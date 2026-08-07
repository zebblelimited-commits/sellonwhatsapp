import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

function serialize(value: unknown): unknown {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serialize(item)]));
  return value;
}

type SerializedVerification = Record<string, unknown> & { id: string };

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const allowedStatuses = new Set(["pending", "approved", "rejected", "all"]);
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid verification status" }, { status: 400 });

    // Sort in the API so both submittedAt-only legacy requests and newer
    // createdAt requests appear in one consistent queue.
    const snapshot = await adminDb.collection("store_verifications").limit(500).get();
    const rawRequests: SerializedVerification[] = snapshot.docs.map((item): SerializedVerification => ({
      id: item.id,
      ...(serialize(item.data()) as Record<string, unknown>),
    }))
      .filter((item) => status === "all" || item.status === status)
      .sort((left, right) => String(right.submittedAt || right.createdAt || "").localeCompare(String(left.submittedAt || left.createdAt || "")));

    const storeIds = Array.from(new Set(rawRequests.map((item) => typeof item.storeId === "string" && item.storeId ? item.storeId : item.id)));
    const storeSnapshots = await Promise.all(storeIds.map((storeId) => adminDb.collection("stores").doc(storeId).get()));
    const stores = new Map(storeSnapshots.filter((item) => item.exists).map((item) => [item.id, item.data() || {}]));
    const requests = rawRequests.map((item) => {
      const store = stores.get(typeof item.storeId === "string" && item.storeId ? item.storeId : item.id) || {};
      return {
        ...item,
        storeName: item.storeName || store.storeName || store.name || "Unnamed store",
        ownerName: item.ownerName || store.ownerName || store.displayName || store.email || "—",
        ownerEmail: item.ownerEmail || store.email || "",
        businessAddress: item.businessAddress || store.address || "",
        whatsappNumber: item.whatsappNumber || store.phone || "",
      };
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Admin verification queue error:", error);
    return NextResponse.json({ error: "Verification requests could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const body = await request.json() as { requestId?: unknown; decision?: unknown; notes?: unknown };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
    if (!requestId || !decision) return NextResponse.json({ error: "A request and decision are required" }, { status: 400 });
    if (decision === "reject" && !notes) return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

    const result = await adminDb.runTransaction(async (transaction) => {
      const requestRef = adminDb.collection("store_verifications").doc(requestId);
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) throw new Error("Verification request not found");
      const verification = requestSnapshot.data() || {};
      if (String(verification.status || "pending") !== "pending") {
        throw new Error("This verification request has already been processed");
      }

      const storeId = typeof verification.storeId === "string" && verification.storeId ? verification.storeId : requestId;
      const storeRef = adminDb.collection("stores").doc(storeId);
      const storeSnapshot = await transaction.get(storeRef);
      if (!storeSnapshot.exists) throw new Error("The store attached to this verification request was not found");
      const storeData = storeSnapshot.data() || {};
      const vendorRecipientId = [storeData.vendorId, storeData.ownerId, storeData.uid, storeId].find((value) => typeof value === "string" && value.length > 0) as string;

      const now = FieldValue.serverTimestamp();
      const approved = decision === "approve";
      transaction.update(requestRef, {
        status: approved ? "approved" : "rejected",
        reviewNotes: notes,
        reviewedAt: now,
        reviewedBy: access.admin.uid,
        reviewedByEmail: access.admin.email || "",
        updatedAt: now,
      });
      transaction.set(storeRef, {
        verificationStatus: approved ? "approved" : "rejected",
        isVerified: approved,
        verificationTier: approved ? "business" : null,
        ...(approved ? {
          verifiedAt: now,
          verifiedBy: access.admin.uid,
        } : {
          rejectedAt: now,
          rejectionReason: notes,
          rejectedBy: access.admin.uid,
        }),
        updatedAt: now,
      }, { merge: true });

      const notificationRef = adminDb.collection("notifications").doc();
      transaction.set(notificationRef, {
        recipientId: vendorRecipientId,
        vendorId: vendorRecipientId,
        recipientRole: "vendor",
        type: "verification",
        priority: "high",
        title: approved ? "Business verification approved" : "Business verification needs attention",
        body: approved ? "Your store is now verified as a Zebble business." : `Your verification was rejected. ${notes}`,
        read: false,
        createdAt: now,
        updatedAt: now,
      });

      const auditRef = adminDb.collection("auditLogs").doc();
      transaction.set(auditRef, {
        action: approved ? "verification_approved" : "verification_rejected",
        targetType: "store",
        targetId: storeId,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: { requestId, reason: notes, verificationType: "business" },
        timestamp: now,
      });

      return { storeId, status: approved ? "approved" : "rejected" };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Admin verification decision error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification decision failed" }, { status: 409 });
  }
}
