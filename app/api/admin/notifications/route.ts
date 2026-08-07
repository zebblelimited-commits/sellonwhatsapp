import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  try {
    const body = await request.json() as { message?: unknown; target?: unknown };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    const target = body.target === "buyers" || body.target === "vendors" || body.target === "admins" ? body.target : "all";
    if (!message) return NextResponse.json({ error: "Please enter a message" }, { status: 400 });

    const recipients = new Map<string, "buyer" | "vendor" | "admin">();
    if (target === "all" || target === "buyers" || target === "vendors") {
      const [usersSnapshot, buyersSnapshot, vendorsSnapshot, storesSnapshot] = await Promise.all([
        adminDb.collection("users").get(),
        adminDb.collection("buyers").get(),
        adminDb.collection("vendors").get(),
        adminDb.collection("stores").get(),
      ]);

      usersSnapshot.docs.forEach((user) => {
        const normalizedRole = String(user.data().role || "buyer").toLowerCase();
        if (["admin", "super_admin", "support", "finance", "moderator"].includes(normalizedRole)) return;
        const role = ["vendor", "seller"].includes(normalizedRole) ? "vendor" : "buyer";
        if (target === "all" || target === `${role}s`) recipients.set(user.id, role);
      });
      buyersSnapshot.docs.forEach((buyer) => {
        if (target === "all" || target === "buyers") recipients.set(buyer.id, "buyer");
      });
      vendorsSnapshot.docs.forEach((vendor) => {
        if (target === "all" || target === "vendors") recipients.set(vendor.id, "vendor");
      });
      // Email/password vendor registration creates a store document first;
      // use its owner identity when the vendor profile has not been migrated.
      storesSnapshot.docs.forEach((store) => {
        const data = store.data();
        const ownerId = [data.vendorId, data.ownerId, data.uid, store.id].find((value) => typeof value === "string" && value.length > 0);
        if (ownerId && (target === "all" || target === "vendors")) recipients.set(ownerId, "vendor");
      });
    }
    if (target === "all" || target === "admins") {
      const adminsSnapshot = await adminDb.collection("admins").where("isActive", "==", true).get();
      adminsSnapshot.docs.forEach((admin) => recipients.set(admin.id, "admin"));
    }

    const recipientEntries = Array.from(recipients.entries());
    for (let index = 0; index < recipientEntries.length; index += 450) {
      const batch = adminDb.batch();
      const now = FieldValue.serverTimestamp();
      recipientEntries.slice(index, index + 450).forEach(([recipientId, recipientRole]) => {
        const ref = adminDb.collection("notifications").doc();
        batch.set(ref, {
          recipientId,
          recipientRole,
          ...(recipientRole === "buyer" ? { buyerId: recipientId } : recipientRole === "vendor" ? { vendorId: recipientId } : { adminId: recipientId }),
          type: "system",
          priority: "medium",
          title: "Announcement from Zebble",
          body: message,
          read: false,
          sentBy: access.admin.uid,
          sentAt: now,
          createdAt: now,
          updatedAt: now,
        });
      });
      await batch.commit();
    }

    await adminDb.collection("auditLogs").add({
      action: "notification_broadcast",
      targetType: "system",
      targetId: target,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { target, recipientCount: recipientEntries.length },
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, recipientCount: recipientEntries.length });
  } catch (error: unknown) {
    console.error("Admin notification broadcast error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send notification" }, { status: 500 });
  }
}
