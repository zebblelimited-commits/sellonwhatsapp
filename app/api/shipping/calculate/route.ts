// app/api/shipping/calculate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

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

        // 2. Calculate dynamic rate for each courier
        couriersSnap.forEach((doc) => {
            const courier = doc.data();
            const stateMultipliers = courier.stateMultipliers || {};

            // Get state multiplier (default to 1.5 for unlisted or far states)
            const multiplier = stateMultipliers[destinationState] || 1.5;

            // Formula: (Base Rate + (Weight * Rate Per Kg)) * State Multiplier
            const baseRate = Number(courier.baseRate || 1500);
            const ratePerKg = Number(courier.ratePerKg || 300);
            const calculatedWeight = Math.max(1, totalWeightKg); // Minimum 1kg charge

            const rawFee = (baseRate + (calculatedWeight - 1) * ratePerKg) * multiplier;
            const roundedFee = Math.ceil(rawFee / 100) * 100; // Round up to nearest 100 NGN

            shippingOptions.push({
                id: doc.id,
                name: courier.name,
                logo: courier.logo || "/couriers/default.png",
                estimatedDays: courier.estimatedDays || "2-5 Business Days",
                shippingFee: roundedFee,
            });
        });

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