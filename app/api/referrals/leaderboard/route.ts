import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const snapshot = await adminDb.collection("users").limit(500).get();
    const leaderboard = snapshot.docs
      .map((item) => {
        const data = item.data();
        const wallet = data.referralWallet || {};
        return {
          id: item.id,
          name: data.displayName || [data.firstName, data.lastName].filter(Boolean).join(" ") || "SellOnWhatsApp member",
          points: Number(wallet.lifetimePoints || 0),
          peopleHelped: Number(data.referralBuyerCount || 0) + Number(data.referralSellerCount || 0),
        };
      })
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 25)
      .map((item, index) => ({ ...item, rank: index + 1 }));
    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Referral leaderboard failed:", error);
    return NextResponse.json({ leaderboard: [] });
  }
}
