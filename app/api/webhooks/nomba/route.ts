import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { Novu } from "@novu/node";
import { inventoryAdjustment } from "@/lib/inventory";
import { notifyOrderPaymentConfirmed, notifyOrderStatus, notifyPayoutCompleted } from "@/lib/novu-events";
import { sendSubscriptionConfirmationEmail, sendSubscriptionPaymentFailedEmail } from "@/lib/email/events";
import { isNombaWebhookSignatureValid, verifyNombaTransaction, initiateNombaBankTransfer } from "@/lib/payments/nomba/client";
import { dispatchShipmentForOrder } from "@/lib/shipping-dispatch";
import { updateExistingStore } from "@/lib/store-sync";

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
    await Promise.race([
      novu.trigger(novuWorkflowId, {
        to: { subscriberId: userId },
        payload: { title, body, actionUrl, actionLabel, priority }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("notification provider timeout")), 5_000)),
    ]);
    console.log(`✅ [NOVU] Triggered notification for ${userId}`);
  } catch (novuErr) {
    const message = novuErr instanceof Error ? novuErr.message : "request failed";
    console.warn(`[NOVU] Notification skipped: ${message}`);
  }
}

async function settleCourierPayout(orderId: string, order: FirebaseFirestore.DocumentData) {
  const amount = Number(order.shippingCost || 0);
  if (!Number.isFinite(amount) || amount <= 0 || order.deliveryMode === "self_arranged") return;
  if (["submitted", "processing", "completed"].includes(String(order.courierPayoutStatus || "").toLowerCase())) return;

  const courierId = String(order.courierId || order.shippingMethod || "").trim();
  const courierSnap = courierId ? await adminDb.collection("couriers").doc(courierId).get() : null;
  const courier = courierSnap?.data() || {};
  const payout = courier.payoutSettings || courier.bankDetails || courier;
  const bankCode = String(payout.bankCode || "").trim();
  const accountNumber = String(payout.accountNumber || "").replace(/\D/g, "");

  if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
    await adminDb.collection("orders").doc(orderId).update({
      courierPayoutStatus: "pending_configuration",
      courierPayoutAmount: amount,
      courierPayoutError: "Courier payout bank details are not configured",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.warn(`[COURIER PAYOUT] ${orderId} is awaiting payout settings for ${courierId || "courier"}`);
    return;
  }

  const reference = `COURIER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
  try {
    const transfer = await initiateNombaBankTransfer({
      destinationBankCode: bankCode,
      accountNumber,
      accountName: String(payout.accountName || "").trim() || undefined,
      amount,
      narration: `Courier settlement for ${orderId}`,
      reference,
    });
    await adminDb.collection("orders").doc(orderId).update({
      courierPayoutStatus: transfer.providerStatus === "SUCCESS" ? "completed" : "processing",
      courierPayoutReference: transfer.transferRef,
      courierPayoutAmount: amount,
      courierPayoutResponse: transfer.rawResponse || null,
      courierPayoutAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await adminDb.collection("orders").doc(orderId).update({
      courierPayoutStatus: "failed",
      courierPayoutAmount: amount,
      courierPayoutError: error instanceof Error ? error.message : "Courier payout failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.error(`[COURIER PAYOUT] ${orderId} failed`, error);
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

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const webhookSecret = process.env.NOMBA_WEBHOOK_SECRET?.trim();
    const signature = request.headers.get("nomba-signature") || request.headers.get("nomba-sig-value");
    const timestamp = request.headers.get("nomba-timestamp") || "";
    if (webhookSecret) {
      if (!signature || !timestamp || !isNombaWebhookSignatureValid(payload, timestamp, signature, webhookSecret)) {
        console.error("[NOMBA WEBHOOK] Signature verification failed");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[NOMBA WEBHOOK] NOMBA_WEBHOOK_SECRET is required in production");
      return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
    }

    const eventType = String(payload?.event_type || "").toUpperCase();
    const transaction = payload?.data?.transaction || payload?.transaction || {};
    const orderReferences = Array.from(new Set([
      payload?.data?.order?.orderReference,
      payload?.order?.orderReference,
      transaction?.merchantTxRef,
      payload?.data?.reference,
      payload?.reference,
      payload?.orderReference,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
    const orderRef = orderReferences[0] || "";

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

    const routingReference = orderReferences.find((reference) => /^(ZEBBLE_BST_|PAYOUT_|SELLER_|PARTNER_|SUB_)/.test(reference)) || orderRef;
    const isBoost = orderReferences.some((reference) => reference.startsWith("ZEBBLE_BST_"));
    const isPayout = orderReferences.some((reference) => reference.startsWith("PAYOUT_") || reference.startsWith("SELLER_"));
    const metadata = payload?.data?.order?.orderMetaData || payload?.data?.order?.metaData || payload?.data?.metadata || payload?.metadata;

    const isPartner = orderReferences.some((reference) => reference.startsWith("PARTNER_")) || metadata?.type === "partner_subscription";
    const isSubscription = orderReferences.some((reference) => reference.startsWith("SUB_"));

    let collectionName = "orders";
    // ✅ FIX 1: Use DocumentSnapshot[] to prevent QueryDocumentSnapshot type mismatch
    let docSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    let storeIdForPartner = "";

    // ✅ MULTI-SELLER DOCUMENT LOOKUP
    if (isPartner) {
      storeIdForPartner = metadata?.storeId || routingReference.split("_")[1];
      collectionName = "stores";
      const singleSnap = await adminDb.collection(collectionName).doc(storeIdForPartner).get();
      if (singleSnap.exists) docSnaps = [singleSnap];
    } else if (isPayout) {
      collectionName = "payouts";
      const singleSnap = await adminDb.collection(collectionName).doc(routingReference).get();
      if (singleSnap.exists) docSnaps = [singleSnap];
    } else {
      collectionName = isBoost ? "boosts" : isSubscription ? "subscriptions" : "orders";

      if (collectionName === "orders") {
        // Query by checkoutReference field for multi-seller checkouts
        for (const reference of orderReferences) {
          const querySnap = await adminDb.collection(collectionName).where("checkoutReference", "==", reference).get();
          if (!querySnap.empty) {
            docSnaps = querySnap.docs;
            break;
          }
          const singleSnap = await adminDb.collection(collectionName).doc(reference).get();
          if (singleSnap.exists) {
            docSnaps = [singleSnap];
            break;
          }
        }
      } else {
        for (const reference of orderReferences) {
          const singleSnap = await adminDb.collection(collectionName).doc(reference).get();
          if (singleSnap.exists) {
            docSnaps = [singleSnap];
            break;
          }
        }
      }
    }

    if (docSnaps.length === 0) {
      console.error(`[WEBHOOK] Document not found for ${orderRef}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const ledgerReference = collectionName === "orders"
      ? String(docSnaps[0].data()?.checkoutReference || "").trim()
      : "";
    const escrowRef = ledgerReference ? adminDb.collection("escrow_transactions").doc(ledgerReference) : null;
    const escrowSnap = escrowRef ? await escrowRef.get() : null;
    let verifiedPaymentAmount = Number(transaction?.transactionAmount || transaction?.amount || payload?.data?.order?.amount || 0);

    if (eventType === "PAYMENT_SUCCESS" && collectionName === "orders" && !escrowSnap?.exists) {
      console.error(`[NOMBA WEBHOOK] No escrow ledger exists for ${ledgerReference || orderRef}`);
      return NextResponse.json({ received: false, retryable: true }, { status: 409 });
    }

    const requiresPaymentVerification = !isPayout && (eventType === "PAYMENT_SUCCESS" || isBoost || isSubscription);
    if (requiresPaymentVerification) {
      const verificationReferences = [
        providerReference,
        ...orderReferences,
      ].filter((value, index, values): value is string => typeof value === "string" && value.length > 0 && values.indexOf(value) === index);
      let verified = false;
      for (const reference of verificationReferences) {
        const verification = await verifyNombaTransaction(reference);
        if (verification.confirmed) {
          verified = true;
          if (Number.isFinite(verification.amount) && Number(verification.amount) > 0) verifiedPaymentAmount = Number(verification.amount);
          break;
        }
      }
      if (!verified) {
        console.warn(`[NOMBA WEBHOOK] Payment ${orderRef} is not verifiable yet; asking Nomba to retry`);
        return NextResponse.json({ received: false, retryable: true }, { status: 202 });
      }
    }

    if (eventType === "PAYMENT_SUCCESS" && collectionName === "orders" && escrowSnap?.exists) {
      const expectedAmount = Number(escrowSnap.data()?.amount || 0);
      if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || !Number.isFinite(verifiedPaymentAmount) || verifiedPaymentAmount < expectedAmount) {
        console.error(`[NOMBA WEBHOOK] Payment amount does not cover escrow ${ledgerReference}: ${verifiedPaymentAmount}/${expectedAmount}`);
        return NextResponse.json({ received: false, retryable: true }, { status: 202 });
      }
    }

    if (eventType === "PAYMENT_SUCCESS" && collectionName === "orders" && escrowRef && escrowSnap?.exists) {
      await escrowRef.set({
        status: "FUNDED",
        fundedAmount: verifiedPaymentAmount,
        providerReference: String(providerReference || ledgerReference),
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
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
            if (typeof payoutData.orderId === "string" && payoutData.orderId) {
              transaction.update(adminDb.collection("orders").doc(payoutData.orderId), {
                sellerPayoutStatus: "completed",
                sellerPayoutProviderReference: providerReference,
                sellerPayoutCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

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
            await notifyPayoutCompleted({ id: docSnap.id, ...localData });
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
            if (holdResult.transitioned) {
              await notifyOrderPaymentConfirmed({ id: docSnap.id, ...localData });
              await settleCourierPayout(docSnap.id, { ...localData, ...holdResult });
              await dispatchShipmentForOrder(docSnap.id);
            }
          } else {
            // Calculate plan expiration
            const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
            const durationUnit = localData.durationMonths ? "months" : "days";

            const expiryDate = new Date();
            if (durationUnit === "months") {
              expiryDate.setMonth(expiryDate.getMonth() + activeDuration);
            } else {
              expiryDate.setDate(expiryDate.getDate() + activeDuration);
            }

            // Boost activation must be idempotent because Nomba can retry a
            // webhook. Only the first verified success may activate it or
            // trigger the downstream email/notification side effects.
            if (collectionName === "boosts") {
              const activation = await adminDb.runTransaction(async (transaction) => {
                const boostSnap = await transaction.get(documentRef);
                const boost = boostSnap.data() || {};
                const currentStatus = String(boost.status || "").toLowerCase();
                if (!boostSnap.exists || ["active", "failed", "cancelled", "refunded"].includes(currentStatus)) {
                  return { transitioned: false };
                }

                transaction.update(documentRef, {
                  status: newStatus,
                  paymentStatus: "paid",
                  providerReference,
                  providerStatus: gatewayStatus,
                  startDate: new Date().toISOString(),
                  expiryDate: expiryDate.toISOString(),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { transitioned: true };
              });

              if (!activation.transitioned) {
                console.log(`ℹ️ [WEBHOOK] Boost ${orderRef} was already finalized; skipping duplicate side effects.`);
                continue;
              }
            } else {
              // 1️⃣ Update the Subscription Document
              await documentRef.update({
                status: newStatus,
                startDate: new Date().toISOString(),
                expiryDate: expiryDate.toISOString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            // 2️⃣ ✅ CRITICAL FIX: Sync Subscription state to Store and User documents
            if (collectionName === "subscriptions" && targetUserId) {
              const planId = localData.planId || "pro_yearly_business_max";
              const isMaxTier = planId === "pro_yearly_business_max" || planId.includes("max");

              // Sync Store document (used by Checkout API for 0% commission check)
              await updateExistingStore(targetUserId, {
                subscriptionPlan: planId,
                isPartner: isMaxTier,
                partnerExpiry: expiryDate.toISOString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, "Nomba subscription webhook");

              // Sync User document
              await adminDb.collection("users").doc(targetUserId).set({
                isPremium: true,
                planId: planId,
                premiumActivatedAt: new Date().toISOString(),
                premiumExpiresAt: expiryDate.toISOString(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          }

          console.log(`✅ [WEBHOOK SUCCESS] ${collectionName} ${orderRef} updated to '${newStatus}'!`);

          if (collectionName === "subscriptions") {
            await sendSubscriptionConfirmationEmail({
              ...localData,
              id: docSnap.id,
              nombaReference: orderRef,
              startDate: new Date().toISOString(),
              expiryDate: localData.expiryDate || undefined,
            });
          } else if (collectionName === "boosts") {
            await sendSubscriptionConfirmationEmail({
              ...localData,
              id: docSnap.id,
              nombaReference: orderRef,
              isBoost: true,
              startDate: new Date().toISOString(),
              expiryDate: localData.expiryDate || undefined,
            }, "store_boost");
          }

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
            if (typeof payoutData.orderId === "string" && payoutData.orderId) {
              transaction.update(adminDb.collection("orders").doc(payoutData.orderId), {
                sellerPayoutStatus: "failed",
                sellerPayoutError: `Provider reported ${gatewayStatus.toLowerCase()}`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
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
          if (collectionName === "orders" && ["REFUNDED", "CANCELLED"].includes(gatewayStatus)) {
            await notifyOrderStatus({ id: docSnap.id, ...localData }, gatewayStatus === "REFUNDED" ? "order-refunded" : "order-cancelled");
          }
          if (collectionName === "subscriptions") {
            await sendSubscriptionPaymentFailedEmail({
              ...localData,
              id: docSnap.id,
              nombaReference: orderRef,
              failureReason: `Provider reported ${gatewayStatus.toLowerCase()}.`,
              attemptDate: new Date().toISOString(),
            });
          } else if (collectionName === "boosts") {
            await sendSubscriptionPaymentFailedEmail({
              ...localData,
              id: docSnap.id,
              nombaReference: orderRef,
              isBoost: true,
              failureReason: `Provider reported ${gatewayStatus.toLowerCase()}.`,
              attemptDate: new Date().toISOString(),
            }, "store_boost");
          }
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
