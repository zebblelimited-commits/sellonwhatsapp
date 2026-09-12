import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { auth } from "firebase-admin";
import crypto from "crypto";
import { createNombaParentCheckoutOrder } from "@/lib/payments/nomba/client";

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

    const resolvedPrice = Number(price || finalPrice || amount);
    const resolvedStoreId = String(storeId || userId || decodedToken.uid).trim();

    if (!planId || !Number.isFinite(resolvedPrice) || resolvedPrice <= 0 || !resolvedStoreId) {
      return NextResponse.json({ error: "Required configurations are missing from payload" }, { status: 400 });
    }

    if (resolvedStoreId !== decodedToken.uid) {
      return NextResponse.json({ error: "You can only purchase a boost for your own store" }, { status: 403 });
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
      userId: decodedToken.uid,
      storeName: storeName || "Unknown Store",
      nombaReference: uniqueOrderRef,
      paymentProvider: "nomba",
      paymentStatus: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Store boosts are platform revenue. Do not route them through seller
    // escrow or the courier settlement account.
    const checkout = await createNombaParentCheckoutOrder({
      orderReference: uniqueOrderRef,
      amount: resolvedPrice.toFixed(2),
      currency: "NGN",
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/boost-success?reference=${encodeURIComponent(uniqueOrderRef)}`,
      customerEmail: decodedToken.email || "billing@zebble.io",
      customerId: decodedToken.uid,
      allowedPaymentMethods: ["Card", "Transfer"],
      orderMetaData: {
        storeId: resolvedStoreId,
        userId: decodedToken.uid,
        planId: String(planId),
        planName: String(planName || "Store Boost Profile Package"),
        durationDays: String(durationDays || 1),
        isBoost: "true",
      },
    });

    const checkoutUrl = checkout.checkoutLink;

    console.log(`✅ Checkout page generated successfully: ${checkoutUrl}`);

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderReference: checkout.orderReference,
    });

  } catch (error: any) {
    console.error("Checkout Master Route Error:", error);
    return NextResponse.json({ error: error.message || "Internal generation error" }, { status: 500 });
  }
}
