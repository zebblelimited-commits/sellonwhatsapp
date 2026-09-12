import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notifyOrderPaymentConfirmed } from "@/lib/novu-events";
import { dispatchShipmentForOrder } from "@/lib/shipping-dispatch";
import { nombaBaseUrl, verifyNombaTransaction } from "@/lib/payments/nomba/client";
import { createEscrowRecord, fundEscrowAndOrders, getEscrowByReference } from "@/src/infrastructure/db/escrowService";

class PaymentConfirmationError extends Error {
    constructor(message: string, public status = 400) { super(message); this.name = "PaymentConfirmationError"; }
}

const amountOf = (value: unknown) => {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
};

function summary(id: string, data: FirebaseFirestore.DocumentData) {
    return {
        id,
        isBooking: data.isBooking === true,
        buyerId: typeof data.buyerId === "string" ? data.buyerId : "",
        status: String(data.status || ""),
        total: amountOf(data.total ?? data.totalAmount ?? data.amount),
        totalAmount: amountOf(data.totalAmount ?? data.total ?? data.amount),
    };
}

export async function POST(request: NextRequest) {
    let requestedOrderReference = "<unknown>";
    try {
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) throw new PaymentConfirmationError("Unauthorized", 401);
        const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
        const body = await request.json() as { orderReference?: unknown };
        const orderReference = typeof body.orderReference === "string" ? body.orderReference.trim() : "";
        requestedOrderReference = orderReference || "<missing>";
        if (!orderReference) throw new PaymentConfirmationError("Order reference is required", 400);

        let ordersSnapshot = await adminDb.collection("orders").where("checkoutReference", "==", orderReference).get();
        if (ordersSnapshot.empty) {
            const legacy = await adminDb.collection("orders").doc(orderReference).get();
            if (!legacy.exists) throw new PaymentConfirmationError("Order not found", 404);
            ordersSnapshot = { empty: false, docs: [legacy] } as unknown as typeof ordersSnapshot;
        }
        const orderDocs = ordersSnapshot.docs;
        const mismatchedOrder = orderDocs.find((doc) => doc.data().buyerId !== decoded.uid);
        if (mismatchedOrder) {
            const buyerId = String(mismatchedOrder.data().buyerId || "");
            console.error("Payment confirmation identity mismatch", {
                tokenUid: decoded.uid.slice(0, 4) + "…" + decoded.uid.slice(-4),
                orderBuyerId: buyerId ? buyerId.slice(0, 4) + "…" + buyerId.slice(-4) : "<missing>",
                orderId: mismatchedOrder.id,
                orderReference,
            });
            throw new PaymentConfirmationError("Forbidden", 403);
        }

        const alreadyHeld = orderDocs.every((doc) => String(doc.data().fundsState || "").toLowerCase() === "held" && doc.data().escrowReservedAt);
        if (!alreadyHeld) {
            let escrow = await getEscrowByReference(orderReference);
            if (!escrow) {
                // Recover checkouts created by the earlier Nomba route before
                // the escrow record was added. The amount comes only from the
                // server-created order documents, never from the browser.
                const recoveredAmount = orderDocs.reduce((total, doc) => total + amountOf(doc.data().total ?? doc.data().totalAmount), 0);
                if (!Number.isFinite(recoveredAmount) || recoveredAmount <= 0) throw new PaymentConfirmationError("Nomba escrow record not found", 409);
                await createEscrowRecord({
                    externalReference: orderReference,
                    amount: recoveredAmount,
                    orderIds: orderDocs.map((doc) => doc.id),
                    buyerId: decoded.uid,
                    buyerPhone: typeof orderDocs[0].data().customerPhone === "string" ? orderDocs[0].data().customerPhone : undefined,
                    description: "Recovered Nomba checkout escrow",
                    paymentProvider: "nomba",
                });
                escrow = await getEscrowByReference(orderReference);
            }
            if (!escrow) throw new PaymentConfirmationError("Nomba escrow record not found", 409);

            // The webhook is authoritative. This fallback is useful when the
            // provider has completed a transfer but its callback is delayed.
            if (escrow.status !== "FUNDED") {
                // Checkout.js uses the checkout reference as its verification
                // identifier. A webhook may populate providerReference later,
                // so use it when available and otherwise verify the checkout
                // reference returned to the browser.
                const references = [
                    String(escrow.providerReference || ""),
                    String(escrow.providerOrderReference || ""),
                    orderReference,
                ].filter(Boolean);
                let verification: Awaited<ReturnType<typeof verifyNombaTransaction>> | null = null;
                for (const reference of references) {
                    verification = await verifyNombaTransaction(reference);
                    if (verification.confirmed) break;
                }
                if (verification?.confirmed) {
                    await fundEscrowAndOrders({
                        eventId: `confirmation:${orderReference}:${verification.transactionId || orderReference}`,
                        externalReference: orderReference,
                        amount: amountOf(escrow.amount),
                        providerReference: verification.transactionId || orderReference,
                        sessionId: typeof escrow.providerSessionId === "string" ? escrow.providerSessionId : undefined,
                    });
                }
            }
        }

        const refreshed = await Promise.all(orderDocs.map((doc) => doc.ref.get()));
        const paid = refreshed.length > 0 && refreshed.every((doc) => String(doc.data()?.fundsState || "").toLowerCase() === "held");
        if (!paid) {
            return NextResponse.json({ success: true, confirmed: false, status: "PENDING_PAYMENT", orders: refreshed.map((doc) => summary(doc.id, doc.data() || {})) }, { status: 202 });
        }

        await Promise.allSettled(refreshed.map(async (doc) => {
            const data = doc.data() || {};
            if (data.paymentConfirmationNotifiedAt) return;
            await notifyOrderPaymentConfirmed({ id: doc.id, ...data });
            await dispatchShipmentForOrder(doc.id);
            await doc.ref.update({ paymentConfirmationNotifiedAt: new Date(), updatedAt: new Date() });
        }));

        return NextResponse.json({
            success: true,
            confirmed: true,
            status: "PAID_HELD",
            orders: refreshed.map((doc) => summary(doc.id, doc.data() || {})),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Payment confirmation failed";
        const status = error instanceof PaymentConfirmationError ? error.status : 502;
        console.error("Order payment confirmation error:", {
            nombaBaseUrl: nombaBaseUrl(),
            orderReference: requestedOrderReference,
            error,
        });
        return NextResponse.json({ error: message }, { status });
    }
}
