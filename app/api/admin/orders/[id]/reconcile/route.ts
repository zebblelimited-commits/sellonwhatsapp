import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

class OrderReconciliationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderReconciliationError";
    this.status = status;
  }
}

const jsonError = (error: unknown, status = 500) => NextResponse.json(
  { error: error instanceof Error ? error.message : "Order reconciliation failed" },
  { status },
);

const finiteAmount = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizedStatus = (value: unknown) => {
  const status = String(value || "").trim().toUpperCase();
  if (["PAID", "HELD"].includes(status)) return "PAID_HELD";
  if (["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
  return status;
};

/**
 * Reconciles a legacy paid order whose payment succeeded but whose webhook did
 * not reserve the seller's escrow. The provider reference is deliberately
 * required: this endpoint must never turn an unverified order into held funds.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { id } = await params;
    const body = await request.json() as {
      action?: unknown;
      reason?: unknown;
      providerReference?: unknown;
    };
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const providerReference = typeof body.providerReference === "string" ? body.providerReference.trim() : "";

    if (!id) throw new OrderReconciliationError("Order ID is required", 400);
    if (action !== "reserve_escrow") throw new OrderReconciliationError("Unsupported reconciliation action", 400);
    if (!providerReference) throw new OrderReconciliationError("A verified provider reference is required", 400);
    if (!reason) throw new OrderReconciliationError("A reconciliation reason is required", 400);

    const result = await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection("orders").doc(id);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new OrderReconciliationError("Order not found", 404);

      const order = orderSnap.data() || {};
      const orderStatus = normalizedStatus(order.status);
      const fundsState = String(order.fundsState || "").trim().toLowerCase();
      const orderAmount = finiteAmount(
        order.escrowReservedAmount ?? order.escrowReservationAmount ?? order.totalAmount,
      );
      const existingReservationAmount = finiteAmount(order.escrowReservedAmount ?? order.escrowReservationAmount);

      // The reservation marker is the idempotency key. A retried request must
      // never increase escrow a second time.
      if (existingReservationAmount > 0 && order.escrowReservedAt) {
        return {
          alreadyProcessed: true,
          amount: existingReservationAmount,
          status: orderStatus,
          fundsState,
        };
      }

      if (["COMPLETED", "REFUNDED", "CANCELLED"].includes(orderStatus) || ["released", "refunded", "refund_pending"].includes(fundsState)) {
        throw new OrderReconciliationError("This order is already settled and cannot receive escrow", 409);
      }
      if (!["PENDING_PAYMENT", "PAID_HELD", "SHIPPED", "DISPUTED"].includes(orderStatus)) {
        throw new OrderReconciliationError("Only a verified paid order can be reconciled into escrow", 409);
      }
      if (fundsState === "held" || order.escrowReservedAt) {
        throw new OrderReconciliationError("The order has incomplete escrow metadata; review it before retrying", 409);
      }
      if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
        throw new OrderReconciliationError("Order has an invalid escrow amount", 409);
      }

      const vendorId = typeof order.vendorId === "string" ? order.vendorId.trim() : "";
      if (!vendorId) throw new OrderReconciliationError("Order has no seller wallet reference", 409);

      const storeRef = adminDb.collection("stores").doc(vendorId);
      const storeSnap = await transaction.get(storeRef);
      if (!storeSnap.exists) throw new OrderReconciliationError("Seller wallet not found", 404);

      const store = storeSnap.data() || {};
      const rawEscrowBalance = Number(store.escrowBalance ?? 0);
      if (!Number.isFinite(rawEscrowBalance)) {
        throw new OrderReconciliationError("Seller escrow is not a valid number; no balance was changed", 409);
      }

      let escrowBalance = rawEscrowBalance;
      let ledgerWasRebuilt = false;
      if (escrowBalance < 0) {
        // A negative escrow value is impossible in the current ledger. Rebuild
        // it from canonical held-order reservations before adding this verified
        // payment, all inside the same transaction.
        const vendorOrders = await transaction.get(
          adminDb.collection("orders").where("vendorId", "==", vendorId),
        );
        escrowBalance = vendorOrders.docs.reduce((total, vendorOrderSnap) => {
          const vendorOrder = vendorOrderSnap.data() || {};
          if (String(vendorOrder.fundsState || "").trim().toLowerCase() !== "held") return total;
          const reservedAt = vendorOrder.escrowReservedAt;
          const reservedAmount = finiteAmount(vendorOrder.escrowReservedAmount ?? vendorOrder.escrowReservationAmount);
          return reservedAt && reservedAmount > 0 ? total + reservedAmount : total;
        }, 0);
        ledgerWasRebuilt = true;
      }

      const now = FieldValue.serverTimestamp();
      const nextStatus = orderStatus === "PENDING_PAYMENT" || orderStatus === "PAID_HELD"
        ? "PAID_HELD"
        : orderStatus === "SHIPPED"
          ? "SHIPPED"
          : order.status;
      transaction.update(storeRef, {
        escrowBalance: escrowBalance + orderAmount,
        updatedAt: now,
      });
      transaction.update(orderRef, {
        status: nextStatus,
        paymentStatus: "paid",
        paymentReference: providerReference,
        fundsState: "held",
        escrowReservedAmount: orderAmount,
        escrowReservedAt: now,
        reconciledAt: now,
        reconciledBy: access.admin.uid,
        reconciledByEmail: access.admin.email || "",
        reconciliationReason: reason,
        updatedAt: now,
      });
      transaction.set(adminDb.collection("auditLogs").doc(), {
        action: "order_escrow_reconciled",
        targetType: "order",
        targetId: id,
        performedBy: access.admin.uid,
        performedByEmail: access.admin.email || "",
        details: {
          amount: orderAmount,
          providerReference,
          reason,
          previousStatus: orderStatus,
          previousFundsState: fundsState || null,
          previousEscrowBalance: rawEscrowBalance,
          ledgerWasRebuilt,
          rebuiltEscrowBalance: ledgerWasRebuilt ? escrowBalance : null,
          nextEscrowBalance: escrowBalance + orderAmount,
        },
        timestamp: now,
      });

      return { alreadyProcessed: false, amount: orderAmount, status: nextStatus, fundsState: "held" };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Admin order escrow reconciliation error:", error);
    return jsonError(error, error instanceof OrderReconciliationError ? error.status : 500);
  }
}
