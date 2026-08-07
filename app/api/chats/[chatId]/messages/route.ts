import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type ChatRole = "buyer" | "vendor" | "admin";
class ChatMessageError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }

async function accessFor(chatId: string, token: string) {
  const decoded = await adminAuth.verifyIdToken(token);
  const [chatSnap, adminSnap] = await Promise.all([
    adminDb.collection("support_chats").doc(chatId).get(),
    adminDb.collection("admins").doc(decoded.uid).get(),
  ]);
  if (!chatSnap.exists) throw new ChatMessageError("Support conversation not found", 404);
  const chat = chatSnap.data() || {};
  const isAdmin = adminSnap.exists && adminSnap.data()?.isActive === true;
  const isParticipant = chat.buyerId === decoded.uid || chat.vendorId === decoded.uid || (Array.isArray(chat.participants) && chat.participants.includes(decoded.uid));
  if (!isAdmin && !isParticipant) throw new ChatMessageError("You do not have access to this conversation", 403);
  const role: ChatRole = isAdmin ? "admin" : chat.vendorId === decoded.uid ? "vendor" : "buyer";
  return { decoded, chatSnap, chat, role, isAdmin };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new ChatMessageError("Authentication required", 401);
    const { chatId } = await params;
    const access = await accessFor(chatId, authHeader.slice("Bearer ".length).trim());
    const body = await request.json() as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) throw new ChatMessageError("A message is required", 400);
    const activeAdminSnapshot = await adminDb.collection("admins").where("isActive", "==", true).get();
    const activeAdminIds = activeAdminSnapshot.docs.map((item) => item.id);
    const messageRef = adminDb.collection("support_chats").doc(chatId).collection("messages").doc();
    const chatRef = adminDb.collection("support_chats").doc(chatId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const chatSnap = await transaction.get(chatRef);
      if (!chatSnap.exists) throw new ChatMessageError("Support conversation not found", 404);
      const chat = chatSnap.data() || {};
      const currentUnread = (chat.unreadBy || {}) as Record<string, unknown>;
      const unreadBy: Record<ChatRole, number> = {
        buyer: Number(currentUnread.buyer || 0),
        vendor: Number(currentUnread.vendor || 0),
        admin: Number(currentUnread.admin || 0),
      };
      const recipients: Array<{ id: string; role: ChatRole }> = [];
      if (chat.buyerId && chat.buyerId !== access.decoded.uid) recipients.push({ id: chat.buyerId, role: "buyer" });
      if (chat.vendorId && chat.vendorId !== access.decoded.uid) recipients.push({ id: chat.vendorId, role: "vendor" });
      activeAdminIds.filter((id) => id !== access.decoded.uid).forEach((id) => recipients.push({ id, role: "admin" }));
      recipients.forEach((recipient) => { unreadBy[recipient.role] += 1; });
      const now = FieldValue.serverTimestamp();
      transaction.set(messageRef, {
        senderId: access.decoded.uid,
        senderEmail: access.decoded.email || "",
        senderRole: access.role,
        content,
        timestamp: now,
        createdAt: now,
        read: false,
        readBy: [access.decoded.uid],
      });
      transaction.update(chatRef, {
        participants: FieldValue.arrayUnion(access.decoded.uid),
        adminIds: access.role === "admin" ? FieldValue.arrayUnion(access.decoded.uid) : FieldValue.arrayUnion(...activeAdminIds),
        lastMessage: content,
        lastMessageAt: now,
        lastMessageBy: access.decoded.uid,
        unreadBy,
        updatedAt: now,
      });
      recipients.forEach((recipient) => {
        const notificationRef = adminDb.collection("notifications").doc();
        transaction.set(notificationRef, {
          recipientId: recipient.id,
          recipientRole: recipient.role,
          ...(recipient.role === "buyer" ? { buyerId: recipient.id } : recipient.role === "vendor" ? { vendorId: recipient.id } : { adminId: recipient.id }),
          type: "message",
          title: "New support message",
          body: content.slice(0, 140),
          chatId,
          read: false,
          createdAt: now,
          updatedAt: now,
        });
      });
      return { messageId: messageRef.id, recipientCount: recipients.length };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Send support message error:", error);
    const status = error instanceof ChatMessageError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send support message" }, { status });
  }
}
