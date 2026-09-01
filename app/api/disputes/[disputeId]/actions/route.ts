import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { notifyFundsReleased, notifyOrderStatus } from "@/lib/novu-events";

const TERMINAL_STATUSES = ["resolved_refund", "resolved_vendor", "closed"];

class DisputeActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DisputeActionError";
    this.status = status;
  }
}

function amountFrom(...values: unknown[]): number {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

async function getDisputeAccess(disputeId: string, token: string) {
  const decodedToken = await adminAuth.verifyIdToken(token);
  const disputeRef = adminDb.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  if (!disputeSnap.exists) {
    return { decodedToken, disputeRef, disputeSnap, dispute: null, isBuyer: false, isVendor: false, isAdmin: false, adminProfile: null };
  }

  const dispute = disputeSnap.data() || {};
  const isBuyer = dispute.buyerId === decodedToken.uid;
  const isVendor = dispute.vendorId === decodedToken.uid;
  const adminSnap = await adminDb.collection("admins").doc(decodedToken.uid).get();
  const adminProfile = adminSnap.exists ? adminSnap.data() || {} : null;
  const isAdmin = adminProfile?.isActive === true;

  return { decodedToken, disputeRef, disputeSnap, dispute, isBuyer, isVendor, isAdmin, adminProfile };
}

async function notifyParties(dispute: Record<string, unknown>, disputeId: string, message: string) {
  const buyerId = typeof dispute.buyerId === "string" ? dispute.buyerId : "";
  const vendorId = typeof dispute.vendorId === "string" ? dispute.vendorId : "";
  const orderId = typeof dispute.orderId === "string" ? dispute.orderId : null;
  const batch = adminDb.batch();
  [buyerId, vendorId].filter(Boolean).forEach((recipientId) => {
    const notificationRef = adminDb.collection("notifications").doc();
    batch.set(notificationRef, {
      [buyerId === recipientId ? "buyerId" : "vendorId"]: recipientId,
      type: "dispute_status",
      disputeId,
      orderId,
      message,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  if (dispute.buyerId || dispute.vendorId) await batch.commit();
}

async function settleDispute(
  disputeId: string,
  requestedStatus: "resolved_refund" | "resolved_vendor",
  resolution: string,
  adminId: string,
  adminEmail: string,
  disputeRef: DocumentReference,
) {
  const outcome = requestedStatus === "resolved_refund" ? "refunded" : "released";

  return adminDb.runTransaction(async (transaction) => {
    const settlementRef = adminDb.collection("dispute_settlements").doc(disputeId);
    const disputeSnap = await transaction.get(disputeRef);
    if (!disputeSnap.exists) throw new DisputeActionError("Dispute not found", 404);

    const dispute = disputeSnap.data() || {};
    const orderId = typeof dispute.orderId === "string" ? dispute.orderId : "";
    const vendorId = typeof dispute.vendorId === "string" ? dispute.vendorId : "";
    const buyerId = typeof dispute.buyerId === "string" ? dispute.buyerId : "";
    if (!orderId || !vendorId || !buyerId) {
      throw new DisputeActionError("Dispute is missing order, buyer, or seller information", 409);
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const storeRef = adminDb.collection("stores").doc(vendorId);
    const settlementSnap = await transaction.get(settlementRef);
    const orderSnap = await transaction.get(orderRef);
    const storeSnap = await transaction.get(storeRef);

    if (settlementSnap.exists) {
      const previous = settlementSnap.data() || {};
      if (previous.outcome !== outcome) {
        throw new DisputeActionError("This dispute has already been settled with a different outcome", 409);
      }
      return { alreadyProcessed: true, outcome, amount: Number(previous.amount || 0) };
    }

    if (!orderSnap.exists) throw new DisputeActionError("Order not found for this dispute", 404);
    if (!storeSnap.exists) throw new DisputeActionError("Seller wallet not found for this dispute", 404);

    const order = orderSnap.data() || {};
    const store = storeSnap.data() || {};
    const existingFundsState = String(order.fundsState || "").toLowerCase();

    // Legacy records may already have been settled before the idempotency marker
    // existed. Record the reconciliation without moving money a second time.
    if (existingFundsState === outcome) {
      const auditRef = adminDb.collection("auditLogs").doc();
      transaction.set(settlementRef, {
        disputeId,
        orderId,
        buyerId,
        vendorId,
        amount: amountFrom(order.escrowReservedAmount, dispute.amount, order.totalAmount),
        outcome,
        status: "reconciled",
        performedBy: adminId,
        performedByEmail: adminEmail,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(disputeRef, {
        status: requestedStatus,
        resolution: resolution || FieldValue.delete(),
        financialOutcome: outcome,
        settlementId: settlementRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(auditRef, {
        action: "dispute_settlement_reconciled",
        targetType: "dispute",
        targetId: disputeId,
        performedBy: adminId,
        performedByEmail: adminEmail,
        details: { outcome, orderId, amount: amountFrom(order.escrowReservedAmount, dispute.amount, order.totalAmount) },
        timestamp: FieldValue.serverTimestamp(),
      });
      return { alreadyProcessed: true, outcome, amount: amountFrom(order.escrowReservedAmount, dispute.amount, order.totalAmount) };
    }

    const amount = amountFrom(order.escrowReservedAmount, dispute.amount, order.totalAmount);
    const escrowBalance = Number(store.escrowBalance ?? 0);
    const availableBalance = Number(store.availableBalance ?? 0);
    const totalSales = Number(store.totalSales ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new DisputeActionError("Dispute has an invalid settlement amount", 409);
    if (!Number.isFinite(escrowBalance) || escrowBalance < amount) {
      throw new DisputeActionError("Escrow ledger mismatch. No funds were moved; reconcile the seller wallet before resolving this dispute.", 409);
    }

    const now = FieldValue.serverTimestamp();
    const commonOrderFields = {
      disputeId,
      fundsState: outcome,
      settlementId: settlementRef.id,
      settlementAmount: amount,
      settledAt: now,
      settledBy: adminId,
      updatedAt: now,
    };

    if (outcome === "released") {
      transaction.update(storeRef, {
        escrowBalance: escrowBalance - amount,
        availableBalance: (Number.isFinite(availableBalance) ? availableBalance : 0) + amount,
        totalSales: (Number.isFinite(totalSales) ? totalSales : 0) + amount,
        updatedAt: now,
      });
      transaction.update(orderRef, {
        status: "COMPLETED",
        releaseReason: "dispute_resolved_vendor",
        releasedAt: now,
        ...commonOrderFields,
      });
    } else {
      // This creates an auditable refund obligation atomically. A real provider
      // refund must transition this record to completed before funds are claimed
      // as returned to the buyer.
      const refundRef = adminDb.collection("refunds").doc(disputeId);
      transaction.set(refundRef, {
        refundId: disputeId,
        disputeId,
        orderId,
        buyerId,
        vendorId,
        amount,
        status: "pending_provider_refund",
        providerReference: order.nombaReference || order.orderId || orderId,
        requestedBy: adminId,
        requestedByEmail: adminEmail,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.update(storeRef, {
        escrowBalance: escrowBalance - amount,
        updatedAt: now,
      });
      transaction.update(orderRef, {
        status: "REFUND_PENDING",
        refundStatus: "pending_provider_refund",
        refundAmount: amount,
        refundRequestedAt: now,
        ...commonOrderFields,
      });
    }

    transaction.set(settlementRef, {
      disputeId,
      orderId,
      buyerId,
      vendorId,
      amount,
      outcome,
      status: outcome === "refunded" ? "refund_pending" : "completed",
      performedBy: adminId,
      performedByEmail: adminEmail,
      createdAt: now,
    });
    transaction.update(disputeRef, {
      status: requestedStatus,
      resolution: resolution || FieldValue.delete(),
      financialOutcome: outcome,
      settlementId: settlementRef.id,
      updatedAt: now,
    });
    const auditRef = adminDb.collection("auditLogs").doc();
    transaction.set(auditRef, {
      action: `dispute_${outcome}`,
      targetType: "dispute",
      targetId: disputeId,
      performedBy: adminId,
      performedByEmail: adminEmail,
      details: { outcome, orderId, buyerId, vendorId, amount },
      timestamp: now,
    });

    return { alreadyProcessed: false, outcome, amount };
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const token = authHeader.slice("Bearer ".length).trim();
    const { disputeId } = await params;
    const access = await getDisputeAccess(disputeId, token);
    if (!access.dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    if (!access.isBuyer && !access.isVendor && !access.isAdmin) return NextResponse.json({ error: "You do not have access to this dispute" }, { status: 403 });

    const messageSnapshot = await access.disputeRef.collection("messages").get();
    const messages = messageSnapshot.docs
      .map((message) => {
        const data = message.data();
        return { id: message.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null };
      })
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error("Dispute messages API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load dispute messages" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const token = authHeader.slice("Bearer ".length).trim();
    const { disputeId } = await params;
    const body = await request.json() as { action?: string; content?: unknown };
    const action = body.action;
    if (!disputeId || !["respond", "mark_read", "update_status"].includes(action || "")) return NextResponse.json({ error: "Invalid dispute action" }, { status: 400 });

    const access = await getDisputeAccess(disputeId, token);
    if (!access.disputeSnap.exists || !access.dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    if (!access.isBuyer && !access.isVendor && !access.isAdmin) return NextResponse.json({ error: "You do not have access to this dispute" }, { status: 403 });

    if (action === "mark_read") {
      await access.disputeRef.update({ read: true, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true });
    }

    if (action === "update_status") {
      if (!access.isAdmin) return NextResponse.json({ error: "Only an active admin can update dispute status" }, { status: 403 });
      const content = (body.content || {}) as { status?: string; resolution?: string };
      const nextStatus = content.status;
      const resolution = typeof content.resolution === "string" ? content.resolution.trim() : "";
      const allowedStatuses = ["open", "under_review", "resolved_refund", "resolved_vendor", "closed"];
      if (!nextStatus || !allowedStatuses.includes(nextStatus)) return NextResponse.json({ error: "Invalid dispute status" }, { status: 400 });

      if (nextStatus === "resolved_refund" || nextStatus === "resolved_vendor") {
        const result = await settleDispute(disputeId, nextStatus, resolution, access.decodedToken.uid, access.decodedToken.email || access.adminProfile?.email || "", access.disputeRef);
        if (!result.alreadyProcessed) {
          await notifyParties(access.dispute, disputeId, nextStatus === "resolved_refund" ? "Admin recorded a buyer refund for this dispute." : "Admin released the escrow funds to the seller.");
          try {
            const settledOrder = await adminDb.collection("orders").doc(access.dispute.orderId).get();
            if (settledOrder.exists) {
              const order = { id: settledOrder.id, ...settledOrder.data(), settlementAmount: result.amount };
              await Promise.allSettled(nextStatus === "resolved_refund"
                ? [notifyOrderStatus(order, "order-refunded")]
                : [notifyFundsReleased(order)]);
            }
          } catch (notificationError) {
            console.error("[NOVU WHATSAPP] Dispute settlement notification failed:", notificationError);
          }
        }
        return NextResponse.json({ success: true, status: nextStatus, financialOutcome: result.outcome, amount: result.amount, alreadyProcessed: result.alreadyProcessed });
      }

      await adminDb.runTransaction(async (transaction) => {
        const freshDispute = await transaction.get(access.disputeRef);
        if (!freshDispute.exists) throw new DisputeActionError("Dispute not found", 404);
        const now = FieldValue.serverTimestamp();
        transaction.update(access.disputeRef, {
          status: nextStatus,
          resolution: resolution || FieldValue.delete(),
          ...(nextStatus === "closed" ? { closedAt: FieldValue.serverTimestamp(), closedBy: access.decodedToken.uid } : {}),
          updatedAt: now,
        });
        const auditRef = adminDb.collection("auditLogs").doc();
        transaction.set(auditRef, {
          action: `dispute_status_${nextStatus}`,
          targetType: "dispute",
          targetId: disputeId,
          performedBy: access.decodedToken.uid,
          performedByEmail: access.decodedToken.email || access.adminProfile?.email || "",
          details: { status: nextStatus, resolution },
          timestamp: now,
        });
      });
      await notifyParties(access.dispute, disputeId, `Dispute status updated to ${nextStatus.replaceAll("_", " ")}.`);
      return NextResponse.json({ success: true, status: nextStatus });
    }

    const currentStatus = String(access.dispute.status || "open");
    if (TERMINAL_STATUSES.includes(currentStatus)) return NextResponse.json({ error: "This dispute is closed and cannot receive new messages" }, { status: 409 });
    const responseText = typeof body.content === "string" ? body.content.trim() : "";
    if (!responseText) return NextResponse.json({ error: "A response message is required" }, { status: 400 });

    const batch = adminDb.batch();
    const messageRef = access.disputeRef.collection("messages").doc();
    const role = access.isAdmin ? "admin" : access.isVendor ? "vendor" : "buyer";
    batch.set(messageRef, {
      senderId: access.decodedToken.uid,
      senderEmail: access.decodedToken.email || access.adminProfile?.email || "",
      senderName: access.isAdmin ? access.adminProfile?.displayName || access.adminProfile?.name || "Admin" : role === "vendor" ? "Seller" : "Buyer",
      role,
      content: responseText,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(access.disputeRef, {
      ...(access.isAdmin ? { adminResponded: true, lastAdminResponse: FieldValue.serverTimestamp() } : access.isVendor ? { vendorResponded: true, lastVendorResponse: FieldValue.serverTimestamp() } : { buyerResponded: true, lastBuyerResponse: FieldValue.serverTimestamp() }),
      status: "under_review",
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (access.isAdmin) {
      const auditRef = adminDb.collection("auditLogs").doc();
      batch.set(auditRef, {
        action: "dispute_admin_message",
        targetType: "dispute",
        targetId: disputeId,
        performedBy: access.decodedToken.uid,
        performedByEmail: access.decodedToken.email || access.adminProfile?.email || "",
        details: { messageId: messageRef.id },
        timestamp: FieldValue.serverTimestamp(),
      });
    }

    const recipients = access.isAdmin ? [access.dispute.buyerId, access.dispute.vendorId] : [access.isVendor ? access.dispute.buyerId : access.dispute.vendorId];
    recipients.filter(Boolean).forEach((recipientId) => {
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        [access.isVendor && !access.isAdmin ? "buyerId" : access.isAdmin && recipientId === access.dispute.buyerId ? "buyerId" : "vendorId"]: recipientId,
        type: "dispute_message",
        disputeId,
        orderId: access.dispute.orderId || null,
        message: `${access.isAdmin ? "Admin" : access.isVendor ? "Seller" : "Buyer"} added a response to your dispute`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    return NextResponse.json({ success: true, messageId: messageRef.id });
  } catch (error: unknown) {
    console.error("Dispute action API error:", error);
    const status = error instanceof DisputeActionError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process dispute action" }, { status });
  }
}
