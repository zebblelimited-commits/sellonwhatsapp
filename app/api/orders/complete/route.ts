import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { notifyFundsReleased, notifyOrderStatus } from "@/lib/novu-events";

class CompletionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CompletionError";
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;
    const { orderId } = await request.json();
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const result = await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection("orders").doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new CompletionError("Order not found", 404);

      const orderData = orderSnap.data() || {};
      const sellerId = typeof orderData.storeId === "string" ? orderData.storeId : orderData.vendorId;
      if (sellerId !== userId && orderData.buyerId !== userId) {
        throw new CompletionError("Forbidden", 403);
      }

      const rawStatus = String(orderData.status || "").toUpperCase();
      const normalizedStatus = ["COMPLETED", "DELIVERED"].includes(rawStatus)
        ? "COMPLETED"
        : ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(rawStatus)
          ? "SHIPPED"
          : ["PAID", "HELD", "PAID_HELD"].includes(rawStatus)
            ? "PAID_HELD"
            : rawStatus;
      const fundsState = String(orderData.fundsState || "").toLowerCase();
      if (normalizedStatus === "COMPLETED" || fundsState === "released") {
        return { alreadyCompleted: true, orderAmount: Number(orderData.totalAmount || 0) };
      }
      if (["refunded", "refund_pending"].includes(fundsState)) {
        throw new CompletionError("This order has already been refunded and cannot release funds", 409);
      }

      // Updated to allow service/work completions in addition to physical shipping statuses
      if (!["PAID_HELD", "SHIPPED", "OUT_FOR_DELIVERY", "WORK_DONE", "COMPLETED_PENDING_BUYER"].includes(normalizedStatus)) {
        throw new CompletionError(`Order cannot be completed from status ${orderData.status || "unknown"}`, 409);
      }

      const orderAmount = Number(orderData.escrowReservedAmount ?? orderData.totalAmount ?? 0);
      if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
        throw new CompletionError("Order has an invalid amount", 409);
      }

      const storeId = typeof orderData.storeId === "string" ? orderData.storeId : orderData.vendorId;
      if (!storeId || typeof storeId !== "string") {
        throw new CompletionError("Order has no vendor wallet", 409);
      }

      const storeRef = adminDb.collection("stores").doc(storeId);
      const storeSnap = await transaction.get(storeRef);
      if (!storeSnap.exists) throw new CompletionError("Vendor wallet not found", 404);

      const storeData = storeSnap.data() || {};
      const escrowBalance = Number(storeData.escrowBalance ?? 0);
      const availableBalance = Number(storeData.availableBalance ?? 0);
      const totalSales = Number(storeData.totalSales ?? 0);

      // Never use FieldValue.increment(-amount) here. The transaction must verify
      // the current ledger before setting the exact non-negative result.
      if (!Number.isFinite(escrowBalance) || escrowBalance < orderAmount) {
        throw new CompletionError(
          "Escrow ledger mismatch. Funds were not released; please contact support before retrying.",
          409
        );
      }

      transaction.update(orderRef, {
        status: "COMPLETED",
        fundsState: "released",
        settlementId: `order_release_${orderId}`,
        settlementAmount: orderAmount,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId === orderData.buyerId ? { buyerConfirmed: true } : { vendorConfirmed: true }),
        completedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(storeRef, {
        escrowBalance: escrowBalance - orderAmount,
        availableBalance: (Number.isFinite(availableBalance) ? availableBalance : 0) + orderAmount,
        totalSales: (Number.isFinite(totalSales) ? totalSales : 0) + orderAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { alreadyCompleted: false, orderAmount, notificationOrder: { id: orderSnap.id, ...orderData } };
    });

    if (!result.alreadyCompleted && result.notificationOrder) {
      try {
        await Promise.allSettled([
          notifyOrderStatus(result.notificationOrder, "order-delivered"),
          notifyFundsReleased({ ...result.notificationOrder, settlementAmount: result.orderAmount }),
        ]);
      } catch (notificationError) {
        console.error("[NOVU WHATSAPP] Completion notification fan-out failed:", notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      alreadyCompleted: result.alreadyCompleted,
      message: result.alreadyCompleted
        ? "Order was already completed."
        : "Order marked as completed and funds released.",
    });
  } catch (error: unknown) {
    console.error("Complete Order API Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = error instanceof CompletionError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
