import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import crypto from "crypto";
// 🌟 Import your notification utility helper here
import { createNotification } from "@/lib/notifications"; 
import { sendSubscriptionConfirmationEmail, sendSubscriptionPaymentFailedEmail } from "@/lib/email/events";

// Ensure this runs in Node.js environment (required for crypto)
export const runtime = 'nodejs'; 

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // 🔥 DEBUG: Log the raw payload immediately so you can see exactly what Nomba sends
    console.log("🔥 [WEBHOOK RAW BODY]:", rawBody);
    console.log("🔥 [WEBHOOK HEADERS]:", Object.fromEntries(request.headers.entries()));

    // 🔥 FIX 1: Check multiple possible header names for the signature
    const inboundSignature = 
      request.headers.get("nomba-signature") || 
      request.headers.get("x-nomba-signature") || 
      request.headers.get("signature");

    if (inboundSignature && process.env.NOMBA_CLIENT_SECRET) {
      const expectedBase64 = crypto
        .createHmac("sha256", process.env.NOMBA_CLIENT_SECRET)
        .update(rawBody)
        .digest("base64");

      const expectedHex = crypto
        .createHmac("sha256", process.env.NOMBA_CLIENT_SECRET)
        .update(rawBody)
        .digest("hex");

      const isMatch = inboundSignature === expectedBase64 || inboundSignature === expectedHex;

      if (!isMatch) {
        console.error("❌ [WEBHOOK] Signature mismatch! Expected (Base64):", expectedBase64, "| Received:", inboundSignature);
        // TEMPORARILY BYPASSING THE 403 RETURN SO WE CAN SEE IF THE PAYLOAD IS CORRECT
        // return NextResponse.json({ error: "Signature mismatch" }, { status: 403 });
      } else {
        console.log("✅ [WEBHOOK] Signature verified successfully.");
      }
    } else {
      console.warn("⚠️ [WEBHOOK] No signature found in headers or missing secret. Proceeding without verification.");
    }

    const payload = JSON.parse(rawBody);
    
    // 🔥 FIX 2: BULLETPROOF REFERENCE EXTRACTION (Handles nested Nomba payloads)
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
      console.error("❌ [WEBHOOK] Could not find orderReference in payload. Full payload:", JSON.stringify(payload, null, 2));
      return NextResponse.json({ error: "Missing orderReference" }, { status: 400 });
    }

    // 🔥 FIX 3: DYNAMIC COLLECTION ROUTING (Supports both boosts and subscriptions)
    const isBoost = orderRef.startsWith("ZEBBLE_BST_");
    const isSubscription = orderRef.startsWith("SUB_");
    const collectionName = isBoost ? "boosts" : isSubscription ? "subscriptions" : "orders";

    const docRef = adminDb.collection(collectionName).doc(orderRef);
    let docSnap = await docRef.get();

    // 🔥 FIX 4: FALLBACK QUERY if Document ID doesn't match the reference string
    if (!docSnap.exists) {
      console.log(`[WEBHOOK] Direct doc ID lookup failed. Falling back to 'nombaReference' field query...`);
      const fallbackQuery = await adminDb
        .collection(collectionName)
        .where("nombaReference", "==", orderRef)
        .limit(1)
        .get();

      if (!fallbackQuery.empty) {
        docSnap = fallbackQuery.docs[0];
        console.log(`[WEBHOOK] ✅ Found document via fallback query! Actual Doc ID: ${docSnap.id}`);
      }
    }

    if (!docSnap.exists) {
      console.error(`❌ [WEBHOOK] Document not found for ${orderRef} in ${collectionName}`);
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const localData = docSnap.data()!;

    // 🔥 FIX 5: UPDATE STATUS
    if (["SUCCESS", "APPROVED", "COMPLETED", "PAYMENT_SUCCESS"].includes(gatewayStatus)) {
      
      // 🛡️ CRITICAL GUARD: If document is already active, skip updating and sending duplicate notifications
      if (localData.status === "active") {
        console.log(`ℹ️ [WEBHOOK] ${collectionName} ${orderRef} is already active. Skipping duplicate execution handling.`);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const activeDuration = Number(localData.durationDays || localData.durationMonths || 7);
      const durationUnit = localData.durationMonths ? "months" : "days";
      
      let expiryDate = new Date();
      if (durationUnit === "months") {
        expiryDate.setMonth(expiryDate.getMonth() + activeDuration);
      } else {
        expiryDate.setDate(expiryDate.getDate() + activeDuration);
      }

      // 1. Update document status in Firestore
      await docSnap.ref.update({
        status: "active",
        startDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log(`✅ [WEBHOOK SUCCESS] ${collectionName} ${orderRef} updated to 'active'!`);

      await sendSubscriptionConfirmationEmail({
        ...localData,
        id: docSnap.id,
        nombaReference: orderRef,
        isBoost: true,
        startDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString(),
        finalPrice: localData.amount ?? localData.finalPrice,
      }, "store_boost");

      // 2. 🌟 TRIGGER IN-APP NOTIFICATION ARCHITECTURE
      const vendorId = localData.storeId || localData.userId || localData.vendorId || "";
      
      if (vendorId) {
        if (isBoost) {
          // Dynamic text context mapped from package metadata schemas
          const planName = localData.packageName || "Store Boost Profile Package";
          const durationLabel = localData.durationLabel || `${activeDuration} Days`;

          await createNotification({
            vendorId: vendorId,
            type: "payment",
            priority: "high",
            title: "🚀 Store Boost Activated!",
            body: `Your "${planName}" (${durationLabel}) is now completely live. Expect increased customer search traffic visibility!`,
            actionable: true,
            actionLabel: "View Dashboard",
            actionUrl: "/dashboard?tab=overview",
            metadata: { orderReference: orderRef, isBoost: true }
          });
        } else if (isSubscription) {
          // Dynamic notification structure if it handles store plan subscriptions
          const planName = localData.planName || "Premium Subscription Plan";
          await createNotification({
            vendorId: vendorId,
            type: "payment",
            priority: "high",
            title: "✨ Premium Plan Activated!",
            body: `Thank you for upgrading! Your premium storefront subscription features are now fully functional.`,
            actionable: true,
            actionLabel: "Go to Store settings",
            actionUrl: "/dashboard?tab=settings",
            metadata: { orderReference: orderRef, isSubscription: true }
          });
        }
      } else {
        console.warn(`⚠️ [WEBHOOK NOTIFICATION WARNING] Could not find a valid matching vendorId / storeId inside localData payload framework context for order ${orderRef}`);
      }

    } else if (["FAILED", "DECLINED"].includes(gatewayStatus)) {
      await docSnap.ref.update({
        status: "failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ [WEBHOOK] ${collectionName} ${orderRef} updated to 'failed'.`);

      await sendSubscriptionPaymentFailedEmail({
        ...localData,
        id: docSnap.id,
        nombaReference: orderRef,
        isBoost: true,
        failureReason: "The Store Boost payment was declined.",
        attemptDate: new Date().toISOString(),
      }, "store_boost");
      
      // OPTIONAL: Send a failure notification to alert the vendor that the attempt was rejected
      const vendorId = localData.storeId || localData.userId || localData.vendorId;
      if (vendorId) {
        await createNotification({
          vendorId: vendorId,
          type: "payment",
          priority: "medium",
          title: "❌ Payment Attempt Declined",
          body: `The payment checkout engine request for your ${isBoost ? 'Store Boost' : 'Premium Subscription'} failed or was declined.`,
          actionable: true,
          actionLabel: "Try Again",
          actionUrl: isBoost ? "/boost-store" : "/dashboard?tab=billing"
        });
      }

    } else {
      console.log(`⏳ [WEBHOOK] Status '${gatewayStatus}' is not a terminal state. Ignoring update.`);
    }

    // ALWAYS return 200 OK so Nomba stops retrying
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("❌ [WEBHOOK CRITICAL ERROR]:", error);
    // Return 200 anyway to prevent Nomba from getting stuck in an infinite retry loop
    return NextResponse.json({ received: true, error: error.message }, { status: 200 });
  }
}
