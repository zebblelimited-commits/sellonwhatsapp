import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getSellerEntitlements } from "@/lib/subscriptions/entitlements";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = authorization.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    const entitlements = await getSellerEntitlements(decoded.uid);
    return NextResponse.json(entitlements);
  } catch (error) {
    console.error("Seller entitlement lookup failed:", error);
    return NextResponse.json({ error: "Unable to load seller entitlements" }, { status: 500 });
  }
}
