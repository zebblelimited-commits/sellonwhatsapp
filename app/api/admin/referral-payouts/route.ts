import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { read: true, approve: true, reject: true } });
  if (!("admin" in access)) return access;
  const snapshot = await adminDb.collection("referralPayouts").limit(500).get();
  const payouts: Array<Record<string, any>> = snapshot.docs.map((item): Record<string, any> => ({ id: item.id, ...(item.data() as Record<string, unknown>) })).sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));
  return NextResponse.json({ payouts });
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { read: true, approve: true, reject: true } });
  if (!("admin" in access)) return access;
  try {
    const body = await request.json();
    const payoutId = String(body?.payoutId || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();
    const note = String(body?.note || "").trim().slice(0, 500);
    if (!payoutId || !["approved", "paid", "rejected"].includes(status)) return NextResponse.json({ error: "Payout ID and a valid status are required" }, { status: 400 });

    await adminDb.runTransaction(async (transaction) => {
      const payoutReference = adminDb.collection("referralPayouts").doc(payoutId);
      const payoutSnapshot = await transaction.get(payoutReference);
      if (!payoutSnapshot.exists) throw new Error("Referral payout not found");
      const payout = payoutSnapshot.data() || {};
      const currentStatus = String(payout.status || "pending").toLowerCase();
      if (currentStatus === "paid") throw new Error("Paid referral payouts cannot be changed");
      if (status === "paid" && !["pending", "approved"].includes(currentStatus)) throw new Error("Only pending or approved payouts can be marked paid");
      if (status === "approved" && currentStatus !== "pending") throw new Error("Only pending payouts can be approved");
      if (status === "rejected" && currentStatus === "rejected") return;

      if (status === "rejected" && currentStatus !== "rejected") {
        const userId = String(payout.userId || "");
        const points = Number(payout.points || 0);
        const userReference = adminDb.collection("users").doc(userId);
        const userSnapshot = await transaction.get(userReference);
        const user = userSnapshot.data() || {};
        const wallet = user.referralWallet || {};
        transaction.set(userReference, {
          referralWallet: {
            ...wallet,
            availablePoints: Number(wallet.availablePoints || 0) + points,
            redeemedPoints: Math.max(0, Number(wallet.redeemedPoints || 0) - points),
          },
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection("referralLedger").doc(`refund_${payoutId}`), {
          id: `refund_${payoutId}`,
          referrerId: userId,
          referredUserId: userId,
          type: "withdrawal_refund",
          description: "Referral withdrawal request was rejected",
          points,
          amountNaira: points,
          status: "approved",
          payoutId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.update(payoutReference, {
        status,
        adminNote: note,
        reviewedBy: access.admin.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Referral payout update failed" }, { status: 400 });
  }
}
