import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyNombaTransaction } from "@/lib/payments/nomba/client";

const TERMINAL_FAILURE = /(FAILED|REJECTED|DECLINED|CANCELLED|CANCELED|REVERSED|REFUND|ERROR)/;

function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return errorResponse("Unauthorized", 401);

    const token = authorization.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    const body = await request.json().catch(() => ({})) as { payoutId?: unknown };
    const payoutId = typeof body.payoutId === "string" ? body.payoutId.trim() : "";
    if (!payoutId) return errorResponse("A payout reference is required", 400);

    const payoutRef = adminDb.collection("payouts").doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) return errorResponse("Withdrawal not found", 404);

    const payout = payoutSnap.data() || {};
    const sellerId = String(payout.storeId || payout.vendorId || "").trim();
    if (sellerId !== decoded.uid) return errorResponse("You cannot inspect this withdrawal", 403);

    const currentStatus = String(payout.status || "pending").trim().toLowerCase();
    if (["completed", "failed", "refunded"].includes(currentStatus)) {
      return NextResponse.json({ success: true, status: currentStatus, providerStatus: payout.providerStatus || null, alreadyFinal: true });
    }

    const references = [payout.providerReference, payout.nombaReference, payout.reference, payoutId]
      .map((value) => String(value || "").trim())
      .filter((value, index, values) => value && values.indexOf(value) === index);
    let providerResult = { confirmed: false, status: "NOT_FOUND" } as Awaited<ReturnType<typeof verifyNombaTransaction>>;
    for (const reference of references) {
      providerResult = await verifyNombaTransaction(reference);
      if (providerResult.confirmed || TERMINAL_FAILURE.test(providerResult.status)) break;
    }

    if (providerResult.confirmed) {
      const result = await adminDb.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(payoutRef);
        if (!currentSnap.exists) return { status: "missing" };
        const current = currentSnap.data() || {};
        const status = String(current.status || "pending").toLowerCase();
        if (["completed", "failed", "refunded"].includes(status)) return { status };

        transaction.update(payoutRef, {
          status: "completed",
          providerStatus: providerResult.status || "SUCCESS",
          providerReference: providerResult.transactionId || current.providerReference || current.nombaReference || payoutId,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
          reconciledBy: "system:withdrawal-status-check",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { status: "completed" };
      });
      return NextResponse.json({ success: true, status: result.status, providerStatus: providerResult.status || "SUCCESS" });
    }

    if (TERMINAL_FAILURE.test(providerResult.status)) {
      const result = await adminDb.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(payoutRef);
        if (!currentSnap.exists) return { status: "missing", restored: false };
        const current = currentSnap.data() || {};
        const status = String(current.status || "pending").toLowerCase();
        if (["completed", "failed", "refunded"].includes(status)) return { status, restored: Boolean(current.balanceRestoredAt) };

        const storeRef = adminDb.collection("stores").doc(sellerId);
        const storeSnap = await transaction.get(storeRef);
        if (!storeSnap.exists) throw new Error("Seller wallet not found while restoring the failed withdrawal");
        const availableBalance = Number(storeSnap.data()?.availableBalance ?? 0);
        const amount = Number(current.grossAmount ?? current.netAmount ?? current.amount ?? 0);
        if (!Number.isFinite(availableBalance) || availableBalance < 0 || !Number.isFinite(amount) || amount <= 0) {
          throw new Error("Invalid withdrawal ledger values; balance was not changed");
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        transaction.update(storeRef, { availableBalance: availableBalance + amount, updatedAt: now });
        transaction.update(payoutRef, {
          status: "failed",
          providerStatus: providerResult.status,
          failureReason: `Nomba reported ${providerResult.status.toLowerCase()}`,
          balanceRestoredAt: now,
          refundedAt: now,
          reconciledAt: now,
          reconciledBy: "system:withdrawal-status-check",
          updatedAt: now,
        });
        return { status: "failed", restored: true };
      });
      return NextResponse.json({ success: true, status: result.status, restored: result.restored, providerStatus: providerResult.status });
    }

    return NextResponse.json({
      success: true,
      pending: true,
      status: "processing",
      providerStatus: providerResult.status || "PENDING",
      message: "Nomba has not returned a final result yet. The withdrawal remains protected and reserved.",
    }, { status: 202 });
  } catch (error) {
    console.error("Withdrawal status check failed:", error);
    return errorResponse(error instanceof Error ? error.message : "Withdrawal status check failed", 502);
  }
}
