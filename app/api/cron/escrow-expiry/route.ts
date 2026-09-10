import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { expirePendingEscrow } from "@/src/infrastructure/db/escrowService";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
    // Vercel automatically sends CRON_SECRET as the Authorization bearer
    // token. Keep CRON_SECRET as a local/backward-compatible alias.
    const configured = process.env.CRON_SECRET || process.env.ESCROW_CRON_SECRET;
    if (!configured) return process.env.NODE_ENV !== "production";
    const header = request.headers.get("authorization");
    return header === `Bearer ${configured}`;
}

export async function GET(request: Request) {
    if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snapshot = await adminDb.collection("escrow_transactions")
        .where("status", "==", "PENDING_PAYMENT")
        .limit(250)
        .get();
    let expired = 0;
    for (const document of snapshot.docs) {
        if (await expirePendingEscrow(document.id)) {
            expired += 1;
            const orders = await adminDb.collection("orders").where("checkoutReference", "==", document.id).get();
            const batch = adminDb.batch();
            for (const order of orders.docs) {
                if (String(order.data().fundsState || "").toLowerCase() === "held") continue;
                batch.update(order.ref, {
                    status: "EXPIRED",
                    paymentStatus: "expired",
                    fundsState: "unfunded",
                    updatedAt: new Date(),
                });
            }
            if (!orders.empty) await batch.commit();
        }
    }
    return NextResponse.json({ success: true, scanned: snapshot.size, expired });
}
