// app/api/admin/seed-couriers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const couriers = [
            {
                id: "chowdeck",
                name: "Chowdeck",
                code: "chowdeck",
                logo: "/images/couriers/chowdecklogo.jpg",
                isActive: true,
                baseRate: 1000,
                ratePerKg: 200,
                estimatedDays: "Same Day Delivery",
                availableStates: ["Lagos", "Abuja", "Oyo", "Ogun"], // Filtered states
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "dellyman",
                name: "Dellyman",
                code: "dellyman",
                logo: "/images/couriers/dellymanlogo.jpg",
                isActive: true,
                baseRate: 1200,
                ratePerKg: 250,
                estimatedDays: "1-2 Business Days",
                availableStates: ["Lagos", "Abuja", "Rivers", "Oyo"],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "glovo",
                name: "Glovo",
                code: "glovo",
                logo: "/images/couriers/glovologo.png",
                isActive: true,
                baseRate: 1100,
                ratePerKg: 200,
                estimatedDays: "Express Same Day",
                availableStates: ["Lagos", "Abuja"],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "kwikpik",
                name: "Kwikpik",
                code: "kwikpik",
                logo: "/images/couriers/kwikpik.jpeg",
                isActive: true,
                baseRate: 1300,
                ratePerKg: 250,
                estimatedDays: "1-2 Business Days",
                availableStates: ["Lagos", "Ogun"],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "gig_logistics",
                name: "GIG Logistics",
                code: "gig",
                logo: "/images/couriers/gigilogo.jpg",
                isActive: true,
                baseRate: 2000,
                ratePerKg: 400,
                estimatedDays: "2-4 Business Days",
                availableStates: [], // Empty array = Nationwide
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "fez_delivery",
                name: "Fez Delivery",
                code: "fez",
                logo: "/images/couriers/fezlogo.png",
                isActive: true,
                baseRate: 1500,
                ratePerKg: 350,
                estimatedDays: "1-3 Business Days",
                availableStates: [], // Nationwide
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {
                id: "sendbox_shipping",
                name: "Sendbox",
                code: "sendbox",
                logo: "/images/couriers/sendboxlogo.jpeg",
                isActive: true,
                baseRate: 1800,
                ratePerKg: 350,
                estimatedDays: "2-4 Business Days",
                availableStates: [], // Nationwide
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