import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

class ShipOrderError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ShipOrderError";
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ShipOrderError("Authentication required", 401);

    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
    const body = await request.json() as { orderId?: unknown; trackingId?: unknown; carrier?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const trackingId = typeof body.trackingId === "string" ? body.trackingId.trim() : "";
    const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";

    if (!orderId) throw new ShipOrderError("Order ID is required");
    if (!trackingId) throw new ShipOrderError("Tracking ID is required");
    if (!carrier) throw new ShipOrderError("Carrier is required");

    const result = await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection("orders").doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new ShipOrderError("Order not found", 404);

      const order = orderSnap.data() || {};
      if (order.vendorId !== decoded.uid) throw new ShipOrderError("You cannot ship this order", 403);

      const rawStatus = String(order.status || "").toUpperCase();
      const status = ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(rawStatus) ? "SHIPPED" : rawStatus;
      if (status === "SHIPPED") {
        return { alreadyShipped: true, trackingId: String(order.trackingId || trackingId) };
      }
      if (status !== "PAID_HELD") {
        throw new ShipOrderError(`Order cannot be shipped from status ${order.status || "unknown"}`, 409);
      }

      const now = FieldValue.serverTimestamp();
      transaction.update(orderRef, {
        status: "SHIPPED",
        shippedAt: now,
        trackingId,
        carrier,
        updatedAt: now,
      });

      if (typeof order.buyerId === "string" && order.buyerId) {
        transaction.create(adminDb.collection("notifications").doc(), {
          buyerId: order.buyerId,
          type: "order_shipped",
          orderId,
          message: `Your order from ${order.storeName || "the seller"} is now in transit.`,
          read: false,
          createdAt: now,
        });
      }

      return { alreadyShipped: false, trackingId };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Ship order API error:", error);
    const status = error instanceof ShipOrderError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to ship order" }, { status });
  }
}
