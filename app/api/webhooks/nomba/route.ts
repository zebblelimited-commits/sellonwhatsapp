import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { Novu } from "@novu/node"; 

// ✅ 1. SAFELY Initialize Novu (Prevents entire webhook from crashing if key is missing)
const novuApiKey = process.env.NOVU_API_KEY || process.env.NOVU_SECRET_KEY;
const novu = novuApiKey ? new Novu(novuApiKey) : null;

export const runtime = 'nodejs'; 

// ✅ Helper function to safely trigger Novu
async function triggerNovuNotification(userId: string, title: string, body: string, actionUrl: string, actionLabel: string, priority: string) {
  if (!novu) {
    console.warn("⚠️ [NOVU] Skipped: NOVU_API_KEY is missing in .env.local");
    return;
  }

  try {
    await novu.trigger('webhook-notification', {
      to: { subscriberId: userId },
      payload: { title, body, actionUrl, actionLabel, priority }
    });
    console.log(`✅ [NOVU] Triggered notification for ${userId}`);
  } catch (novuErr) {
    console.error("❌ [NOVU] Failed to trigger:", novuErr);
  }
}

// ✅ 2. Handle GET requests (Nomba redirects the user's browser here after payment)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderRef = searchParams.get('orderReference') || searchParams.get('reference');
  
  const redirectUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  if (orderRef?.startsWith("PARTNER_")) {
    return NextResponse.redirect(`${redirectUrl}/dashboard?tab=partner&reference=${orderRef}`);
  }
  
  // ✅ ADDED: Redirect to payouts tab after withdrawal
  if (orderRef?.startsWith("PAYOUT_")) {
    return NextResponse.redirect(`${redirectUrl}/dashboard?tab=payouts&reference=${orderRef}`);
  }
  
  return NextResponse.redirect(`${redirectUrl}/dashboard?tab=overview&reference=${orderRef}`);
}

// ✅ 3. Handle POST requests (Nomba's server-to-server webhook)
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log("🔥 [WEBHOOK HIT] Raw Body:", rawBody);
    
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const orderRef = 
      payload?.data?.order?.orderReference || 
      payload?.order?.orderReference || 
      payload?.data?.reference || 
      payload?.reference || 
      payload?.orderReference;

    const rawStatus = 
      payload?.data?.order?.status || 
      payload?.order?.status || 
      payload?.data?.status || 
      payload?.status || 
      payload?.event_type;
      
    const gatewayStatus = String(rawStatus || "").toUpperCase();
    console.log(`[WEBHOOK] Extracted -> Ref: ${orderRef}, Status: ${gatewayStatus}`);

    if (!orderRef) {
      console.error("[WEBHOOK] No reference found. Full payload:", JSON.stringify(payload));
      return NextResponse.json({ received: true }, { status: 200 }); 
    }

    // Identify Payment Type
    const isBoost = orderRef.startsWith("ZEBBLE_BST_");
    const isPayout = orderRef.startsWith("PAYOUT_"); // ✅ ADDED FOR WITHDRAWALS
    const metadata = 
      payload?.data?.order?.orderMetaData || 
      payload?.data?.metadata || 
      payload?.metadata;

    const isPartner = orderRef.startsWith("PARTNER_") || metadata?.type === "partner_subscription";
    const isSubscription = orderRef.startsWith("SUB_");
    
    let collectionName = "orders";
    let docRef;
    let storeIdForPartner = "";

    if (isPartner) {
      storeIdForPartner = metadata?.storeId || orderRef.split("_")[1];
      collectionName = "stores";
      docRef = adminDb.collection(collectionName).doc(storeIdForPartner);
    } else if (isPayout) {
      // ✅ ROUTE PAYOUTS TO THE CORRECT COLLECTION
      collectionName = "payouts";
      docRef = adminDb.collection(collectionName).doc(orderRef);
    } else {
      collectionName = isBoost ? "boosts" : isSubscription ? "subscriptions" : "orders";
      docRef = adminDb.collection(collectionName).doc(orderRef);
    }

    let docSnap = await docRef.get();

    if (!docSnap.exists && !isPartner) {
      const fallbackQuery = await adminDb
        .collection(collectionName)
        .where("nombaReference", "==", orderRef)
        .limit(1)
        .get();

      if (!fallbackQuery.empty) {
        docSnap = fallbackQuery.docs[0];
      }
    }

    if (!docSnap.exists) {
      console.error(`[WEBHOOK] Document not found for ${orderRef}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const localData = docSnap.data()!;
    // ✅ Added localData.storeId as fallback for payouts
    const targetUserId = isPartner ? storeIdForPartner : (localData.vendorId || localData.storeId || localData.userId);

    // ==========================================
    // 🔥 UPDATE STATUS IF SUCCESSFUL
    // ==========================================
    if (["SUCCESS", "APPROVED", "COMPLETED", "PAYMENT_SUCCESS"].includes(gatewayStatus)) {
      
      if (isPayout) {
        // ✅ HANDLE PAYOUT COMPLETION
        const successResult = await adminDb.runTransaction(async (transaction) => {
          const payoutSnap = await transaction.get(docSnap.ref);
          if (!payoutSnap.exists || payoutSnap.data()?.status === "completed") return { transitioned: false };
          transaction.update(docSnap.ref, {
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return { transitioned: true };
        });
        console.log(`✅ [WEBHOOK SUCCESS] Payout ${orderRef} marked as completed.`);

        if (targetUserId && successResult.transitioned) {
          const netAmount = localData?.netAmount || 0;
          const notifConfig = {
            type: "payment",
            priority: "high",
            title: "Withdrawal Successful! 💸",
            body: `Your withdrawal of ₦${netAmount.toLocaleString()} has been processed to your bank account.`,
            actionUrl: "/dashboard?tab=payouts",
            actionLabel: "View Payouts"
          };

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...notifConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            notifConfig.title, 
            notifConfig.body, 
            notifConfig.actionUrl, 
            notifConfig.actionLabel, 
            notifConfig.priority
          );
        }

      } else if (isPartner) {
        const durationDays = Number(metadata?.durationDays || 30);
        let expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);

        await docSnap.ref.update({
          isPartner: true,
          partnerExpiry: expiryDate.toISOString(),
          partnerPlan: "marketplace-pro",
          lastPartnerPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ [WEBHOOK SUCCESS] Store ${storeIdForPartner} upgraded to Marketplace Partner until ${expiryDate.toISOString()}`);

        if (targetUserId) {
          const notifConfig = {
            type: "system",
            priority: "high",
            title: "Welcome to the Partner Program! 👑",
            body: `You are now a Marketplace Partner for the next ${durationDays} days. Enjoy 0% seller commission!`,
            actionUrl: "/dashboard?tab=partner",
            actionLabel: "View Partner Dashboard"
          };

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...notifConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            notifConfig.title, 
            notifConfig.body, 
            notifConfig.actionUrl, 
            notifConfig.actionLabel, 
            notifConfig.priority
          );
        }

      } else {
        // ✅ Determine the correct status based on collection type
        let newStatus = "active"; // Default for boosts/subscriptions
        
        if (collectionName === "orders") {
          newStatus = "PAID_HELD"; // ✅ Orders should be PAID_HELD (funds in escrow)
        }

        const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
        const durationUnit = localData.durationMonths ? "months" : "days";
        
        let expiryDate = new Date();
        if (durationUnit === "months") {
          expiryDate.setMonth(expiryDate.getMonth() + activeDuration);
        } else {
          expiryDate.setDate(expiryDate.getDate() + activeDuration);
        }

        await docSnap.ref.update({
          status: newStatus, // ✅ Uses PAID_HELD for orders, active for others
          startDate: new Date().toISOString(),
          expiryDate: expiryDate.toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ [WEBHOOK SUCCESS] ${collectionName} ${orderRef} updated to '${newStatus}'!`);

        if (targetUserId) {
          let notifConfig = {
            type: "payment",
            priority: "medium",
            title: "Payment Successful! ✅",
            body: "Your transaction was successful.",
            actionUrl: "/dashboard?tab=overview",
            actionLabel: "View Dashboard"
          };

          if (collectionName === "orders") {
            notifConfig = {
              type: "order",
              priority: "high",
              title: "New Order Placed! 📦",
              body: `Action Required: New order received! Funds are securely held in escrow. Ref: ${orderRef.slice(-8)}`,
              actionUrl: "/dashboard?tab=orders",
              actionLabel: "View Orders"
            };
          } else if (collectionName === "subscriptions") {
            notifConfig = {
              type: "system",
              priority: "medium",
              title: "Subscription Activated! 👑",
              body: `Your Pro subscription is now active for the next ${activeDuration} ${durationUnit}. Enjoy premium features!`,
              actionUrl: "/dashboard?tab=overview",
              actionLabel: "Go to Dashboard"
            };
          } else if (collectionName === "boosts") {
            notifConfig = {
              type: "product",
              priority: "medium",
              title: "Product Boost Active! 🚀",
              body: `Your product boost is now live and will run for ${activeDuration} ${durationUnit}.`,
              actionUrl: "/dashboard?tab=products",
              actionLabel: "View Products"
            };
          }

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...notifConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            notifConfig.title, 
            notifConfig.body, 
            notifConfig.actionUrl, 
            notifConfig.actionLabel, 
            notifConfig.priority
          );
        }
      }
    } 
    // ==========================================
    // 🔥 UPDATE STATUS IF FAILED
    // ==========================================
    else if (["FAILED", "DECLINED"].includes(gatewayStatus)) {
      
      if (isPayout) {
        // ✅ HANDLE PAYOUT FAILURE & AUTOMATIC REFUND
        const failureResult = await adminDb.runTransaction(async (transaction) => {
          const payoutSnap = await transaction.get(docSnap.ref);
          if (!payoutSnap.exists) return { refunded: false, alreadyFinal: true };

          const payoutData = payoutSnap.data() || {};
          if (["failed", "rejected", "completed"].includes(payoutData.status)) {
            return { refunded: false, alreadyFinal: true };
          }

          const storeRef = targetUserId ? adminDb.collection("stores").doc(targetUserId) : null;
          const storeSnap = storeRef ? await transaction.get(storeRef) : null;
          if (storeRef && !storeSnap?.exists) throw new Error("Store not found while refunding failed payout");

          if (storeRef && storeSnap) {
            const currentAvailable = Number(storeSnap.data()?.availableBalance ?? 0);
            const grossAmount = Number(payoutData.grossAmount ?? 0);
            transaction.update(storeRef, {
              availableBalance: (Number.isFinite(currentAvailable) ? currentAvailable : 0) + (Number.isFinite(grossAmount) ? grossAmount : 0),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          transaction.update(docSnap.ref, {
            status: "failed",
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return { refunded: true, alreadyFinal: false };
        });
        console.log(`❌ [WEBHOOK FAILED] Payout ${orderRef} failed.`);

        if (failureResult.refunded) {
          console.log(`✅ [REFUND] Returned ₦${localData?.grossAmount || 0} to store ${targetUserId} after failed payout.`);
        }

        if (targetUserId && failureResult.refunded) {
          const failConfig = {
            type: "payment",
            priority: "urgent",
            title: "Withdrawal Failed ❌",
            body: `Your withdrawal request could not be processed by the bank. The funds have been returned to your available balance.`,
            actionUrl: "/dashboard?tab=payouts",
            actionLabel: "View Payouts"
          };

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...failConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            failConfig.title, 
            failConfig.body, 
            failConfig.actionUrl, 
            failConfig.actionLabel, 
            failConfig.priority
          );
        }

      } else if (isPartner) {
        console.log(`❌ [WEBHOOK FAILED] Partner subscription payment failed for ${storeIdForPartner}`);
        if (targetUserId) {
          const failConfig = {
            type: "payment",
            priority: "urgent",
            title: "Partner Subscription Failed ❌",
            body: `Your Marketplace Partner subscription payment could not be processed. Please try again.`,
            actionUrl: "/dashboard?tab=partner",
            actionLabel: "Retry Subscription"
          };

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...failConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            failConfig.title, 
            failConfig.body, 
            failConfig.actionUrl, 
            failConfig.actionLabel, 
            failConfig.priority
          );
        }
      } else {
        await docSnap.ref.update({
          status: "failed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (targetUserId) {
          const failConfig = {
            type: "payment",
            priority: "urgent",
            title: "Payment Failed ❌",
            body: `Your payment could not be processed. Please try again or use a different payment method.`,
            actionUrl: collectionName === "orders" ? "/dashboard?tab=orders" : "/dashboard?tab=overview",
            actionLabel: "View Details"
          };

          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...failConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await triggerNovuNotification(
            targetUserId, 
            failConfig.title, 
            failConfig.body, 
            failConfig.actionUrl, 
            failConfig.actionLabel, 
            failConfig.priority
          );
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("❌ [WEBHOOK CRITICAL ERROR]:", error);
    return NextResponse.json({ received: true, error: error.message }, { status: 200 });
  }
}
