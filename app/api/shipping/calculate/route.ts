// app/api/shipping/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { fetchFezDeliveryCost } from "@/lib/fez";
import { fetchSendboxQuote } from "@/lib/sendbox";

export const runtime = "nodejs";

interface ShippingRequest {
    destinationState: string;
    totalWeightKg?: number;
    cartTotal?: number;
}

interface CourierOption {
    id: string;
    name: string;
    logo: string;
    estimatedDays: string;
    shippingFee: number;
    dispatchEnabled: boolean;
    integrationStatus: string;
}

export async function POST(req: NextRequest) {
    try {
        const body: ShippingRequest = await req.json();
        const { destinationState, totalWeightKg = 1, cartTotal = 0 } = body;

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

        if (couriersSnap.empty) {
            return NextResponse.json({
                success: true,
                options: [],
                message: "No active shipping couriers available."
            });
        }

        const shippingOptions: CourierOption[] = [];

        // 2. Loop through couriers and dynamically check availability & rates
        for (const doc of couriersSnap.docs) {
            const courier = doc.data();
            const courierCode = courier.code?.toLowerCase() || "";
            const courierName = courier.name?.toLowerCase() || "";

            // Only show providers that can receive a real order from the
            // platform. Static quote-only records must not look dispatchable
            // at checkout. The code fallback keeps existing FEZ records
            // working until the courier seed endpoint is run again.
            const dispatchEnabled = courierCode === "fez" && courier.dispatchEnabled !== false;
            if (!dispatchEnabled) continue;

            // Check State Availability: 
            // If availableStates exists and is an array, ensure destinationState is included.
            if (Array.isArray(courier.availableStates) && courier.availableStates.length > 0) {
                const isAvailable = courier.availableStates.some(
                    (state: string) => state.toLowerCase() === destinationState.toLowerCase()
                );
                if (!isAvailable) continue; // Skip courier if not available in this state
            }

            let finalFee = 0;

            // Check FEZ Delivery
            if (courierCode === "fez" || courierName.includes("fez")) {
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
            // Check Sendbox
            else if (courierCode === "sendbox" || courierName.includes("sendbox")) {
                try {
                    const quotes = await fetchSendboxQuote({
                        destination_state: destinationState,
                        weight: Math.max(1, totalWeightKg),
                    });

                    if (quotes && quotes.length > 0) {
                        finalFee = quotes[0].fee || quotes[0].amount || 0;
                    } else {
                        finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
                    }
                } catch (sendboxErr) {
                    console.error("⚠️ [SENDBOX API ERROR], falling back to static formula:", sendboxErr);
                    finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
                }
            }
            // Static fallback for other couriers (Chowdeck, Dellyman, Glovo, Kwikpik, GIG, etc.)
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
                } else {
                    logoPath = "/images/couriers/default.png";
                }
            }

            shippingOptions.push({
                id: doc.id,
                name: courier.name,
                logo: logoPath,
                estimatedDays: courier.estimatedDays || "2-5 Business Days",
                shippingFee: finalFee,
                dispatchEnabled: true,
                integrationStatus: courier.integrationStatus || "ready",
            });
        }

        // 3. Sort active options from lowest to highest fee
        shippingOptions.sort((a, b) => a.shippingFee - b.shippingFee);

        return NextResponse.json({
            success: true,
            destinationState,
            totalWeightKg,
            options: shippingOptions,
        });
    } catch (error: any) {
        console.error("❌ [SHIPPING CALCULATION ERROR]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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
