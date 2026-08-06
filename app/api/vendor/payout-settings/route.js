import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function GET(req) { // Note: ': Request' is removed
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json({ error: "Store ID required" }, { status: 400 });
    }

    const storeRef = doc(db, "stores", storeId);
    const storeSnap = await getDoc(storeRef);

    if (!storeSnap.exists()) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const data = storeSnap.data();
    const activeDetails = data.pendingPayoutDetails || data;

    return NextResponse.json({
      bankName: activeDetails.bankName || "Not Set",
      accountNumber: activeDetails.accountNumber || "----------",
      accountName: activeDetails.accountName || "No Account Name",
      bankCode: activeDetails.bankCode || "",
      status: data.payoutStatus || "UNCONFIGURED",
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) { // Note: ': Request' is removed
  try {
    const body = await req.json();
    const { storeId, bankName, bankCode, accountNumber, accountName } = body;

    if (!storeId) return NextResponse.json({ error: "Store ID missing" }, { status: 400 });

    const storeRef = doc(db, "stores", storeId);
    await updateDoc(storeRef, {
      pendingPayoutDetails: { bankName, bankCode, accountNumber, accountName },
      payoutStatus: "PENDING_REVIEW",
      lastModified: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}