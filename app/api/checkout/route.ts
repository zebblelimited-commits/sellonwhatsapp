import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface CheckoutRequestBody {
    buyerId: string;
    customerEmail: string;
    address: any;
    sellerOrders: {
        storeId: string;
        storeName: string;
        items: any[];
        courierId?: string;
        courierName?: string;
        shippingMethod: string;
        shippingCost: number;
        estimatedDays?: string;
        subtotal: number;
    }[];
    paymentMethod: string;
    total: number;
}

async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = 2
): Promise<Response> {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            if (i === retries) throw error;
            await new Promise((resolve) =>
                setTimeout(resolve, 1000 * Math.pow(2, i))
            );
        }
    }
    throw new Error("All retry attempts failed");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        console.log("🔵 [CHECKOUT API] Request received");

        const accountId = process.env.NOMBA_ACCOUNT_ID;
        const clientId = process.env.NOMBA_CLIENT_ID;
        const clientSecret = process.env.NOMBA_CLIENT_SECRET;

        if (!accountId || !clientId || !clientSecret) {
            console.error("❌ [CHECKOUT API] Missing Nomba API environment variables.");
            return NextResponse.json(
                { error: "Payment gateway configuration error." },
                { status: 500 }
            );
        }

        const body: CheckoutRequestBody = await req.json();

        const {
            buyerId,
            customerEmail,
            address,
            sellerOrders,
            paymentMethod,
            total: frontendTotal,
        } = body;

        if (
            !buyerId ||
            !customerEmail ||
            !address ||
            !sellerOrders ||
            sellerOrders.length === 0
        ) {
            return NextResponse.json(
                { error: "Missing required checkout fields." },
                { status: 400 }
            );
        }

        console.log("🔵 [CHECKOUT API] Customer email:", customerEmail);

        const batch = adminDb.batch();
        const checkoutReference = `SOWA_CHK_${Date.now()}`;
        let calculatedGrandTotal = 0;
        const createdOrderIds: string[] = [];

        // ---------------------------------------------------------
        // CREATE SELLER ORDERS
        // ---------------------------------------------------------

        for (const sellerOrder of sellerOrders) {
            const {
                storeId,
                storeName,
                items,
                courierId: requestedCourierId,
                courierName: requestedCourierName,
                shippingMethod,
                shippingCost: rawShippingCost,
                estimatedDays,
                subtotal: productSubtotal,
            } = sellerOrder;

            if (!storeId || storeId === "unknown") {
                console.error("❌ [CHECKOUT API] Invalid storeId detected:", storeId);
                return NextResponse.json(
                    { error: "One or more items in your cart are missing store information." },
                    { status: 400 }
                );
            }

            console.log(`🔵 [CHECKOUT API] Fetching store data for: ${storeId}`);
            const storeSnap = await adminDb.collection("stores").doc(storeId).get();

            if (!storeSnap.exists) {
                console.error(`❌ [CHECKOUT API] Store document not found: ${storeId}`);
                return NextResponse.json(
                    { error: "Store configuration not found. Please contact support." },
                    { status: 404 }
                );
            }

            const storeData = storeSnap.data() || {};

            // -----------------------------------------------------
            // CHECK SELF-ARRANGED SHIPPING & COMMISSIONS
            // -----------------------------------------------------

            // The checkout client sends the selected courier ID. Keep the
            // shipping method fallback for older clients that only sent it.
            const courierId = requestedCourierId || shippingMethod;
            const courierName = requestedCourierName || shippingMethod;
            const isSelfArranged = courierId === "self_arranged" || shippingMethod === "self_arranged";
            const shippingCost = isSelfArranged ? 0 : rawShippingCost;

            const isPartner =
                storeData.isPartner === true ||
                storeData.subscriptionPlan === "pro_max" ||
                storeData.subscriptionPlan === "pro_yearly_business_max" ||
                String(storeData.subscriptionPlan || "").toLowerCase().includes("max");

            const sellerCommissionRate = isPartner ? 0 : 0.015;

            // Handling fee is waived for self-arranged shipping
            const handlingFee = !isSelfArranged && shippingCost > 0 ? 200 : 0;

            const sellerCommission = Math.round(productSubtotal * sellerCommissionRate);
            const sellerPayout = productSubtotal - sellerCommission;
            const buyerPlatformFee = Math.round((productSubtotal + shippingCost) * 0.015);
            const escrowAmount = productSubtotal;

            const platformRevenue = sellerCommission + buyerPlatformFee + handlingFee;
            const orderTotal = productSubtotal + shippingCost + buyerPlatformFee + handlingFee;

            calculatedGrandTotal += orderTotal;

            const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            createdOrderIds.push(orderId);

            // -----------------------------------------------------
            // ORDER DOCUMENT
            // -----------------------------------------------------

            const orderDoc = {
                orderId,
                checkoutReference,
                buyerId,
                customerEmail,
                storeId,
                // Keep the legacy ownership alias while all readers migrate
                // to the canonical storeId field.
                vendorId: storeId,
                storeName,
                items,
                customerName: address.name || "",
                customerPhone: address.phone || "",
                deliveryAddress: address,
                shippingMethod: courierId,
                courierId,
                courierName,
                estimatedDays: estimatedDays || null,
                shippingCost,
                handlingFee,
                productSubtotal,
                sellerCommission,
                sellerPayout,
                buyerPlatformFee,
                platformRevenue,
                escrowAmount,
                total: orderTotal,
                // totalAmount is retained for older dashboard and admin
                // consumers; total remains the checkout source of truth.
                totalAmount: orderTotal,
                status: "PENDING_PAYMENT",
                paymentStatus: "pending",
                paymentMethod,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            batch.set(adminDb.collection("orders").doc(orderId), orderDoc);

            // -----------------------------------------------------
            // CREATE SHIPMENT (EXCLUDE SELF-ARRANGED)
            // -----------------------------------------------------

            if (!isSelfArranged && shippingCost > 0) {
                const shipmentId = `SHP_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

                const shipmentDoc = {
                    shipmentId,
                    orderId,
                    checkoutReference,
                    storeId,
                    buyerId,
                    customerEmail,
                    courierId,
                    courierName,
                    status: "PENDING_PICKUP",
                    pickupAddress: storeData.address || "Store Address",
                    deliveryAddress: address,
                    shippingCost,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                };

                batch.set(adminDb.collection("shipments").doc(shipmentId), shipmentDoc);
            }
        }

        // ---------------------------------------------------------
        // VERIFY TOTAL
        // ---------------------------------------------------------

        if (Math.abs(calculatedGrandTotal - frontendTotal) > 1) {
            return NextResponse.json(
                {
                    error: "Total amount mismatch. Please refresh and try again.",
                    expectedTotal: calculatedGrandTotal,
                    providedTotal: frontendTotal,
                },
                { status: 400 }
            );
        }

        console.log("🔵 [CHECKOUT API] Committing batch to Firestore...");
        await batch.commit();
        console.log("✅ [CHECKOUT API] Firestore batch committed successfully.");

        // ---------------------------------------------------------
        // NOMBA PAYMENT INITIALIZATION
        // ---------------------------------------------------------

        const nombaOrigin = process.env.NOMBA_SANDBOX_URL || "https://sandbox.nomba.com";
        const isSandbox =
            Boolean(process.env.NOMBA_SANDBOX_URL) ||
            process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox";

        const authBaseUrl = `${nombaOrigin}/v1`;
        const checkoutBaseUrls = isSandbox
            ? [`${nombaOrigin}/v1`, `${nombaOrigin}/sandbox`]
            : [`${nombaOrigin}/v1`];

        console.log("🔵 [CHECKOUT API] Requesting Nomba Auth Token...");

        const authRes = await fetchWithRetry(`${authBaseUrl}/auth/token/issue`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                accountId: accountId,
            },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });

        if (!authRes.ok) {
            const errText = await authRes.text();
            throw new Error(`Nomba Auth Failed: ${authRes.status} - ${errText}`);
        }

        const authData = await authRes.json();
        const token = authData.data?.access_token;

        if (!token) {
            throw new Error("No access token received from Nomba");
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const callbackUrl = `${appUrl}/payment/success?reference=${checkoutReference}`;

        const itemSummary =
            sellerOrders.length > 1
                ? `${sellerOrders.reduce((acc, curr) => acc + curr.items.length, 0)} items from ${sellerOrders.length} stores`
                : `${sellerOrders[0].items.length} items from ${sellerOrders[0].storeName}`;

        const formattedPaymentMethods = paymentMethod?.toLowerCase() === "transfer"
            ? ["BANK_TRANSFER", "CARD"]
            : ["CARD", "BANK_TRANSFER"];

        const checkoutRequest = {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                accountId: accountId,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                order: {
                    orderReference: checkoutReference,
                    amount: Number(calculatedGrandTotal.toFixed(2)),
                    currency: "NGN",
                    callbackUrl,
                    customerEmail: customerEmail || "customer@sowa.com",
                    description: `Checkout: ${itemSummary}`,
                    allowedPaymentMethods: formattedPaymentMethods,
                    metaData: {
                        checkoutReference,
                        orderIds: createdOrderIds.join(","),
                        buyerId,
                    },
                },
            }),
        };

        console.log("🔵 [CHECKOUT API] Creating Nomba Checkout Order...");

        let nombaOrderRes = await fetchWithRetry(
            `${checkoutBaseUrls[0]}/checkout/order`,
            checkoutRequest
        );

        if (
            !nombaOrderRes.ok &&
            nombaOrderRes.status === 404 &&
            checkoutBaseUrls.length > 1
        ) {
            console.warn("⚠️ Primary route returned 404; trying sandbox route.");
            nombaOrderRes = await fetchWithRetry(
                `${checkoutBaseUrls[1]}/checkout/order`,
                checkoutRequest
            );
        }

        if (!nombaOrderRes.ok) {
            const errText = await nombaOrderRes.text();
            throw new Error(`Nomba Order Creation Failed: ${nombaOrderRes.status} - ${errText}`);
        }

        const nombaData = await nombaOrderRes.json();

        if (nombaData.code === "00" || nombaData.status === "success" || nombaData.data?.checkoutLink) {
            const rawCheckoutLink = nombaData.data?.checkoutLink || "";
            const querySeparator = rawCheckoutLink.includes("?") ? "&" : "?";
            const finalCheckoutLink = rawCheckoutLink
                ? `${rawCheckoutLink}${querySeparator}orderRef=${checkoutReference}`
                : "";

            return NextResponse.json({
                success: true,
                checkoutLink: finalCheckoutLink,
                reference: checkoutReference,
                orderIds: createdOrderIds,
            });
        } else {
            throw new Error(nombaData.description || "Nomba Order creation failed");
        }
    } catch (error: any) {
        console.error("❌ [CHECKOUT API] Fatal Error:", error.message);
        return NextResponse.json(
            { error: error.message || "An unexpected error occurred. Please try again." },
            { status: 500 }
        );
    }
}
