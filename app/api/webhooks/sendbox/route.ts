import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { notifyOrderStatus } from "@/lib/novu-events";

export const runtime = "nodejs";

type SendboxPayload = Record<string, unknown>;

function text(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function nestedText(value: unknown, key: string) {
    if (!value || typeof value !== "object") return "";
    return text((value as SendboxPayload)[key]);
}

function statusOf(payload: SendboxPayload) {
    return text(payload.status_code)
        || nestedText(payload.current_status, "code")
        || nestedText(payload.status, "code")
        || text(payload.status)
        || nestedText(payload.package_delivery_status, "code");
}

function referenceOf(payload: SendboxPayload) {
    return text(payload.code)
        || text(payload.tracking_code)
        || text(payload.reference_code)
        || text(payload.shipment_id)
        || text(payload.id)
        || text(payload._id);
}

function normalizedStatus(value: string): "shipped" | "out_for_delivery" | "delivered" | "cancelled" | null {
    const status = value.toLowerCase().replace(/[\s-]+/g, "_");
    if (["pending", "processing", "pickup_started", "pickup_completed", "in_transit", "shipped"].includes(status)) return "shipped";
    if (["in_delivery", "out_for_delivery", "delivery_started"].includes(status)) return "out_for_delivery";
    if (["delivered", "deliverd", "completed", "success"].includes(status)) return "delivered";
    if (["cancelled", "canceled", "failed", "returned", "rejected"].includes(status)) return "cancelled";
    return null;
}

async function findShipments(reference: string) {
    const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const field of ["shipmentId", "orderId", "trackingId", "providerReference", "courierOrderId"]) {
        const snapshot = await adminDb.collection("shipments").where(field, "==", reference).limit(20).get();
        snapshot.docs.forEach((document) => matches.set(document.id, document));
    }
    return Array.from(matches.values());
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as SendboxPayload;
        const payload = body.payload && typeof body.payload === "object"
            ? body.payload as SendboxPayload
            : body;
        const reference = referenceOf(payload);
        const nextStatus = normalizedStatus(statusOf(payload));

        if (!reference || !nextStatus) {
            return NextResponse.json({ received: true, processed: false });
        }

        const shipments = await findShipments(reference);
        const orderIds = new Set<string>();

        await Promise.all(shipments.map(async (shipment) => {
            const data = shipment.data() || {};
            const orderId = text(data.orderId);
            if (orderId) orderIds.add(orderId);
            await shipment.ref.update({
                status: nextStatus.toUpperCase(),
                providerStatus: statusOf(payload),
                dispatchStatus: nextStatus === "delivered" ? "COMPLETED" : nextStatus === "cancelled" ? "FAILED" : "IN_PROGRESS",
                ...(text(payload.code) ? { trackingId: text(payload.code) } : {}),
                ...(nextStatus === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }));

        const notificationType = nextStatus === "shipped"
            ? "order-shipped"
            : nextStatus === "out_for_delivery"
                ? "order-out-for-delivery"
                : nextStatus === "delivered"
                    ? "order-delivered"
                    : "order-cancelled";

        await Promise.allSettled(Array.from(orderIds).map(async (orderId) => {
            const orderRef = adminDb.collection("orders").doc(orderId);
            const orderSnap = await orderRef.get();
            if (!orderSnap.exists) return;
            const order = orderSnap.data() || {};
            await orderRef.update({
                deliveryStatus: nextStatus.toUpperCase(),
                courierStatus: statusOf(payload),
                ...(text(payload.code) ? { trackingId: text(payload.code) } : {}),
                ...(nextStatus === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });
            await notifyOrderStatus({ id: orderSnap.id, ...order, trackingId: order.trackingId || reference }, notificationType);
        }));

        console.log(`[SENDBOX WEBHOOK] ${reference} -> ${statusOf(payload)} (${shipments.length} shipment(s))`);
        return NextResponse.json({ received: true, processed: true });
    } catch (error) {
        console.error("[SENDBOX WEBHOOK] Processing failed:", error);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
    }
}
