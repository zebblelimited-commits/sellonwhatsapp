// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin"; // ✅ Use Admin SDK to bypass security rules
import { FieldValue } from "firebase-admin/firestore";
import { sendNotification } from "@/lib/cloud-functions/sendNotification"; // ✅ Added Notification Import

// ✅ Define TypeScript interfaces for request body
interface CheckoutRequestBody {
    price: number;
    quantity: number;
    deliveryFee: number;
    productName: string;
    storeId: string;
    paymentMethod: string;
    customerEmail: string;
    isBooking: boolean;
    bookingDate?: string;
    bookingSlot?: string;
    productId: string;
    buyerId: string; // REQUIRED: Must be passed from authenticated client
    storeUsername?: string;
    storeName?: string;
    deliveryState?: string;

    // SHIPBUBBLE SHIPPING DATA
    shippingRequestToken?: string | null;
    shippingCourierId?: string | number | null;
    shippingServiceCode?: string | null;
    shippingCourierName?: string | null;
    shippingServiceType?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    deliveryAddress?: string | null;
}

// ✅ Define TypeScript interface for order document
interface OrderDocument {
    orderId: string;
    buyerId: string;
    vendorId: string;
    productId: string;
    storeUsername: string | null;
    storeName: string | null;
    productName: string;
    productImage: string | null;
    status: "PENDING_PAYMENT";
    paymentStatus: "pending";
    totalAmount: number;
    deliveryFee: number;
    quantity: number;
    isBooking: boolean;
    slotId: string | null;
    bookingDate: string | null;
    bookingSlot: string | null;
    customerEmail: string;
    paymentMethod: string;
    deliveryState: string | null;

    // SHIPBUBBLE SHIPPING DATA
    shippingRequestToken: string | null;
    shippingCourierId: string | number | null;
    shippingServiceCode: string | null;
    shippingCourierName: string | null;
    shippingServiceType: string | null;
    recipientName: string | null;
    recipientPhone: string | null;
    deliveryAddress: string | null;

    createdAt: FieldValue;
    updatedAt: FieldValue;
}

// ✅ Define TypeScript interface for booking document
interface BookingDocument {
    orderId: string;
    status: "PENDING";
    bookingDate: string;
    bookingSlot: string;
    totalAmount: number;
    customerEmail: string;
    buyerId: string;
    createdAt: FieldValue;
    updatedAt: FieldValue;
}

// ✅ Define TypeScript interface for Nomba auth response
interface NombaAuthResponse {
    data?: {
        access_token?: string;
    };
    code?: string;
    status?: string;
}

// ✅ Define TypeScript interface for Nomba order response
interface NombaOrderResponse {
    code?: string;
    status?: string;
    description?: string;
    data?: {
        checkoutLink?: string;
    };
}

// ✅ Fetch with retry helper function
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = 2
): Promise<Response> {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error: any) {
            console.error(`Fetch attempt ${i + 1} failed:`, error.message);
            if (i === retries) throw error;
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
    throw new Error('All retry attempts failed');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body: CheckoutRequestBody = await req.json();

        // Destructure all incoming data + buyerId from client
        const {
            price,
            quantity,
            deliveryFee,
            productName,
            storeId,
            paymentMethod,
            customerEmail,
            isBooking,
            bookingDate,
            bookingSlot,
            productId,
            buyerId,
            storeUsername,
            storeName,
            deliveryState,
            // SHIPBUBBLE SHIPPING DATA
            shippingRequestToken,
            shippingCourierId,
            shippingServiceCode,
            shippingCourierName,
            shippingServiceType,
            recipientName,
            recipientPhone,
            deliveryAddress
        } = body;

        // --- STAGE 1: DATA VALIDATION ---
        if (!productId || !storeId) {
            console.error("SOWA API REJECTED: Missing productId or storeId");
            return NextResponse.json({ error: "Missing Product ID or Store ID" }, { status: 400 });
        }

        // Validate buyerId is present and matches expected format
        if (!buyerId || typeof buyerId !== "string") {
            console.error("SOWA API REJECTED: Invalid or missing buyerId");
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        if (isBooking && (!bookingDate || !bookingSlot)) {
            console.error("SOWA API REJECTED: Missing booking details");
            return NextResponse.json({ error: "Booking date and slot are required" }, { status: 400 });
        }

        const requestedQuantity = isBooking ? 1 : Math.floor(Number(quantity ?? 1));
        if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 10000) {
            return NextResponse.json({ error: "Quantity must be a whole number greater than zero" }, { status: 400 });
        }

        // Give the buyer an immediate availability response.
        const productRef = adminDb.collection("products").doc(productId);
        const productSnapshot = await productRef.get();
        if (!productSnapshot.exists) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }
        const productData = productSnapshot.data() || {};
        const productType = String(productData.productType || "physical").toLowerCase();
        const tracksInventory = !["service", "utility", "booking"].includes(productType) && productData.trackInventory !== false;
        if (tracksInventory) {
            const availableStock = Number(productData.stockCount ?? productData.stock ?? 0);
            if (!Number.isFinite(availableStock) || availableStock < requestedQuantity) {
                return NextResponse.json({ error: `Only ${Math.max(0, availableStock || 0)} item${availableStock === 1 ? "" : "s"} remaining.` }, { status: 409 });
            }
        }

        // Safe slotId generation
        const slotId: string | null = isBooking && bookingDate && bookingSlot
            ? `${bookingDate}_${(bookingSlot || "").replace(':', '-')}`
            : null;

        // --- STAGE 2: PRE-PAYMENT AVAILABILITY CHECK ---
        if (isBooking && slotId) {
            const bookingRef = adminDb
                .collection("products")
                .doc(productId)
                .collection("bookings")
                .doc(slotId);

            const bookingSnap = await bookingRef.get();

            if (bookingSnap.exists && bookingSnap.data()?.status === "confirmed") {
                return NextResponse.json(
                    { error: "This slot was just booked. Please select another time." },
                    { status: 409 }
                );
            }
        }

        // --- STAGE 3: NOMBA AUTHENTICATION ---
        const nombaOrigin = process.env.NOMBA_SANDBOX_URL || "https://sandbox.nomba.com";
        const isSandbox = Boolean(process.env.NOMBA_SANDBOX_URL) || process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox";
        const authBaseUrl = `${nombaOrigin}/v1`;
        const checkoutBaseUrls = isSandbox
            ? [`${nombaOrigin}/v1`, `${nombaOrigin}/sandbox`]
            : [`${nombaOrigin}/v1`];

        console.log('🔵 Connecting to Nomba:', checkoutBaseUrls[0]);

        // Get Nomba auth token
        let authRes: Response;
        try {
            authRes = await fetchWithRetry(`${authBaseUrl}/auth/token/issue`, {
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
        } catch (fetchError: any) {
            console.error("❌ Failed to connect to Nomba auth:", fetchError.message);
            return NextResponse.json(
                { error: "Payment service temporarily unavailable. Please try again in a few minutes." },
                { status: 503 }
            );
        }

        if (!authRes || !authRes.ok) {
            const authErr = authRes ? await authRes.text() : 'No response';
            console.error(`❌ Nomba Auth Failed (${authRes?.status}):`, authErr);
            return NextResponse.json(
                { error: "Payment service authentication failed." },
                { status: 502 }
            );
        }

        const authData: NombaAuthResponse = await authRes.json();
        const token: string | undefined = authData.data?.access_token;

        if (!token) {
            console.error("❌ No access token in response:", authData);
            return NextResponse.json(
                { error: "Failed to initialize payment session." },
                { status: 502 }
            );
        }

        console.log('✅ Nomba token obtained');

        // --- STAGE 4: CALCULATION & REFERENCE ---
        const productTotal: number = Number(price || 0) * requestedQuantity;
        const totalAmount: number = productTotal + Number(deliveryFee || 0);

        // ✅ Updated prefix to SOWA_
        const orderReference: string = `SOWA_${isBooking ? 'BK' : 'ORD'}_${Date.now()}`;

        console.log('💰 Order details:', {
            orderReference,
            totalAmount,
            isBooking,
            productName,
            buyerId
        });

        // Build callback URL
        const appUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const callbackUrl: string = `${appUrl}/payment/success?reference=${orderReference}`;

        // --- STAGE 5: CREATE NOMBA CHECKOUT ORDER ---
        let orderRes: Response;
        const checkoutRequest: RequestInit = {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "accountId": process.env.NOMBA_ACCOUNT_ID!,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                order: {
                    orderReference,
                    amount: totalAmount.toFixed(2),
                    currency: "NGN",
                    callbackUrl: callbackUrl,
                    customerEmail: customerEmail || "customer@sowa.com",
                    description: isBooking
                        ? `Booking: ${productName} (${bookingDate} ${bookingSlot})`
                        : `Order: ${productName}`,
                    allowedPaymentMethods: [paymentMethod || "Card", "Transfer"],
                    metaData: {
                        isBooking: !!isBooking,
                        slotId: slotId,
                        productId: productId,
                        storeId: storeId,
                        buyerId: buyerId,
                        storeUsername: storeUsername || null,
                        storeName: storeName || null,
                        productName: productName,
                        bookingDate: bookingDate || null,
                        bookingSlot: bookingSlot || null,
                        // SHIPBUBBLE DATA (Passed to Webhook)
                        shippingRequestToken: shippingRequestToken || null,
                        shippingCourierId: shippingCourierId || null,
                        shippingServiceCode: shippingServiceCode || null
                    }
                }
            }),
        };
        try {
            orderRes = await fetchWithRetry(`${checkoutBaseUrls[0]}/checkout/order`, checkoutRequest);
            if (!orderRes.ok && orderRes.status === 404 && checkoutBaseUrls.length > 1) {
                console.warn("⚠️ Primary Nomba checkout route returned 404; trying sandbox checkout route.");
                orderRes = await fetchWithRetry(`${checkoutBaseUrls[1]}/checkout/order`, checkoutRequest);
            }
        } catch (fetchError: any) {
            console.error("❌ Failed to create Nomba order:", fetchError.message);
            return NextResponse.json(
                { error: "Unable to create payment order. Please try again." },
                { status: 503 }
            );
        }

        const orderData: NombaOrderResponse = await orderRes.json();

        if (orderData.code === "00" || orderData.status === "success") {
            console.log('✅ Nomba order created raw URL:', orderData.data?.checkoutLink);

            // --- STAGE 6: SAVE INITIAL RECORDS IN FIRESTORE ---
            try {
                if (isBooking && slotId) {
                    const bookingDoc: BookingDocument = {
                        orderId: orderReference,
                        status: "PENDING",
                        bookingDate: bookingDate || "",
                        bookingSlot: bookingSlot || "",
                        totalAmount: totalAmount || 0,
                        customerEmail: customerEmail || "customer@sowa.com",
                        buyerId: buyerId,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    await adminDb
                        .collection("products")
                        .doc(productId)
                        .collection("bookings")
                        .doc(slotId)
                        .set(bookingDoc);
                }

                const productSnap = await adminDb.collection("products").doc(productId).get().catch(() => null);
                const productData = productSnap?.data() || {};
                const productImages = Array.isArray(productData.images) ? productData.images : [];
                const productImage = String(productImages[0] || productData.imageUrl || productData.image || "") || null;

                const orderDoc: OrderDocument = {
                    orderId: orderReference,
                    buyerId: buyerId,
                    vendorId: storeId,
                    productId: productId,
                    storeUsername: storeUsername || null,
                    storeName: storeName || null,
                    productName: productName || "Unknown Product",
                    productImage,
                    status: "PENDING_PAYMENT",
                    paymentStatus: "pending",
                    totalAmount: totalAmount,
                    deliveryFee: Number(deliveryFee || 0),
                    quantity: requestedQuantity,
                    isBooking: !!isBooking,
                    slotId: slotId || null,
                    bookingDate: bookingDate || null,
                    bookingSlot: bookingSlot || null,
                    customerEmail: customerEmail || "customer@sowa.com",
                    paymentMethod: paymentMethod || "Card",
                    deliveryState: deliveryState || null,

                    // SHIPBUBBLE SHIPPING DATA
                    shippingRequestToken: shippingRequestToken || null,
                    shippingCourierId: shippingCourierId || null,
                    shippingServiceCode: shippingServiceCode || null,
                    shippingCourierName: shippingCourierName || null,
                    shippingServiceType: shippingServiceType || null,
                    recipientName: recipientName || null,
                    recipientPhone: recipientPhone || null,
                    deliveryAddress: deliveryAddress || null,

                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                };

                await adminDb.collection("orders").doc(orderReference).set(orderDoc);

                try {
                    await sendNotification({
                        vendorId: storeId,
                        type: "order",
                        priority: "high",
                        title: "New Order Placed! 📦",
                        body: `New order received! ${productName} for ₦${totalAmount.toLocaleString()}. Funds are securely held in escrow.`,
                        actionable: true,
                        actionLabel: "View Orders",
                        actionUrl: "/dashboard?tab=orders",
                        metadata: {
                            orderId: orderReference,
                            amount: totalAmount,
                            productName
                        },
                        novuTriggerId: "new-order-placed",
                        novuPayload: {
                            productName: productName,
                            amount: `₦${totalAmount.toLocaleString()}`
                        }
                    });
                } catch (notifError) {
                    console.error("Failed to send order notification:", notifError);
                }

            } catch (firestoreError: any) {
                console.error("❌ Firestore save failed:", firestoreError.message);
            }

            // ✅ ATTACH orderRef PARAMETER TO CHECKOUT URL FOR FLUTTER CONSUMPTION
            const rawCheckoutLink = orderData.data?.checkoutLink || "";
            const querySeparator = rawCheckoutLink.includes("?") ? "&" : "?";
            const finalCheckoutLink = rawCheckoutLink
                ? `${rawCheckoutLink}${querySeparator}orderRef=${orderReference}`
                : "";

            return NextResponse.json({
                success: true,
                checkoutLink: finalCheckoutLink,
                reference: orderReference,
                orderId: orderReference
            });

        } else {
            console.error("❌ Nomba order creation failed:", orderData);
            throw new Error(orderData.description || "Nomba Order creation failed");
        }

    } catch (error: any) {
        console.error("❌ SOWA API ERROR:", error.message);
        return NextResponse.json({
            error: error.message || "An unexpected error occurred. Please try again."
        }, { status: 500 });
    }
}