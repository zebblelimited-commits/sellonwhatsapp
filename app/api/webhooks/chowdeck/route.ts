import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { notifyOrderStatus } from "@/lib/novu-events";

export const runtime = "nodejs";

function timingSafeSignatureMatch(rawBody: string, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function normaliseStatus(value: unknown): "preparing" | "awaiting_pickup" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | null {
  const status = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["received", "preparing", "order_created", "order_assigned"].includes(status)) return "preparing";
  if (["awaiting_pickup", "pickup"].includes(status)) return "awaiting_pickup";
  if (["picked", "picked_up", "in_transit", "shipped"].includes(status)) return "shipped";
  if (["arrived", "out_for_delivery", "on_delivery"].includes(status)) return "out_for_delivery";
  if (["success", "completed", "delivered", "order_complete"].includes(status)) return "delivered";
  if (["rejected", "cancelled", "canceled", "failed", "returned"].includes(status)) return "cancelled";
  return null;
}

function eventType(status: ReturnType<typeof normaliseStatus>) {
  if (status === "shipped") return "order-shipped";
  if (status === "out_for_delivery") return "order-out-for-delivery";
  if (status === "delivered") return "order-delivered";
  if (status === "cancelled") return "order-cancelled";
  return null;
}

async function findShipments(reference: string) {
  const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const field of ["shipmentId", "providerReference", "trackingId", "courierOrderId"]) {
    const snapshot = await adminDb.collection("shipments").where(field, "==", reference).limit(20).get();
    snapshot.docs.forEach((document) => matches.set(document.id, document));
  }
  return Array.from(matches.values());
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const secret = process.env.CHOWDECK_WEBHOOK_SECRET;
    const signature = request.headers.get("x-chowdeck-signature");
    if (!secret || !signature || !timingSafeSignatureMatch(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid Chowdeck webhook signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      category?: string;
      payload?: {
        reference?: unknown;
        status?: unknown;
        tracking_url?: unknown;
      };
    };
    const payload = body.payload || {};
    const reference = String(payload.reference || "").trim();
    const status = normaliseStatus(payload.status || body.category);
    if (!reference || !status) {
      return NextResponse.json({ received: true, processed: false });
    }

    const shipments = await findShipments(reference);
    const notificationType = eventType(status);
    await Promise.allSettled(shipments.map(async (shipment) => {
      const data = shipment.data() || {};
      const orderId = typeof data.orderId === "string" ? data.orderId : "";
      await shipment.ref.update({
        status: status.toUpperCase(),
        providerStatus: payload.status || body.category,
        ...(status === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
        ...(payload.tracking_url ? { trackingUrl: payload.tracking_url } : {}),
        dispatchStatus: status === "delivered" ? "COMPLETED" : status === "cancelled" ? "FAILED" : "IN_PROGRESS",
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (!orderId) return;
      const orderRef = adminDb.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) return;
      const order = orderSnap.data() || {};
      await orderRef.update({
        deliveryStatus: status.toUpperCase(),
        courierStatus: payload.status || body.category,
        ...(payload.tracking_url ? { trackingUrl: payload.tracking_url } : {}),
        ...(status === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (notificationType) {
        await notifyOrderStatus({ id: orderSnap.id, ...order, trackingId: order.trackingId || reference }, notificationType);
      }
    }));

    console.log(`[CHOWDECK WEBHOOK] ${reference} -> ${status} (${shipments.length} shipment(s))`);
    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error("[CHOWDECK WEBHOOK] Processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
