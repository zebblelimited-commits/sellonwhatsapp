import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { chowdeckConfigured } from "@/lib/chowdeck";
import { sendboxConfigured } from "@/lib/sendbox";
import { topshipConfigured, type TopshipQuote } from "@/lib/topship";
import { calculateEscrowBreakdown } from "@/lib/escrow/calculator";
import { createEscrowRecord } from "@/src/infrastructure/db/escrowService";
import { createNombaCheckoutOrder, nombaBaseUrl } from "@/lib/payments/nomba/client";

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
        providerQuoteId?: number | string;
        providerQuote?: TopshipQuote | Record<string, unknown>;
        subtotal: number;
    }[];
    paymentMethod: string;
    total: number;
}

function hasValidCoordinates(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, any>;
    const location = record.location && typeof record.location === "object" ? record.location : {};
    const shippingAddress = record.shippingAddress && typeof record.shippingAddress === "object" ? record.shippingAddress : {};
    const firstValue = (...values: unknown[]) => values.find((candidate) => candidate !== undefined && candidate !== null && !(typeof candidate === "string" && candidate.trim() === ""));
    const latitude = Number(firstValue(record.latitude, record.lat, location.latitude, location.lat, shippingAddress.latitude, shippingAddress.lat));
    const longitude = Number(firstValue(record.longitude, record.lng, location.longitude, location.lng, shippingAddress.longitude, shippingAddress.lng));
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function normalizeCustomerPhone(value: unknown): string {
    const raw = String(value ?? "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("234")) return `+${digits}`;
    if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    return "";
}

function isPublicHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:"
            && !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname);
    } catch {
        return false;
    }
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

        if (!process.env.NOMBA_CLIENT_ID || !process.env.NOMBA_CLIENT_SECRET || !process.env.NOMBA_ACCOUNT_ID) {
            console.error("❌ [CHECKOUT API] Missing Nomba API environment variables.");
            return NextResponse.json(
                { error: "Payment gateway configuration error. Nomba checkout is not configured." },
                { status: 503 }
            );
        }

        const authorization = req.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Please sign in before checking out." }, { status: 401 });
        }
        const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());

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

        if (buyerId !== decoded.uid) {
            const payloadUid = String(buyerId || "");
            console.error("❌ [CHECKOUT API] Buyer identity mismatch", {
                tokenUid: decoded.uid.slice(0, 4) + "…" + decoded.uid.slice(-4),
                payloadUid: payloadUid ? payloadUid.slice(0, 4) + "…" + payloadUid.slice(-4) : "<missing>",
            });
            return NextResponse.json({ error: "Your checkout session expired. Please refresh and try again." }, { status: 403 });
        }

        const customerPhone = normalizeCustomerPhone(address.phone);
        if (!customerPhone) {
            return NextResponse.json(
                { error: "A valid customer phone number is required for Nomba checkout. Update the delivery address and try again." },
                { status: 400 },
            );
        }

        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
        if (!isPublicHttpsUrl(appUrl)) {
            return NextResponse.json(
                { error: "NEXT_PUBLIC_APP_URL must be a public HTTPS URL for Nomba checkout. Use an HTTPS tunnel such as ngrok while testing locally." },
                { status: 503 },
            );
        }

        if (!hasValidCoordinates(address)) {
            return NextResponse.json(
                { error: "A valid buyer delivery latitude and longitude are required before checkout." },
                { status: 400 },
            );
        }

        console.log("🔵 [CHECKOUT API] Customer email:", customerEmail);

        const batch = adminDb.batch();
        // Keep a short, unique merchant reference for Nomba and for the
        // Firestore escrow ledger. Nomba rejects reused order references.
        const checkoutReference = String(Math.floor(100000000 + Math.random() * 900000000));
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
                providerQuoteId,
                providerQuote,
                subtotal: clientSubtotal,
            } = sellerOrder;

            const productSubtotal = items.reduce((sum: number, item: any) => {
                const price = Number(item?.price);
                const quantity = Number(item?.quantity ?? 1);
                return sum + (Number.isFinite(price) && price >= 0 && Number.isFinite(quantity) && quantity > 0 ? price * quantity : 0);
            }, 0);
            if (!Number.isFinite(productSubtotal) || productSubtotal <= 0 || Number(clientSubtotal) !== productSubtotal) {
                return NextResponse.json({ error: "One or more checkout item totals are invalid. Please refresh your cart." }, { status: 400 });
            }

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

            if (!hasValidCoordinates(storeData)) {
                return NextResponse.json(
                    { error: `${storeName || "This seller"} must save valid store coordinates before accepting delivery orders.` },
                    { status: 400 },
                );
            }

            // -----------------------------------------------------
            // CHECK SELF-ARRANGED SHIPPING & COMMISSIONS
            // -----------------------------------------------------

            // The checkout client sends the selected courier ID. Keep the
            // shipping method fallback for older clients that only sent it.
            const courierId = requestedCourierId || shippingMethod;
            const courierName = requestedCourierName || shippingMethod;
            const isSelfArranged = courierId === "self_arranged" || shippingMethod === "self_arranged";
            const shippingCost = isSelfArranged ? 0 : rawShippingCost;

            // The quote endpoint only exposes dispatch-ready providers, but
            // keep this server-side guard so an old or tampered client cannot
            // create a paid order that the platform cannot dispatch.
            if (!isSelfArranged) {
                const courierSnap = await adminDb.collection("couriers").doc(courierId).get();
                const courier = courierSnap.data() || {};
                const courierCode = String(courier.code || courierId || "").toLowerCase();
                const isTopship = courierCode === "topship" || courierId === "topship";
                const isSendbox = courierCode === "sendbox" || courierId === "sendbox_shipping";
                const dispatchEnabled = (courierCode === "fez" && courier.dispatchEnabled !== false)
                    || (courierCode === "chowdeck" && chowdeckConfigured())
                    || (isTopship && topshipConfigured())
                    || (isSendbox && sendboxConfigured());
                const usesFallbackChowdeck = courierCode === "chowdeck" && courierId === "chowdeck";
                const usesFallbackTopship = isTopship && courierId === "topship";
                const usesFallbackSendbox = isSendbox && courierId === "sendbox_shipping";
                if ((!courierSnap.exists && !usesFallbackChowdeck && !usesFallbackTopship && !usesFallbackSendbox) || !dispatchEnabled) {
                    return NextResponse.json(
                        { error: `${courierName || "This courier"} is not currently available for automated dispatch. Choose Chowdeck Relay, FEZ, Topship, or Self-Arranged.` },
                        { status: 400 },
                    );
                }
                if (courierCode === "chowdeck" && (providerQuoteId === undefined || providerQuoteId === null || providerQuoteId === "")) {
                    return NextResponse.json(
                        { error: "Chowdeck delivery pricing expired. Please refresh the shipping quote and try again." },
                        { status: 400 },
                    );
                }
                if (isTopship && !providerQuote) {
                    return NextResponse.json(
                        { error: "Topship delivery pricing expired. Please refresh the shipping quote and try again." },
                        { status: 400 },
                    );
                }
                if (isSendbox && (providerQuoteId === undefined || providerQuoteId === null || providerQuoteId === "")) {
                    return NextResponse.json(
                        { error: "Sendbox delivery pricing expired. Please refresh the shipping quote and try again." },
                        { status: 400 },
                    );
                }
            }

            const hasPhysicalItems = !items.length || items.some((item: any) =>
                !["service", "booking", "utility"].includes(String(item.productType || item.orderType || "").toLowerCase())
                && !item.bookingDate
                && !item.bookingSlot,
            );

            const isPartner =
                storeData.isPartner === true ||
                storeData.subscriptionPlan === "pro_max" ||
                storeData.subscriptionPlan === "pro_yearly_business_max" ||
                String(storeData.subscriptionPlan || "").toLowerCase().includes("max");

            // Handling fee is waived for self-arranged shipping
            const handlingFee = !isSelfArranged && shippingCost > 0 ? 200 : 0;
            const breakdown = calculateEscrowBreakdown({
                productCost: productSubtotal,
                shippingCost,
                courierHandlingFee: handlingFee,
                isSubscribedSeller: isPartner,
            });
            const { sellerCommission, sellerPayout, platformRevenue } = breakdown.allocations;
            const { buyerPlatformFee, totalPaidByBuyer: orderTotal } = breakdown.buyerBreakdown;
            const escrowAmount = productSubtotal;

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
                deliveryMode: isSelfArranged ? "self_arranged" : "aggregator",
                deliveryStatus: isSelfArranged ? "SELF_ARRANGED" : "PENDING_PICKUP",
                providerQuoteId: providerQuoteId ?? null,
                providerQuote: providerQuote ?? null,
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
                paymentProvider: "nomba",
                paymentMethod,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            batch.set(adminDb.collection("orders").doc(orderId), orderDoc);

            // -----------------------------------------------------
            // Create a visible shipment record for every physical order. A
            // self-arranged shipment is local-only; an aggregator shipment is
            // dispatched after payment is verified.
            // -----------------------------------------------------

            if (hasPhysicalItems) {
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
                    providerQuoteId: providerQuoteId ?? null,
                    providerQuote: providerQuote ?? null,
                    deliveryMode: isSelfArranged ? "self_arranged" : "aggregator",
                    dispatchStatus: isSelfArranged ? "NOT_REQUIRED" : "PENDING",
                    status: isSelfArranged ? "SELF_ARRANGED" : "PENDING_PICKUP",
                    pickupAddress: {
                        name: storeName,
                        address: storeData.address || "Store Address",
                        city: storeData.city || storeData.location?.city || "",
                        state: storeData.state || storeData.location?.state || "",
                        lga: storeData.lga || storeData.location?.lga || "",
                        phone: storeData.phone || storeData.phoneNumber || "",
                        latitude: storeData.latitude ?? storeData.location?.latitude ?? storeData.location?.lat ?? null,
                        longitude: storeData.longitude ?? storeData.location?.longitude ?? storeData.location?.lng ?? null,
                    },
                    pickupState: storeData.state || "",
                    pickupPhone: storeData.phone || storeData.phoneNumber || "",
                    storeName,
                    deliveryAddress: address,
                    shippingCost,
                    estimatedDays: estimatedDays || null,
                    items,
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

        const escrowAccountId = process.env.NOMBA_ESCROW_ACCOUNT_ID?.trim() || "";
        const allowedPaymentMethods = paymentMethod === "transfer"
            ? ["Transfer"]
            : paymentMethod === "card"
                ? ["Card"]
                : ["Card", "Transfer"];

        await createEscrowRecord({
            externalReference: checkoutReference,
            amount: calculatedGrandTotal,
            orderIds: createdOrderIds,
            buyerId,
            buyerPhone: customerPhone,
            description: `Checkout for ${createdOrderIds.length} order(s)`,
            paymentProvider: "nomba",
        });

        const checkout = await createNombaCheckoutOrder({
            orderReference: checkoutReference,
            amount: calculatedGrandTotal.toFixed(2),
            currency: "NGN",
            callbackUrl: `${appUrl}/payment/success?reference=${encodeURIComponent(checkoutReference)}`,
            customerEmail: String(customerEmail).trim(),
            customerId: buyerId,
            ...(escrowAccountId ? { accountId: escrowAccountId } : {}),
            allowedPaymentMethods,
            orderMetaData: {
                checkoutReference,
                orderIds: createdOrderIds.join(","),
                buyerId,
                flow: "escrow",
            },
        });

        await Promise.all([
            ...createdOrderIds.map((orderId) => adminDb.collection("orders").doc(orderId).update({
                paymentProvider: "nomba",
                nombaOrderReference: checkout.orderReference,
                nombaCheckoutLink: checkout.checkoutLink,
                updatedAt: FieldValue.serverTimestamp(),
            })),
            adminDb.collection("escrow_transactions").doc(checkoutReference).update({
                paymentProvider: "nomba",
                providerOrderReference: checkout.orderReference,
                providerCheckoutLink: checkout.checkoutLink,
                providerAccountId: escrowAccountId,
                updatedAt: FieldValue.serverTimestamp(),
            }),
        ]);

        return NextResponse.json({
            success: true,
            checkoutLink: checkout.checkoutLink,
            reference: checkoutReference,
            orderIds: createdOrderIds,
            paymentProvider: "nomba",
            nombaOrderReference: checkout.orderReference,
            nombaBaseUrl: nombaBaseUrl(),
        });
    } catch (error: any) {
        console.error("❌ [CHECKOUT API] Fatal Error:", {
            message: error?.message,
            status: error?.status,
            providerResponse: error?.responseBody,
        });
        return NextResponse.json(
            { error: error.message || "An unexpected error occurred. Please try again." },
            { status: 500 }
        );
    }
}
