import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { MINIMUM_REFERRAL_WITHDRAWAL } from "@/lib/referrals";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const requestedPoints = Math.floor(Number(body?.points));
    const idempotencyKey = String(body?.idempotencyKey || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
    if (!Number.isFinite(requestedPoints) || requestedPoints < MINIMUM_REFERRAL_WITHDRAWAL) {
      return NextResponse.json({ error: `Minimum referral withdrawal is ₦${MINIMUM_REFERRAL_WITHDRAWAL.toLocaleString()}` }, { status: 400 });
    }

    const payoutId = `REFPAYOUT_${decoded.uid}_${idempotencyKey}`;
    const payoutReference = adminDb.collection("referralPayouts").doc(payoutId);
    const userReference = adminDb.collection("users").doc(decoded.uid);
    const ledgerReference = adminDb.collection("referralLedger").doc(`withdrawal_${payoutId}`);
    await adminDb.runTransaction(async (transaction) => {
      const [existingPayout, userSnapshot] = await Promise.all([transaction.get(payoutReference), transaction.get(userReference)]);
      if (existingPayout.exists) return;
      const user = userSnapshot.data() || {};
      const wallet = user.referralWallet || {};
      const availablePoints = Number(wallet.availablePoints || 0);
      const payoutSettings = user.referralPayoutSettings;
      if (!payoutSettings?.bankCode || !payoutSettings?.accountNumber) throw new Error("Add your referral payout bank account first");
      if (String(payoutSettings.status || "").toLowerCase() === "rejected") throw new Error("Your referral payout account was rejected. Update it and try again.");
      if (availablePoints < requestedPoints) throw new Error(`Insufficient available points. Your balance is ₦${availablePoints.toLocaleString()}.`);
      transaction.update(userReference, {
        referralWallet: {
          ...wallet,
          availablePoints: availablePoints - requestedPoints,
          redeemedPoints: Number(wallet.redeemedPoints || 0) + requestedPoints,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(payoutReference, {
        id: payoutId,
        userId: decoded.uid,
        points: requestedPoints,
        amountNaira: requestedPoints,
        status: "pending",
        bankName: payoutSettings.bankName || "",
        bankCode: payoutSettings.bankCode,
        accountNumber: payoutSettings.accountNumber,
        accountName: payoutSettings.accountName || "",
        requestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(ledgerReference, {
        id: ledgerReference.id,
        referrerId: decoded.uid,
        referredUserId: decoded.uid,
        type: "withdrawal",
        description: "Referral wallet withdrawal request",
        points: -requestedPoints,
        amountNaira: -requestedPoints,
        status: "requested",
        payoutId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true, payoutId, message: "Withdrawal request submitted for review" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Referral withdrawal failed";
    return NextResponse.json({ error: message === "Unauthorized" ? message : message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
