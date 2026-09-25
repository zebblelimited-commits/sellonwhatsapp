import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { jsonValue, timestampValue } from "@/lib/api/public-catalog";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth.verifyIdToken(header.slice("Bearer ".length).trim());
}

function numberParam(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function notificationView(id: string, data: Record<string, unknown>) {
  return {
    id,
    type: typeof data.type === "string" ? data.type : "system",
    priority: typeof data.priority === "string" ? data.priority : "low",
    title: typeof data.title === "string" ? data.title : "Notification",
    body: typeof data.body === "string" ? data.body : "",
    read: data.read === true,
    actionable: data.actionable === true,
    actionLabel: typeof data.actionLabel === "string" ? data.actionLabel : undefined,
    actionUrl: typeof data.actionUrl === "string" ? data.actionUrl : undefined,
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    orderId: typeof data.orderId === "string" ? data.orderId : undefined,
    disputeId: typeof data.disputeId === "string" ? data.disputeId : undefined,
    storeId: typeof data.storeId === "string" ? data.storeId : undefined,
    createdAt: jsonValue(data.createdAt),
    updatedAt: jsonValue(data.updatedAt),
    readAt: jsonValue(data.readAt),
  };
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    const limit = numberParam(new URL(request.url).searchParams.get("limit"), 50, 100);
    const ownerFields = ["buyerId", "vendorId", "recipientId", "userId", "adminId"] as const;
    const snapshots = await Promise.all(ownerFields.map((field) => adminDb
      .collection("notifications")
      .where(field, "==", decoded.uid)
      .limit(100)
      .get()));

    const documents = new Map<string, Record<string, unknown>>();
    for (const snapshot of snapshots) {
      for (const item of snapshot.docs) documents.set(item.id, item.data() as Record<string, unknown>);
    }

    const notifications = [...documents.entries()]
      .sort((left, right) => timestampValue(right[1].createdAt) - timestampValue(left[1].createdAt))
      .slice(0, limit)
      .map(([id, data]) => notificationView(id, data));

    return NextResponse.json({
      notifications: jsonValue(notifications),
      unreadCount: notifications.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Unauthorized" : "Notifications could not be loaded" }, { status: 401 });
  }
}
