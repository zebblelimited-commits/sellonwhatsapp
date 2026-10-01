import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteStoreData } from "@/lib/admin-delete-seller-data";

const STORE_ACTIONS = ["approve", "reject", "suspend", "verify", "restore", "delete", "sponsorship"] as const;
type StoreAction = (typeof STORE_ACTIONS)[number];

function isSuperAdminRole(role: unknown) {
  return ["super_admin", "superadmin"].includes(String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
}

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
    const body = (await request.json()) as Record<string, unknown>;
    const action = body?.action as StoreAction;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!STORE_ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid store action" }, { status: 400 });
    if (["reject", "suspend"].includes(action) && !reason) {
      return NextResponse.json({ error: "A reason is required for this action" }, { status: 400 });
    }

    const storeRef = adminDb.collection("stores").doc(id);
    if (action === "delete") {
      if (!isSuperAdminRole(access.admin.role)) return NextResponse.json({ error: "Only a super admin can permanently delete a store" }, { status: 403 });
      const storeSnapshot = await storeRef.get();
      if (!storeSnapshot.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
      const store = storeSnapshot.data() || {};
      const ownerId = typeof store.vendorId === "string" ? store.vendorId : typeof store.ownerId === "string" ? store.ownerId : typeof store.uid === "string" ? store.uid : id;
      const deleted = await deleteStoreData([storeRef], ownerId);
      await adminDb.collection("auditLogs").add({
        action: "store_delete",
        targetType: "store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { reason, ownerId, ...deleted },
        timestamp: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, action, storeId: id, deleted });
    }

    if (action === "sponsorship") {
      const isSponsored = body.isSponsored === true;
      const requestedStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
      const sponsorshipStatus = isSponsored ? "active" : requestedStatus || "inactive";
      if (!["active", "inactive", "expired", "cancelled"].includes(sponsorshipStatus)) {
        return NextResponse.json({ error: "Invalid sponsorship status" }, { status: 400 });
      }

      const numericPriority = Number(body.priority);
      const priority = Number.isFinite(numericPriority) ? Math.max(0, numericPriority) : 0;
      const placement = typeof body.placement === "string" ? body.placement.trim().slice(0, 80) : "marketplace";
      const source = typeof body.source === "string" ? body.source.trim().slice(0, 80) : "admin";
      const sponsoredUntil = typeof body.sponsoredUntil === "string" ? Date.parse(body.sponsoredUntil) : NaN;
      if (isSponsored && typeof body.sponsoredUntil === "string" && !Number.isFinite(sponsoredUntil)) {
        return NextResponse.json({ error: "sponsoredUntil must be a valid ISO date" }, { status: 400 });
      }

      const fields: Record<string, unknown> = {
        isSponsored,
        sponsored: isSponsored,
        sponsorshipStatus,
        priority,
        placement,
        source,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: access.admin.uid,
      };
      if (isSponsored) {
        fields.sponsoredAt = FieldValue.serverTimestamp();
        fields.sponsoredUntil = Number.isFinite(sponsoredUntil)
          ? Timestamp.fromMillis(sponsoredUntil)
          : FieldValue.delete();
      } else {
        fields.sponsoredUntil = FieldValue.delete();
      }

      const storeSnapshot = await storeRef.get();
      if (!storeSnapshot.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
      await storeRef.set(fields, { merge: true });
      await adminDb.collection("auditLogs").add({
        action: isSponsored ? "store_sponsorship_enabled" : "store_sponsorship_disabled",
        targetType: "store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { isSponsored, sponsorshipStatus, priority, placement, source },
        timestamp: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        success: true,
        action,
        storeId: id,
        isSponsored,
        status: sponsorshipStatus,
        priority,
      });
    }

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
