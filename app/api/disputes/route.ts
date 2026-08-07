import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

class DisputeCreateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DisputeCreateError";
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authHeader.slice("Bearer ".length).trim());
    const body = await request.json() as { orderId?: unknown; reason?: unknown; description?: unknown; evidence?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "other";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const evidence = Array.isArray(body.evidence) ? body.evidence : [];
    if (!orderId) throw new DisputeCreateError("Order ID is required");
    if (!description) throw new DisputeCreateError("Please describe the issue");

    const result = await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection("orders").doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new DisputeCreateError("Order not found", 404);
      const order = orderSnap.data() || {};
      if (order.buyerId !== decoded.uid) throw new DisputeCreateError("Only the buyer can open this dispute", 403);

      const existingDisputeId = typeof order.disputeId === "string" ? order.disputeId : "";
      if (existingDisputeId) {
        const existingRef = adminDb.collection("disputes").doc(existingDisputeId);
        const existingSnap = await transaction.get(existingRef);
        if (existingSnap.exists) return { disputeId: existingDisputeId, alreadyExists: true };
      }

      const disputeRef = adminDb.collection("disputes").doc();
      const now = FieldValue.serverTimestamp();
      transaction.create(disputeRef, {
        orderId,
        buyerId: decoded.uid,
        vendorId: typeof order.vendorId === "string" ? order.vendorId : "",
        buyerEmail: decoded.email || order.customerEmail || null,
        vendorName: order.storeName || null,
        reason,
        description,
        evidence,
        amount: Number(order.totalAmount || 0),
        status: "open",
        read: false,
        buyerResponded: false,
        vendorResponded: false,
        adminResponded: false,
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(orderRef, {
        status: "DISPUTED",
        disputeId: disputeRef.id,
        disputeReason: reason,
        disputeDescription: description,
        disputedAt: now,
        updatedAt: now,
      });

      const vendorId = typeof order.vendorId === "string" ? order.vendorId : "";
      if (vendorId) {
        const notificationRef = adminDb.collection("notifications").doc();
        transaction.create(notificationRef, {
          vendorId,
          type: "dispute_opened",
          disputeId: disputeRef.id,
          orderId,
          message: "A buyer opened a dispute for one of your orders.",
          read: false,
          createdAt: now,
        });
      }
      return { disputeId: disputeRef.id, alreadyExists: false };
    });

    return NextResponse.json({ success: true, ...result }, { status: result.alreadyExists ? 200 : 201 });
  } catch (error: unknown) {
    console.error("Create dispute API error:", error);
    const status = error instanceof DisputeCreateError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create dispute" }, { status });
  }
}
