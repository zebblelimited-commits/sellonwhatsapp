import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { NombaProvider } from "@/lib/payments/nomba/client";

export const runtime = "nodejs";

class RefundError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

async function requireAdmin(request: NextRequest) {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new RefundError("Unauthorized", 401);
    const token = await adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
    const adminSnapshot = await adminDb.collection("admins").doc(token.uid).get();
    if (!adminSnapshot.exists || adminSnapshot.data()?.isActive !== true) throw new RefundError("Forbidden", 403);
    return token;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const adminUser = await requireAdmin(request);
        const { id } = await params;
        const refundRef = adminDb.collection("refunds").doc(id);
        const refundSnapshot = await refundRef.get();
        if (!refundSnapshot.exists) throw new RefundError("Refund not found", 404);
        const refund = refundSnapshot.data() || {};
        if (!["pending_provider_refund", "failed"].includes(String(refund.status || ""))) {
            return NextResponse.json({ success: true, alreadyProcessed: true, status: refund.status });
        }
        const amount = Number(refund.amount);
        const providerReference = String(refund.providerReference || "").trim();
        if (!Number.isFinite(amount) || amount <= 0 || !providerReference) throw new RefundError("Refund has invalid provider metadata", 409);

        let providerResult;
        try {
            providerResult = await new NombaProvider().processRefund(providerReference, amount);
        } catch (error) {
            await refundRef.update({ status: "failed", failureReason: error instanceof Error ? error.message : "Nomba refund failed", updatedAt: FieldValue.serverTimestamp() });
            throw new RefundError("Nomba refund failed", 502);
        }

        await adminDb.runTransaction(async (transaction) => {
            const current = await transaction.get(refundRef);
            if (!current.exists) throw new RefundError("Refund not found", 404);
            const currentData = current.data() || {};
            if (currentData.status === "refunded") return;
            const orderId = String(currentData.orderId || "");
            const orderRef = adminDb.collection("orders").doc(orderId);
            const settlementRef = adminDb.collection("dispute_settlements").doc(String(currentData.disputeId || id));
            const orderSnapshot = orderId ? await transaction.get(orderRef) : null;
            transaction.update(refundRef, {
                status: "refunded",
                refundReference: providerResult.refundRef,
                processedBy: adminUser.uid,
                processedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            if (orderSnapshot?.exists) transaction.update(orderRef, { status: "REFUNDED", fundsState: "refunded", refundStatus: "completed", refundReference: providerResult.refundRef, refundedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
            transaction.set(settlementRef, { status: "refunded", refundReference: providerResult.refundRef, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        return NextResponse.json({ success: true, status: "refunded", refundReference: providerResult.refundRef });
    } catch (error: unknown) {
        const status = error instanceof RefundError ? error.status : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : "Refund failed" }, { status });
    }
}
