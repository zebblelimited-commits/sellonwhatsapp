// app/api/shipping/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { fetchFezDeliveryCost } from "@/lib/fez";
import { fetchSendboxQuote, sendboxConfigured } from "@/lib/sendbox";
import { chowdeckConfigured, fetchChowdeckDeliveryFee, type ChowdeckAddress } from "@/lib/chowdeck";
import { fetchTopshipQuote, type TopshipAddress, type TopshipQuote, topshipConfigured } from "@/lib/topship";

export const runtime = "nodejs";

interface ShippingRequest {
    destinationState: string;
    totalWeightKg?: number;
    cartTotal?: number;
    pickupAddress?: ChowdeckAddress;
    destinationAddress?: ChowdeckAddress;
    estimatedOrderAmount?: number;
}

interface CourierOption {
    id: string;
    name: string;
    logo: string;
    estimatedDays: string;
    shippingFee: number;
    dispatchEnabled: boolean;
    integrationStatus: string;
    provider?: string;
    providerQuoteId?: number | string;
    providerQuote?: TopshipQuote | Record<string, unknown>;
}

interface UnavailableProvider {
    id: string;
    name: string;
    reason: string;
}

function isCancelledOrMalformedRequest(error: unknown) {
    if (error instanceof SyntaxError) return true;
    if (!(error instanceof Error)) return false;
    const code = (error as Error & { code?: string }).code;
    return error.name === "AbortError" || code === "ABORT_ERR" || code === "UND_ERR_ABORTED" || /aborted|terminated|request body/i.test(error.message);
}

export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        if (!rawBody.trim()) {
            return NextResponse.json(
                { success: false, options: [], unavailableProviders: [], cancelled: true },
                { status: 400 },
            );
        }

        let body: ShippingRequest;
        try {
            body = JSON.parse(rawBody) as ShippingRequest;
        } catch (error) {
            if (isCancelledOrMalformedRequest(error)) {
                return NextResponse.json(
                    { success: false, options: [], unavailableProviders: [], cancelled: true },
                    { status: 400 },
                );
            }
            throw error;
        }
        const { destinationState, totalWeightKg = 1, cartTotal = 0, pickupAddress, destinationAddress, estimatedOrderAmount = cartTotal } = body;

        if (!destinationState) {
            return NextResponse.json(
                { error: "Destination state is required." },
                { status: 400 }
            );
        }

        // 1. Fetch active couriers from Firestore
        const couriersSnap = await adminDb
            .collection("couriers")
            .where("isActive", "==", true)
            .get();

        const shippingOptions: CourierOption[] = [];
        const unavailableProviders: UnavailableProvider[] = [];

        // Chowdeck coverage must come from its live quote API. Do not require
        // the admin seed route to have been run before showing the provider.
        const courierEntries: Array<{ id: string; data: () => any }> = couriersSnap.docs.map((doc) => ({
            id: doc.id,
            data: () => doc.data(),
        }));
        const hasChowdeckRecord = courierEntries.some(({ data }) => {
            const courier = data();
            return courier.code?.toLowerCase() === "chowdeck" || courier.name?.toLowerCase().includes("chowdeck");
        });
        const hasTopshipRecord = courierEntries.some(({ data }) => {
            const courier = data();
            return courier.code?.toLowerCase() === "topship" || courier.name?.toLowerCase().includes("topship");
        });
        const hasSendboxRecord = courierEntries.some(({ data }) => {
            const courier = data();
            return courier.code?.toLowerCase() === "sendbox" || courier.name?.toLowerCase().includes("sendbox");
        });

        if (chowdeckConfigured() && !hasChowdeckRecord) {
            courierEntries.push({
                id: "chowdeck",
                data: () => ({
                    name: "Chowdeck",
                    code: "chowdeck",
                    logo: "/images/couriers/chowdecklogo.jpg",
                    estimatedDays: "Same Day Delivery",
                    integrationStatus: "ready",
                }),
            });
        }
        if (topshipConfigured() && !hasTopshipRecord) {
            courierEntries.push({
                id: "topship",
                data: () => ({
                    name: "Topship",
                    code: "topship",
                    logo: "/images/couriers/topshiplogo.jpeg",
                    estimatedDays: "2-4 Business Days",
                    integrationStatus: "ready",
                }),
            });
        }
        if (sendboxConfigured() && !hasSendboxRecord) {
            courierEntries.push({
                id: "sendbox_shipping",
                data: () => ({
                    name: "Sendbox",
                    code: "sendbox",
                    logo: "/images/couriers/sendboxlogo.jpeg",
                    estimatedDays: "2-4 Business Days",
                    integrationStatus: "ready",
                }),
            });
        }

        if (courierEntries.length === 0) {
            return NextResponse.json({
                success: true,
                options: [],
                message: "No active shipping couriers available."
            });
        }

        // 2. Loop through couriers and dynamically check availability & rates
        for (const doc of courierEntries) {
            const courier = doc.data();
            const courierCode = courier.code?.toLowerCase() || "";
            const courierName = courier.name?.toLowerCase() || "";
            const isFez = courierCode === "fez" || courierName.includes("fez");
            const isChowdeck = courierCode === "chowdeck" || courierName.includes("chowdeck");
            const isTopship = courierCode === "topship" || courierName.includes("topship");
            const isSendbox = courierCode === "sendbox" || courierName.includes("sendbox");

            // Only show providers that can receive a real order from the
            // platform. Static quote-only records must not look dispatchable
            // at checkout. The code fallback keeps existing FEZ records
            // working until the courier seed endpoint is run again.
            const dispatchEnabled = (isFez && courier.dispatchEnabled !== false)
                || (isChowdeck && chowdeckConfigured())
                || (isTopship && topshipConfigured())
                || (isSendbox && sendboxConfigured());
            if (!dispatchEnabled) {
                if (isChowdeck) {
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Chowdeck",
                        reason: "Chowdeck is not configured on the server. Add the API key and merchant reference, then redeploy.",
                    });
                }
                if (isTopship) {
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Topship",
                        reason: "Topship is not configured on the server. Add TOPSHIP_API_KEY, then redeploy.",
                    });
                }
                if (isSendbox) {
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Sendbox",
                        reason: "Sendbox is not configured on the server. Add SENDBOX_ACCESS_TOKEN and redeploy.",
                    });
                }
                continue;
            }

            // Chowdeck coverage changes by service area and must be checked by
            // its live fee endpoint. A stale Firestore state list can hide a
            // valid option (for example, Jos/Plateau), so skip this filter for
            // Chowdeck. An unsuccessful quote is handled below.
            if (!isChowdeck && !isTopship && !isSendbox && Array.isArray(courier.availableStates) && courier.availableStates.length > 0) {
                const isAvailable = courier.availableStates.some(
                    (state: string) => state.toLowerCase() === destinationState.toLowerCase()
                );
                if (!isAvailable) continue; // Skip courier if not available in this state
            }

            let finalFee = 0;
            let providerQuoteId: number | string | undefined;
            let providerQuote: TopshipQuote | Record<string, unknown> | undefined;

            // Check FEZ Delivery
            if (isFez) {
                try {
                    const fezRate = await fetchFezDeliveryCost({
                        state: destinationState,
                        weight: Math.max(1, totalWeightKg),
                    });
                    finalFee = fezRate.totalCost;
                } catch (fezErr) {
                    console.error("⚠️ [FEZ API RATE ERROR], falling back to static formula:", fezErr);
                    finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
                }
            }
            // Chowdeck requires a fresh fee quote before delivery creation.
            // Never replace a failed quote with a static fee because that
            // would leave us with a paid order but no valid fee_id.
            else if (isChowdeck) {
                try {
                    const chowdeckQuote = await fetchChowdeckDeliveryFee({
                        sourceAddress: pickupAddress || "Seller pickup address not provided",
                        destinationAddress: destinationAddress || "Buyer delivery address not provided",
                        estimatedOrderAmountNaira: estimatedOrderAmount,
                    });
                    finalFee = chowdeckQuote.totalAmountNaira;
                    providerQuoteId = chowdeckQuote.id;
                } catch (chowdeckErr) {
                    const reason = chowdeckErr instanceof Error
                        ? chowdeckErr.message
                        : "Chowdeck could not return a delivery quote.";
                    console.error("⚠️ [CHOWDECK API RATE ERROR], hiding unavailable option:", {
                        courierId: doc.id,
                        error: reason,
                    });
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Chowdeck",
                        reason,
                    });
                    continue;
                }
            }
            // Topship returns a quote object rather than a quote ID. Keep the
            // selected quote with the checkout so it can be used to book the
            // draft shipment after Nomba payment is confirmed.
            else if (isTopship) {
                try {
                    const topShipQuote = await fetchTopshipQuote({
                        sender: pickupAddress as TopshipAddress || {},
                        receiver: destinationAddress as TopshipAddress || {},
                        totalWeightKg: Math.max(1, totalWeightKg),
                    });
                    finalFee = topShipQuote.totalCost / 100;
                    providerQuote = topShipQuote;
                } catch (topshipErr) {
                    console.error("⚠️ [TOPSHIP API RATE ERROR], hiding unavailable option:", {
                        courierId: doc.id,
                        error: topshipErr,
                    });
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Topship",
                        reason: "Topship could not return a delivery quote for this route. Check the staging API key and both address locations.",
                    });
                    continue;
                }
            }
            // Check Sendbox
            else if (isSendbox) {
                try {
                    const quotes = await fetchSendboxQuote({
                        origin_name: pickupAddress?.name,
                        origin_phone: pickupAddress?.phone,
                        origin_state: pickupAddress?.state,
                        origin_city: pickupAddress?.city || pickupAddress?.lga,
                        origin_street: pickupAddress?.address,
                        destination_state: destinationState,
                        destination_name: destinationAddress?.name,
                        destination_phone: destinationAddress?.phone,
                        destination_city: destinationAddress?.city || destinationAddress?.lga,
                        destination_street: destinationAddress?.address,
                        weight: Math.max(1, totalWeightKg),
                    });

                    if (quotes && quotes.length > 0) {
                        const quote = quotes[0] as Record<string, unknown>;
                        finalFee = Number(quote.fee || quote.amount || 0);
                        providerQuoteId = String(quote.key || quote.id || "");
                        providerQuote = quote;
                    } else {
                        throw new Error("Sendbox returned no delivery quotes for this route");
                    }
                } catch (sendboxErr) {
                    console.error("⚠️ [SENDBOX API ERROR], hiding unavailable option:", sendboxErr);
                    unavailableProviders.push({
                        id: doc.id,
                        name: courier.name || "Sendbox",
                        reason: sendboxErr instanceof Error ? sendboxErr.message : "Sendbox could not return a delivery quote.",
                    });
                    continue;
                }
            }
            // Static fallback for other quote-only couriers (Dellyman, Glovo,
            // Kwikpik, GIG, etc.).
            else {
                finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
            }

            // Determine image logo fallback path
            let logoPath = courier.logo;
            if (!logoPath) {
                if (courierCode === "chowdeck" || courierName.includes("chowdeck")) {
                    logoPath = "/images/couriers/chowdecklogo.jpg";
                } else if (courierCode === "dellyman" || courierName.includes("dellyman")) {
                    logoPath = "/images/couriers/dellymanlogo.jpg";
                } else if (courierCode === "glovo" || courierName.includes("glovo")) {
                    logoPath = "/images/couriers/glovologo.png";
                } else if (courierCode === "kwikpik" || courierName.includes("kwikpik")) {
                    logoPath = "/images/couriers/kwikpik.jpeg";
                } else if (courierCode === "sendbox" || courierName.includes("sendbox")) {
                    logoPath = "/images/couriers/sendboxlogo.jpeg";
                } else if (courierCode === "gig" || courierName.includes("gig")) {
                    logoPath = "/images/couriers/gigilogo.jpg";
                } else if (courierCode === "fez" || courierName.includes("fez")) {
                    logoPath = "/images/couriers/fezlogo.png";
                } else if (courierCode === "topship" || courierName.includes("topship")) {
                    logoPath = "/images/couriers/topshiplogo.jpeg";
                } else {
                    logoPath = "/images/couriers/default.png";
                }
            }

            shippingOptions.push({
                id: doc.id,
                name: courier.name || "Chowdeck",
                logo: logoPath,
                estimatedDays: courier.estimatedDays || "2-5 Business Days",
                shippingFee: finalFee,
                dispatchEnabled: true,
                integrationStatus: courier.integrationStatus || "ready",
                provider: courierCode,
                ...(providerQuoteId !== undefined ? { providerQuoteId } : {}),
                ...(providerQuote ? { providerQuote } : {}),
            });
        }

        // 3. Sort active options from lowest to highest fee
        shippingOptions.sort((a, b) => a.shippingFee - b.shippingFee);

        return NextResponse.json({
            success: true,
            destinationState,
            totalWeightKg,
            options: shippingOptions,
            unavailableProviders,
        });
    } catch (error: unknown) {
        if (isCancelledOrMalformedRequest(error)) {
            return NextResponse.json(
                { success: false, options: [], unavailableProviders: [], cancelled: true },
                { status: 400 },
            );
        }
        const message = error instanceof Error ? error.message : "Unable to calculate shipping rates.";
        console.error("❌ [SHIPPING CALCULATION ERROR]:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * Helper function for static fee calculation fallback
 */
function calculateStaticFallback(courier: any, state: string, weight: number): number {
    const stateMultipliers = courier.stateMultipliers || {};
    const multiplier = stateMultipliers[state] || 1.5;
    const baseRate = Number(courier.baseRate || 1500);
    const ratePerKg = Number(courier.ratePerKg || 300);
    const calculatedWeight = Math.max(1, weight);

    const rawFee = (baseRate + (calculatedWeight - 1) * ratePerKg) * multiplier;
    return Math.ceil(rawFee / 100) * 100;
}
