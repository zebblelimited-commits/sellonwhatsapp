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

        // 2. Loop through couriers and dynamically fetch or calculate rates
        for (const doc of couriersSnap.docs) {
            const courier = doc.data();
            let finalFee = 0;
            const courierCode = courier.code?.toLowerCase() || "";
            const courierName = courier.name?.toLowerCase() || "";

            // Check if courier is FEZ Delivery
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
            // Check if courier is Sendbox
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
            // Default static calculation for other couriers (e.g., GIG)
            else {
                finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
            }

            shippingOptions.push({
                id: doc.id,
                name: courier.name,
                // Dynamic logo fallback handling for Sendbox, GIG, and FEZ
                logo: courier.logo || (
                    courierCode === "sendbox" || courierName.includes("sendbox")
                        ? "/images/couriers/sendboxlogo.jpeg"
                        : courierCode === "gig" || courierName.includes("gig")
                            ? "/images/couriers/gigilogo.jpg"
                            : courierCode === "fez" || courierName.includes("fez")
                                ? "/images/couriers/fezlogo.png"
                                : "/images/couriers/default.png"
                ),
                estimatedDays: courier.estimatedDays || "2-5 Business Days",
                shippingFee: finalFee,
            });
        }

        // 3. Sort options from lowest to highest fee
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
    return Math.ceil(rawFee / 100) * 100; // Round up to nearest 100 NGN
}