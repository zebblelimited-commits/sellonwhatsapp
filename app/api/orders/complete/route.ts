import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { notifyFundsReleased, notifyOrderStatus } from "@/lib/novu-events";
import { ESCROW_COLLECTION } from "@/lib/escrow/types";
import { recordSuccessfulOrder } from "@/lib/referrals";

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
      const isSeller = sellerId === userId;
      const isBuyer = orderData.buyerId === userId;
      if (!isSeller && !isBuyer) {
        throw new CompletionError("Forbidden", 403);
      }

      // Sellers may complete service work, but they must never release escrow
      // for a physical order. Physical delivery must be confirmed by the
      // buyer after handover/delivery.
      const isServiceOrBooking =
        ["service", "booking", "utility"].includes(String(orderData.productType || orderData.orderType || "").toLowerCase()) ||
        (Array.isArray(orderData.items) && orderData.items.some((item: any) => item.bookingDate || item.bookingSlot));
      if (isSeller && !isServiceOrBooking) {
        throw new CompletionError("Only the buyer can confirm delivery and release funds for a physical order", 403);
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

      const deliveryStatus = String(orderData.deliveryStatus || "").toUpperCase();
      const isSelfArranged = String(orderData.deliveryMode || "").toLowerCase() === "self_arranged" || String(orderData.shippingMethod || "").toLowerCase() === "self_arranged";
      if (isBuyer && isServiceOrBooking) {
        const serviceReady = ["WORK_DONE", "COMPLETED_PENDING_BUYER", "SHIPPED"].includes(normalizedStatus);
        if (!serviceReady) throw new CompletionError("The seller has not marked this service as completed yet", 409);
      }
      if (isBuyer && !isServiceOrBooking) {
        // Aggregator delivery must be reported delivered by the courier. A
        // self-arranged order has no courier callback, so seller handover
        // moves it to SHIPPED/IN_TRANSIT and the buyer confirms on receipt.
        const physicalReady = isSelfArranged
          ? ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(normalizedStatus) || ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(deliveryStatus)
          : normalizedStatus === "COMPLETED" || normalizedStatus === "DELIVERED" || deliveryStatus === "DELIVERED";
        if (!physicalReady) throw new CompletionError("Delivery must be completed before you can release the held funds", 409);
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
      if (!Number.isFinite(sellerPayoutAmount) || sellerPayoutAmount <= 0) {
        throw new CompletionError("Order has an invalid seller settlement amount", 409);
      }

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
        sellerPayoutStatus: "available",
        sellerPayoutReference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        sellerPayoutAvailableAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId === orderData.buyerId ? { buyerConfirmed: true } : { vendorConfirmed: true }),
        completedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(storeRef, {
        escrowBalance: escrowBalance - orderAmount,
        // Order completion credits the seller ledger first. The seller must
        // explicitly withdraw this balance; no automatic bank transfer is
        // initiated from the order-completion request.
        availableBalance: (Number.isFinite(availableBalance) ? availableBalance : 0) + sellerPayoutAmount,
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
        paymentProvider: "internal_ledger",
        reference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        nombaReference: `SELLER_${orderId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50),
        grossAmount: sellerPayoutAmount,
        netAmount: sellerPayoutAmount,
        amount: sellerPayoutAmount,
        settlementType: "order_release",
        balanceCreditedAt: admin.firestore.FieldValue.serverTimestamp(),
        providerStatus: "AVAILABLE_BALANCE",
        bankName: sellerPayoutSettings.bankName || "",
        accountNumber: sellerPayoutSettings.accountNumber || "",
        bankCode: sellerPayoutSettings.bankCode || "",
        accountName: sellerPayoutSettings.accountName || "",
        status: "available",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { alreadyCompleted: false, orderAmount, sellerPayoutAmount, notificationOrder: { id: orderSnap.id, ...orderData } };
    });

    if (!result.alreadyCompleted && result.notificationOrder) {
      try {
        await recordSuccessfulOrder(
          orderId,
          String((result.notificationOrder as Record<string, any>).buyerId || "") || undefined,
          String((result.notificationOrder as Record<string, any>).storeId || (result.notificationOrder as Record<string, any>).vendorId || "") || undefined,
        );
      } catch (referralError) {
        console.error("Referral order reward could not be recorded:", referralError);
      }
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
