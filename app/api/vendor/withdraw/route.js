import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, increment } from "firebase/firestore";

export async function POST(req) {
  try {
    const { storeId, amount } = await req.json();

    if (!storeId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal request" }, { status: 400 });
    }

    // 1. Fetch Vendor Wallet and Payout Details
    const walletRef = doc(db, "wallets", storeId);
    const storeRef = doc(db, "stores", storeId);
    
    const [walletSnap, storeSnap] = await Promise.all([
      getDoc(walletRef),
      getDoc(storeRef)
    ]);

    if (!walletSnap.exists() || !storeSnap.exists()) {
      return NextResponse.json({ error: "Vendor record not found" }, { status: 404 });
    }

    const walletData = walletSnap.data();
    const storeData = storeSnap.data();
    const availableBalance = walletData.available || 0;

    // 2. Check for sufficient funds
    if (amount > availableBalance) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // 3. Get Bank Details (Priority to verified details)
    const bankDetails = storeData.payoutDetails; // Ensure this matches your Firestore field name
    if (!bankDetails || !bankDetails.accountNumber) {
      return NextResponse.json({ error: "No verified payout bank account found" }, { status: 400 });
    }

    /**
     * 4. Trigger Nomba Transfer API
     * We use the credentials you retrieved earlier to authorize the transfer.
     */
    const nombaResponse = await fetch("https://api.nomba.com/v1/transfers/bank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NOMBA_ACCESS_TOKEN}`,
        "account-key": process.env.NOMBA_ACCOUNT_KEY
      },
      body: JSON.stringify({
        amount: amount,
        bankCode: bankDetails.bankCode,
        accountNumber: bankDetails.accountNumber,
        currency: "NGN",
        reason: `Zebble Withdrawal - ${storeData.name}`,
        reference: `WD-${Date.now()}-${storeId}`
      })
    });

    const nombaResult = await nombaResponse.json();

    if (!nombaResponse.ok) {
      throw new Error(nombaResult.message || "Nomba transfer failed");
    }

    // 5. Atomic Update: Deduct balance and Log Transaction
    await updateDoc(walletRef, {
      available: increment(-amount),
      totalWithdrawn: increment(amount),
      lastWithdrawalDate: serverTimestamp()
    });

    await addDoc(collection(db, "transactions"), {
      storeId,
      type: "WITHDRAWAL",
      amount: amount,
      status: "SUCCESS",
      bankName: bankDetails.bankName,
      accountNumber: bankDetails.accountNumber,
      nombaRef: nombaResult.data?.reference || "N/A",
      createdAt: serverTimestamp()
    });

    return NextResponse.json({ 
      success: true, 
      message: "Withdrawal processed successfully",
      data: nombaResult.data 
    });

  } catch (error) {
    console.error("Withdrawal Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}