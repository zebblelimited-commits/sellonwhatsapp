import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { auth } from "firebase-admin";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify User Authentication Token
    const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer")) {
      return NextResponse.json({ error: "Unauthorized access token mapping" }, { status: 401 });
    }

    // ✅ FIX: Strip "Bearer " and any leading/trailing spaces perfectly to isolate pure JWT
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    
    if (!token) {
      return NextResponse.json({ error: "Malformed authentication token signature" }, { status: 401 });
    }

    const decodedToken = await auth().verifyIdToken(token);

    // 2. Parse and Normalize Payload Fallbacks
    const body = await request.json();
    const { 
      planId, 
      planName, 
      price, 
      finalPrice, 
      amount, 
      durationDays, 
      durationLabel, 
      storeId, 
      userId, 
      storeName 
    } = body;

    const resolvedPrice = price || finalPrice || amount;
    const resolvedStoreId = storeId || userId || decodedToken.uid;

    if (!planId || !resolvedPrice || !resolvedStoreId) {
      return NextResponse.json({ error: "Required configurations are missing from payload" }, { status: 400 });
    }

    // Generate unique order reference mapping
    const uniqueOrderRef = `ZEBBLE_BST_${crypto.randomBytes(4).toString("hex").toUpperCase()}_${Date.now()}`;

    // Establish persistent pending states immediately
    await adminDb.collection("boosts").doc(uniqueOrderRef).set({
      status: "pending_payment",
      packageName: planName || "Store Boost Profile Package",
      tier: planId,
      totalAmount: Number(resolvedPrice),
      durationDays: Number(durationDays || 1),
      durationLabel: durationLabel || "1 Day",
      storeId: resolvedStoreId,
      storeName: storeName || "Unknown Store",
      nombaReference: uniqueOrderRef,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Resolve Uniform Nomba Architecture Links
    const rawBaseUrl = process.env.NOMBA_SANDBOX_URL || "https://sandbox.nomba.com";
    const sanitizedBaseUrl = rawBaseUrl.replace(/\/$/, ""); 

    const authUrl = `${sanitizedBaseUrl}/v1/auth/token/issue`;
    const orderUrl = `${sanitizedBaseUrl}/v1/checkout/order`;

    console.log(`[Nomba Engine] Executing security handshake sequence...`);

    // STEP A: Exchange App Client Credentials for temporary access token stream
    const authResponse = await fetch(authUrl, {
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
    });

    if (!authResponse.ok) {
      const authErrorText = await authResponse.text();
      console.error("[Nomba Engine] Key signature exchange rejected:", authErrorText);
      return NextResponse.json({ error: "Payment server authentication failure" }, { status: 502 });
    }

    const authData = await authResponse.json();
    const gatewayAccessToken = authData.data?.access_token;

    if (!gatewayAccessToken) {
      return NextResponse.json({ error: "Access token missing from gateway stream context" }, { status: 502 });
    }

    // STEP B: Dispatch Manifest Intent to Checkout Pipeline
    const payload = {
      order: {
        orderReference: uniqueOrderRef,
        amount: parseFloat(Number(resolvedPrice).toFixed(2)), 
        currency: "NGN",
        customerEmail: decodedToken.email || "billing@zebble.io",
        description: `Boost Plan: ${planName || planId} (${durationLabel || 'Custom Duration'})`,
        
        // User redirect after payment
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/boost-success?reference=${uniqueOrderRef}`,
        
        // Explicitly point the server-to-server webhook to backend API
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/nomba`, 
        
        allowedPaymentMethods: ["Card", "Transfer"],
        metaData: {
          storeId: resolvedStoreId,
          planId,
          isBoost: "true"
        }
      },
    };

    console.log(`[Nomba Engine] Dispatched checkout transaction to target: ${orderUrl}`);

    const gatewayResponse = await fetch(orderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayAccessToken}`,
        accountId: process.env.NOMBA_ACCOUNT_ID!,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await gatewayResponse.json();

    const isSuccessfullyCreated = responseData.code === "00" || responseData.data?.success === true;

    if (!gatewayResponse.ok || !isSuccessfullyCreated) {
      console.error("[Nomba Engine] Gateway placement stream rejected:", responseData);
      return NextResponse.json({ error: responseData.description || "Payment server initialization rejected" }, { status: 502 });
    }

    // 4. Return Normalized Checkout Pointer back to Frontend Component
    const checkoutUrl = responseData.data?.checkoutLink || responseData.data?.checkoutUrl || responseData.checkoutLink;

    console.log(`✅ Checkout page generated successfully: ${checkoutUrl}`);

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderReference: uniqueOrderRef,
    });

  } catch (error: any) {
    console.error("Checkout Master Route Error:", error);
    return NextResponse.json({ error: error.message || "Internal generation error" }, { status: 500 });
  }
}