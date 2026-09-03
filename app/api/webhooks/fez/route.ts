// app/api/webhooks/fez/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { notifyOrderStatus } from "@/lib/novu-events";

function normalizedDeliveryStatus(value: unknown): "shipped" | "out_for_delivery" | "delivered" | "cancelled" | null {
    const status = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (["picked_up", "pickup", "in_transit", "shipped", "dispatched", "collected"].includes(status)) return "shipped";
    if (["out_for_delivery", "outfordelivery", "on_delivery"].includes(status)) return "out_for_delivery";
    if (["delivered", "delivery_success", "completed"].includes(status)) return "delivered";
    if (["cancelled", "canceled", "failed", "returned", "undelivered"].includes(status)) return "cancelled";
    return null;
}

async function findShipmentRecords(reference: string) {
    const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const field of ["shipmentId", "orderId", "trackingId", "providerReference", "courierOrderId"]) {
        const snapshot = await adminDb.collection("shipments").where(field, "==", reference).limit(20).get();
        snapshot.docs.forEach((item) => matches.set(item.id, item));
    }
    return Array.from(matches.values());
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orderNumber, status } = body;

        // Extract signature headers
        const signature = req.headers.get("x-signature");
        const timestamp = req.headers.get("x-timestamp");
        const secretKey = process.env.FEZ_SECRET_KEY;

        if (signature && timestamp && secretKey) {
            // Verify HMAC-SHA256 signature
            const payloadToSign = `${orderNumber}${status}${timestamp}`;
            const computedSignature = crypto
                .createHmac("sha256", secretKey)
                .update(payloadToSign)
                .digest("hex");

            if (computedSignature !== signature) {
                return NextResponse.json(
                    { error: "Invalid HMAC Signature" },
                    { status: 401 }
                );
            }
        }

        const nextStatus = normalizedDeliveryStatus(status);
        console.log(`📦 [FEZ WEBHOOK] Order ${orderNumber} updated status to: ${status}`);
        if (!nextStatus) return NextResponse.json({ status: "Success", message: "Webhook acknowledged; status not mapped" });

        const shipmentRecords = await findShipmentRecords(String(orderNumber || ""));
        const orderIds = new Set<string>();
        for (const shipment of shipmentRecords) {
            const shipmentData = shipment.data() || {};
            const orderId = typeof shipmentData.orderId === "string" ? shipmentData.orderId : "";
            if (orderId) orderIds.add(orderId);
            await shipment.ref.update({
                status: nextStatus.toUpperCase(),
                dispatchStatus: nextStatus === "delivered" ? "COMPLETED" : nextStatus === "cancelled" ? "FAILED" : "IN_PROGRESS",
                providerStatus: status,
                ...(nextStatus === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }

        // Some courier callbacks identify the marketplace order directly and
        // older records may not have a shipment document yet.
        if (shipmentRecords.length === 0) {
            const orderRef = adminDb.collection("orders").doc(String(orderNumber));
            const orderSnap = await orderRef.get();
            if (orderSnap.exists) orderIds.add(orderSnap.id);
        }

        const eventType = nextStatus === "shipped"
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
                courierStatus: status,
                ...(nextStatus === "delivered" ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });
            await notifyOrderStatus({ id: orderSnap.id, ...order, trackingId: order.trackingId || orderNumber }, eventType);
        }));

        return NextResponse.json({ status: "Success", message: "Webhook processed" });
    } catch (error: any) {
        console.error("❌ [FEZ WEBHOOK ERROR]:", error.message);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
    }
}
