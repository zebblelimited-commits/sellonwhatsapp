import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createTelegramConnectionUrl } from "@/lib/novu";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
    const connection = await createTelegramConnectionUrl(decoded.uid);
    return NextResponse.json(connection);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram connection could not be created";
    console.error("[NOVU TELEGRAM] Connection link failed:", message);
    return NextResponse.json({ error: "Telegram connection could not be created" }, { status: 502 });
  }
}
