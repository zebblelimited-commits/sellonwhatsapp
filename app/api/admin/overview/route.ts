import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

function numberValue(data: Record<string, unknown>, ...fields: string[]) {
  for (const field of fields) {
    const value = Number(data[field]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function formatAmount(value: number) {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

function statusOf(data: Record<string, unknown>) {
  return String(data.status || "").trim().toLowerCase();
}

function timestampOf(data: Record<string, unknown>, ...fields: string[]) {
  for (const field of fields) {
    const value = data[field];
    if (value && typeof value === "object") {
      const timestamp = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
      if (typeof timestamp.toMillis === "function") {
        const millis = timestamp.toMillis();
        if (Number.isFinite(millis)) return millis;
      }
      const seconds = timestamp.seconds ?? timestamp._seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
    if (typeof value === "string" || typeof value === "number") {
      const millis = typeof value === "number" ? value : Date.parse(value);
      if (Number.isFinite(millis)) return millis;
    }
  }
  return 0;
}

function readableStatus(status: string) {
  return status ? status.replace(/_/g, " ") : "updated";
}

function shortId(value: unknown) {
  const id = String(value || "");
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id || "unknown";
}

function isPaid(status: string) {
  return ["active", "paid", "successful", "success", "completed", "approved", "processing", "paid_held", "shipped", "disputed"].includes(status);
}

function isOrderRevenue(status: string) {
  return !["", "pending", "pending_payment", "failed", "cancelled", "canceled", "refunded", "reversed"].includes(status);
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const [ordersSnapshot, verificationsSnapshot, subscriptionsSnapshot, boostsSnapshot, storesSnapshot, payoutsSnapshot, auditSnapshot] = await Promise.all([
      adminDb.collection("orders").limit(10000).get(),
      adminDb.collection("store_verifications").limit(10000).get(),
      adminDb.collection("subscriptions").limit(10000).get(),
      adminDb.collection("boosts").limit(10000).get(),
      adminDb.collection("stores").limit(10000).get(),
      adminDb.collection("payouts").limit(10000).get(),
      adminDb.collection("auditLogs").limit(1000).get(),
    ]);

    const orders = ordersSnapshot.docs.map((item) => item.data() as Record<string, unknown>);
    const totalRevenue = orders.reduce((total, order) => {
      return total + (isOrderRevenue(statusOf(order)) ? numberValue(order, "totalAmount", "amount", "total") : 0);
    }, 0);

    const subscriptionRevenue = subscriptionsSnapshot.docs.reduce((total, item) => {
      const data = item.data() as Record<string, unknown>;
      return total + (isPaid(statusOf(data)) ? numberValue(data, "finalPrice", "amount", "totalAmount", "basePrice") : 0);
    }, 0);

    const boostRevenue = boostsSnapshot.docs.reduce((total, item) => {
      const data = item.data() as Record<string, unknown>;
      return total + (isPaid(statusOf(data)) ? numberValue(data, "totalAmount", "finalPrice", "amount", "price") : 0);
    }, 0);

    const partnerRevenue = storesSnapshot.docs.reduce((total, item) => {
      const data = item.data() as Record<string, unknown>;
      if (!data.lastPartnerPaymentAt && !data.partnerPaymentAmount && !data.partnerSubscriptionAmount) return total;
      const paymentAmount = numberValue(data, "partnerPaymentAmount", "partnerSubscriptionAmount", "lastPartnerPaymentAmount");
      return total + (paymentAmount > 0 ? paymentAmount : 10000);
    }, 0);

    const payoutCommissions = payoutsSnapshot.docs.reduce((total, item) => {
      const data = item.data() as Record<string, unknown>;
      return total + (["completed", "processing"].includes(statusOf(data)) ? numberValue(data, "platformFee", "commission", "commissionAmount") : 0);
    }, 0);
    const orderCommissions = orders.reduce((total, order) => {
      return total + (isOrderRevenue(statusOf(order)) ? numberValue(order, "platformFee", "commission", "commissionAmount") : 0);
    }, 0);

    const recentActivity = [
      ...ordersSnapshot.docs.map((item) => {
        const data = item.data() as Record<string, unknown>;
        const status = statusOf(data);
        const amount = numberValue(data, "totalAmount", "amount", "total");
        return {
          id: `order:${item.id}`,
          type: "order",
          title: `Order ${shortId(item.id)} ${status ? `is ${readableStatus(status)}` : "was created"}`,
          description: `${formatAmount(amount)} marketplace order`,
          timestamp: timestampOf(data, "createdAt", "orderDate", "timestamp", "updatedAt"),
        };
      }),
      ...payoutsSnapshot.docs.map((item) => {
        const data = item.data() as Record<string, unknown>;
        const status = statusOf(data);
        return {
          id: `payout:${item.id}`,
          type: "payout",
          title: `Payout ${shortId(item.id)} ${status ? `is ${readableStatus(status)}` : "was updated"}`,
          description: `${formatAmount(numberValue(data, "amount", "requestedAmount", "amountNaira", "totalAmount"))} seller payout`,
          timestamp: timestampOf(data, "updatedAt", "createdAt", "requestedAt", "timestamp"),
        };
      }),
      ...verificationsSnapshot.docs.map((item) => {
        const data = item.data() as Record<string, unknown>;
        const status = statusOf(data);
        return {
          id: `verification:${item.id}`,
          type: "verification",
          title: `${String(data.storeName || "Store")} verification ${status ? readableStatus(status) : "submitted"}`,
          description: "Business verification request",
          timestamp: timestampOf(data, "submittedAt", "createdAt", "updatedAt", "timestamp"),
        };
      }),
      ...auditSnapshot.docs.map((item) => {
        const data = item.data() as Record<string, unknown>;
        const action = readableStatus(String(data.action || "Admin activity"));
        const actor = String(data.performedByEmail || data.performedBy || data.actorEmail || "Admin");
        return {
          id: `audit:${item.id}`,
          type: "audit",
          title: action.charAt(0).toUpperCase() + action.slice(1),
          description: `${actor}${data.targetType ? ` • ${String(data.targetType)}` : ""}`,
          timestamp: timestampOf(data, "timestamp", "createdAt", "updatedAt"),
        };
      }),
    ]
      .filter((activity) => activity.timestamp > 0)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 8)
      .map((activity) => ({ ...activity, timestamp: new Date(activity.timestamp).toISOString() }));

    return NextResponse.json({
      totalOrders: orders.length,
      totalRevenue: Math.round(totalRevenue),
      pendingVerifications: verificationsSnapshot.docs.filter((item) => statusOf(item.data() as Record<string, unknown>) === "pending").length,
      subscriptionRevenue: Math.round(subscriptionRevenue),
      boostRevenue: Math.round(boostRevenue),
      partnerCommissionRevenue: Math.round(partnerRevenue + payoutCommissions + orderCommissions),
      recentActivity,
    });
  } catch (error) {
    console.error("Admin overview aggregation error:", error);
    return NextResponse.json({ error: "Admin overview metrics could not be loaded" }, { status: 500 });
  }
}
