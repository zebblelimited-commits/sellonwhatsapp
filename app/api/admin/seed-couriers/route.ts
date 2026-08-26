// app/api/admin/seed-couriers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const couriers = [
            {
                id: "gig_logistics",
                name: "GIG Logistics",
                logo: "/couriers/gig.png",
                isActive: true,
                baseRate: 2000,
                ratePerKg: 400,
                estimatedDays: "2-4 Business Days",
                stateMultipliers: {
                    Lagos: 1.0,
                    Ogun: 1.1,
                    Oyo: 1.2,
                    Abuja: 1.35,
                    Rivers: 1.4,
                    Kano: 1.5,
                    Delta: 1.3,
                    Enugu: 1.4,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "fez_delivery",
                name: "Fez Delivery",
                logo: "/couriers/fez.png",
                isActive: true,
                baseRate: 1500,
                ratePerKg: 350,
                estimatedDays: "1-3 Business Days",
                stateMultipliers: {
                    Lagos: 1.0,
                    Ogun: 1.1,
                    Oyo: 1.15,
                    Abuja: 1.4,
                    Rivers: 1.5,
                    Kano: 1.6,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        ];

        for (const courier of couriers) {
            await adminDb.collection("couriers").doc(courier.id).set(courier, { merge: true });
        }

        return NextResponse.json({ success: true, message: "Couriers seeded successfully!" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}