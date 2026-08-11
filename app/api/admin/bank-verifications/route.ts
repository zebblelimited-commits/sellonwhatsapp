import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

type BankDetails = {
  bankName?: unknown;
  bankCode?: unknown;
  accountNumber?: unknown;
  accountName?: unknown;
  status?: unknown;
  verificationStatus?: unknown;
  submittedAt?: unknown;
  updatedAt?: unknown;
};

function value(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusFor(store: Record<string, unknown>, details: BankDetails): "pending" | "approved" | "rejected" {
  const raw = value(store.payoutAccountVerificationStatus || details.verificationStatus || details.status || store.payoutStatus).toLowerCase();
  if (["approved", "verified", "complete", "completed"].includes(raw)) return "approved";
  if (["rejected", "revoked", "failed"].includes(raw)) return "rejected";
  return "pending";
}

function serialize(valueToSerialize: unknown): unknown {
  if (valueToSerialize && typeof (valueToSerialize as { toDate?: () => Date }).toDate === "function") {
    return (valueToSerialize as { toDate: () => Date }).toDate().toISOString();
  }
  return valueToSerialize;
}

function maskAccount(accountNumber: string): string {
  return accountNumber.length > 4 ? `••••${accountNumber.slice(-4)}` : "••••";
}

function storeBankDetails(store: Record<string, unknown>): BankDetails {
  const payoutSettings = (store.payoutSettings && typeof store.payoutSettings === "object" ? store.payoutSettings : {}) as BankDetails;
  const pendingDetails = (store.pendingPayoutDetails && typeof store.pendingPayoutDetails === "object" ? store.pendingPayoutDetails : {}) as BankDetails;
  // Pending details must win when present because they represent a newly
  // submitted account waiting for review.
  return { ...payoutSettings, ...pendingDetails };
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { read: true } });
  if (!("admin" in access)) return access;

  try {
    const requestedStatus = new URL(request.url).searchParams.get("status") || "pending";
    if (!["pending", "approved", "rejected", "all"].includes(requestedStatus)) {
      return NextResponse.json({ error: "Invalid bank verification status" }, { status: 400 });
    }

    const snapshot = await adminDb.collection("stores").limit(1000).get();
    const verifications = snapshot.docs.map((document) => {
      const store = document.data() as Record<string, unknown>;
      const details = storeBankDetails(store);
      const accountNumber = value(details.accountNumber);
      const status = statusFor(store, details);
      return {
        id: document.id,
        storeId: document.id,
        vendorId: value(store.vendorId || store.ownerId || store.uid) || document.id,
        storeName: value(store.storeName || store.name) || "Unnamed store",
        username: value(store.username),
        ownerName: value(store.ownerName || store.displayName || store.email) || "—",
        ownerEmail: value(store.ownerEmail || store.email),
        bankName: value(details.bankName) || "—",
        bankCode: value(details.bankCode),
        accountName: value(details.accountName) || "—",
        accountNumber,
        maskedAccountNumber: accountNumber ? maskAccount(accountNumber) : "Not provided",
        status,
        submittedAt: serialize(details.submittedAt || store.payoutAccountSubmittedAt || details.updatedAt || store.updatedAt),
        reviewedAt: serialize(store.payoutAccountVerifiedAt || store.payoutAccountRejectedAt),
        reviewNotes: value(store.payoutAccountVerificationNotes),
      };
    }).filter((item) => item.accountNumber && (requestedStatus === "all" || item.status === requestedStatus))
      .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));

    return NextResponse.json({ verifications });
  } catch (error) {
    console.error("Admin bank verification queue error:", error);
    return NextResponse.json({ error: "Bank verification requests could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { approve: true } });
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as { storeId?: unknown; decision?: unknown; notes?: unknown };
    const storeId = value(body.storeId);
    const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : "";
    const notes = value(body.notes).slice(0, 2000);
    if (!storeId || !decision) return NextResponse.json({ error: "A store and decision are required" }, { status: 400 });
    if (decision === "reject" && !notes) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

    const result = await adminDb.runTransaction(async (transaction) => {
      const storeRef = adminDb.collection("stores").doc(storeId);
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists) throw new Error("Store not found");
      const store = storeSnapshot.data() as Record<string, unknown>;
      const details = storeBankDetails(store);
      const accountNumber = value(details.accountNumber);
      if (!accountNumber || !value(details.bankCode)) throw new Error("This seller has not submitted complete bank details");

      const currentStatus = statusFor(store, details);
      const approved = decision === "approve";
      if (currentStatus !== "pending") {
        if ((approved && currentStatus === "approved") || (!approved && currentStatus === "rejected")) {
          return { storeId, status: currentStatus, idempotent: true };
        }
        throw new Error("This bank account has already been processed");
      }

      const now = FieldValue.serverTimestamp();
      const payoutSettings = (store.payoutSettings && typeof store.payoutSettings === "object" ? store.payoutSettings : {}) as Record<string, unknown>;
      const pendingDetails = (store.pendingPayoutDetails && typeof store.pendingPayoutDetails === "object" ? store.pendingPayoutDetails : null) as Record<string, unknown> | null;
      const verificationStatus = approved ? "approved" : "rejected";
      const common = {
        payoutAccountVerificationStatus: verificationStatus,
        payoutAccountVerificationNotes: notes,
        payoutAccountVerificationReviewedBy: access.admin.uid,
        payoutAccountVerificationReviewedByEmail: access.admin.email || "",
        updatedAt: now,
        ...(approved ? { payoutAccountVerifiedAt: now } : { payoutAccountRejectedAt: now }),
        payoutSettings: { ...payoutSettings, status: approved ? "VERIFIED" : "REJECTED", verificationStatus, reviewedAt: now },
        ...(pendingDetails ? { pendingPayoutDetails: { ...pendingDetails, status: approved ? "VERIFIED" : "REJECTED", verificationStatus, reviewedAt: now } } : {}),
      };
      transaction.set(storeRef, common, { merge: true });

      const vendorId = value(store.vendorId || store.ownerId || store.uid) || storeId;
      const notificationRef = adminDb.collection("notifications").doc();
      transaction.set(notificationRef, {
        recipientId: vendorId,
        vendorId,
        recipientRole: "vendor",
        type: "payout_account_verification",
        priority: "high",
        title: approved ? "Payout account verified" : "Payout account verification rejected",
        body: approved ? "Your payout bank account has been verified and can receive withdrawals." : `Your payout account was rejected. ${notes}`,
        read: false,
        createdAt: now,
        updatedAt: now,
      });

      const auditRef = adminDb.collection("auditLogs").doc();
      transaction.set(auditRef, {
        action: approved ? "bank_account_verification_approved" : "bank_account_verification_rejected",
        targetType: "vendor_payout_account",
        targetId: storeId,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { storeId, bankName: value(details.bankName), accountLast4: accountNumber.slice(-4), reason: notes },
        timestamp: now,
      });

      return { storeId, status: verificationStatus, idempotent: false };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Admin bank verification decision error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bank verification decision failed" }, { status: 409 });
  }
}
