import { NextResponse } from "next/server";

// This legacy endpoint used the client Firestore SDK, accepted an arbitrary
// storeId without authentication, and wrote to a separate wallets collection.
// All withdrawals now go through /api/withdraw, which uses the authenticated
// Firebase user and the stores.availableBalance ledger transactionally.
export async function POST() {
  return NextResponse.json(
    { error: "This legacy withdrawal endpoint is disabled. Use /api/withdraw." },
    { status: 410 }
  );
}
