import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

function ownsNotification(data: Record<string, unknown>, uid: string) {
  return ["buyerId", "vendorId", "recipientId", "userId", "adminId"].some((field) => data[field] === uid);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await authenticate(request);
    const { id } = await params;
    const notificationId = decodeURIComponent(id).trim();
    if (!notificationId) return NextResponse.json({ error: "Notification id is required" }, { status: 400 });

    const notificationRef = adminDb.collection("notifications").doc(notificationId);
    const snapshot = await notificationRef.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

    const data = snapshot.data() as Record<string, unknown>;
    if (!ownsNotification(data, decoded.uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await notificationRef.update({
      read: true,
      readAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: notificationId, read: true });
  } catch (error) {
    console.error("Notification read API error:", error);
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Notification could not be updated" }, { status: 401 });
  }
}
