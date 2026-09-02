import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";
import { inventoryAdjustment } from "@/lib/inventory";
import { notifyOrderPaymentConfirmed } from "@/lib/novu-events";

class PaymentConfirmationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PaymentConfirmationError";
    this.status = status;
  }
}

const jsonError = (error: unknown, status = 500) => NextResponse.json(
  { error: error instanceof Error ? error.message : "Payment confirmation failed" },
  { status },
);

const amountOf = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const statusOf = (value: unknown) => {
  const status = String(value || " ").trim().toUpperCase();
  if (["PAID", "HELD"].includes(status)) return "PAID_HELD";
  if (["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
  return status;
};

const orderSummaries = (orders: Array<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>) =>
  orders.map(({ ref, data }) => ({
    id: ref.id,
    isBooking: data.isBooking === true,
    buyerId: typeof data.buyerId === "string" ? data.buyerId : "",
    status: String(data.status || ""),
    total: amountOf(data.total ?? data.totalAmount ?? data.amount),
    totalAmount: amountOf(data.totalAmount ?? data.total ?? data.amount),
  }));

type ProviderTransaction = {
  status?: unknown;
  responseCode?: unknown;
  transactionId?: unknown;
  transactionReference?: unknown;
  reference?: unknown;
};

type VerificationPayload = {
  code?: unknown;
  status?: unknown;
  data?: {
    success?: unknown;
    status?: unknown;
    responseCode?: unknown;
    reference?: unknown;
    transaction?: ProviderTransaction;
    transactionDetails?: {
      paymentReference?: unknown;
      statusCode?: unknown;
    };
  };
};

const getNombaToken = async (authBaseUrl: string) => {
  const response = await fetch(`${authBaseUrl}/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: process.env.NOMBA_ACCOUNT_ID || "",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.NOMBA_CLIENT_ID,
      client_secret: process.env.NOMBA_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new PaymentConfirmationError("Payment provider authentication failed", 502);
  const data = await response.json() as { data?: { access_token?: string } };
  if (!data.data?.access_token) throw new PaymentConfirmationError("Payment provider returned no verification token", 502);
  return data.data.access_token;
};

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new PaymentConfirmationError("Unauthorized", 401);
    const decoded = await adminAuth.verifyIdToken(authorization.slice("Bearer ".length).trim());

    const body = await request.json() as { orderReference?: string };
    const orderReference = typeof body.orderReference === "string" ? body.orderReference.trim() : "";
    if (!orderReference) throw new PaymentConfirmationError("Order reference is required", 400);

    // ✅ MULTI-SELLER SUPPORT: Query by checkoutReference field
    let initialOrdersSnap = await adminDb.collection("orders").where("checkoutReference", "==", orderReference).get();

    // Fallback for legacy single-seller orders where doc ID was the reference
    if (initialOrdersSnap.empty) {
      const fallbackSnap = await adminDb.collection("orders").doc(orderReference).get();
      if (!fallbackSnap.exists) throw new PaymentConfirmationError("Order not found", 404);

      // Create a mock structure for uniform processing
      initialOrdersSnap = {
        empty: false,
        docs: [fallbackSnap]
      } as any;
    }

    const ordersToProcess = initialOrdersSnap.docs.map(doc => ({ ref: doc.ref, data: doc.data() }));

    // Verify all orders belong to the buyer and check initial state
    for (const { data } of ordersToProcess) {
      if (data.buyerId !== decoded.uid) throw new PaymentConfirmationError("Forbidden", 403);

      const initialFundsState = String(data.fundsState || "").trim().toLowerCase();
      if (initialFundsState === "held" && data.escrowReservedAt) {
        return NextResponse.json({
          success: true,
          confirmed: true,
          status: "PAID_HELD",
          alreadyProcessed: true,
          orders: orderSummaries(ordersToProcess),
        });
      }
      if (["released", "refunded", "refund_pending"].includes(initialFundsState)) {
        return NextResponse.json({
          success: true,
          confirmed: true,
          status: String(data.status || ""),
          orders: orderSummaries(ordersToProcess),
        });
      }
    }

    const nombaOrigin = process.env.NOMBA_SANDBOX_URL || "https://sandbox.nomba.com";
    const isSandbox = Boolean(process.env.NOMBA_SANDBOX_URL) || process.env.NEXT_PUBLIC_ENVIRONMENT === "sandbox";
    const authBaseUrl = `${nombaOrigin}/v1`;
    const token = await getNombaToken(authBaseUrl);

    const verificationUrl = isSandbox
      ? `${nombaOrigin}/sandbox/checkout/transaction?idType=orderReference&id=${encodeURIComponent(orderReference)}`
      : `${nombaOrigin}/v1/checkout/confirm-transaction-receipt`;

    const verificationResponse = await fetch(verificationUrl, {
      method: isSandbox ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        accountId: process.env.NOMBA_ACCOUNT_ID || "",
        "Content-Type": "application/json",
      },
      ...(isSandbox ? {} : { body: JSON.stringify({ orderReference }) }),
      cache: "no-store",
    });

    const verificationPayload = await verificationResponse.json().catch(() => ({})) as VerificationPayload;
    const providerStatus = String(
      verificationPayload.data?.status || verificationPayload.status || verificationPayload.data?.transaction?.status || verificationPayload.data?.transactionDetails?.statusCode || "",
    ).toUpperCase();
    const providerCode = String(
      verificationPayload.code || verificationPayload.data?.responseCode || verificationPayload.data?.transaction?.responseCode || "",
    ).toUpperCase();

    const confirmed = verificationResponse.ok && (
      verificationPayload.data?.success === true ||
      ["SUCCESS", "SUCCESSFUL", "COMPLETED", "APPROVED", "PAYMENT_SUCCESS", "PAYMENT SUCCESSFUL"].includes(providerStatus) ||
      providerStatus.includes("SUCCESS") ||
      providerCode === "00"
    );

    if (!confirmed) {
      return NextResponse.json({ success: true, confirmed: false, status: "PENDING_PAYMENT", message: "Payment is still awaiting provider confirmation." }, { status: 202 });
    }

    const providerReference = String(
      verificationPayload.data?.transaction?.transactionId ||
      verificationPayload.data?.transaction?.transactionReference ||
      verificationPayload.data?.transaction?.reference ||
      verificationPayload.data?.transactionDetails?.paymentReference ||
      verificationPayload.data?.reference ||
      orderReference,
    );

    const results = await adminDb.runTransaction(async (transaction) => {
      const processedOrders = [];

      for (const { ref, data: order } of ordersToProcess) {
        const orderSnap = await transaction.get(ref);
        if (!orderSnap.exists) continue;

        const currentOrder = orderSnap.data() || {};
        if (currentOrder.buyerId !== decoded.uid) throw new PaymentConfirmationError("Forbidden", 403);

        const fundsState = String(currentOrder.fundsState || "").trim().toLowerCase();
        const reservedAmount = amountOf(currentOrder.escrowReservedAmount ?? currentOrder.escrowReservationAmount);

        if (fundsState === "held" && reservedAmount > 0 && currentOrder.escrowReservedAt) {
          processedOrders.push({ alreadyProcessed: true, status: statusOf(currentOrder.status), amount: reservedAmount });
          continue;
        }

        if (["released", "refunded", "refund_pending"].includes(fundsState)) {
          throw new PaymentConfirmationError("This order is already settled", 409);
        }

        const orderAmount = amountOf(
          currentOrder.escrowReservedAmount ??
          currentOrder.escrowReservationAmount ??
          currentOrder.escrowAmount ??
          currentOrder.totalAmount ??
          currentOrder.total,
        );

        // ✅ Support both vendorId (legacy) and storeId (new multi-seller)
        const vendorId = typeof currentOrder.vendorId === "string" ? currentOrder.vendorId.trim() : (typeof currentOrder.storeId === "string" ? currentOrder.storeId.trim() : "");

        if (!vendorId || orderAmount <= 0) throw new PaymentConfirmationError("Order escrow data is invalid", 409);

        const storeRef = adminDb.collection("stores").doc(vendorId);
        const storeSnap = await transaction.get(storeRef);
        if (!storeSnap.exists) throw new PaymentConfirmationError("Seller wallet not found", 404);

        const productId = typeof currentOrder.productId === "string" ? currentOrder.productId.trim() : "";
        const productRef = productId ? adminDb.collection("products").doc(productId) : null;
        const productSnap = productRef ? await transaction.get(productRef) : null;

        const store = storeSnap.data() || {};
        const rawEscrowBalance = Number(store.escrowBalance ?? 0);
        if (!Number.isFinite(rawEscrowBalance)) throw new PaymentConfirmationError("Seller escrow ledger is invalid", 409);

        let escrowBalance = rawEscrowBalance;
        let ledgerWasRebuilt = false;

        if (escrowBalance < 0) {
          const idField = typeof currentOrder.vendorId === "string" ? "vendorId" : "storeId";
          const vendorOrders = await transaction.get(adminDb.collection("orders").where(idField, "==", vendorId));
          escrowBalance = vendorOrders.docs.reduce((total, vendorOrderSnap) => {
            const vendorOrder = vendorOrderSnap.data() || {};
            if (String(vendorOrder.fundsState || "").trim().toLowerCase() !== "held") return total;
            const amount = amountOf(vendorOrder.escrowReservedAmount ?? vendorOrder.escrowReservationAmount);
            return vendorOrder.escrowReservedAt && amount > 0 ? total + amount : total;
          }, 0);
          ledgerWasRebuilt = true;
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const currentStatus = statusOf(currentOrder.status);
        const nextStatus = ["SHIPPED", "DISPUTED"].includes(currentStatus) ? currentOrder.status : "PAID_HELD";

        let inventoryError = null;
        let orderUpdate = {};

        if (productRef && productSnap?.exists) {
          const inv = inventoryAdjustment(productSnap.data() || {}, currentOrder, now, orderReference);
          if (inv.error) inventoryError = inv.error;
          else {
            if (inv.tracked) transaction.update(productRef, inv.productUpdate);
            orderUpdate = inv.orderUpdate || {};
          }
        }

        if (inventoryError) throw new PaymentConfirmationError(inventoryError, 409);

        transaction.update(storeRef, { escrowBalance: escrowBalance + orderAmount, updatedAt: now });

        const finalUpdate = {
          ...orderUpdate,
          status: nextStatus,
          paymentStatus: "paid",
          paymentReference: providerReference,
          fundsState: "held",
          escrowReservedAmount: orderAmount,
          escrowReservedAt: now,
          updatedAt: now,
        };

        transaction.update(ref, finalUpdate);

        transaction.set(adminDb.collection("auditLogs").doc(), {
          action: "payment_receipt_verified_and_escrow_reserved",
          targetType: "order",
          targetId: orderReference,
          performedBy: `buyer:${decoded.uid}`,
          performedByEmail: decoded.email || "",
          details: {
            orderId: currentOrder.orderId,
            amount: orderAmount,
            providerReference,
            providerStatus,
            providerCode,
            ledgerWasRebuilt,
            previousEscrowBalance: rawEscrowBalance,
            rebuiltEscrowBalance: ledgerWasRebuilt ? escrowBalance : null
          },
          timestamp: now,
        });

        processedOrders.push({ alreadyProcessed: false, status: nextStatus, amount: orderAmount });
      }

      return processedOrders;
    });

    // Notify only after the escrow transaction has committed. The Novu fan-out
    // is isolated from payment confirmation and is idempotent across retries.
    try {
      await Promise.allSettled(
        results.map((result, index) => result.alreadyProcessed
          ? Promise.resolve()
          : notifyOrderPaymentConfirmed({
            id: ordersToProcess[index]?.ref.id,
            ...ordersToProcess[index]?.data,
          })),
      );
    } catch (notificationError) {
      console.error("[NOVU WHATSAPP] Payment confirmation fan-out failed:", notificationError);
    }

    return NextResponse.json({
      success: true,
      confirmed: true,
      results,
      orders: orderSummaries(ordersToProcess),
    });
  } catch (error: unknown) {
    console.error("Order payment confirmation error:", error);
    return jsonError(error, error instanceof PaymentConfirmationError ? error.status : 502);
  }
}
