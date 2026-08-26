import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { Novu } from "@novu/node";
import { inventoryAdjustment } from "@/lib/inventory";

// ✅ 1. SAFELY Initialize Novu
const novuApiKey = process.env.NOVU_API_KEY || process.env.NOVU_SECRET_KEY;
const novu = novuApiKey ? new Novu(novuApiKey) : null;
const novuWorkflowId = process.env.NOVU_WORKFLOW_ID?.trim();

export const runtime = 'nodejs';

async function triggerNovuNotification(userId: string, title: string, body: string, actionUrl: string, actionLabel: string, priority: string) {
  if (!novu || !novuWorkflowId) {
    console.warn("⚠️ [NOVU] Skipped: configure NOVU_WORKFLOW_ID with an existing Novu workflow trigger");
    return;
  }
  try {
    await novu.trigger(novuWorkflowId, {
      to: { subscriberId: userId },
      payload: { title, body, actionUrl, actionLabel, priority }
    });
    console.log(`✅ [NOVU] Triggered notification for ${userId}`);
  } catch (novuErr) {
    console.error("❌ [NOVU] Failed to trigger:", novuErr);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderRef = searchParams.get('orderReference') || searchParams.get('reference');
  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (orderRef?.startsWith("PARTNER_")) {
    return NextResponse.redirect(`${redirectUrl}/dashboard?tab=partner&reference=${orderRef}`);
  }
  if (orderRef?.startsWith("PAYOUT_")) {
    return NextResponse.redirect(`${redirectUrl}/dashboard?tab=payouts&reference=${orderRef}`);
  }

  return NextResponse.redirect(`${redirectUrl}/dashboard?tab=overview&reference=${orderRef}`);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log("🔥 [WEBHOOK HIT] Raw Body:", rawBody);

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = String(payload?.event_type || "").toUpperCase();
    const transaction = payload?.data?.transaction || payload?.transaction || {};
    const orderRef =
      payload?.data?.order?.orderReference ||
      payload?.order?.orderReference ||
      transaction?.merchantTxRef ||
      payload?.data?.reference ||
      payload?.reference ||
      payload?.orderReference;

    let rawStatus =
      payload?.data?.order?.status ||
      payload?.order?.status ||
      payload?.data?.status ||
      payload?.status ||
      "";

    if (!rawStatus) {
      if (eventType === "PAYOUT_SUCCESS" || eventType === "PAYMENT_SUCCESS") {
        rawStatus = "SUCCESS";
      } else if (eventType === "PAYOUT_FAILED" || eventType === "PAYOUT_REFUND") {
        rawStatus = "REFUNDED";
      } else {
        rawStatus = eventType;
      }
    }

    const gatewayStatus = String(rawStatus || "").toUpperCase();
    const providerReference =
      transaction?.transactionId ||
      transaction?.transactionReference ||
      transaction?.reference ||
      transaction?.merchantTxRef ||
      payload?.data?.reference ||
      payload?.transaction?.reference ||
      orderRef;

    console.log(`[WEBHOOK] Extracted -> Ref: ${orderRef}, Status: ${gatewayStatus}`);

    if (!orderRef) {
      console.error("[WEBHOOK] No reference found. Full payload:", JSON.stringify(payload));
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const isBoost = orderRef.startsWith("ZEBBLE_BST_");
    const isPayout = orderRef.startsWith("PAYOUT_");
    const metadata = payload?.data?.order?.orderMetaData || payload?.data?.metadata || payload?.metadata;

    const isPartner = orderRef.startsWith("PARTNER_") || metadata?.type === "partner_subscription";
    const isSubscription = orderRef.startsWith("SUB_");

    let collectionName = "orders";
    // ✅ FIX 1: Use DocumentSnapshot[] to prevent QueryDocumentSnapshot type mismatch
    let docSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    let storeIdForPartner = "";

    // ✅ MULTI-SELLER DOCUMENT LOOKUP
    if (isPartner) {
      storeIdForPartner = metadata?.storeId || orderRef.split("_")[1];
      collectionName = "stores";
      const singleSnap = await adminDb.collection(collectionName).doc(storeIdForPartner).get();
      if (singleSnap.exists) docSnaps = [singleSnap];
    } else if (isPayout) {
      collectionName = "payouts";
      const singleSnap = await adminDb.collection(collectionName).doc(orderRef).get();
      if (singleSnap.exists) docSnaps = [singleSnap];
    } else {
      collectionName = isBoost ? "boosts" : isSubscription ? "subscriptions" : "orders";

      if (collectionName === "orders") {
        // Query by checkoutReference field for multi-seller checkouts
        const querySnap = await adminDb.collection(collectionName).where("checkoutReference", "==", orderRef).get();
        if (!querySnap.empty) {
          docSnaps = querySnap.docs;
        } else {
          // Fallback to document ID for legacy single-seller orders
          const singleSnap = await adminDb.collection(collectionName).doc(orderRef).get();
          if (singleSnap.exists) docSnaps = [singleSnap];
        }
      } else {
        const singleSnap = await adminDb.collection(collectionName).doc(orderRef).get();
        if (singleSnap.exists) docSnaps = [singleSnap];
      }
    }

    if (docSnaps.length === 0) {
      console.error(`[WEBHOOK] Document not found for ${orderRef}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // ==========================================
    // 🔥 UPDATE STATUS IF SUCCESSFUL
    // ==========================================
    if (["SUCCESS", "APPROVED", "COMPLETED", "PAYMENT_SUCCESS"].includes(gatewayStatus)) {
      for (const docSnap of docSnaps) {
        const documentRef = docSnap.ref;
        const localData = docSnap.data()!;
        const targetUserId = isPartner ? storeIdForPartner : (localData.vendorId || localData.storeId || localData.userId);

        if (isPayout) {
          const successResult = await adminDb.runTransaction(async (transaction) => {
            const payoutSnap = await transaction.get(documentRef);
            const payoutData = payoutSnap.data() || {};
            const currentStatus = String(payoutData.status || "").toLowerCase();
            if (!payoutSnap.exists || ["completed", "failed", "refunded"].includes(currentStatus)) return { transitioned: false };

            transaction.update(documentRef, {
              status: "completed",
              providerReference,
              providerStatus: gatewayStatus,
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.set(adminDb.collection("auditLogs").doc(), {
              action: "payout_provider_completed",
              targetType: "payout",
              targetId: docSnap.id,
              performedBy: "system:nomba-webhook",
              performedByEmail: "",
              details: { providerReference, previousStatus: currentStatus },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { transitioned: true };
          });

          if (targetUserId && successResult.transitioned) {
            const netAmount = localData?.netAmount || 0;
            const notifConfig = {
              type: "payment", priority: "high",
              title: "Withdrawal Successful! 💸",
              body: `Your withdrawal of ₦${netAmount.toLocaleString()} has been processed to your bank account.`,
              actionUrl: "/dashboard?tab=payouts", actionLabel: "View Payouts"
            };
            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...notifConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, notifConfig.title, notifConfig.body, notifConfig.actionUrl, notifConfig.actionLabel, notifConfig.priority);
          }

        } else if (isPartner) {
          const durationDays = Number(metadata?.durationDays || 30);
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + durationDays);

          await documentRef.update({
            isPartner: true,
            partnerExpiry: expiryDate.toISOString(),
            partnerPlan: "marketplace-pro",
            lastPartnerPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          if (targetUserId) {
            const notifConfig = {
              type: "system", priority: "high",
              title: "Welcome to the Partner Program! 👑",
              body: `You are now a Marketplace Partner for the next ${durationDays} days. Enjoy 0% seller commission!`,
              actionUrl: "/dashboard?tab=partner", actionLabel: "View Partner Dashboard"
            };
            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...notifConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, notifConfig.title, notifConfig.body, notifConfig.actionUrl, notifConfig.actionLabel, notifConfig.priority);
          }

        } else {
          let newStatus = "active";
          if (collectionName === "orders") {
            newStatus = "PAID_HELD";

            const holdResult = await adminDb.runTransaction(async (transaction) => {
              const orderSnap = await transaction.get(documentRef);
              if (!orderSnap.exists) throw new Error("Order disappeared while reserving escrow");
              const order = orderSnap.data() || {};

              // ✅ Support both new multi-seller fields and legacy fields
              const orderAmount = Number(order.escrowAmount ?? order.totalAmount ?? order.total ?? 0);
              const vendorId = typeof order.storeId === "string" ? order.storeId : (typeof order.vendorId === "string" ? order.vendorId : "");

              if (!vendorId || !Number.isFinite(orderAmount) || orderAmount <= 0) {
                throw new Error("Order is missing a valid vendor or amount; escrow was not reserved");
              }

              const currentFundsState = String(order.fundsState || "").toLowerCase();
              if (["held", "released", "refunded", "refund_pending"].includes(currentFundsState) || order.escrowReservedAt) {
                return { transitioned: false, amount: orderAmount };
              }

              const storeRef = adminDb.collection("stores").doc(vendorId);
              const storeSnap = await transaction.get(storeRef);
              if (!storeSnap.exists) throw new Error("Seller wallet not found; escrow was not reserved");

              const store = storeSnap.data() || {};
              const rawEscrowBalance = Number(store.escrowBalance ?? 0);
              if (!Number.isFinite(rawEscrowBalance)) {
                throw new Error("Seller escrow ledger is invalid; payment was not credited to escrow");
              }

              let escrowBalance = rawEscrowBalance;
              let ledgerWasRebuilt = false;
              if (escrowBalance < 0) {
                const vendorOrders = await transaction.get(adminDb.collection("orders").where("storeId", "==", vendorId));
                escrowBalance = vendorOrders.docs.reduce((total, vendorOrderSnap) => {
                  const vendorOrder = vendorOrderSnap.data() || {};
                  if (String(vendorOrder.fundsState || "").trim().toLowerCase() !== "held") return total;
                  const reservedAmount = Number(vendorOrder.escrowReservedAmount ?? vendorOrder.escrowReservationAmount ?? 0);
                  return vendorOrder.escrowReservedAt && Number.isFinite(reservedAmount) && reservedAmount > 0 ? total + reservedAmount : total;
                }, 0);
                ledgerWasRebuilt = true;
              }

              const now = admin.firestore.FieldValue.serverTimestamp();
              const items = Array.isArray(order.items) ? order.items : [];
              let inventoryError = null;
              let orderUpdate = {};

              // ✅ MULTI-SELLER INVENTORY ADJUSTMENT
              if (items.length > 0) {
                for (const item of items) {
                  const productId = typeof item.productId === "string" ? item.productId.trim() : "";
                  if (!productId) continue;

                  const productRef = adminDb.collection("products").doc(productId);
                  const productSnap = await transaction.get(productRef);
                  if (!productSnap?.exists) { inventoryError = `Product ${productId} not found`; break; }

                  // Create a pseudo-order so inventoryAdjustment can read productId and quantity
                  const pseudoOrder = { ...order, productId: productId, quantity: item.quantity || 1 };
                  const inventory = inventoryAdjustment(productSnap.data() || {}, pseudoOrder, now, docSnap.id);

                  if (inventory.error) { inventoryError = inventory.error; break; }
                  if (inventory.tracked) transaction.update(productRef, inventory.productUpdate);
                  if (inventory.orderUpdate) orderUpdate = { ...orderUpdate, ...inventory.orderUpdate };
                }
              } else {
                // Legacy fallback for single productId
                const productId = typeof order.productId === "string" ? order.productId.trim() : "";
                const productRef = productId ? adminDb.collection("products").doc(productId) : null;
                const productSnap = productRef ? await transaction.get(productRef) : null;

                if (productId && (!productRef || !productSnap?.exists)) {
                  inventoryError = "Product inventory record not found";
                } else if (productRef && productSnap) {
                  const inventory = inventoryAdjustment(productSnap.data() || {}, order, now, docSnap.id);
                  if (inventory.error) inventoryError = inventory.error;
                  else {
                    if (inventory.tracked) transaction.update(productRef, inventory.productUpdate);
                    if (inventory.orderUpdate) orderUpdate = { ...orderUpdate, ...inventory.orderUpdate };
                  }
                }
              }

              if (inventoryError) throw new Error(`${inventoryError} Escrow was not reserved.`);

              transaction.update(storeRef, { escrowBalance: escrowBalance + orderAmount, updatedAt: now });

              if (ledgerWasRebuilt) {
                transaction.set(adminDb.collection("auditLogs").doc(), {
                  action: "system_escrow_ledger_rebuilt",
                  targetType: "store",
                  targetId: vendorId,
                  performedBy: "system:nomba-webhook",
                  performedByEmail: "",
                  details: { reason: "negative_escrow_before_payment_reservation", previousEscrowBalance: rawEscrowBalance, rebuiltEscrowBalance: escrowBalance, orderId: docSnap.id, orderAmount },
                  timestamp: now,
                });
              }

              transaction.update(documentRef, {
                ...orderUpdate,
                status: "PAID_HELD",
                paymentStatus: "paid",
                fundsState: "held",
                escrowReservedAmount: orderAmount,
                escrowReservedAt: now,
                updatedAt: now,
              });

              return { transitioned: true, amount: orderAmount, ledgerWasRebuilt };
            });

            console.log(`✅ [ESCROW] Order ${orderRef} ${holdResult.transitioned ? `reserved ₦${holdResult.amount}` : "was already reserved"}.`);
          } else {
            // ✅ FIX 2: Moved activeDuration and durationUnit here so they are in scope for the else block
            const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
            const durationUnit = localData.durationMonths ? "months" : "days";

            const expiryDate = new Date();
            if (durationUnit === "months") {
              expiryDate.setMonth(expiryDate.getMonth() + activeDuration);
            } else {
              expiryDate.setDate(expiryDate.getDate() + activeDuration);
            }

            await documentRef.update({
              status: newStatus,
              startDate: new Date().toISOString(),
              expiryDate: expiryDate.toISOString(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          console.log(`✅ [WEBHOOK SUCCESS] ${collectionName} ${orderRef} updated to '${newStatus}'!`);

          if (targetUserId) {
            let notifConfig = { type: "payment", priority: "medium", title: "Payment Successful! ✅", body: "Your transaction was successful.", actionUrl: "/dashboard?tab=overview", actionLabel: "View Dashboard" };
            if (collectionName === "orders") {
              notifConfig = { type: "order", priority: "high", title: "New Order Placed! 📦", body: `Action Required: New order received! Funds are securely held in escrow. Ref: ${orderRef.slice(-8)}`, actionUrl: "/dashboard?tab=orders", actionLabel: "View Orders" };
            } else if (collectionName === "subscriptions") {
              const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
              const durationUnit = localData.durationMonths ? "months" : "days";
              notifConfig = { type: "system", priority: "medium", title: "Subscription Activated! 👑", body: `Your Pro subscription is now active for the next ${activeDuration} ${durationUnit}.`, actionUrl: "/dashboard?tab=overview", actionLabel: "Go to Dashboard" };
            } else if (collectionName === "boosts") {
              const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
              const durationUnit = localData.durationMonths ? "months" : "days";
              notifConfig = { type: "product", priority: "medium", title: "Product Boost Active! 🚀", body: `Your product boost is now live and will run for ${activeDuration} ${durationUnit}.`, actionUrl: "/dashboard?tab=products", actionLabel: "View Products" };
            }

            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...notifConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, notifConfig.title, notifConfig.body, notifConfig.actionUrl, notifConfig.actionLabel, notifConfig.priority);
          }
        }
      }
    }
    // ==========================================
    // 🔥 UPDATE STATUS IF FAILED
    // ==========================================
    else if (["FAILED", "DECLINED", "REVERSED", "REFUNDED", "CANCELLED"].includes(gatewayStatus)) {
      for (const docSnap of docSnaps) {
        const documentRef = docSnap.ref;
        const localData = docSnap.data()!;
        const targetUserId = isPartner ? storeIdForPartner : (localData.vendorId || localData.storeId || localData.userId);

        if (isPayout) {
          const failureResult = await adminDb.runTransaction(async (transaction) => {
            const payoutSnap = await transaction.get(documentRef);
            if (!payoutSnap.exists) return { refunded: false, alreadyFinal: true };
            const payoutData = payoutSnap.data() || {};
            const currentStatus = String(payoutData.status || "").toLowerCase();
            if (["failed", "refunded", "completed"].includes(currentStatus)) return { refunded: false, alreadyFinal: true };

            const storeRef = targetUserId ? adminDb.collection("stores").doc(targetUserId) : null;
            const storeSnap = storeRef ? await transaction.get(storeRef) : null;
            if (storeRef && storeSnap) {
              const currentAvailable = Number(storeSnap.data()?.availableBalance ?? 0);
              const grossAmount = Number(payoutData.grossAmount ?? 0);
              transaction.update(storeRef, { availableBalance: currentAvailable + grossAmount, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }

            transaction.update(documentRef, {
              status: "refunded", providerReference, providerStatus: gatewayStatus,
              failureReason: `Provider reported ${gatewayStatus.toLowerCase()}`,
              balanceRestoredAt: admin.firestore.FieldValue.serverTimestamp(),
              refundedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { refunded: true, alreadyFinal: false };
          });

          if (targetUserId && failureResult.refunded) {
            const failConfig = { type: "payment", priority: "urgent", title: "Withdrawal Failed ❌", body: `Your withdrawal request could not be processed. Funds returned to balance.`, actionUrl: "/dashboard?tab=payouts", actionLabel: "View Payouts" };
            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...failConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, failConfig.title, failConfig.body, failConfig.actionUrl, failConfig.actionLabel, failConfig.priority);
          }
        } else if (isPartner) {
          if (targetUserId) {
            const failConfig = { type: "payment", priority: "urgent", title: "Partner Subscription Failed ❌", body: `Your Marketplace Partner subscription payment could not be processed.`, actionUrl: "/dashboard?tab=partner", actionLabel: "Retry Subscription" };
            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...failConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, failConfig.title, failConfig.body, failConfig.actionUrl, failConfig.actionLabel, failConfig.priority);
          }
        } else {
          await documentRef.update({ status: "failed", ...(collectionName === "orders" ? { paymentStatus: "failed" } : {}), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          if (targetUserId) {
            const failConfig = { type: "payment", priority: "urgent", title: "Payment Failed ❌", body: `Your payment could not be processed.`, actionUrl: collectionName === "orders" ? "/dashboard?tab=orders" : "/dashboard?tab=overview", actionLabel: "View Details" };
            await adminDb.collection("notifications").add({ vendorId: targetUserId, ...failConfig, actionable: true, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNovuNotification(targetUserId, failConfig.title, failConfig.body, failConfig.actionUrl, failConfig.actionLabel, failConfig.priority);
          }
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("❌ [WEBHOOK CRITICAL ERROR]:", error);
    return NextResponse.json({ received: false, retryable: true, error: error instanceof Error ? error.message : "Webhook processing failed" }, { status: 500 });
  }
}