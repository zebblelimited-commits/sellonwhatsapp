import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authHeader.slice("Bearer ".length).trim());
    const { chatId } = await params;
    const chatRef = adminDb.collection("support_chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) return NextResponse.json({ error: "Support conversation not found" }, { status: 404 });
    const chat = chatSnap.data() || {};
    const adminSnap = await adminDb.collection("admins").doc(decoded.uid).get();
    const isAdmin = adminSnap.exists && adminSnap.data()?.isActive === true;
    const isParticipant = chat.buyerId === decoded.uid || chat.vendorId === decoded.uid || (Array.isArray(chat.participants) && chat.participants.includes(decoded.uid));
    if (!isAdmin && !isParticipant) return NextResponse.json({ error: "You do not have access to this conversation" }, { status: 403 });
    const role = isAdmin ? "admin" : chat.vendorId === decoded.uid ? "vendor" : "buyer";
    const messagesSnapshot = await chatRef.collection("messages").get();
    const batch = adminDb.batch();
    messagesSnapshot.docs.forEach((message) => batch.update(message.ref, { read: true, readBy: FieldValue.arrayUnion(decoded.uid), [`readAt.${role}`]: FieldValue.serverTimestamp() }));
    batch.update(chatRef, { [`unreadBy.${role}`]: 0, [`lastReadAt.${role}`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ success: true, marked: messagesSnapshot.size });
  } catch (error: unknown) {
    console.error("Mark support chat read error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to mark support chat as read" }, { status: 500 });
  }
}
