import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { lookupNombaBankAccount, NombaError } from "@/lib/payments/nomba/client";
import { FieldValue } from "firebase-admin/firestore";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const snapshot = await adminDb.collection("users").doc(decoded.uid).get();
    return NextResponse.json({ payoutSettings: snapshot.data()?.referralPayoutSettings || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Unable to load payout account" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const bankName = String(body?.bankName || "").trim().slice(0, 120);
    const bankCode = String(body?.bankCode || "").trim().slice(0, 20);
    const accountNumber = String(body?.accountNumber || "").replace(/\D/g, "").slice(0, 10);
    if (!bankName || !bankCode || accountNumber.length !== 10) {
      return NextResponse.json({ error: "Bank and a valid 10-digit account number are required" }, { status: 400 });
    }
    const verified = await lookupNombaBankAccount(bankCode, accountNumber);
    const settings = { bankName, bankCode, accountNumber: verified.accountNumber, accountName: verified.accountName, status: "pending_review", submittedAt: FieldValue.serverTimestamp() };
    await adminDb.collection("users").doc(decoded.uid).set({ referralPayoutSettings: settings, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ success: true, payoutSettings: { ...settings, submittedAt: new Date().toISOString() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save payout account";
    const status = message === "Unauthorized" ? 401 : error instanceof NombaError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
