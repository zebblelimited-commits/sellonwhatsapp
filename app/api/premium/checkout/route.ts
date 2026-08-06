// app/api/premium/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export async function POST(req: NextRequest) {
  try {
    const { planId, userId, returnUrl } = await req.json();
    
    // 1. Verify user is authenticated
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const idToken = authHeader.split("Bearer")[1];
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== userId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 });
    }

    // 2. Get plan details
    const planDoc = await adminDb.collection("plans").doc(planId).get();
    if (!planDoc.exists) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const plan = planDoc.data();

    // 3. Create Nomba payment session
    const nomabaResponse = await fetch(`${process.env.NOMBA_SANDBOX_URL}/api/v1/charges`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOMBA_CLIENT_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: plan.price,
        currency: "NGN",
        email: decoded.email,
        reference: `premium_${userId}_${Date.now()}`,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/premium/webhook`,
        metadata: {
          userId,
          planId,
          returnUrl
        }
      })
    });

    const nomabaData = await nomabaResponse.json();
    
    if (!nomabaData.success || !nomabaData.data?.checkout_url) {
      throw new Error("Nomba checkout failed");
    }

    // 4. Create pending subscription record
    await adminDb.collection("subscriptions").add({
      userId,
      planId,
      status: "pending_payment",
      nomabaReference: nomabaData.data.reference,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({ 
      success: true, 
      checkoutUrl: nomabaData.data.checkout_url 
    });

  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to initialize checkout" }, 
      { status: 500 }
    );
  }
}