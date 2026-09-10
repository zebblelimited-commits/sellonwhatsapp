import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { notifyOrderPaymentConfirmed, notifyPayoutCompleted } from "@/lib/novu-events";
import { dispatchShipmentForOrder } from "@/lib/shipping-dispatch";
import {
    fundEscrowAndOrders,
    getEscrowByReference,
    getEscrowByVirtualAccount,
} from "@/src/infrastructure/db/escrowService";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function timingSafeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left.trim());
    const b = Buffer.from(right.trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validSignature(rawBody: string, request: Request): boolean {
    const secret = process.env.SAFEHAVEN_WEBHOOK_SECRET?.trim();
    if (!secret) return process.env.NODE_ENV !== "production";
    const supplied = request.headers.get("x-safehaven-signature")
        || request.headers.get("x-webhook-signature")
        || request.headers.get("x-signature");
    if (!supplied) return false;
    const normalized = supplied.replace(/^sha256=/i, "").trim();
    const expectedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBase64 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    return timingSafeEqual(normalized, expectedHex) || timingSafeEqual(normalized, expectedBase64);
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
    const rawBody = await request.text();
    if (!validSignature(rawBody, request)) {
        return NextResponse.json({ received: false, error: "Invalid webhook signature" }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try { payload = record(JSON.parse(rawBody)); }
    catch { return NextResponse.json({ received: false, error: "Invalid JSON" }, { status: 400 }); }

    const eventType = String(payload.eventType || payload.type || "").toLowerCase();
    if (!eventType || (!["account.credit", "account.debit", "virtualaccount.transfer", "virtual_account.transfer"].includes(eventType))) {
        // Acknowledge provider health checks and future event types. They are
        // not escrow credits and must never mutate the ledger.
        return NextResponse.json({ received: true, ignored: true });
    }

    const data = record(payload.data);
    const status = String(data.status || "").toLowerCase();

    if (eventType === "account.debit") {
        const providerReference = String(data.paymentReference || data.sessionId || "").trim();
        if (!providerReference) return NextResponse.json({ received: true, ignored: true });
        const matches = await Promise.all([
            adminDb.collection("payouts").where("providerReference", "==", providerReference).limit(1).get(),
            adminDb.collection("payouts").where("reference", "==", providerReference).limit(1).get(),
        ]);
        const payoutSnap = matches.find((result) => !result.empty)?.docs[0];
        if (!payoutSnap) return NextResponse.json({ received: true, pending: true, reason: "Payout record not found" }, { status: 202 });
        const completed = ["completed", "successful", "success", "approved"].includes(status);
        const failed = ["failed", "canceled", "cancelled", "declined", "rejected"].includes(status);
        if (!completed && !failed) return NextResponse.json({ received: true, ignored: true, status });

        const result = await adminDb.runTransaction(async (transaction) => {
            const currentSnap = await transaction.get(payoutSnap.ref);
            if (!currentSnap.exists) return { transitioned: false, storeId: "" };
            const payout = currentSnap.data() || {};
            const currentStatus = String(payout.status || "").toLowerCase();
            if (["completed", "refunded"].includes(currentStatus)) return { transitioned: false, storeId: String(payout.storeId || payout.vendorId || "") };
            if (failed) {
                const storeId = String(payout.storeId || payout.vendorId || "");
                const storeRef = adminDb.collection("stores").doc(storeId);
                const storeSnap = await transaction.get(storeRef);
                if (!storeSnap.exists) throw new Error("Store not found while restoring failed payout");
                const availableBalance = Number(storeSnap.data()?.availableBalance ?? 0);
                const grossAmount = Number(payout.grossAmount ?? payout.amount ?? 0);
                if (!Number.isFinite(availableBalance) || !Number.isFinite(grossAmount) || grossAmount <= 0) throw new Error("Invalid payout ledger while restoring failed payout");
                transaction.update(storeRef, { availableBalance: availableBalance + grossAmount, updatedAt: new Date() });
                transaction.update(currentSnap.ref, { status: "failed", balanceRestoredAt: new Date(), failureReason: String(data.responseMessage || "Safe Haven transfer failed"), providerStatus: status, updatedAt: new Date() });
                return { transitioned: true, storeId };
            }
            transaction.update(currentSnap.ref, { status: "completed", providerStatus: status, providerReference, completedAt: new Date(), updatedAt: new Date() });
            return { transitioned: true, storeId: String(payout.storeId || payout.vendorId || "") };
        });
        if (result.transitioned && result.storeId && completed) {
            const refreshed = await payoutSnap.ref.get();
            await notifyPayoutCompleted({ id: payoutSnap.id, ...(refreshed.data() || {}) });
        }
        return NextResponse.json({ received: true, payout: completed ? "completed" : "failed", reference: providerReference });
    }

    if (data.isReversed === true || !["completed", "successful", "success", "approved"].includes(status)) {
        return NextResponse.json({ received: true, ignored: true, status });
    }

    const externalReference = String(data.externalReference || data.orderReference || data.referenceCode || payload.referenceCode || payload.reference || "").trim();
    const virtualAccount = String(data.virtualAccount || data.virtualAccountId || "").trim();
    const accountNumber = String(data.creditAccountNumber || data.accountNumber || "").trim();
    let reference = externalReference;
    if (!reference && virtualAccount) reference = (await getEscrowByVirtualAccount(virtualAccount))?.reference || "";
    if (!reference && accountNumber) reference = (await getEscrowByVirtualAccount(accountNumber))?.reference || "";
    if (!reference) return NextResponse.json({ received: true, pending: true, reason: "Escrow record not found" }, { status: 202 });

    const eventId = String(data._id || data.sessionId || data.paymentReference || `${eventType}:${reference}:${data.createdAt || "unknown"}`);
    const funding = await fundEscrowAndOrders({
        eventId,
        externalReference: reference,
        amount: Number(data.amount),
        providerReference: String(data.paymentReference || data.sessionId || "").trim() || undefined,
        sessionId: String(data.sessionId || "").trim() || undefined,
        rawPayload: payload,
    });

    if (funding.funded && !funding.duplicate) {
        await Promise.allSettled(funding.orderIds.map(async (orderId) => {
            const snapshot = await adminDb.collection("orders").doc(orderId).get();
            if (!snapshot.exists) return;
            const order = { id: snapshot.id, ...snapshot.data() };
            await Promise.allSettled([
                notifyOrderPaymentConfirmed(order),
                dispatchShipmentForOrder(orderId),
            ]);
        }));
    }

    return NextResponse.json({ received: true, funded: funding.funded, duplicate: funding.duplicate, reference });
}
