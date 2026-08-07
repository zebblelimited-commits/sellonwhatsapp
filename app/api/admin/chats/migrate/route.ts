import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;
  try {
    let migrated = 0;
    let skipped = 0;
    for (const sourceCollection of ["admin_chats", "vendor_chats"]) {
      const chats = await adminDb.collection(sourceCollection).get();
      for (const source of chats.docs) {
        const data = source.data();
        const chatRef = adminDb.collection("support_chats").doc(`legacy_${sourceCollection}_${source.id}`);
        const existing = await chatRef.get();
        if (existing.exists) { skipped += 1; continue; }
        const participants = Array.from(new Set([data.buyerId, data.vendorId, ...(Array.isArray(data.participants) ? data.participants : [])].filter(Boolean)));
        const batch = adminDb.batch();
        batch.set(chatRef, {
          chatId: chatRef.id,
          channel: "support",
          sourceCollection,
          sourceChatId: source.id,
          status: data.status || "open",
          buyerId: data.buyerId || null,
          vendorId: data.vendorId || null,
          participants,
          adminIds: sourceCollection === "admin_chats" ? [access.admin.uid] : [],
          userName: data.userName || data.buyerName || data.storeName || "Support user",
          userEmail: data.userEmail || data.buyerEmail || "",
          userRole: data.userRole || (data.vendorId ? "vendor" : "buyer"),
          lastMessage: data.lastMessage || "",
          lastMessageAt: data.lastMessageAt || FieldValue.serverTimestamp(),
          unreadBy: data.unreadBy || { buyer: 0, vendor: 0, admin: Number(data.unreadCount || 0) },
          createdAt: data.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        const messages = await source.ref.collection("messages").get();
        messages.docs.forEach((message) => batch.set(chatRef.collection("messages").doc(message.id), { ...message.data(), migratedFrom: `${sourceCollection}/${source.id}` }, { merge: true }));
        await batch.commit();
        migrated += 1;
      }
    }
    await adminDb.collection("auditLogs").add({
      action: "support_chat_migration",
      targetType: "system",
      targetId: "support_chats",
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { migrated, skipped },
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, migrated, skipped });
  } catch (error: unknown) {
    console.error("Support chat migration error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to migrate support chats" }, { status: 500 });
  }
}
