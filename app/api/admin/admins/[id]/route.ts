import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

const ROLES = ["super_admin", "admin", "support", "finance", "moderator"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  if (access.admin.role !== "super_admin") return NextResponse.json({ error: "Only super admins can manage admin permissions" }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json() as { role?: unknown; isActive?: unknown; permissions?: unknown };
    if (id === access.admin.uid && body.isActive === false) return NextResponse.json({ error: "You cannot deactivate your own admin account" }, { status: 400 });
    const adminRef = adminDb.collection("admins").doc(id);
    const current = await adminRef.get();
    if (!current.exists) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: access.admin.uid };
    if (typeof body.role === "string") {
      if (!ROLES.includes(body.role)) return NextResponse.json({ error: "Invalid admin role" }, { status: 400 });
      updates.role = body.role;
    }
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (body.permissions && typeof body.permissions === "object" && !Array.isArray(body.permissions)) updates.permissions = body.permissions;
    await adminRef.set(updates, { merge: true });
    await adminDb.collection("auditLogs").add({
      action: "permission_changed",
      targetType: "admin",
      targetId: id,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { updates: Object.keys(updates).filter((field) => !["updatedAt", "updatedBy"].includes(field)) },
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin permission update error:", error);
    return NextResponse.json({ error: "Unable to update admin permissions" }, { status: 500 });
  }
}
