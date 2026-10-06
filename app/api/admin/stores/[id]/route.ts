import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteStoreData } from "@/lib/admin-delete-seller-data";

const STORE_ACTIONS = [
  "approve", "reject", "suspend", "verify", "restore", "delete", "sponsorship",
  "reset_escrow_balance", "reset_total_sales", "reset_add_to_cart_clicks",
] as const;
type StoreAction = (typeof STORE_ACTIONS)[number];

const RESET_FIELDS = {
  reset_escrow_balance: "escrowBalance",
  reset_total_sales: "totalSales",
  reset_add_to_cart_clicks: "add_to_cart_clicks",
} as const;

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
    if ((["reject", "suspend", "delete", ...Object.keys(RESET_FIELDS)] as string[]).includes(action) && !reason) {
      return NextResponse.json({ error: "A reason is required for this action" }, { status: 400 });
    }

    const resetField = RESET_FIELDS[action as keyof typeof RESET_FIELDS];
    if (resetField) {
      const role = String(access.admin.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      const hasStoreWritePermission = access.admin.permissions?.stores?.write === true;
      if (!hasStoreWritePermission && !["super_admin", "superadmin", "finance"].includes(role)) {
        return NextResponse.json({ error: "Only an authorized finance or store administrator can reset store metrics" }, { status: 403 });
      }

      const storeRef = adminDb.collection("stores").doc(id);
      const result = await adminDb.runTransaction(async (transaction) => {
        const storeSnap = await transaction.get(storeRef);
        if (!storeSnap.exists) throw new Error("Store not found");
        const currentValue = Number(storeSnap.data()?.[resetField] ?? 0);
        if (!Number.isFinite(currentValue) || currentValue < 0) throw new Error(`Store field ${resetField} contains an invalid value`);

        const now = FieldValue.serverTimestamp();
        transaction.update(storeRef, {
          [resetField]: 0,
          updatedAt: now,
          updatedBy: access.admin.uid,
        });
        transaction.set(adminDb.collection("auditLogs").doc(), {
          action: `store_${action}`,
          targetType: "store",
          targetId: id,
          performedBy: access.admin.uid,
          performedByEmail: access.admin.email || "",
          details: { field: resetField, previousValue: currentValue, nextValue: 0, reason },
          timestamp: now,
        });
        return { previousValue: currentValue };
      });

      return NextResponse.json({
        success: true,
        action,
        storeId: id,
        field: resetField,
        value: 0,
        previousValue: result.previousValue,
      });
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
      const storeSnapshot = await storeRef.get();
      if (!storeSnapshot.exists) return NextResponse.json({ error: "Store not found" }, { status: 404 });
      const current = storeSnapshot.data() || {};
      const boostUntil = current.boostSponsoredUntil;
      const boostUntilMillis = boostUntil && typeof boostUntil === "object" && "toMillis" in boostUntil && typeof boostUntil.toMillis === "function"
        ? boostUntil.toMillis()
        : typeof boostUntil === "string" ? Date.parse(boostUntil) : 0;
      const boostActive = current.boostSponsored === true && (!boostUntilMillis || boostUntilMillis > Date.now());
      const effectiveSponsored = isSponsored || boostActive;
      const source = isSponsored && boostActive ? "admin_and_store_boost" : isSponsored ? "admin" : boostActive ? "store_boost" : "none";
      const numericPriority = Number(body.priority ?? current.priority);
      const priority = Number.isFinite(numericPriority) ? Math.max(0, numericPriority) : 0;
      const fields: Record<string, unknown> = {
        adminSponsored: isSponsored,
        isSponsored: effectiveSponsored,
        sponsored: effectiveSponsored,
        sponsorshipStatus: effectiveSponsored ? "active" : "inactive",
        sponsorshipSource: source,
        source,
        priority,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: access.admin.uid,
      };
      fields.adminSponsoredAt = isSponsored ? FieldValue.serverTimestamp() : FieldValue.delete();
      if (!boostActive) {
        fields.sponsoredAt = isSponsored ? FieldValue.serverTimestamp() : FieldValue.delete();
        fields.sponsoredUntil = FieldValue.delete();
      } else {
        fields.sponsoredAt = FieldValue.serverTimestamp();
        fields.sponsoredUntil = isSponsored ? FieldValue.delete() : boostUntil || FieldValue.delete();
      }
      await storeRef.set(fields, { merge: true });
      await adminDb.collection("auditLogs").add({
        action: isSponsored ? "store_sponsorship_enabled" : "store_sponsorship_disabled",
        targetType: "store",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { isSponsored, boostActive, priority, source },
        timestamp: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        success: true,
        action,
        storeId: id,
        isSponsored: effectiveSponsored,
        adminSponsored: isSponsored,
        boostSponsored: boostActive,
        status: effectiveSponsored ? "active" : "inactive",
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
