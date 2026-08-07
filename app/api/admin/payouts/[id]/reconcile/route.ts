import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

const PAYOUT_STATUSES = ["pending", "processing", "completed", "failed", "refunded"] as const;
type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

class ReconciliationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReconciliationError";
    this.status = status;
  }
}

const jsonError = (error: unknown, status = 500) => NextResponse.json({ error: error instanceof Error ? error.message : "Payout reconciliation failed" }, { status });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { id } = await params;
    const body = await request.json() as { status?: unknown; reason?: unknown; providerReference?: unknown };
    const nextStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() as PayoutStatus : "" as PayoutStatus;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const providerReference = typeof body.providerReference === "string" ? body.providerReference.trim() : "";
    if (!id || !PAYOUT_STATUSES.includes(nextStatus)) throw new ReconciliationError("Invalid payout status", 400);
    if ((nextStatus === "failed" || nextStatus === "refunded") && !reason) throw new ReconciliationError("A reconciliation reason is required", 400);

    const result = await adminDb.runTransaction(async (transaction) => {
      const payoutRef = adminDb.collection("payouts").doc(id);
      const payoutSnap = await transaction.get(payoutRef);
      if (!payoutSnap.exists) throw new ReconciliationError("Payout not found", 404);
      const payout = payoutSnap.data() || {};
      const rawCurrentStatus = String(payout.status || "pending").toLowerCase();
      const currentStatus = (rawCurrentStatus === "approved" ? "processing" : rawCurrentStatus) as PayoutStatus;
      const vendorId = typeof payout.vendorId === "string" ? payout.vendorId : typeof payout.storeId === "string" ? payout.storeId : "";

      if (currentStatus === nextStatus) return { alreadyProcessed: true, status: currentStatus, balanceRestored: Boolean(payout.balanceRestoredAt) };
      if (currentStatus === "completed") throw new ReconciliationError("Completed payouts cannot be changed", 409);
      if (currentStatus === "refunded" && nextStatus !== "refunded") throw new ReconciliationError("Refunded payouts cannot be reopened", 409);
      if (currentStatus === "failed" && !["failed", "refunded"].includes(nextStatus)) throw new ReconciliationError("Failed payouts can only be marked refunded", 409);
      if (nextStatus === "processing" && currentStatus !== "pending") throw new ReconciliationError("Only pending payouts can be moved to processing", 409);
      if (nextStatus === "completed" && !["pending", "processing"].includes(currentStatus)) throw new ReconciliationError("Only pending or processing payouts can be completed", 409);
      if (nextStatus === "completed" && !providerReference && !payout.nombaReference && !payout.providerReference && !payout.reference) {
        throw new ReconciliationError("A provider reference is required before marking a payout completed", 400);
      }

      const now = FieldValue.serverTimestamp();
      const fields: Record<string, unknown> = {
        status: nextStatus,
        reconciledAt: now,
        reconciledBy: access.admin.uid,
        reconciledByEmail: access.admin.email || "",
        updatedAt: now,
      };
      if (providerReference) fields.providerReference = providerReference;

      if (nextStatus === "processing") {
        fields.processingAt = now;
      }
      if (nextStatus === "completed") {
        fields.completedAt = now;
        fields.providerStatus = "MANUALLY_CONFIRMED";
      }

      let balanceRestored = Boolean(payout.balanceRestoredAt);
      if (["failed", "refunded"].includes(nextStatus)) {
        if (!balanceRestored) {
          if (!vendorId) throw new ReconciliationError("Payout has no seller wallet reference", 409);
          const storeRef = adminDb.collection("stores").doc(vendorId);
          const storeSnap = await transaction.get(storeRef);
          if (!storeSnap.exists) throw new ReconciliationError("Seller wallet not found", 404);
          const currentAvailable = Number(storeSnap.data()?.availableBalance ?? 0);
          const grossAmount = Number(payout.grossAmount ?? payout.amount ?? 0);
          if (!Number.isFinite(currentAvailable) || currentAvailable < 0 || !Number.isFinite(grossAmount) || grossAmount <= 0) {
            throw new ReconciliationError("Seller balance or payout amount is invalid; no balance was changed", 409);
          }
          transaction.update(storeRef, {
            availableBalance: currentAvailable + grossAmount,
            updatedAt: now,
          });
          fields.balanceRestoredAt = now;
          fields.refundedAt = now;
          balanceRestored = true;
        }
        fields.reconciliationReason = reason;
      }

      transaction.update(payoutRef, fields);
      transaction.set(adminDb.collection("auditLogs").doc(), {
        action: `payout_reconciled_${nextStatus}`,
        targetType: "payout",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { previousStatus: currentStatus, nextStatus, reason, providerReference: providerReference || payout.providerReference || payout.nombaReference || payout.reference || null, balanceRestored },
        timestamp: now,
      });

      return { alreadyProcessed: false, status: nextStatus, balanceRestored };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Admin payout reconciliation error:", error);
    return jsonError(error, error instanceof ReconciliationError ? error.status : 500);
  }
}
