import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const SHIPBUBBLE_BASE_URL = "https://api.shipbubble.com/v1";

interface ShippingQuoteRequest {
    storeId: string;
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string;
    recipientAddress: string;
    productId: string;
    quantity: number;
}

interface ShipbubbleAddressResponse {
    status: string;
    message?: string;
    errors?: string[];
    data?: {
        address_code?: number;
        formatted_address?: string;
        state?: string;
        city?: string;
    };
}

interface ShipbubbleRate {
    courier_id: string | number;
    courier_name: string;
    courier_image?: string;
    service_code?: string;
    service_type?: string;
    total: number;
    rate_card_amount?: number;
    delivery_eta?: string;
    pickup_eta?: string;
    tracking?: {
        bars?: number;
        label?: string;
    };
    dropoff_station?: {
        name?: string;
        address?: string;
        phone?: string;
    } | null;
}

interface ShipbubbleRatesResponse {
    status: string;
    message?: string;
    errors?: string[];
    data?: {
        request_token?: string;
        couriers?: ShipbubbleRate[];
    };
}

/**
 * Convert Nigerian phone numbers to a safer international format.
 *
 * 08031234567 -> +2348031234567
 * 2348031234567 -> +2348031234567
 * +2348031234567 -> +2348031234567
 */
function normalizeNigerianPhone(phone: string): string {
    const cleaned = String(phone || "").replace(/\D/g, "");

    if (cleaned.startsWith("234")) {
        return `+${cleaned}`;
    }

    if (cleaned.startsWith("0")) {
        return `+234${cleaned.slice(1)}`;
    }

    return `+234${cleaned}`;
}

/**
 * Validate an address with Shipbubble and return its address_code.
 */
async function validateShipbubbleAddress({
    name,
    email,
    phone,
    address,
}: {
    name: string;
    email: string;
    phone: string;
    address: string;
}): Promise<number> {
    const apiKey = process.env.SHIPBUBBLE_API_KEY;

    if (!apiKey) {
        throw new Error("Shipbubble API key is not configured.");
    }

    const response = await fetch(
        `${SHIPBUBBLE_BASE_URL}/shipping/address/validate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                email,
                phone: normalizeNigerianPhone(phone),
                address,
            }),
        }
    );

    const data: ShipbubbleAddressResponse = await response.json();

    if (!response.ok || data.status !== "success" || !data.data?.address_code) {
        console.error("Shipbubble address validation failed:", data);

        throw new Error(
            data.errors?.join(", ") ||
            data.message ||
            "Unable to validate this address."
        );
    }

    return data.data.address_code;
}

export async function POST(req: NextRequest) {
    try {
        const body: ShippingQuoteRequest = await req.json();

        const {
            storeId,
            recipientName,
            recipientEmail,
            recipientPhone,
            recipientAddress,
            productId,
            quantity,
        } = body;

        // ---------------------------------------------------------
        // 1. Validate incoming data
        // ---------------------------------------------------------

        if (
            !storeId ||
            !recipientName ||
            !recipientEmail ||
            !recipientPhone ||
            !recipientAddress ||
            !productId
        ) {
            return NextResponse.json(
                {
                    error:
                        "Store, product, recipient name, email, phone, and delivery address are required.",
                },
                { status: 400 }
            );
        }

        const requestedQuantity = Math.max(
            1,
            Math.floor(Number(quantity || 1))
        );

        // ---------------------------------------------------------
        // 2. Get store data from Firebase
        // ---------------------------------------------------------

        const storeRef = adminDb.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();

        if (!storeSnap.exists) {
            return NextResponse.json(
                { error: "Store not found." },
                { status: 404 }
            );
        }

        const store = storeSnap.data() || {};

        if (!store.address || !store.state || !store.phone) {
            return NextResponse.json(
                {
                    error:
                        "This store does not have a complete pickup address configured.",
                },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------
        // 3. Get product from Firebase
        //
        // IMPORTANT:
        // Do not trust product price from the browser.
        // ---------------------------------------------------------

        const productRef = adminDb.collection("products").doc(productId);
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            return NextResponse.json(
                { error: "Product not found." },
                { status: 404 }
            );
        }

        const product = productSnap.data() || {};

        const productPrice = Number(product.price || 0);

        if (!Number.isFinite(productPrice) || productPrice <= 0) {
            return NextResponse.json(
                { error: "This product has an invalid price." },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------
        // 4. Get or validate the seller's Shipbubble address
        //
        // Cache the address_code in the store document so we don't
        // validate the seller address on every checkout.
        // ---------------------------------------------------------

        let senderAddressCode = Number(
            store.shipbubbleAddressCode || 0
        );

        if (!senderAddressCode) {
            const senderAddress = [
                store.address,
                store.lga,
                store.state,
                "Nigeria",
            ]
                .filter(Boolean)
                .join(", ");

            senderAddressCode = await validateShipbubbleAddress({
                name: store.storeName || "Store",
                email: store.email || "store@sellonwhatsapp.com",
                phone: store.phone,
                address: senderAddress,
            });

            await storeRef.set(
                {
                    shipbubbleAddressCode: senderAddressCode,
                    shipbubbleAddressUpdatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        }

        // ---------------------------------------------------------
        // 5. Validate the customer's delivery address
        // ---------------------------------------------------------

        const receiverAddressCode = await validateShipbubbleAddress({
            name: recipientName,
            email: recipientEmail,
            phone: recipientPhone,
            address: `${recipientAddress}, Nigeria`,
        });

        // ---------------------------------------------------------
        // 6. Prepare package details
        //
        // STRICT VALIDATION: Require verified seller-provided data.
        // ---------------------------------------------------------
        const shipping = product.shipping;

        if (
            !shipping ||
            !shipping.weightKg ||
            !shipping.lengthCm ||
            !shipping.widthCm ||
            !shipping.heightCm
        ) {
            return NextResponse.json(
                {
                    error:
                        "This product is missing package weight or dimensions. Please ask the seller to update the product shipping details.",
                },
                { status: 400 }
            );
        }

        const unitWeight = Number(shipping.weightKg);
        const packageLength = Number(shipping.lengthCm);
        const packageWidth = Number(shipping.widthCm);
        const packageHeight = Number(shipping.heightCm);
        const shipbubbleCategoryId = Number(shipping.shipbubbleCategoryId || 90097994);

        // Shipbubble pickup date format: yyyy-mm-dd
        const pickupDate = new Date().toISOString().split("T")[0];

        // ---------------------------------------------------------
        // 7. Request shipping rates
        // ---------------------------------------------------------

        const apiKey = process.env.SHIPBUBBLE_API_KEY;

        const ratesResponse = await fetch(
            `${SHIPBUBBLE_BASE_URL}/shipping/fetch_rates`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sender_address_code: senderAddressCode,
                    reciever_address_code: receiverAddressCode,
                    pickup_date: pickupDate,
                    category_id: shipbubbleCategoryId,

                    package_items: [
                        {
                            name: product.name || "Product",
                            description:
                                product.description ||
                                product.name ||
                                "Store product",
                            unit_weight: String(unitWeight),
                            unit_amount: String(productPrice),
                            quantity: String(requestedQuantity),
                        },
                    ],

                    package_dimension: {
                        length: packageLength,
                        width: packageWidth,
                        height: packageHeight,
                    },
                }),
            }
        );

        const ratesData: ShipbubbleRatesResponse =
            await ratesResponse.json();

        if (
            !ratesResponse.ok ||
            ratesData.status !== "success" ||
            !ratesData.data?.request_token
        ) {
            console.error(
                "Shipbubble rates request failed:",
                ratesData
            );

            return NextResponse.json(
                {
                    error:
                        ratesData.errors?.join(", ") ||
                        ratesData.message ||
                        "Unable to calculate delivery rates.",
                },
                { status: 400 }
            );
        }

        const couriers = ratesData.data.couriers || [];

        if (!couriers.length) {
            return NextResponse.json(
                {
                    error:
                        "No delivery options are available for this destination.",
                },
                { status: 404 }
            );
        }

        // ---------------------------------------------------------
        // 8. Return safe quote data to the client
        // ---------------------------------------------------------

        return NextResponse.json({
            success: true,
            requestToken: ratesData.data.request_token,
            senderAddressCode,
            receiverAddressCode,
            couriers: couriers.map((courier) => ({
                courierId: courier.courier_id,
                courierName: courier.courier_name,
                courierImage: courier.courier_image || null,
                serviceCode: courier.service_code || null,
                serviceType: courier.service_type || null,
                total: Number(
                    courier.rate_card_amount ??
                    courier.total ??
                    0
                ),
                deliveryEta:
                    courier.delivery_eta ||
                    "Delivery estimate unavailable",
                pickupEta:
                    courier.pickup_eta ||
                    null,
                trackingLabel:
                    courier.tracking?.label ||
                    null,
                dropoffStation:
                    courier.dropoff_station || null,
            })),
        });
    } catch (error: any) {
        console.error("SHIPBUBBLE QUOTE ERROR:", error);

        return NextResponse.json(
            {
                error:
                    error.message ||
                    "Unable to calculate delivery options.",
            },
            { status: 500 }
        );
    }
}