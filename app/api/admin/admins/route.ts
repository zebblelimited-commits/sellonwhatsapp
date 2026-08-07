import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  if (access.admin.role !== "super_admin") return NextResponse.json({ error: "Only super admins can manage admin permissions" }, { status: 403 });

  const snapshot = await adminDb.collection("admins").limit(100).get();
  return NextResponse.json({ admins: snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() })) });
}
