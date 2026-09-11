// app/api/premium/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { createNombaCheckoutOrder } from "@/lib/payments/nomba/client";

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
    const plan = planDoc.data() || {};
    const planPrice = Number(plan.price);
    if (!Number.isFinite(planPrice) || planPrice <= 0) {
      return NextResponse.json({ error: "Plan price is invalid" }, { status: 400 });
    }

    // 3. Create the checkout through the shared environment-aware Nomba client.
    const orderReference = `PREMIUM_${userId}_${Date.now()}`;
    const checkout = await createNombaCheckoutOrder({
      amount: planPrice.toFixed(2),
      currency: "NGN",
      orderReference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?tab=partner&reference=${encodeURIComponent(orderReference)}`,
      customerEmail: decoded.email || "",
      customerId: userId,
      allowedPaymentMethods: ["Card", "Transfer"],
      orderMetaData: {
        userId,
        planId,
        returnUrl: String(returnUrl || ""),
        flow: "premium_checkout",
      },
    });

    // 4. Create pending subscription record
    await adminDb.collection("subscriptions").add({
      userId,
      planId,
      status: "pending_payment",
      nombaReference: checkout.orderReference,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({ 
      success: true, 
      checkoutUrl: checkout.checkoutLink 
    });

  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to initialize checkout" }, 
      { status: 500 }
    );
  }
}
