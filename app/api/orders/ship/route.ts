import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notifyOrderStatus } from "@/lib/novu-events";

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

    const result = await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection("orders").doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new ShipOrderError("Order not found", 404);

      const order = orderSnap.data() || {};

      // Verify vendor ownership (supporting vendorId or storeId)
      const vendorId = order.vendorId || order.storeId;
      if (vendorId !== decoded.uid) throw new ShipOrderError("You cannot update this order", 403);

      // Detect if order is non-physical / service
      const isServiceOrBooking =
        order.productType === 'service' ||
        order.productType === 'booking' ||
        order.productType === 'utility' ||
        order.shippingMethod === 'self_arranged' ||
        (Array.isArray(order.items) && order.items.some((i: any) => i.bookingDate || i.bookingSlot));

      // Validation: Tracking ID is required ONLY for physical items
      if (!isServiceOrBooking) {
        if (!trackingId) throw new ShipOrderError("Tracking ID is required for physical shipments");
        if (!carrier) throw new ShipOrderError("Carrier is required for physical shipments");
      }

      const rawStatus = String(order.status || "").toUpperCase();

      // If already shipped or completed, return early
      if (["SHIPPED", "WORK_DONE", "COMPLETED_PENDING_BUYER"].includes(rawStatus)) {
        return { alreadyUpdated: true, status: rawStatus, notificationOrder: null };
      }

      if (!["PAID_HELD", "PENDING", "IN_PROGRESS"].includes(rawStatus)) {
        throw new ShipOrderError(`Order status cannot be updated from ${order.status || "unknown"}`, 409);
      }

      const now = FieldValue.serverTimestamp();
      const nextStatus = isServiceOrBooking ? "COMPLETED_PENDING_BUYER" : "SHIPPED";

      const updatePayload: Record<string, any> = {
        status: nextStatus,
        shippedAt: now,
        updatedAt: now,
      };

      if (!isServiceOrBooking) {
        updatePayload.trackingId = trackingId;
        updatePayload.carrier = carrier;
      }

      transaction.update(orderRef, updatePayload);

      // Notify Buyer
      if (typeof order.buyerId === "string" && order.buyerId) {
        transaction.create(adminDb.collection("notifications").doc(), {
          buyerId: order.buyerId,
          type: isServiceOrBooking ? "service_completed" : "order_shipped",
          orderId,
          message: isServiceOrBooking
            ? `Work for your order from ${order.storeName || "the provider"} has been completed. Please review and release funds.`
            : `Your order from ${order.storeName || "the seller"} is now in transit.`,
          read: false,
          createdAt: now,
        });
      }

      return { alreadyUpdated: false, status: nextStatus, notificationOrder: { id: orderSnap.id, ...order } };
    });

    if (!result.alreadyUpdated && result.notificationOrder) {
      try {
        await notifyOrderStatus(result.notificationOrder, "order-shipped");
      } catch (notificationError) {
        console.error("[NOVU WHATSAPP] Order-shipped notification failed:", notificationError);
      }
    }

    const { notificationOrder: _notificationOrder, ...responseResult } = result;
    return NextResponse.json({ success: true, ...responseResult });
  } catch (error: unknown) {
    console.error("Update order API error:", error);
    const status = error instanceof ShipOrderError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update order" }, { status });
  }
}
