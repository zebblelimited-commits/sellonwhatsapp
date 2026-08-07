import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  const snapshot = await adminDb.collection("admins").doc(access.admin.uid).get();
  const data = snapshot.data() || {};
  return NextResponse.json({ profile: {
    uid: access.admin.uid,
    email: data.email || access.admin.email || "",
    role: data.role || access.admin.role,
    isActive: data.isActive !== false,
    ...data,
  } });
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as { displayName?: unknown; phoneNumber?: unknown; timezone?: unknown };
    const fields = {
      displayName: typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : "",
      phoneNumber: typeof body.phoneNumber === "string" ? body.phoneNumber.trim().slice(0, 30) : "",
      timezone: typeof body.timezone === "string" ? body.timezone.trim().slice(0, 60) : "Africa/Lagos",
      updatedAt: FieldValue.serverTimestamp(),
    };
    await adminDb.collection("admins").doc(access.admin.uid).set(fields, { merge: true });
    await adminDb.collection("auditLogs").add({
      action: "settings_changed",
      targetType: "admin",
      targetId: access.admin.uid,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { fields: Object.keys(fields).filter((field) => field !== "updatedAt") },
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, profile: fields });
  } catch (error) {
    console.error("Admin profile update error:", error);
    return NextResponse.json({ error: "Unable to update admin profile" }, { status: 500 });
  }
}
