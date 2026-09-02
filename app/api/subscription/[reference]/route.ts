// app/api/subscription/[reference]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { Novu } from "@novu/node";
import { sendSubscriptionConfirmationEmail } from "@/lib/email/events";

// ✅ Initialize Novu (Make sure you have NOVU_SECRET_KEY in your .env)
const novu = new Novu(process.env.NOVU_SECRET_KEY!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;

  if (!reference || typeof reference !== "string" || reference.trim() === "") {
    console.error("❌ Status check rejected: Empty reference variable.");
    return NextResponse.json({ error: "Missing or invalid reference argument" }, { status: 400 });
  }

  try {
    console.log(`[Subscription Status] Checking status for reference: ${reference}`);

    // 1. Check if the active subscription tracking doc already exists in Firestore
    let docRef = adminDb.collection("subscriptions").doc(reference);
    let docSnap = await docRef.get();

    // 2. Fallback: Lookup by alternative nombaReference field match
    if (!docSnap.exists) {
      const fallbackQuery = await adminDb
        .collection("subscriptions")
        .where("nombaReference", "==", reference)
        .limit(1)
        .get();

      if (!fallbackQuery.empty) {
        docSnap = fallbackQuery.docs[0];
        docRef = adminDb.collection("subscriptions").doc(docSnap.id);
      }
    }

    let subscriptionRecord = docSnap.exists ? docSnap.data() : null;

    // 🚀 Just-In-Time Verification loop if doc is missing or not marked fully active yet
    if (!subscriptionRecord || subscriptionRecord.status !== "active") {
      console.log(`🔍 [ JIT Verification ] Verifying reference with Nomba API directly...`);

      let verifiedData = null;

      // Automated fallbacks for Mock environment or local debug tests
      if (reference.startsWith("mock-") || reference.includes("test") || reference.startsWith("SUB_")) {
        let extractedUserId = "test-user-id";
        const parts = reference.split("_");
        if (parts.length >= 4) {
          extractedUserId = parts[3]; // Retrieves the Firestore Auth UID token segment
        } else if (subscriptionRecord?.userId) {
          extractedUserId = subscriptionRecord.userId;
        }

        const isMaxTier = reference.includes("PRO_MAX") || reference.includes("BUSINESS_MAX");
        const isProLite = reference.includes("PRO_LITE");

        verifiedData = {
          status: "active",
          userId: extractedUserId,
          planId: isMaxTier ? "pro_yearly_business_max" : (isProLite ? "pro_business_lite" : "pro"),
          planName: isMaxTier ? "Pro Yearly Business Max Plan" : (isProLite ? "Pro Business Lite Plan" : (subscriptionRecord?.planName || "Pro Plan")),
          durationMonths: isMaxTier ? 12 : (subscriptionRecord?.durationMonths || 1),
          finalPrice: subscriptionRecord?.finalPrice || (isMaxTier ? 50000 : 5000),
          productLimit: isMaxTier ? 999999 : (isProLite ? 500 : 20)
        };
      } else {
        // 🔑 Target Nomba's Checkout receipt checking verification API via POST
        const isSandbox = process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox";
        const nombaUrl = isSandbox
          ? "https://sandbox.nomba.com/v1/checkout/confirm-transaction-receipt"
          : "https://api.nomba.com/v1/checkout/confirm-transaction-receipt";

        const token = process.env.NOMBA_CLIENT_KEY || process.env.NOMBA_SECRET_KEY;
        const accountId = process.env.NOMBA_ACCOUNT_ID;

        try {
          const nombaRes = await fetch(nombaUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "accountId": accountId || "",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ orderReference: reference })
          });

          if (nombaRes.ok) {
            const nombaData = await nombaRes.json();
            const tx = nombaData?.data || {};

            // Nomba returns 'SUCCESS', 'SUCCESSFUL', or response code '00' on valid transactions
            if (tx.status === "SUCCESS" || tx.status === "SUCCESSFUL" || nombaData.code === "00") {
              const metadata = tx.metadata || {};
              const isMaxTier = reference.includes("PRO_MAX") || reference.includes("BUSINESS_MAX") || metadata.planId === "pro_yearly_business_max";
              const isProLite = reference.includes("PRO_LITE") || metadata.planId === "pro_business_lite";

              verifiedData = {
                status: "active",
                userId: metadata.userId || subscriptionRecord?.userId,
                planId: isMaxTier ? "pro_yearly_business_max" : (isProLite ? "pro_business_lite" : "pro"),
                planName: isMaxTier ? "Pro Yearly Business Max Plan" : (isProLite ? "Pro Business Lite Plan" : (metadata.planName || "Pro Plan")),
                durationMonths: isMaxTier ? 12 : Number(metadata.months || 1),
                finalPrice: tx.amount || 0,
                productLimit: isMaxTier ? 999999 : (isProLite ? 500 : 20)
              };
            }
          }
        } catch (fetchErr) {
          console.error("⚠️ Failed to verify with Nomba API endpoint:", fetchErr);
        }
      }

      // If validation criteria is verified, immediately provision authorization clearance rights
      if (verifiedData && verifiedData.userId) {
        const now = new Date();
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + verifiedData.durationMonths);

        const updatedSubPayload = {
          ...subscriptionRecord,
          status: "active",
          nombaReference: reference,
          userId: verifiedData.userId,
          planId: verifiedData.planId,
          planName: verifiedData.planName,
          durationMonths: verifiedData.durationMonths,
          productLimit: verifiedData.productLimit,
          finalPrice: verifiedData.finalPrice,
          paidAt: now.toISOString(),
          startDate: now.toISOString(),
          expiryDate: expiry.toISOString(),
          updatedAt: now.toISOString()
        };

        // Commit subscription transaction update rules
        await docRef.set(updatedSubPayload, { merge: true });

        // Build premium activation settings layout conditionally based on selected tier rights
        const isMaxTier = verifiedData.planId === "pro_yearly_business_max";

        const userFeaturesUpdate: Record<string, any> = {
          isPremium: true,
          planId: verifiedData.planId,
          planName: verifiedData.planName,
          productLimit: verifiedData.productLimit,

          // Shared Premium features (Pro Lite & Max Tiers)
          hasProBadge: true,
          hasRealtimeChatSupport: true,
          hasAdvancedAnalytics: true,
          hasPrioritySupport: true,
          prioritySupportResponseHours: isMaxTier ? 1 : 4, // 1 hour response for Max, 4 hours for Pro Lite

          // Business Max Exclusive features
          hasCustomBranding: isMaxTier,
          hasCustomDomain: isMaxTier,
          hasApiAccess: isMaxTier,
          hasDedicatedAccountManager: isMaxTier,
          hasEarlyFeatureAccess: isMaxTier,

          premiumActivatedAt: now.toISOString(),
          premiumExpiresAt: expiry.toISOString(),
          updatedAt: now.toISOString()
        };

        // Upgrades corresponding Vendor Profile Access Control fields inside Firebase
        await adminDb.collection("users").doc(verifiedData.userId).set(userFeaturesUpdate, { merge: true });

        // ✅ FIX: ALSO UPDATE STORES COLLECTION
        // Keeps store-level subscription plan and partner status in sync with checkout tier checks
        await adminDb.collection("stores").doc(verifiedData.userId).set({
          subscriptionPlan: verifiedData.planId,
          isPartner: isMaxTier,
          partnerExpiry: expiry.toISOString(),
          updatedAt: now.toISOString()
        }, { merge: true });

        console.log(`🎉 [ Activation Success ] Upgraded User & Store ${verifiedData.userId} to ${verifiedData.planName}.`);

        await sendSubscriptionConfirmationEmail({
          ...updatedSubPayload,
          id: docRef.id,
          nombaReference: reference,
        });

        // ==========================================
        // ✅ SEND SUBSCRIPTION NOTIFICATION (FIRESTORE + NOVU)
        // ==========================================
        const targetUserId = verifiedData.userId;
        const notifConfig = {
          type: "system",
          priority: "medium",
          title: "Subscription Activated! 👑",
          body: `Your ${verifiedData.planName} is now active. Enjoy premium features!`,
          actionUrl: "/dashboard?tab=overview",
          actionLabel: "Go to Dashboard"
        };

        // 1️⃣ WRITE TO FIRESTORE (Powers your NotificationsTab)
        try {
          await adminDb.collection("notifications").add({
            vendorId: targetUserId,
            ...notifConfig,
            actionable: true,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (notifErr) {
          console.error("❌ Failed to write notification to Firestore:", notifErr);
        }

        // 2️⃣ TRIGGER NOVU (Powers your Bell Icon)
        try {
          await novu.trigger('webhook-notification', {
            to: { subscriberId: targetUserId },
            payload: notifConfig
          });
          console.log(`✅ [NOVU] Triggered subscription notification for ${targetUserId}`);
        } catch (novuErr) {
          console.error("❌ [NOVU] Failed to trigger:", novuErr);
        }

        subscriptionRecord = updatedSubPayload;
      }
    }

    // Return a 404 block instead of 200 if still processing, signaling frontend to continue polling cleanly
    if (!subscriptionRecord || subscriptionRecord.status !== "active") {
      return NextResponse.json({
        error: "Subscription transaction verification processing",
        status: "pending_payment"
      }, { status: 404 });
    }

    // Calculate fallback expirations mappings
    let expiryDateStr = subscriptionRecord.expiryDate;
    const rawStatus = subscriptionRecord.status || "pending_payment";
    const isExpired = expiryDateStr ? new Date(expiryDateStr).getTime() < Date.now() : false;
    const effectiveStatus = rawStatus === "active" && isExpired ? "expired" : rawStatus;

    // Universal compatible JSON layout payload
    return NextResponse.json({
      success: true,
      status: effectiveStatus,
      planName: subscriptionRecord.planName || "Subscription Plan",
      subscription: {
        id: docSnap.id || reference,
        ...subscriptionRecord,
        status: effectiveStatus,
        expiryDate: expiryDateStr,
      },
      data: {
        id: docSnap.id || reference,
        ...subscriptionRecord,
        status: effectiveStatus,
        expiryDate: expiryDateStr,
      },
      id: docSnap.id || reference,
      expiryDate: expiryDateStr,
      durationMonths: subscriptionRecord.durationMonths || 1,
      paidAt: subscriptionRecord.paidAt || null,
      nombaReference: subscriptionRecord.nombaReference || reference
    });

  } catch (error: any) {
    console.error("❌ Subscription Status Check Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal validation parsing exception" },
      { status: 500 }
    );
  }
}
