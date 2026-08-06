import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Legacy payout approval is disabled. Payouts are submitted and reconciled through the withdrawal workflow." }, { status: 410 });
}
