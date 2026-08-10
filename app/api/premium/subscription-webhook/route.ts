import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// ✅ Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
    }),
  });
}
const adminDb = admin.firestore();

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);
    
    // ✅ Log full payload for debugging (remove in production)
    console.log("🔔 Subscription Webhook Payload:", JSON.stringify(payload, null, 2));

    // ✅ CORRECT: Extract fields matching actual Nomba payload structure (mirrors boost webhook)
    const eventType = payload.event_type; // "payment_success", "payment_failed", etc.
    const orderRef = payload.data?.order?.orderReference; // ✅ Nested in data.order
    const transactionStatus = payload.data?.transaction?.status?.toUpperCase();
    
    // Determine success: either event_type indicates success OR transaction status
    const isSuccess = eventType === "payment_success" || 
                     transactionStatus === "SUCCESS" || 
                     transactionStatus === "APPROVED" || 
                     transactionStatus === "COMPLETED";
    const isFailure = eventType === "payment_failed" || 
                     transactionStatus === "FAILED" || 
                     transactionStatus === "DECLINED";

    console.log(`🔔 Subscription Webhook: ${orderRef} | Event: ${eventType} | TxStatus: ${transactionStatus}`);

    // ✅ Handle missing reference gracefully (test pings)
    if (!orderRef) {
      console.log("[Webhook] Received event without orderReference (Test/Ping). Acknowledging.");
      return NextResponse.json({ message: "Acknowledged" }, { status: 200 });
    }

    // ✅ Query subscriptions collection with CORRECT field name (must match checkout route)
    const querySnapshot = await adminDb
      .collection("subscriptions")
      .where("nombaReference", "==", orderRef)  // ✅ Must exactly match checkout's field name
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      // 🔍 Debug: Log what we searched for
      console.error(`❌ Subscription not found for nombaReference: ${orderRef}`);
      
      // Optional fallback: Try lookup by document ID
      const docById = await adminDb.collection("subscriptions").doc(orderRef).get();
      if (docById.exists) {
        console.log(`✅ Found by doc ID: ${orderRef}`);
        // Continue processing with docById...
        return processSubscriptionDoc(docById, isSuccess, isFailure, transactionStatus, eventType);
      }
      
      return NextResponse.json({ 
        error: "Subscription record not found", 
        searchedReference: orderRef,
        searchedField: "nombaReference"
      }, { status: 200 }); // Return 200 so Nomba stops retrying
    }

    const doc = querySnapshot.docs[0];
    return await processSubscriptionDoc(doc, isSuccess, isFailure, transactionStatus, eventType);

  } catch (error: any) {
    console.error("❌ CRITICAL Webhook Error:", error);
    // Return 500 so Nomba retries later
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// ✅ Extracted helper function (mirrors boost webhook pattern)
async function processSubscriptionDoc(
  doc: admin.firestore.DocumentSnapshot,
  isSuccess: boolean,
  isFailure: boolean,
  transactionStatus?: string,
  eventType?: string,
) {
  const data = doc.data() || {};
  const orderRef = data.nombaReference;

  // ✅ Prevent double-processing (idempotency)
  if (data.status === "active") {
    console.log(`ℹ️ Subscription ${orderRef} already active - skipping update`);
    return NextResponse.json({ message: "Already processed", status: "active" }, { status: 200 });
  }

  // ✅ Handle Payment Success (mirrors boost webhook logic)
  if (isSuccess) {
    const durationMonths = data.durationMonths || 1;
    // Use 30.44 days = average month length for accuracy (mirrors boost's day calculation)
    const msInMonth = 1000 * 60 * 60 * 24 * 30.44;
    const expiryDate = new Date(Date.now() + (durationMonths * msInMonth));

    await doc.ref.update({
      status: "active",                    // ✅ Same as boost: "active"
      startDate: new Date().toISOString(), // ✅ Same as boost
      expiryDate: expiryDate.toISOString(),// ✅ Calculated like boost's expiryDate
      paidAt: new Date().toISOString(),    // ✅ Same as boost
      nombaTransactionId: data.nombaTransactionId || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Subscription Activated: ${orderRef} | Expires: ${expiryDate.toISOString()} | Duration: ${durationMonths} months`);
    return NextResponse.json({ 
      received: true, 
      status: "active",
      expiryDate: expiryDate.toISOString(),
      reference: orderRef
    }, { status: 200 });
  } 
  
  // ✅ Handle Payment Failure (mirrors boost webhook)
  if (isFailure) {
    await doc.ref.update({
      status: "failed",                    // ✅ Same as boost: "failed"
      failedAt: new Date().toISOString(),
      failureReason: transactionStatus || "Payment declined",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`❌ Subscription Failed: ${orderRef} | Reason: ${transactionStatus}`);
    return NextResponse.json({ received: true, status: "failed", reference: orderRef }, { status: 200 });
  }

  // ✅ Acknowledge other events (pending, refunded, etc.)
  console.log(`ℹ️ Unhandled event for ${orderRef}: event_type=${eventType}, tx_status=${transactionStatus}`);
  return NextResponse.json({ received: true, event: eventType }, { status: 200 });
}
