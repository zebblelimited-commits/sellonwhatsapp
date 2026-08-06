import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import admin from "firebase-admin";

// Helper to get Nomba Token
async function getNombaToken() {
  const response = await fetch(`${process.env.NOMBA_AUTH_URL}/v1/auth/token/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", accountId: process.env.NOMBA_ACCOUNT_ID! },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.NOMBA_CLIENT_ID,
      client_secret: process.env.NOMBA_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error("Failed to authenticate with Nomba");
  return result?.data?.access_token;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify User
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.split(" ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const storeId = decoded.uid;

    // 2. Parse Request & Fetch Store Data
    const { amount } = await request.json();
    if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const storeDoc = await adminDb.collection("stores").doc(storeId).get();
    if (!storeDoc.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    
    const storeData = storeDoc.data();
    const payoutSettings = storeData?.payoutSettings;

    if (!payoutSettings?.bankCode || !payoutSettings?.accountNumber) {
      return NextResponse.json({ error: "Please link a bank account in Settings first." }, { status: 400 });
    }

    // ✅ 3. Check Balances (Fallback to alternative field names just in case)
    const availableBalance = Number(
      storeData?.availableBalance || 
      storeData?.balance || 
      storeData?.walletBalance || 
      0
    );
    
    // 🔍 DEBUG LOG: See exactly what financial fields exist in the database
    console.log(`[WITHDRAW] User ${storeId} requesting ₦${amount}.`);
    console.log(`[WITHDRAW] Firestore Financial Fields:`, {
      availableBalance: storeData?.availableBalance,
      balance: storeData?.balance,
      escrowBalance: storeData?.escrowBalance,
      totalSales: storeData?.totalSales
    });
    console.log(`[WITHDRAW] Final Available Balance used by API: ₦${availableBalance}`);

    if (amount > availableBalance) {
      const errorMsg = availableBalance === 0 
        ? "You have no available funds to withdraw yet. Your funds are currently locked in escrow until orders are marked as Completed/Delivered." 
        : `Insufficient balance. Your actual available balance is ₦${availableBalance.toLocaleString()}.`;
        
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const isPartnerActive = storeData?.isPartner && new Date(storeData?.partnerExpiry) > new Date();
    const feePercent = isPartnerActive ? 0.015 : 0.03;
    const platformFee = amount * feePercent;
    const netPayout = amount - platformFee;

    // 4. Initiate Nomba Transfer
    const nombaToken = await getNombaToken();
    const transferRef = `PAYOUT_${storeId}_${Date.now()}`;

    const transferResponse = await fetch(`${process.env.NOMBA_SANDBOX_URL}/v1/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nombaToken}`,
        accountId: process.env.NOMBA_ACCOUNT_ID!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: netPayout.toFixed(2), 
        reference: transferRef,
        narration: "Zebble Store Payout",
        bankCode: payoutSettings.bankCode,
        accountNumber: payoutSettings.accountNumber,
        accountName: payoutSettings.accountName,
        currency: "NGN"
      }),
    });

    const transferResult = await transferResponse.json();
    if (!transferResponse.ok) {
      console.error("Nomba Transfer Error:", transferResult);
      throw new Error(transferResult?.description || "Gateway rejected transfer");
    }

    // 5. Update Firestore (Deduct balance & log transaction)
    const batch = adminDb.batch();
    
    batch.update(adminDb.collection("stores").doc(storeId), {
      availableBalance: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    batch.set(adminDb.collection("payouts").doc(transferRef), {
      id: transferRef,
      storeId: storeId,
      vendorId: storeId,
      grossAmount: amount,
      platformFee: platformFee,
      netAmount: netPayout,
      bankName: payoutSettings.bankName,
      accountNumber: payoutSettings.accountNumber,
      nombaReference: transferResult?.data?.reference || transferRef,
      status: "pending",
      requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      message: "Withdrawal initiated successfully",
      reference: transferRef 
    });

  } catch (error: any) {
    console.error("Withdrawal API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}