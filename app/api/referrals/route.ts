import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  attributeReferral,
  ensureReferralProfile,
  readReferralWallet,
  recordMeaningfulActivity,
  syncReferralMilestones,
} from "@/lib/referrals";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

function serialize(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const role = String(decoded.role || "buyer");
    await ensureReferralProfile(decoded.uid, role, decoded.name || decoded.email || decoded.uid);
    await syncReferralMilestones(decoded.uid);
    const wallet = await readReferralWallet(decoded.uid);
    const [ledgerSnapshot, payoutSnapshot] = await Promise.all([
      adminDb.collection("referralLedger").where("referrerId", "==", decoded.uid).limit(100).get(),
      adminDb.collection("referralPayouts").where("userId", "==", decoded.uid).limit(50).get(),
    ]);
    const ledger: Array<Record<string, any>> = ledgerSnapshot.docs
      .map((item): Record<string, any> => ({ id: item.id, ...(item.data() as Record<string, any>) }))
      .sort((a, b) => String(serialize(b.createdAt) || "").localeCompare(String(serialize(a.createdAt) || "")));
    const successfulBuyerIds = new Set(ledger.filter((item) => String(item.type).includes("buyer") && item.referredUserId !== decoded.uid).map((item) => item.referredUserId));
    const successfulSellerIds = new Set(ledger.filter((item) => String(item.type).includes("seller") && item.referredUserId !== decoded.uid).map((item) => item.referredUserId));

    return NextResponse.json({
      wallet,
      activity: {
        buyers: successfulBuyerIds.size,
        sellers: successfulSellerIds.size,
        orders: ledger.filter((item) => String(item.type).includes("order")).length,
        totalEarned: wallet.lifetimePoints,
      },
      ledger: ledger.slice(0, 30),
      payouts: payoutSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, any>) })),
    });
  } catch (error) {
    console.error("Referral wallet GET failed:", error);
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Unable to load referral wallet" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    if (action === "attribute") {
      const result = await attributeReferral({
        uid: decoded.uid,
        role: String(body.role || decoded.role || "buyer"),
        referralCode: typeof body.referralCode === "string" ? body.referralCode : "",
        displayName: typeof body.displayName === "string" ? body.displayName : decoded.name || decoded.email || decoded.uid,
      });
      return NextResponse.json({ success: true, ...result });
    }
    if (action === "activity") {
      return NextResponse.json({ success: true, result: await recordMeaningfulActivity(decoded.uid) });
    }
    if (action === "sync") {
      await syncReferralMilestones(decoded.uid);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown referral action" }, { status: 400 });
  } catch (error) {
    console.error("Referral action failed:", error);
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Referral action failed" }, { status: 400 });
  }
}
