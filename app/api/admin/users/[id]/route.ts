import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

const USER_ACTIONS = ["ban", "suspend", "verify", "restore"] as const;
type UserAction = (typeof USER_ACTIONS)[number];

function jsonError(error: unknown, status = 500) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to process user action" },
    { status }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { id } = await params;
    const [userSnap, buyerSnap, vendorSnap, storeSnap] = await Promise.all([
      adminDb.collection("users").doc(id).get(),
      adminDb.collection("buyers").doc(id).get(),
      adminDb.collection("vendors").doc(id).get(),
      adminDb.collection("stores").doc(id).get(),
    ]);

    if (!userSnap.exists && !buyerSnap.exists && !vendorSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: { id, ...(userSnap.data() || vendorSnap.data() || buyerSnap.data() || {}) },
      buyerProfile: buyerSnap.exists ? buyerSnap.data() : null,
      vendorProfile: vendorSnap.exists ? vendorSnap.data() : null,
      store: storeSnap.exists ? { id: storeSnap.id, ...storeSnap.data() } : null,
    });
  } catch (error) {
    console.error("Admin user detail error:", error);
    return jsonError(error);
  }
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
    const action = body?.action as UserAction;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!USER_ACTIONS.includes(action)) return jsonError(new Error("Invalid user action"), 400);
    if (["ban", "suspend"].includes(action) && !reason) {
      return jsonError(new Error("A reason is required for this action"), 400);
    }

    const userRef = adminDb.collection("users").doc(id);
    const buyerRef = adminDb.collection("buyers").doc(id);
    const vendorRef = adminDb.collection("vendors").doc(id);
    let profile: Record<string, unknown> | null = null;
    let role = "buyer";

    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const buyerSnap = await transaction.get(buyerRef);
      const vendorSnap = await transaction.get(vendorRef);

      if (!userSnap.exists && !buyerSnap.exists && !vendorSnap.exists) {
        throw new Error("User not found");
      }

      const source = userSnap.exists ? userSnap.data() : vendorSnap.exists ? vendorSnap.data() : buyerSnap.data();
      profile = source || {};
      role = typeof source?.role === "string" ? source.role : (vendorSnap.exists ? "vendor" : "buyer");

      const statusFields: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: access.admin.uid,
      };

      if (action === "ban") {
        Object.assign(statusFields, {
          status: "banned",
          isBanned: true,
          isSuspended: false,
          bannedAt: FieldValue.serverTimestamp(),
          bannedBy: access.admin.uid,
          banReason: reason,
        });
      } else if (action === "suspend") {
        Object.assign(statusFields, {
          status: "suspended",
          isSuspended: true,
          isBanned: false,
          suspendedAt: FieldValue.serverTimestamp(),
          suspendedBy: access.admin.uid,
          suspendReason: reason,
        });
      } else if (action === "verify") {
        Object.assign(statusFields, {
          isVerified: true,
          verifiedAt: FieldValue.serverTimestamp(),
          verifiedBy: access.admin.uid,
        });
      } else {
        Object.assign(statusFields, {
          status: "active",
          isBanned: false,
          isSuspended: false,
          restoredAt: FieldValue.serverTimestamp(),
          restoredBy: access.admin.uid,
          banReason: FieldValue.delete(),
          suspendReason: FieldValue.delete(),
        });
      }

      const canonicalUser = {
        uid: id,
        role,
        email: source?.email || "",
        displayName: source?.displayName || "",
        firstName: source?.firstName || "",
        lastName: source?.lastName || "",
        createdAt: source?.createdAt || FieldValue.serverTimestamp(),
        ...statusFields,
      };

      transaction.set(userRef, canonicalUser, { merge: true });
      if (buyerSnap.exists || role === "buyer") transaction.set(buyerRef, statusFields, { merge: true });
      if (vendorSnap.exists || role === "vendor") transaction.set(vendorRef, { ...canonicalUser, ...statusFields }, { merge: true });
    });

    if (["ban", "suspend", "restore"].includes(action)) {
      const storeRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      const directStoreRef = adminDb.collection("stores").doc(id);
      const directStoreSnap = await directStoreRef.get();
      if (directStoreSnap.exists) storeRefs.set(directStoreRef.path, directStoreRef);

      const ownedStores = await adminDb.collection("stores").where("vendorId", "==", id).get();
      ownedStores.docs.forEach((store) => storeRefs.set(store.ref.path, store.ref));

      if (storeRefs.size) {
        const batch = adminDb.batch();
        storeRefs.forEach((storeRef) => batch.set(storeRef, {
          status: action === "restore" ? "active" : action === "ban" ? "banned" : "suspended",
          isBanned: action === "ban",
          isSuspended: action === "suspend",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: access.admin.uid,
          ...(action === "restore" ? { restoredAt: FieldValue.serverTimestamp(), banReason: FieldValue.delete(), suspendReason: FieldValue.delete() } : {}),
          ...(action === "ban" ? { banReason: reason, bannedAt: FieldValue.serverTimestamp() } : {}),
          ...(action === "suspend" ? { suspendReason: reason, suspendedAt: FieldValue.serverTimestamp() } : {}),
        }, { merge: true }));
        await batch.commit();
      }
    }

    if (["ban", "suspend", "restore"].includes(action)) {
      await adminAuth.updateUser(id, { disabled: action !== "restore" });
    }

    await adminDb.collection("auditLogs").add({
      action: `user_${action}`,
      targetType: "user",
      targetId: id,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { reason, role, previous: profile },
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, action, userId: id });
  } catch (error) {
    console.error("Admin user action error:", error);
    return jsonError(error);
  }
}
