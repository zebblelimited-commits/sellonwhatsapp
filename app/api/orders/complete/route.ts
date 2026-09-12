import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { notifyFundsReleased, notifyOrderStatus } from "@/lib/novu-events";
import { ESCROW_COLLECTION } from "@/lib/escrow/types";
import { initiateNombaBankTransfer } from "@/lib/payments/nomba/client";

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
        return { alreadyCompleted: true, orderAmount: Number(orderData.escrowReservedAmount || orderData.totalAmount || 0), payoutPending: orderData.sellerPayoutStatus === "pending" };
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

      const escrowRef = adminDb.collection(ESCROW_COLLECTION).doc(String(orderData.checkoutReference || orderId));
      const escrowSnap = await transaction.get(escrowRef);
      if (escrowSnap.exists) {
        const escrowStatus = String(escrowSnap.data()?.status || "");
        if (!["FUNDED", "DISPUTED", "SETTLEMENT_PENDING"].includes(escrowStatus)) {
          throw new CompletionError(`Escrow cannot be released from status ${escrowStatus}`, 409);
        }
      }

      const storeData = storeSnap.data() || {};
      const escrowBalance = Number(storeData.escrowBalance ?? 0);
      const availableBalance = Number(storeData.availableBalance ?? 0);
      const totalSales = Number(storeData.totalSales ?? 0);
      const sellerPayoutAmount = Number(orderData.sellerPayout ?? orderAmount);
      const sellerPayoutSettings = storeData.payoutSettings || {};

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
        sellerPayoutAmount,
        sellerPayoutStatus: "pending",
        sellerPayoutReference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId === orderData.buyerId ? { buyerConfirmed: true } : { vendorConfirmed: true }),
        completedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(storeRef, {
        escrowBalance: escrowBalance - orderAmount,
        availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
        totalSales: (Number.isFinite(totalSales) ? totalSales : 0) + orderAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (escrowSnap.exists) {
        const escrow = escrowSnap.data() || {};
        const orderIds = Array.isArray(escrow.orderIds) ? escrow.orderIds : [];
        transaction.update(escrowRef, {
          status: orderIds.length <= 1 ? "RELEASED" : "SETTLEMENT_PENDING",
          releasedOrderIds: admin.firestore.FieldValue.arrayUnion(orderId),
          lastReleasedOrderId: orderId,
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      transaction.set(adminDb.collection("payouts").doc(`SELLER_${orderId}`), {
        id: `SELLER_${orderId}`,
        payoutId: `SELLER_${orderId}`,
        orderId,
        storeId,
        vendorId: storeId,
        paymentProvider: "nomba",
        reference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        nombaReference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        grossAmount: sellerPayoutAmount,
        netAmount: sellerPayoutAmount,
        amount: sellerPayoutAmount,
        bankName: sellerPayoutSettings.bankName || "",
        accountNumber: sellerPayoutSettings.accountNumber || "",
        bankCode: sellerPayoutSettings.bankCode || "",
        accountName: sellerPayoutSettings.accountName || "",
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { alreadyCompleted: false, orderAmount, sellerPayoutAmount, sellerPayoutSettings, notificationOrder: { id: orderSnap.id, ...orderData } };
    });

    if (!result.alreadyCompleted) {
      const payoutReference = `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
      const payoutSettings = result.sellerPayoutSettings || {};
      const sellerPayoutAmount = Number(result.sellerPayoutAmount ?? result.orderAmount);
      if (!payoutSettings.bankCode || !payoutSettings.accountNumber || !/^\d{10}$/.test(String(payoutSettings.accountNumber).replace(/\D/g, ""))) {
        await adminDb.runTransaction(async (transaction) => {
          const orderRef = adminDb.collection("orders").doc(orderId);
          const payoutRef = adminDb.collection("payouts").doc(payoutReference);
          const [orderSnap, payoutSnap] = await Promise.all([transaction.get(orderRef), transaction.get(payoutRef)]);
          if (!orderSnap.exists || payoutSnap.data()?.status === "completed") return;
          const storeRef = adminDb.collection("stores").doc(String(orderSnap.data()?.storeId || ""));
          const storeSnap = await transaction.get(storeRef);
          const available = Number(storeSnap.data()?.availableBalance ?? 0);
          transaction.update(storeRef, { availableBalance: (Number.isFinite(available) ? available : 0) + sellerPayoutAmount, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          transaction.update(orderRef, { sellerPayoutStatus: "failed", sellerPayoutError: "Seller payout bank details are not configured", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          if (payoutSnap.exists) transaction.update(payoutRef, { status: "failed", failureReason: "Seller payout bank details are not configured", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
      } else {
        try {
          const transfer = await initiateNombaBankTransfer({
            destinationBankCode: String(payoutSettings.bankCode),
            accountNumber: String(payoutSettings.accountNumber).replace(/\D/g, ""),
            accountName: String(payoutSettings.accountName || "").trim() || undefined,
            amount: sellerPayoutAmount,
            narration: `Seller settlement for ${orderId}`,
            reference: payoutReference,
            sourceAccountId: process.env.NOMBA_ESCROW_ACCOUNT_ID?.trim() || undefined,
          });
          await adminDb.collection("payouts").doc(payoutReference).update({ status: "processing", providerReference: transfer.transferRef, providerStatus: transfer.providerStatus || "SUBMITTED", rawProviderResponse: transfer.rawResponse || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          if (transfer.providerStatus === "SUCCESS") await adminDb.collection("orders").doc(orderId).update({ sellerPayoutStatus: "completed", sellerPayoutProviderReference: transfer.transferRef, sellerPayoutCompletedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (payoutError) {
          console.error("[NOMBA] Seller settlement could not be submitted:", payoutError);
          await adminDb.collection("payouts").doc(payoutReference).update({ status: "processing", gatewayError: payoutError instanceof Error ? payoutError.message : "Provider response unavailable", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }

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
