import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import admin from "firebase-admin";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify User
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.split(" ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { orderId } = await request.json();
    if (!orderId) return NextResponse.json({ error: "Order ID required" }, { status: 400 });

    // 2. Fetch Order
    const orderDoc = await adminDb.collection("orders").doc(orderId).get();
    if (!orderDoc.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const orderData = orderDoc.data();
    
    // Security: Ensure the user is the vendor or buyer of this order
    if (orderData.vendorId !== userId && orderData.buyerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent double completion
    if (orderData.status === "COMPLETED") {
      return NextResponse.json({ error: "Order already completed" }, { status: 400 });
    }

    const orderAmount = orderData.totalAmount || 0;
    const storeId = orderData.vendorId;

    // 3. Batch Update Firestore
    const batch = adminDb.batch();

    // A. Update Order Status
    batch.update(adminDb.collection("orders").doc(orderId), {
      status: "COMPLETED",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // B. Update Store Balances (Move from Escrow to Available)
    // Note: We move the full gross amount here. The platform fee is deducted later in the Withdraw API.
    batch.update(adminDb.collection("stores").doc(storeId), {
      escrowBalance: admin.firestore.FieldValue.increment(-orderAmount),
      availableBalance: admin.firestore.FieldValue.increment(orderAmount),
      totalSales: admin.firestore.FieldValue.increment(orderAmount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: "Order marked as completed and funds released." });

  } catch (error: any) {
    console.error("Complete Order API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}