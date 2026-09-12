import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { createNombaParentCheckoutOrder } from "@/lib/payments/nomba/client";

// ✅ Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const auth = getAuth();

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the user is logged in
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const storeId = decodedToken.uid;
    const userEmail = decodedToken.email || "";

    // ✅ Nomba Checkout expects amount in NGN (Naira) as a string/float
    const amountInNaira = "10000.00";
    const orderReference = `PARTNER_${storeId}_${Date.now()}`;

    // App URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // UI Callback URL for browser redirect after checkout completion
    const callbackUrl = `${appUrl}/dashboard?tab=partner&reference=${orderReference}`;

    // Partner subscriptions are platform revenue. Omitting order.accountId
    // and splitRequest sends the payment to the authenticated parent account.
    const checkout = await createNombaParentCheckoutOrder({
      amount: amountInNaira,
      currency: "NGN",
      orderReference,
      customerEmail: userEmail,
      customerId: storeId,
      callbackUrl,
      allowedPaymentMethods: ["Card", "Transfer"],
      orderMetaData: {
        type: "partner_subscription",
        storeId,
        userId: storeId,
        durationDays: "30",
        productName: "SellOnWhatsapp Marketplace Partner Subscription (1 Month)",
      },
    });

    return NextResponse.json({
      checkoutUrl: checkout.checkoutLink,
    });

  } catch (error: any) {
    console.error("Partner Subscribe API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
