// app/api/shipping/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { fetchFezDeliveryCost } from "@/lib/fez"; // Import FEZ helper[cite: 1]

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

            // Check if courier is FEZ Delivery
            if (courier.code === "fez" || courier.name?.toLowerCase().includes("fez")) {
                try {
                    // Call live FEZ API[cite: 1]
                    const fezRate = await fetchFezDeliveryCost({
                        state: destinationState,
                        weight: Math.max(1, totalWeightKg),
                    });

                    // totalCost contains the fee including VAT[cite: 1]
                    finalFee = fezRate.totalCost;
                } catch (fezErr) {
                    console.error("⚠️ [FEZ API RATE ERROR], falling back to static formula:", fezErr);
                    finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
                }
            } else {
                // Fallback / default calculation for other couriers
                finalFee = calculateStaticFallback(courier, destinationState, totalWeightKg);
            }

            shippingOptions.push({
                id: doc.id,
                name: courier.name,
                // Dynamic logo fallback handling for both FEZ and GIG
                logo: courier.logo || (
                    courier.code === "gig" || courier.name?.toLowerCase().includes("gig")
                        ? "/images/couriers/gigilogo.jpg"
                        : courier.code === "fez" || courier.name?.toLowerCase().includes("fez")
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