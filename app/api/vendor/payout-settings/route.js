import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { lookupNombaBankAccount } from "@/lib/payments/nomba/client";

async function authenticatedUser(request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

export async function GET(request) {
  try {
    const user = await authenticatedUser(request);
    const storeId = new URL(request.url).searchParams.get("storeId");
    if (!storeId || storeId !== user.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const snapshot = await adminDb.collection("stores").doc(storeId).get();
    if (!snapshot.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    const data = snapshot.data() || {};
    const details = data.payoutSettings || data.pendingPayoutDetails || {};
    return NextResponse.json({
      bankName: details.bankName || "Not Set",
      accountNumber: details.accountNumber || "----------",
      accountName: details.accountName || "No Account Name",
      bankCode: details.bankCode || "",
      status: data.payoutAccountVerificationStatus || details.status || data.payoutStatus || "UNCONFIGURED",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Failed to load payout settings" }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json();
    const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
    const bankCode = typeof body?.bankCode === "string" ? body.bankCode.trim() : "";
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.replace(/\D/g, "") : "";
    if (!storeId || storeId !== user.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) return NextResponse.json({ error: "A valid bank and 10-digit account number are required" }, { status: 400 });

    const verified = await lookupNombaBankAccount(bankCode, accountNumber);
    await adminDb.collection("stores").doc(storeId).update({
      pendingPayoutDetails: {
        bankName: typeof body.bankName === "string" ? body.bankName : "",
        bankCode,
        accountNumber: verified.accountNumber,
        accountName: verified.accountName,
        verificationSessionId: verified.sessionId,
        submittedAt: new Date(),
      },
      payoutStatus: "PENDING_REVIEW",
      payoutAccountVerificationStatus: "PENDING_REVIEW",
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true, accountName: verified.accountName, accountNumber: verified.accountNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save payout settings";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
