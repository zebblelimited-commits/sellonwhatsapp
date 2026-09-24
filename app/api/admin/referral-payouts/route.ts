import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { initiateNombaBankTransfer } from "@/lib/payments/nomba/client";

function serialize(value: unknown): unknown {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

function recipientRole(user: Record<string, any>): "buyer" | "vendor" {
  return ["vendor", "seller"].includes(String(user.role || "").toLowerCase()) ? "vendor" : "buyer";
}

function notificationFields(userId: string, role: "buyer" | "vendor") {
  return role === "vendor" ? { vendorId: userId } : { buyerId: userId };
}

async function notifyUser(
  userId: string,
  user: Record<string, any>,
  details: { type: string; title: string; body: string; actionUrl?: string; priority?: string },
) {
  const role = recipientRole(user);
  await adminDb.collection("notifications").add({
    recipientId: userId,
    recipientRole: role,
    ...notificationFields(userId, role),
    ...details,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { read: true, approve: true, reject: true } });
  if (!("admin" in access)) return access;

  try {
    const [payoutSnapshot, usersSnapshot] = await Promise.all([
      adminDb.collection("referralPayouts").limit(500).get(),
      adminDb.collection("users").limit(1000).get(),
    ]);

    const payouts: Array<Record<string, any>> = payoutSnapshot.docs
      .map((item): Record<string, any> => {
        const data = item.data() as Record<string, any>;
        return {
          id: item.id,
          ...data,
          requestedAt: serialize(data.requestedAt),
          reviewedAt: serialize(data.reviewedAt),
          executedAt: serialize(data.executedAt),
          updatedAt: serialize(data.updatedAt),
        };
      })
      .sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));

    const accounts: Array<Record<string, any>> = usersSnapshot.docs
      .map((item): Record<string, any> | null => {
        const data = item.data() as Record<string, any>;
        const settings = data.referralPayoutSettings;
        if (!settings || typeof settings !== "object") return null;
        return {
          id: item.id,
          userId: item.id,
          email: String(data.email || ""),
          name: String(data.displayName || data.name || data.username || data.email || item.id),
          role: String(data.role || "buyer"),
          bankName: String(settings.bankName || ""),
          bankCode: String(settings.bankCode || ""),
          accountNumber: String(settings.accountNumber || ""),
          accountName: String(settings.accountName || ""),
          status: String(settings.status || "pending_review").toLowerCase() === "pending" ? "pending_review" : String(settings.status || "pending_review").toLowerCase(),
          submittedAt: serialize(settings.submittedAt),
          reviewedAt: serialize(settings.reviewedAt),
          reviewedBy: String(settings.reviewedBy || ""),
          reviewNote: String(settings.reviewNote || ""),
        };
      })
      .filter((item): item is Record<string, any> => Boolean(item))
      .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));

    return NextResponse.json({ payouts, accounts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Referral payout records could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request, { payouts: { read: true, approve: true, reject: true } });
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as Record<string, any>;
    const action = String(body.action || "").trim().toLowerCase();
    const userId = String(body.userId || "").trim();
    const note = String(body.note || "").trim().slice(0, 500);

    if (action === "message") {
      const message = String(body.message || "").trim().slice(0, 2000);
      if (!userId || !message) return NextResponse.json({ error: "User ID and message are required" }, { status: 400 });
      const userSnapshot = await adminDb.collection("users").doc(userId).get();
      if (!userSnapshot.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
      await notifyUser(userId, userSnapshot.data() || {}, {
        type: "referral_payout_account",
        priority: "high",
        title: "Message from payout review",
        body: message,
        actionUrl: "/referrals",
      });
      await adminDb.collection("auditLogs").add({
        action: "referral_payout_message",
        targetType: "user",
        targetId: userId,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { message },
        timestamp: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "account-decision") {
      const decision = String(body.decision || "").trim().toLowerCase();
      if (!userId || !["approved", "rejected"].includes(decision)) {
        return NextResponse.json({ error: "User ID and a valid account decision are required" }, { status: 400 });
      }

      const userReference = adminDb.collection("users").doc(userId);
      const notificationReference = adminDb.collection("notifications").doc();
      const userSnapshot = await userReference.get();
      if (!userSnapshot.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const user = userSnapshot.data() || {};
      const settings = user.referralPayoutSettings;
      if (!settings || typeof settings !== "object") return NextResponse.json({ error: "Referral payout account not found" }, { status: 404 });
      const role = recipientRole(user);
      const defaultBody = decision === "approved"
        ? "Your referral payout account has been approved. You can now request a referral withdrawal."
        : "Your referral payout account was rejected. Please update your bank details and submit them again.";
      const batch = adminDb.batch();
      batch.set(userReference, {
        referralPayoutSettings: {
          ...settings,
          status: decision,
          reviewNote: note,
          reviewedBy: access.admin.uid,
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(notificationReference, {
        recipientId: userId,
        recipientRole: role,
        ...notificationFields(userId, role),
        type: "referral_payout_account",
        priority: "high",
        title: decision === "approved" ? "Referral payout account approved" : "Referral payout account rejected",
        body: note || defaultBody,
        actionUrl: "/referrals",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      await adminDb.collection("auditLogs").add({
        action: "referral_payout_account_" + decision,
        targetType: "user",
        targetId: userId,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { note },
        timestamp: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    const payoutId = String(body.payoutId || "").trim();
    const status = String(body.status || "").trim().toLowerCase();

    if (action === "execute") {
      if (!payoutId) return NextResponse.json({ error: "Payout ID is required" }, { status: 400 });
      const payoutReference = adminDb.collection("referralPayouts").doc(payoutId);
      let payout: Record<string, any> = {};
      let user: Record<string, any> = {};
      await adminDb.runTransaction(async (transaction) => {
        const payoutSnapshot = await transaction.get(payoutReference);
        if (!payoutSnapshot.exists) throw new Error("Referral payout not found");
        payout = payoutSnapshot.data() || {};
        const currentStatus = String(payout.status || "pending").toLowerCase();
        if (currentStatus !== "approved") throw new Error("Only approved referral payouts can be executed");
        const userReference = adminDb.collection("users").doc(String(payout.userId || ""));
        const userSnapshot = await transaction.get(userReference);
        user = userSnapshot.data() || {};
        transaction.update(payoutReference, {
          status: "processing",
          executionStartedAt: FieldValue.serverTimestamp(),
          executedBy: access.admin.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      try {
        const transfer = await initiateNombaBankTransfer({
          amount: Number(payout.amountNaira || payout.points || 0),
          destinationBankCode: String(payout.bankCode || ""),
          accountNumber: String(payout.accountNumber || ""),
          accountName: String(payout.accountName || ""),
          reference: "REFERRAL_" + payoutId,
          narration: "SellOnWhatsApp referral earnings payout",
        });
        const providerStatus = String(transfer.providerStatus || "").toUpperCase();
        const finalStatus = providerStatus === "SUCCESS" ? "paid" : "processing";
        await payoutReference.update({
          status: finalStatus,
          providerReference: transfer.transferRef,
          providerStatus,
          gatewayResponse: transfer.rawResponse || null,
          executedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (payout.userId) {
          await notifyUser(String(payout.userId), user, {
            type: "referral_payout",
            priority: finalStatus === "paid" ? "medium" : "high",
            title: finalStatus === "paid" ? "Referral payout sent" : "Referral payout processing",
            body: finalStatus === "paid"
              ? "Your referral earnings payout has been sent to your bank account."
              : "Your referral earnings payout has been submitted to Nomba and is still processing.",
            actionUrl: "/referrals",
          });
        }
        return NextResponse.json({ success: true, status: finalStatus, providerStatus });
      } catch (error) {
        await payoutReference.update({
          status: "approved",
          gatewayError: error instanceof Error ? error.message : "Nomba payout failed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        throw error;
      }
    }

    if (!payoutId || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Payout ID and a valid status are required" }, { status: 400 });
    }

    let payoutForNotification: Record<string, any> = {};
    let userForNotification: Record<string, any> = {};
    await adminDb.runTransaction(async (transaction) => {
      const payoutReference = adminDb.collection("referralPayouts").doc(payoutId);
      const payoutSnapshot = await transaction.get(payoutReference);
      if (!payoutSnapshot.exists) throw new Error("Referral payout not found");
      const payout = payoutSnapshot.data() || {};
      payoutForNotification = payout;
      const currentStatus = String(payout.status || "pending").toLowerCase();
      if (currentStatus === "paid" || currentStatus === "processing") throw new Error("This referral payout cannot be changed while it is " + currentStatus);
      if (status === "approved" && currentStatus !== "pending") throw new Error("Only pending payouts can be approved");
      if (status === "rejected" && currentStatus === "rejected") return;

      const withdrawalUserId = String(payout.userId || "");
      const userReference = adminDb.collection("users").doc(withdrawalUserId);
      const userSnapshot = await transaction.get(userReference);
      userForNotification = userSnapshot.data() || {};

      if (status === "rejected" && currentStatus !== "rejected") {
        const points = Number(payout.points || 0);
        const user = userForNotification;
        const wallet = user.referralWallet || {};
        transaction.set(userReference, {
          referralWallet: {
            ...wallet,
            availablePoints: Number(wallet.availablePoints || 0) + points,
            redeemedPoints: Math.max(0, Number(wallet.redeemedPoints || 0) - points),
          },
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection("referralLedger").doc("refund_" + payoutId), {
          id: "refund_" + payoutId,
          referrerId: withdrawalUserId,
          referredUserId: withdrawalUserId,
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

    if (payoutForNotification.userId) {
      await notifyUser(String(payoutForNotification.userId), userForNotification, {
        type: "referral_payout",
        priority: status === "rejected" ? "high" : "medium",
        title: status === "approved" ? "Referral payout approved" : "Referral payout rejected",
        body: note || (status === "approved"
          ? "Your referral payout request has been approved and is ready for processing."
          : "Your referral payout request was rejected and the points were returned to your referral wallet."),
        actionUrl: "/referrals",
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Referral payout update failed" }, { status: 400 });
  }
}
