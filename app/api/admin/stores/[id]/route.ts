import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

const STORE_ACTIONS = ["approve", "reject", "suspend", "verify", "restore"] as const;
type StoreAction = (typeof STORE_ACTIONS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  const { id } = await params;
  const store = await adminDb.collection("stores").doc(id).get();
  if (!store.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  return NextResponse.json({ store: { id: store.id, ...store.data() } });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { id } = await params;
    const body = (await request.json()) as { action?: string; reason?: unknown };
    const action = body?.action as StoreAction;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!STORE_ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid store action" }, { status: 400 });
    if (["reject", "suspend"].includes(action) && !reason) {
      return NextResponse.json({ error: "A reason is required for this action" }, { status: 400 });
    }

    const storeRef = adminDb.collection("stores").doc(id);
    let storeData: Record<string, unknown> | undefined;
    await adminDb.runTransaction(async (transaction) => {
      const storeSnap = await transaction.get(storeRef);
      if (!storeSnap.exists) throw new Error("Store not found");
      storeData = storeSnap.data();

      const fields: Record<string, unknown> = {
        vendorId: storeData?.vendorId || storeData?.uid || id,
        ownerId: storeData?.ownerId || storeData?.vendorId || storeData?.uid || id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: access.admin.uid,
      };

      if (action === "approve") Object.assign(fields, { status: "active", isApproved: true, isRejected: false, approvedAt: FieldValue.serverTimestamp(), approvedBy: access.admin.uid });
      if (action === "reject") Object.assign(fields, { status: "rejected", isApproved: false, isRejected: true, rejectedAt: FieldValue.serverTimestamp(), rejectedBy: access.admin.uid, rejectionReason: reason });
      if (action === "suspend") Object.assign(fields, { status: "suspended", isSuspended: true, suspendedAt: FieldValue.serverTimestamp(), suspendedBy: access.admin.uid, suspensionReason: reason });
      if (action === "verify") Object.assign(fields, { status: "verified", isVerified: true, isApproved: true, verifiedAt: FieldValue.serverTimestamp(), verifiedBy: access.admin.uid });
      if (action === "restore") Object.assign(fields, { status: "active", isSuspended: false, isRejected: false, isApproved: true, restoredAt: FieldValue.serverTimestamp(), restoredBy: access.admin.uid, rejectionReason: FieldValue.delete(), suspensionReason: FieldValue.delete() });

      transaction.set(storeRef, fields, { merge: true });
    });

    await adminDb.collection("auditLogs").add({
      action: `store_${action}`,
      targetType: "store",
      targetId: id,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { reason, previous: storeData },
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, action, storeId: id });
  } catch (error) {
    console.error("Admin store action error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process store action" }, { status: 500 });
  }
}
