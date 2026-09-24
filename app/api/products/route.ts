import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { syncReferralMilestones } from "@/lib/referrals";

export async function POST(request: NextRequest) {
    try {
        const { userId, productPayload } = await request.json();
        const authorization = request.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
        if (decoded.uid !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
        }

        // 1. Get tier limits from user profile doc
        const userSnap = await adminDb.collection("users").doc(userId).get();
        const userData = userSnap.exists ? userSnap.data() : null;
        const productLimit = userData?.productLimit ?? 20; // Default fallback to 20

        // 2. Get high-performance server-side aggregation count 
        const productsQuerySnapshot = await adminDb
            .collection("products")
            .where("userId", "==", userId)
            .count()
            .get();

        const currentCount = productsQuerySnapshot.data().count;

        // 3. Enforce gating conditions
        if (currentCount >= productLimit) {
            return NextResponse.json({
                success: false,
                error: "PRODUCT_LIMIT_EXCEEDED",
                message: `Your subscription tier limits you to ${productLimit} products. Please upgrade to add more items.`
            }, { status: 403 });
        }

        // 4. Otherwise, continue and write the item record securely...
        const docRef = await adminDb.collection("products").add({
            ...productPayload,
            userId,
            createdAt: new Date().toISOString()
        });
        await syncReferralMilestones(userId);

        return NextResponse.json({ success: true, id: docRef.id });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}