import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import type { DocumentReference } from "firebase-admin/firestore";

const jsonError = (message: string, status = 500) => NextResponse.json({ error: message }, { status });

class WithdrawalError extends Error {
  status: number;
  safeToRefund: boolean;

  constructor(message: string, status = 500, safeToRefund = true) {
    super(message);
    this.name = "WithdrawalError";
    this.status = status;
    this.safeToRefund = safeToRefund;
  }
}

function isConnectFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = (error as Error & { cause?: { code?: string } }).cause;
  return ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"].includes(cause?.code || "");
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function getNombaToken() {
  const response = await fetchWithTimeout(`${process.env.NOMBA_AUTH_URL}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId: process.env.NOMBA_ACCOUNT_ID || "" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.NOMBA_CLIENT_ID,
      client_secret: process.env.NOMBA_CLIENT_SECRET,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result?.data?.access_token) throw new WithdrawalError("Failed to authenticate with Nomba");
  return result.data.access_token as string;
}

async function refundReservation(storeId: string, payoutRef: DocumentReference, reason: string) {
  await adminDb.runTransaction(async (transaction) => {
    const payoutSnap = await transaction.get(payoutRef);
    if (!payoutSnap.exists || !["pending", "processing"].includes(String(payoutSnap.data()?.status || "").toLowerCase())) return;

    const storeRef = adminDb.collection("stores").doc(storeId);
    const storeSnap = await transaction.get(storeRef);
    if (!storeSnap.exists) throw new Error("Store not found while refunding withdrawal reservation");

    const payout = payoutSnap.data() || {};
    const currentAvailable = Number(storeSnap.data()?.availableBalance ?? 0);
    const grossAmount = Number(payout.grossAmount ?? 0);
    if (!Number.isFinite(currentAvailable) || currentAvailable < 0 || !Number.isFinite(grossAmount) || grossAmount <= 0) {
      throw new Error("Invalid payout ledger values while restoring the reserved balance");
    }
    transaction.update(storeRef, {
      availableBalance: currentAvailable + grossAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(payoutRef, {
      status: "refunded",
      failureReason: reason,
      refundReason: reason,
      balanceRestoredAt: admin.firestore.FieldValue.serverTimestamp(),
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(adminDb.collection("auditLogs").doc(), {
      action: "payout_reservation_refunded",
      targetType: "payout",
      targetId: payoutRef.id,
      performedBy: "system:withdrawal-api",
      performedByEmail: "",
      details: { reason, restoredAmount: grossAmount },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function POST(request: NextRequest) {
  let storeId = "";
  let payoutRef: DocumentReference | null = null;
  let transferAttempted = false;

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonError("Unauthorized", 401);

    const token = authHeader.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    storeId = decoded.uid;

    const body = await request.json();
    const requestedAmount = Number(body?.amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return jsonError("Invalid amount", 400);
    }

    const requestedIdempotencyKey = request.headers.get("Idempotency-Key") || (typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "");
    const idempotencyKey = requestedIdempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!idempotencyKey) return jsonError("An idempotency key is required. Please retry the withdrawal.", 400);
    const transferRef = `PAYOUT_${storeId}_${idempotencyKey}`;
    payoutRef = adminDb.collection("payouts").doc(transferRef);
    const storeRef = adminDb.collection("stores").doc(storeId);

    // Reserve the gross amount and create the payout record atomically.
    // A second click cannot pass this check after the first request reserves funds.
    const reservation = await adminDb.runTransaction(async (transaction) => {
      const existingPayoutSnap = await transaction.get(payoutRef!);
      if (existingPayoutSnap.exists) {
        const existingPayout = existingPayoutSnap.data() || {};
        if (existingPayout.vendorId !== storeId && existingPayout.storeId !== storeId) {
          throw new WithdrawalError("Invalid payout request", 403);
        }
        if (Number(existingPayout.grossAmount || 0) !== requestedAmount) {
          throw new WithdrawalError("This idempotency key was already used for a different withdrawal amount", 409);
        }
        return {
          existing: true,
          payoutSettings: null,
          platformFee: Number(existingPayout.platformFee || 0),
          netPayout: Number(existingPayout.netAmount || 0),
          existingStatus: String(existingPayout.status || "pending"),
        };
      }

      const storeSnap = await transaction.get(storeRef);
      if (!storeSnap.exists) throw new WithdrawalError("Store not found", 404);

      const storeData = storeSnap.data() || {};
      const payoutSettings = storeData.payoutSettings;
      if (!payoutSettings?.bankCode || !payoutSettings?.accountNumber) {
        throw new WithdrawalError("Please link a bank account in Settings first.", 400);
      }

      const rawAvailable = Number(storeData.availableBalance ?? 0);
      const availableBalance = Number.isFinite(rawAvailable) ? rawAvailable : 0;
      const rawEscrow = Number(storeData.escrowBalance ?? 0);
      const escrowBalance = Number.isFinite(rawEscrow) ? rawEscrow : 0;

      console.log(`[WITHDRAW] User ${storeId} requesting ₦${requestedAmount}.`);
      console.log(`[WITHDRAW] Firestore Financial Fields:`, {
        availableBalance: storeData.availableBalance,
        escrowBalance: storeData.escrowBalance,
        totalSales: storeData.totalSales,
      });
      console.log(`[WITHDRAW] Final Available Balance used by API: ₦${availableBalance}`);

      if (requestedAmount > availableBalance) {
        const errorMessage = availableBalance <= 0
          ? "You have no available funds to withdraw yet. Your funds are currently locked in escrow until orders are completed."
          : `Insufficient balance. Your actual available balance is ₦${availableBalance.toLocaleString()}.`;
        throw new WithdrawalError(errorMessage, 400);
      }

      const isPartnerActive = Boolean(storeData.isPartner && storeData.partnerExpiry && new Date(storeData.partnerExpiry).getTime() > Date.now());
      const feePercent = isPartnerActive ? 0.015 : 0.03;
      const platformFee = requestedAmount * feePercent;
      const netPayout = requestedAmount - platformFee;

      transaction.update(storeRef, {
        availableBalance: availableBalance - requestedAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(payoutRef!, {
        id: transferRef,
        storeId,
        vendorId: storeId,
        grossAmount: requestedAmount,
        platformFee,
        netAmount: netPayout,
        bankName: payoutSettings.bankName || "",
        accountNumber: payoutSettings.accountNumber,
        bankCode: payoutSettings.bankCode,
        accountName: payoutSettings.accountName || "",
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        balanceReservedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowBalanceAtRequest: escrowBalance,
      });
      transaction.set(adminDb.collection("auditLogs").doc(), {
        action: "payout_requested",
        targetType: "payout",
        targetId: transferRef,
        performedBy: storeId,
        performedByEmail: decoded.email || "",
        details: { grossAmount: requestedAmount, netAmount: netPayout, platformFee, status: "pending" },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { existing: false, payoutSettings, platformFee, netPayout, existingStatus: "pending" };
    });

    if (reservation.existing) {
      const existingIsFinal = ["completed", "failed", "refunded"].includes(reservation.existingStatus);
      return NextResponse.json({
        success: true,
        pending: !existingIsFinal,
        alreadyProcessed: true,
        reference: transferRef,
        message: existingIsFinal ? `This withdrawal is already ${reservation.existingStatus}.` : "This withdrawal is already being processed.",
      });
    }

    let nombaToken: string;
    try {
      nombaToken = await getNombaToken();
    } catch {
      throw new WithdrawalError("The payout provider is temporarily unavailable. Please try again shortly.", 503, true);
    }

    transferAttempted = true;
    const transferResponse = await fetchWithTimeout(`${process.env.NOMBA_SANDBOX_URL}/v1/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nombaToken}`,
        accountId: process.env.NOMBA_ACCOUNT_ID || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: reservation.netPayout.toFixed(2),
        reference: transferRef,
        narration: "Zebble Store Payout",
        bankCode: reservation.payoutSettings.bankCode,
        accountNumber: reservation.payoutSettings.accountNumber,
        accountName: reservation.payoutSettings.accountName,
        currency: "NGN",
      }),
    }, 15000);

    const transferResult = await transferResponse.json();
    if (!transferResponse.ok) {
      throw new WithdrawalError(transferResult?.description || "Gateway rejected transfer", 400, true);
    }

    await payoutRef.update({
      status: "processing",
      nombaReference: transferResult?.data?.reference || transferRef,
      gatewaySubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal initiated successfully",
      reference: transferRef,
    });
  } catch (error: unknown) {
    console.error("Withdrawal API Error:", error);

    const safeTransportFailure = transferAttempted && isConnectFailure(error);
    let reservationRefunded = false;
    let reservationRefundError: unknown = null;

    if (payoutRef && (!transferAttempted || (error instanceof WithdrawalError && error.safeToRefund) || safeTransportFailure)) {
      try {
        await refundReservation(
          storeId,
          payoutRef,
          safeTransportFailure ? "Nomba connection timed out before the transfer was submitted" : "Gateway rejected the transfer"
        );
        reservationRefunded = true;
      } catch (refundError) {
        reservationRefundError = refundError;
        console.error("Withdrawal reservation refund failed:", refundError);
      }
    } else if (payoutRef && transferAttempted) {
      // The network failed after the gateway request started. Do not refund blindly;
      // the gateway may have accepted the transfer and will resolve it by webhook.
      try {
        await payoutRef.update({
          status: "processing",
          gatewayError: error instanceof Error ? error.message : "Gateway response unavailable",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return NextResponse.json({
          success: true,
          pending: true,
          reference: payoutRef.id,
          message: "The transfer is being verified with the payout provider. Please check your payout history shortly.",
        }, { status: 202 });
      } catch (updateError) {
        console.error("Could not mark payout processing:", updateError);
      }
    }

    if (reservationRefundError) {
      return jsonError("Withdrawal failed and the reserved balance could not be released automatically. Please contact support.", 500);
    }

    if (safeTransportFailure && reservationRefunded) {
      return jsonError("The payout provider is temporarily unreachable. Your funds remain available; please try again shortly.", 503);
    }

    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = error instanceof WithdrawalError ? error.status : 500;
    return jsonError(message, status);
  }
}
