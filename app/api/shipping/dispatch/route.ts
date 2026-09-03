import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { dispatchShipmentForOrder } from "@/lib/shipping-dispatch";

export const runtime = "nodejs";

class DispatchRouteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DispatchRouteError";
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new DispatchRouteError("Authentication required", 401);
    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());
    const body = await request.json() as { shipmentId?: unknown };
    const shipmentId = typeof body.shipmentId === "string" ? body.shipmentId.trim() : "";
    if (!shipmentId) throw new DispatchRouteError("Shipment ID is required");

    const shipmentSnap = await adminDb.collection("shipments").doc(shipmentId).get();
    if (!shipmentSnap.exists) throw new DispatchRouteError("Shipment not found", 404);
    const shipment = shipmentSnap.data() || {};
    const adminSnap = await adminDb.collection("admins").doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isActive === true;
    const isSeller = shipment.storeId === decoded.uid || shipment.vendorId === decoded.uid;
    if (!isAdmin && !isSeller) throw new DispatchRouteError("You cannot dispatch this shipment", 403);

    const orderId = typeof shipment.orderId === "string" ? shipment.orderId.trim() : "";
    if (!orderId) throw new DispatchRouteError("Shipment has no order reference", 409);
    const result = await dispatchShipmentForOrder(orderId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("[SHIPPING] Dispatch route error:", error);
    const status = error instanceof DispatchRouteError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shipment dispatch failed" }, { status });
  }
}
