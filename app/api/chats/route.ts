import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type ChatRole = "buyer" | "vendor" | "admin";

class ChatError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ChatError";
    this.status = status;
  }
}

async function actorFor(uid: string): Promise<{ role: ChatRole; email: string }> {
  const adminSnap = await adminDb.collection("admins").doc(uid).get();
  if (adminSnap.exists && adminSnap.data()?.isActive === true) return { role: "admin", email: String(adminSnap.data()?.email || "") };
  const [userSnap, vendorSnap, storeSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("vendors").doc(uid).get(),
    adminDb.collection("stores").doc(uid).get(),
  ]);
  const user = userSnap.data() || {};
  const vendor = vendorSnap.data() || {};
  const store = storeSnap.data() || {};
  const role: ChatRole = user.role === "vendor" || vendorSnap.exists || storeSnap.exists ? "vendor" : "buyer";
  return { role, email: String(user.email || vendor.email || store.email || "") };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new ChatError("Authentication required", 401);
    const decoded = await adminAuth.verifyIdToken(authHeader.slice("Bearer ".length).trim());
    const actor = await actorFor(decoded.uid);
    const body = await request.json() as { participantId?: unknown; participantRole?: unknown; buyerId?: unknown; vendorId?: unknown; subject?: unknown };
    let buyerId = typeof body.buyerId === "string" ? body.buyerId.trim() : "";
    let vendorId = typeof body.vendorId === "string" ? body.vendorId.trim() : "";
    const participantId = typeof body.participantId === "string" ? body.participantId.trim() : "";
    const participantRole = body.participantRole === "vendor" || body.participantRole === "buyer" ? body.participantRole : "";

    if (actor.role === "admin") {
      if (!participantId || !participantRole) throw new ChatError("A buyer or seller must be selected", 400);
      if (participantRole === "buyer") buyerId = participantId;
      else vendorId = participantId;
    } else if (actor.role === "vendor") {
      if (!buyerId) buyerId = participantId;
      if (!buyerId || vendorId && vendorId !== decoded.uid) throw new ChatError("A buyer is required", 400);
      vendorId = decoded.uid;
    } else {
      if (!vendorId) vendorId = participantId;
      if (!vendorId || buyerId && buyerId !== decoded.uid) throw new ChatError("A seller is required", 400);
      buyerId = decoded.uid;
    }

    const chatId = `support_${buyerId || "none"}_${vendorId || "none"}`;
    const chatRef = adminDb.collection("support_chats").doc(chatId);
    const targetId = actor.role === "admin" ? participantId : actor.role === "buyer" ? vendorId : buyerId;
    const [targetUserSnap, targetVendorSnap, targetStoreSnap] = await Promise.all([
      targetId ? adminDb.collection("users").doc(targetId).get() : Promise.resolve(null),
      targetId ? adminDb.collection("vendors").doc(targetId).get() : Promise.resolve(null),
      targetId ? adminDb.collection("stores").doc(targetId).get() : Promise.resolve(null),
    ]);
    const targetData = {
      ...(targetUserSnap?.data() || {}),
      ...(targetVendorSnap?.data() || {}),
      ...(targetStoreSnap?.data() || {}),
    };
    const targetName = String(targetData.storeName || targetData.displayName || targetData.username || targetData.name || targetData.email || targetId);
    const targetEmail = String(targetData.email || "");
    const targetPhone = String(targetData.whatsappNumber || targetData.whatsappPhone || targetData.phone || targetData.phoneNumber || "");

    const result = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(chatRef);
      const now = FieldValue.serverTimestamp();
      const participants = Array.from(new Set([buyerId, vendorId, ...(actor.role === "admin" ? [decoded.uid] : [])].filter(Boolean)));
      const current = existing.data() || {};
      const adminIds = Array.from(new Set([...(Array.isArray(current.adminIds) ? current.adminIds : []), ...(actor.role === "admin" ? [decoded.uid] : [])]));
      const fields = {
        chatId,
        channel: "support",
        status: "open",
        buyerId: buyerId || null,
        vendorId: vendorId || null,
        participants,
        adminIds,
        participantRole: actor.role === "admin" ? participantRole : actor.role === "buyer" ? "vendor" : "buyer",
        userName: targetName,
        userEmail: targetEmail,
        userPhone: targetPhone,
        contactPhone: targetPhone,
        userRole: participantRole || (actor.role === "buyer" ? "vendor" : "buyer"),
        subject: typeof body.subject === "string" ? body.subject.trim() : current.subject || "Support conversation",
        unreadBy: current.unreadBy || { buyer: 0, vendor: 0, admin: 0 },
        createdAt: current.createdAt || now,
        updatedAt: now,
      };
      transaction.set(chatRef, fields, { merge: true });
      return fields;
    });
    return NextResponse.json({ success: true, chat: { id: chatId, ...result } });
  } catch (error: unknown) {
    console.error("Create support chat error:", error);
    const status = error instanceof ChatError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to open support chat" }, { status });
  }
}
