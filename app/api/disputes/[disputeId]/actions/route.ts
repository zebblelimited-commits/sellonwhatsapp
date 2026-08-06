import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

async function getDisputeAccess(disputeId: string, token: string) {
  const decodedToken = await adminAuth.verifyIdToken(token);
  const disputeRef = adminDb.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  if (!disputeSnap.exists) return { decodedToken, disputeRef, disputeSnap, dispute: null, isBuyer: false, isVendor: false, isAdmin: false, adminProfile: null };

  const dispute = disputeSnap.data() || {};
  const isBuyer = dispute.buyerId === decodedToken.uid;
  const isVendor = dispute.vendorId === decodedToken.uid;
  const adminSnap = await adminDb.collection("admins").doc(decodedToken.uid).get();
  const adminProfile = adminSnap.exists ? adminSnap.data() || {} : null;
  const isAdmin = Boolean(adminProfile?.isActive);

  return { decodedToken, disputeRef, disputeSnap, dispute, isBuyer, isVendor, isAdmin, adminProfile };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { disputeId } = await params;
    const access = await getDisputeAccess(disputeId, token);
    if (!access.dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    if (!access.isBuyer && !access.isVendor && !access.isAdmin) {
      return NextResponse.json({ error: "You do not have access to this dispute" }, { status: 403 });
    }

    const messageSnapshot = await access.disputeRef.collection("messages").get();
    const messages = messageSnapshot.docs
      .map((message) => {
        const data = message.data();
        return {
          id: message.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        };
      })
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error("Dispute messages API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dispute messages" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { disputeId } = await params;
    const { action, content } = await request.json();

    if (!disputeId || !["respond", "mark_read", "update_status"].includes(action)) {
      return NextResponse.json({ error: "Invalid dispute action" }, { status: 400 });
    }

    const { decodedToken, disputeRef, disputeSnap, dispute, isBuyer, isVendor, isAdmin, adminProfile } = await getDisputeAccess(disputeId, token);
    if (!disputeSnap.exists || !dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    if (!isBuyer && !isVendor && !isAdmin) {
      return NextResponse.json({ error: "You do not have access to this dispute" }, { status: 403 });
    }

    if (action === "mark_read") {
      await disputeRef.update({
        read: true,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    if (action === "update_status") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only an active admin can update dispute status" }, { status: 403 });
      }

      const allowedStatuses = ["open", "under_review", "resolved_refund", "resolved_vendor", "closed"];
      if (typeof content?.status !== "string" || !allowedStatuses.includes(content.status)) {
        return NextResponse.json({ error: "Invalid dispute status" }, { status: 400 });
      }

      const resolution = typeof content?.resolution === "string" ? content.resolution.trim() : "";
      const isResolved = ["resolved_refund", "resolved_vendor", "closed"].includes(content.status);
      await disputeRef.update({
        status: content.status,
        resolution: resolution || FieldValue.delete(),
        ...(isResolved
          ? {
              resolvedAt: FieldValue.serverTimestamp(),
              resolvedBy: decodedToken.uid,
              resolvedByEmail: decodedToken.email || adminProfile?.email || "",
            }
          : {
              resolvedAt: FieldValue.delete(),
              resolvedBy: FieldValue.delete(),
              resolvedByEmail: FieldValue.delete(),
            }),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Keep both parties informed without exposing admin credentials to the client.
      const notificationBatch = adminDb.batch();
      [dispute.buyerId, dispute.vendorId].filter(Boolean).forEach((recipientId) => {
        const notificationRef = adminDb.collection("notifications").doc();
        notificationBatch.set(notificationRef, {
          [dispute.buyerId === recipientId ? "buyerId" : "vendorId"]: recipientId,
          type: "dispute_status",
          disputeId,
          orderId: dispute.orderId || null,
          message: `Dispute status updated to ${content.status.replaceAll("_", " ")}`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await notificationBatch.commit();

      return NextResponse.json({ success: true, status: content.status });
    }

    const responseText = typeof content === "string" ? content.trim() : "";
    if (!responseText) {
      return NextResponse.json({ error: "A response message is required" }, { status: 400 });
    }

    const batch = adminDb.batch();
    const messageRef = disputeRef.collection("messages").doc();

    const role = isAdmin ? "admin" : isVendor ? "vendor" : "buyer";
    batch.set(messageRef, {
      senderId: decodedToken.uid,
      senderEmail: decodedToken.email || adminProfile?.email || "",
      senderName: isAdmin ? adminProfile?.displayName || adminProfile?.name || "Admin" : role === "vendor" ? "Seller" : "Buyer",
      role,
      content: responseText,
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.update(disputeRef, {
      ...(isAdmin
        ? {
            adminResponded: true,
            lastAdminResponse: FieldValue.serverTimestamp(),
          }
        : isVendor
        ? {
            vendorResponded: true,
            lastVendorResponse: FieldValue.serverTimestamp(),
          }
        : {
            buyerResponded: true,
            lastBuyerResponse: FieldValue.serverTimestamp(),
          }),
      status: "under_review",
      updatedAt: FieldValue.serverTimestamp(),
    });

    const recipients = isAdmin
      ? [dispute.buyerId, dispute.vendorId]
      : [isVendor ? dispute.buyerId : dispute.vendorId];
    recipients.filter(Boolean).forEach((recipientId) => {
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        [isVendor && !isAdmin ? "buyerId" : isAdmin && recipientId === dispute.buyerId ? "buyerId" : "vendorId"]: recipientId,
        type: "dispute_message",
        disputeId,
        orderId: dispute.orderId || null,
        message: `${isAdmin ? "Admin" : isVendor ? "Seller" : "Buyer"} added a response to your dispute`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    return NextResponse.json({ success: true, messageId: messageRef.id });
  } catch (error: unknown) {
    console.error("Dispute action API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process dispute action" },
      { status: 500 }
    );
  }
}
