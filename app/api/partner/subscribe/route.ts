import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";

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

// ✅ Helper to get Nomba Access Token
async function getNombaToken() {
  const authUrl = process.env.NOMBA_AUTH_URL || process.env.NOMBA_SANDBOX_URL || "https://api.nomba.com";
  const response = await fetch(`${authUrl}/v1/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: process.env.NOMBA_ACCOUNT_ID!,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.NOMBA_CLIENT_ID,
      client_secret: process.env.NOMBA_CLIENT_SECRET,
    }),
    cache: "no-store",
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result?.description || "Failed to authenticate with Nomba");
  return result?.data?.access_token;
}

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

    // 2. Get Nomba Token
    const nombaToken = await getNombaToken();

    // ✅ Nomba Checkout expects amount in NGN (Naira) as a string/float
    const amountInNaira = "10000.00";
    const orderReference = `PARTNER_${storeId}_${Date.now()}`;

    // App URL & Dynamic Nomba API Base URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const nombaBaseUrl = process.env.NOMBA_SANDBOX_URL || "https://api.nomba.com";

    // UI Callback URL for browser redirect after checkout completion
    const callbackUrl = `${appUrl}/dashboard?tab=partner&reference=${orderReference}`;

    // ✅ 3. Create Checkout Order
    const response = await fetch(`${nombaBaseUrl}/v1/checkout/order`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nombaToken}`,
        accountId: process.env.NOMBA_ACCOUNT_ID!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          amount: amountInNaira,
          currency: "NGN",
          orderReference: orderReference,
          customerEmail: userEmail,
          customerId: storeId,
          accountId: process.env.NOMBA_ACCOUNT_ID,
          callbackUrl: callbackUrl,
          metaData: {
            type: "partner_subscription",
            storeId: storeId,
            userId: storeId,
            durationDays: 30,
            productName: "SellOnWhatsapp Marketplace Partner Subscription (1 Month)"
          }
        },
        tokenizeCard: "false"
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Nomba Checkout Order Error:", result);
      throw new Error(result?.description || "Failed to create Nomba checkout order");
    }

    // ✅ 4. Extract the checkout link
    const checkoutLink = result?.data?.checkoutLink || result?.checkoutLink;

    if (!checkoutLink) {
      console.error("Nomba Response missing checkoutLink:", result);
      throw new Error("Checkout link not found in Nomba response");
    }

    return NextResponse.json({
      checkoutUrl: checkoutLink
    });

  } catch (error: any) {
    console.error("Partner Subscribe API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}