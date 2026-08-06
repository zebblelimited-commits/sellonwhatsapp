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
    status: "PAID_HELD";
    totalAmount: number;
    deliveryFee: number;
    quantity: number;
    isBooking: boolean;
    slotId: string | null;
    bookingDate: string | null;
    bookingSlot: string | null;
    customerEmail: string;
    paymentMethod: string;
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
            buyerId,  // REQUIRED: Must be passed from authenticated client
            storeUsername,
            storeName
        } = body;

        // --- STAGE 1: DATA VALIDATION ---
        if (!productId || !storeId) {
            console.error("ZEBBLE API REJECTED: Missing productId or storeId");
            return NextResponse.json({ error: "Missing Product ID or Store ID" }, { status: 400 });
        }

        // Validate buyerId is present and matches expected format
        if (!buyerId || typeof buyerId !== "string") {
            console.error("ZEBBLE API REJECTED: Invalid or missing buyerId");
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        if (isBooking && (!bookingDate || !bookingSlot)) {
            console.error("ZEBBLE API REJECTED: Missing booking details");
            return NextResponse.json({ error: "Booking date and slot are required" }, { status: 400 });
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
        const BASE_URL: string = process.env.NOMBA_SANDBOX_URL
            ? `${process.env.NOMBA_SANDBOX_URL}/v1`
            : "https://sandbox.nomba.com/v1";

        console.log('🔵 Connecting to Nomba:', BASE_URL);

        // Get Nomba auth token
        let authRes: Response;
        try {
            authRes = await fetchWithRetry(`${BASE_URL}/auth/token/issue`, {
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
        const productTotal: number = Number(price || 0) * Number(quantity || 1);
        const totalAmount: number = productTotal + Number(deliveryFee || 0);
        const orderReference: string = `ZEBBLE_${isBooking ? 'BK' : 'ORD'}_${Date.now()}`;

        console.log('💰 Order details:', {
            orderReference,
            totalAmount,
            isBooking,
            productName,
            buyerId
        });

        // Build the callback URL properly
        const appUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const callbackUrl: string = `${appUrl}/payment/success?reference=${orderReference}`;

        // --- STAGE 5: CREATE NOMBA CHECKOUT ORDER ---
        let orderRes: Response;
        try {
            orderRes = await fetchWithRetry(`${BASE_URL}/checkout/order`, {
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
                        customerEmail: customerEmail || "customer@zebble.com",
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
                            bookingSlot: bookingSlot || null
                        }
                    }
                }),
            });
        } catch (fetchError: any) {
            console.error("❌ Failed to create Nomba order:", fetchError.message);
            return NextResponse.json(
                { error: "Unable to create payment order. Please try again." },
                { status: 503 }
            );
        }

        const orderData: NombaOrderResponse = await orderRes.json();

        if (orderData.code === "00" || orderData.status === "success") {
            console.log('✅ Nomba order created:', orderData.data?.checkoutLink);

            // --- STAGE 6: SAVE INITIAL RECORDS IN FIRESTORE (using Admin SDK) ---

            try {
                // 6.1: Soft-lock the slot if it's a booking
                if (isBooking && slotId) {
                    const bookingDoc: BookingDocument = {
                        orderId: orderReference,
                        status: "PENDING",
                        bookingDate: bookingDate || "",
                        bookingSlot: bookingSlot || "",
                        totalAmount: totalAmount || 0,
                        customerEmail: customerEmail || "customer@zebble.com",
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

                    console.log('📅 Booking slot soft-locked:', slotId);
                }

                // 6.2: Create the main order record with ALL required fields
                const orderDoc: OrderDocument = {
                    orderId: orderReference,
                    buyerId: buyerId,
                    vendorId: storeId,
                    productId: productId,
                    storeUsername: storeUsername || null,
                    storeName: storeName || null,
                    productName: productName || "Unknown Product",
                    status: "PAID_HELD",  // Must start as PAID_HELD for escrow flow
                    totalAmount: totalAmount,
                    deliveryFee: Number(deliveryFee || 0),
                    quantity: Number(quantity || 1),
                    isBooking: !!isBooking,
                    slotId: slotId || null,
                    bookingDate: bookingDate || null,
                    bookingSlot: bookingSlot || null,
                    customerEmail: customerEmail || "customer@zebble.com",
                    paymentMethod: paymentMethod || "Card",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                };

                await adminDb.collection("orders").doc(orderReference).set(orderDoc);

                console.log('📦 Order record created:', orderReference);

                // 🚀 STAGE 6.3: TRIGGER VENDOR NOTIFICATION
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
                        // ✅ Trigger Novu to show in the Inbox
                        novuTriggerId: "new-order-placed",
                        novuPayload: {
                            productName: productName,
                            amount: `₦${totalAmount.toLocaleString()}`
                        }
                    });
                } catch (notifError) {
                    // We catch this so a notification failure doesn't break the checkout flow
                    console.error("Failed to send order notification:", notifError);
                }

            } catch (firestoreError: any) {
                console.error("❌ Firestore save failed:", firestoreError.message);
                // Don't fail the checkout - Nomba already has the order
                // The webhook will retry saving when payment is confirmed
            }

            return NextResponse.json({
                success: true,
                checkoutLink: orderData.data?.checkoutLink,
                reference: orderReference
            });

        } else {
            console.error("❌ Nomba order creation failed:", orderData);
            throw new Error(orderData.description || "Nomba Order creation failed");
        }

    } catch (error: any) {
        console.error("❌ ZEBBLE API ERROR:", error.message);
        if (error.stack) {
            console.error("TRACE:", error.stack);
        }
        return NextResponse.json({
            error: error.message || "An unexpected error occurred. Please try again."
        }, { status: 500 });
    }
}