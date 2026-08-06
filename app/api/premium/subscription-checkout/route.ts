// app/api/premium/subscription-checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";

// ✅ Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
    }),
  });
}
const adminDb = admin.firestore();

// ✅ Plan definitions with monthly base prices (server-side source of truth)
const SUBSCRIPTION_PLANS: Record<string, {
  monthlyPrice: number;
  name: string;
  interval: string;
}> = {
  pro_lite: {
    monthlyPrice: 4999,
    name: "Pro Business Lite",
    interval: "month"
  },
  pro_max: {
    monthlyPrice: 49990,
    name: "Pro Yearly Business Max",
    interval: "year"
  }
};

// ✅ Duration-based pricing calculator
const DURATION_DISCOUNTS: Record<number, number> = {
  1: 0,      // 0% discount for monthly
  3: 0.10,   // 10% discount for quarterly
  6: 0.17,   // 17% discount for bi-annual
  12: 0.25   // 25% discount for annual
};

function calculateFinalPrice(monthlyPrice: number, months: number): number {
  const discount = DURATION_DISCOUNTS[months] || 0;
  const totalPrice = monthlyPrice * months;
  return Math.round(totalPrice * (1 - discount));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      planId,
      userId,
      userEmail,
      returnUrl,
      // ✅ New fields from pricing page
      durationMonths = 1,
      durationLabel = "1 Month",
      monthlyBasePrice,
      basePrice,
      finalPrice,  // ✅ This is the price to charge
      discount,
      discountPercentage,
      savingsAmount,
      autoRenew = true,
      metadata: clientMetadata = {}
    } = body;

    // ✅ Validate input
    if (!planId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ✅ Verify user is authenticated
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split("Bearer")[1];
    if (!idToken) {
      return NextResponse.json({ error: "Invalid token format" }, { status: 401 });
    }

    const decoded = await getAuth().verifyIdToken(idToken.trim());
    if (decoded.uid !== userId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 });
    }

    // ✅ Get plan details
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // ✅ Calculate the actual amount to charge
    // Use client-provided finalPrice if available, otherwise calculate server-side
    const chargeAmount = finalPrice || calculateFinalPrice(
      monthlyBasePrice || plan.monthlyPrice, 
      durationMonths
    );

    const totalSavings = savingsAmount || (
      (plan.monthlyPrice * durationMonths) - chargeAmount
    );

    console.log('💰 Subscription Checkout:', {
      planId,
      planName: plan.name,
      monthlyPrice: plan.monthlyPrice,
      duration: `${durationMonths} months`,
      discount: `${Math.round((discount || 0) * 100)}%`,
      chargeAmount: `₦${chargeAmount.toLocaleString()}`,
      savings: `₦${totalSavings.toLocaleString()}`,
      autoRenew
    });

    // ✅ Generate unique order reference
    const orderReference = `SUB_${planId.toUpperCase()}_${userId}_${Date.now()}`;

    // ✅ Mock mode for development
    if (process.env.NODE_ENV === "development" && process.env.MOCK_NOMBA === "true") {
      const mockRef = orderReference;
      
      // Store subscription with duration info
      await adminDb.collection("subscriptions").add({
        userId,
        planId,
        planName: plan.name,
        monthlyPrice: plan.monthlyPrice,
        durationMonths,
        durationLabel,
        basePrice: basePrice || plan.monthlyPrice * durationMonths,
        finalPrice: chargeAmount,
        discount: discount || 0,
        savingsAmount: totalSavings,
        interval: plan.interval,
        autoRenew,
        status: "pending_payment",
        nombaReference: orderReference,  // ✅ Must match webhook query
        isMock: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Calculate expiry date based on duration
        expiryDate: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000)
        )
      });
      
      return NextResponse.json({ 
        success: true, 
        checkoutLink: `${returnUrl || process.env.NEXT_PUBLIC_APP_URL}/payment/subscription-success?reference=${mockRef}&mock=true`,
        isMock: true,
        reference: mockRef,
        amount: chargeAmount
      });
    }

    // ✅ Nomba 2-step auth flow
    const BASE_URL = `${process.env.NOMBA_SANDBOX_URL}/v1`;

    // Step 1: Get access token
    const authRes = await fetch(`${BASE_URL}/auth/token/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "accountId": process.env.NOMBA_ACCOUNT_ID!
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.NOMBA_CLIENT_ID,
        client_secret: process.env.NOMBA_CLIENT_SECRET,
      }),
    });

    if (!authRes.ok) {
      const authErr = await authRes.text();
      console.error('Nomba Auth Error:', authErr);
      throw new Error(`Nomba Auth Failed: ${authErr}`);
    }

    const authData = await authRes.json();
    const token = authData.data?.access_token;
    if (!token) throw new Error("No access token returned from Nomba");

    // Step 2: Create checkout order with CORRECT amount
    const orderRes = await fetch(`${BASE_URL}/checkout/order`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "accountId": process.env.NOMBA_ACCOUNT_ID!,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        order: {
          orderReference,
          amount: chargeAmount.toFixed(2),  // ✅ Use the calculated amount!
          currency: "NGN",
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/subscription-success?reference=${orderReference}`,
          customerEmail: userEmail || decoded.email,
          description: `${plan.name} - ${durationLabel}${autoRenew ? ' (Auto-renew)' : ''}`,
          allowedPaymentMethods: ["Card", "Transfer"],
          metaData: {
            userId,
            planId,
            planName: plan.name,
            durationMonths,
            durationLabel,
            monthlyPrice: plan.monthlyPrice,
            actualAmount: chargeAmount,
            originalAmount: plan.monthlyPrice * durationMonths,
            savingsAmount: totalSavings,
            discount: discount || 0,
            discountPercentage: Math.round((discount || 0) * 100),
            autoRenew,
            interval: plan.interval,
            returnUrl: returnUrl || process.env.NEXT_PUBLIC_APP_URL,
            // ✅ Pass all metadata through for webhook processing
            isSubscription: true,
            ...clientMetadata
          }
        }
      }),
    });

    const orderData = await orderRes.json();

    if (orderData.code !== "00" && orderData.status !== "success") {
      console.error('Nomba Order Error:', orderData);
      throw new Error(orderData.description || "Failed to create Nomba checkout order");
    }

    const checkoutLink = orderData.data?.checkoutLink;
    if (!checkoutLink) throw new Error("No checkout link returned from Nomba");

    // ✅ Create pending subscription record with full duration info
    await adminDb.collection("subscriptions").add({
      userId,
      planId,
      planName: plan.name,
      monthlyPrice: plan.monthlyPrice,
      durationMonths,
      durationLabel,
      basePrice: plan.monthlyPrice * durationMonths,
      finalPrice: chargeAmount,
      discount: discount || 0,
      savingsAmount: totalSavings,
      interval: plan.interval,
      autoRenew,
      status: "pending_payment",
      nombaReference: orderReference,  // ✅ FIXED: was "nomabaReference"
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Calculate tentative expiry date
      expiryDate: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000)
      )
    });

    console.log(`✅ Checkout created: ${orderReference} - ₦${chargeAmount.toLocaleString()}`);

    return NextResponse.json({ 
      success: true, 
      checkoutLink,
      reference: orderReference,
      amount: chargeAmount,
      planName: plan.name,
      duration: durationLabel,
      savings: totalSavings
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Subscription checkout error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}