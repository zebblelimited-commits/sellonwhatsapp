// app/api/webhooks/fez/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orderNumber, status } = body;

        // Extract signature headers
        const signature = req.headers.get("x-signature");
        const timestamp = req.headers.get("x-timestamp");
        const secretKey = process.env.FEZ_SECRET_KEY;

        if (signature && timestamp && secretKey) {
            // Verify HMAC-SHA256 signature
            const payloadToSign = `${orderNumber}${status}${timestamp}`;
            const computedSignature = crypto
                .createHmac("sha256", secretKey)
                .update(payloadToSign)
                .digest("hex");

            if (computedSignature !== signature) {
                return NextResponse.json(
                    { error: "Invalid HMAC Signature" },
                    { status: 401 }
                );
            }
        }

        console.log(`📦 [FEZ WEBHOOK] Order ${orderNumber} updated status to: ${status}`);

        // TODO: Update order status in your database (e.g., Firestore / MongoDB)
        // e.g., if (status === "Delivered") { markOrderAsCompleted(orderNumber); }

        return NextResponse.json({ status: "Success", message: "Webhook processed" });
    } catch (error: any) {
        console.error("❌ [FEZ WEBHOOK ERROR]:", error.message);
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
    }
}