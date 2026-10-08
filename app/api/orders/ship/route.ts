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

function orderProductImage(order: Record<string, any>): string | undefined {
  const firstItem = Array.isArray(order.items) && order.items[0] && typeof order.items[0] === "object"
    ? order.items[0]
    : {};
  const candidates = [
    order.productImage,
    order.imageUrl,
    order.image,
    firstItem.image,
    firstItem.imageUrl,
    firstItem.thumbnail,
    Array.isArray(order.images) ? order.images[0] : undefined,
  ];
  const image = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof image === "string" ? image.trim() : undefined;
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
      const orderIsSelfArranged = order.shippingMethod === "self_arranged" || order.deliveryMode === "self_arranged";
      const requestedSelfArranged = carrier.toLowerCase() === "self_arranged";
      if (requestedSelfArranged && !orderIsSelfArranged) {
        throw new ShipOrderError("This order was not placed with self-arranged delivery", 409);
      }
      const isSelfArranged = orderIsSelfArranged || requestedSelfArranged;
      const isServiceOrBooking =
        order.productType === 'service' ||
        order.productType === 'booking' ||
        order.productType === 'utility' ||
        (Array.isArray(order.items) && order.items.some((i: any) => i.bookingDate || i.bookingSlot));

      // Validation: Tracking ID is required ONLY for physical items
      if (!isServiceOrBooking) {
        if (!isSelfArranged && !trackingId) throw new ShipOrderError("Tracking ID is required for physical shipments");
        if (!isSelfArranged && !carrier) throw new ShipOrderError("Carrier is required for physical shipments");
      }

      const rawStatus = String(order.status || "").toUpperCase();
      const fundsState = String(order.fundsState || "").toLowerCase();
      const paymentStatus = String(order.paymentStatus || "").toLowerCase();
      const paymentHeld = fundsState === "held" || (
        paymentStatus === "paid" &&
        ["PAID_HELD", "SHIPPED", "OUT_FOR_DELIVERY", "WORK_DONE", "COMPLETED_PENDING_BUYER"].includes(rawStatus)
      );
      if (!paymentHeld) {
        throw new ShipOrderError("Payment must be confirmed and held in escrow before handover", 409);
      }

      // If already shipped or completed, return early
      if (["SHIPPED", "WORK_DONE", "COMPLETED_PENDING_BUYER"].includes(rawStatus)) {
        return { alreadyUpdated: true, status: rawStatus, isSelfArranged, notificationOrder: null };
      }

      if (!["PAID_HELD", "PENDING", "IN_PROGRESS"].includes(rawStatus)) {
        throw new ShipOrderError(`Order status cannot be updated from ${order.status || "unknown"}`, 409);
      }

      const now = FieldValue.serverTimestamp();
      const nextStatus = isServiceOrBooking ? "COMPLETED_PENDING_BUYER" : "SHIPPED";

      const updatePayload: Record<string, any> = {
        status: nextStatus,
        deliveryStatus: "IN_TRANSIT",
        shippedAt: now,
        updatedAt: now,
      };

      if (!isServiceOrBooking) {
        if (trackingId) updatePayload.trackingId = trackingId;
        updatePayload.carrier = carrier || "Self-arranged";
        updatePayload.courierName = carrier || order.courierName || "Self-arranged";
        updatePayload.handoverMethod = isSelfArranged ? "self_arranged" : "courier";
        updatePayload.handoverAt = now;
        updatePayload.handoverBy = decoded.uid;
      }

      transaction.update(orderRef, updatePayload);

      // Notify Buyer
      if (typeof order.buyerId === "string" && order.buyerId) {
        transaction.create(adminDb.collection("notifications").doc(), {
          buyerId: order.buyerId,
          type: isServiceOrBooking ? "service_completed" : (isSelfArranged ? "order_handover" : "order_shipped"),
          title: isServiceOrBooking ? "Service completed" : "Order update",
          orderId,
          productImage: orderProductImage(order) || null,
          message: isServiceOrBooking
            ? `Work for your order from ${order.storeName || "the provider"} has been completed. Please review and release funds.`
            : isSelfArranged
              ? `The seller has handed over your order from ${order.storeName || "the seller"}. It is now in transit.`
              : `Your order from ${order.storeName || "the seller"} has been handed over to ${carrier || order.courierName || "the courier"} and is now in transit.`,
          read: false,
          createdAt: now,
        });
      }

      return { alreadyUpdated: false, status: nextStatus, isSelfArranged, notificationOrder: { id: orderSnap.id, ...order } };
    });

    // Keep the shipment timeline aligned with the seller's manual handoff
    // action. This is especially important for self-arranged orders, where
    // there is no external courier webhook to advance the shipment.
    if (!result.alreadyUpdated && result.status === "SHIPPED") {
      const shipmentSnap = await adminDb.collection("shipments").where("orderId", "==", orderId).limit(1).get();
      if (!shipmentSnap.empty) {
        await shipmentSnap.docs[0].ref.update({
          status: "SHIPPED",
          deliveryStatus: "IN_TRANSIT",
          dispatchStatus: result.isSelfArranged ? "NOT_REQUIRED" : "MANUAL_HANDOVER",
          handoverMethod: result.isSelfArranged ? "self_arranged" : "courier",
          handoverAt: FieldValue.serverTimestamp(),
          handoverBy: decoded.uid,
          updatedAt: FieldValue.serverTimestamp(),
          ...(trackingId ? { trackingId } : {}),
          ...(carrier ? { courierName: carrier } : {}),
        });
      }
    }

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
