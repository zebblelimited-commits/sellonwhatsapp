import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { COURIER_CATALOG } from "@/lib/courier-catalog";

function courierView(id: string, stored: Record<string, unknown> | undefined) {
  const catalog = COURIER_CATALOG.find((courier) => courier.id === id);
  if (!catalog) return null;
  return {
    ...catalog,
    ...stored,
    id: catalog.id,
    name: String(stored?.name || catalog.name),
    code: String(stored?.code || catalog.code),
    logo: String(stored?.logo || catalog.logo),
    estimatedDays: String(stored?.estimatedDays || catalog.estimatedDays),
    isActive: stored?.isActive !== false && catalog.defaultActive,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const snapshot = await adminDb.collection("couriers").get();
    const stored = new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as Record<string, unknown>]));
    const couriers = COURIER_CATALOG
      .map((courier) => courierView(courier.id, stored.get(courier.id)))
      .filter(Boolean);
    return NextResponse.json({ couriers });
  } catch (error) {
    console.error("Admin courier settings load error:", error);
    return NextResponse.json({ error: "Courier settings could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as { id?: unknown; isActive?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const isActive = body.isActive === true;
    const catalog = COURIER_CATALOG.find((courier) => courier.id === id);
    if (!catalog) return NextResponse.json({ error: "Unknown courier" }, { status: 400 });
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }

    const courierRef = adminDb.collection("couriers").doc(id);
    const existing = await courierRef.get();
    const now = FieldValue.serverTimestamp();
    await courierRef.set({
      ...catalog,
      ...(existing.exists ? existing.data() : {}),
      isActive,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    }, { merge: true });

    await adminDb.collection("auditLogs").add({
      action: isActive ? "courier_activated" : "courier_deactivated",
      targetType: "courier",
      targetId: id,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { isActive, courierName: catalog.name },
      timestamp: now,
    });

    return NextResponse.json({ success: true, id, isActive });
  } catch (error) {
    console.error("Admin courier settings update error:", error);
    return NextResponse.json({ error: "Courier setting could not be updated" }, { status: 500 });
  }
}
