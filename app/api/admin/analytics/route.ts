import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function displayDay(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isRevenueOrder(data: Record<string, any>): boolean {
  return !["cancelled", "canceled", "failed", "refunded", "pending"].includes(
    String(data.status || "").toLowerCase(),
  );
}

function orderAmount(data: Record<string, any>): number {
  return asNumber(data.totalAmount ?? data.amount ?? data.total ?? data.subtotal);
}

const categoryLabels: Record<string, string> = {
  "physical-products": "Physical Products",
  "freelance-services": "Freelance Services",
  "bookable-services": "Bookable Services",
  "events-tickets": "Events & Tickets",
  "digital-products": "Digital Products",
  vehicles: "Vehicles",
  property: "Property",
};

function normalizedCategory(value: unknown): string {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!category || ["uncategorized", "unknown", "n/a", "none", "null"].includes(category)) return "";
  if (categoryLabels[category]) return categoryLabels[category];
  return category
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productCategory(data: Record<string, any>): string {
  return normalizedCategory(data.subCategory || data.category || data.mainCategory);
}

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7d";
    const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end.getTime() - (days - 1) * DAY_MS);
    start.setHours(0, 0, 0, 0);

    const [ordersSnapshot, usersSnapshot, storesSnapshot, productsSnapshot] = await Promise.all([
      adminDb.collection("orders").limit(10000).get(),
      adminDb.collection("users").limit(10000).get(),
      adminDb.collection("stores").limit(10000).get(),
      adminDb.collection("products").limit(10000).get(),
    ]);

    const productCategories = new Map<string, string>();
    productsSnapshot.docs.forEach((snapshot) => {
      const category = productCategory(snapshot.data() as Record<string, any>);
      if (category) productCategories.set(snapshot.id, category);
    });

    const dayKeys = Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      return dayKey(date);
    });
    const daySet = new Set(dayKeys);
    const gmv = new Map(dayKeys.map((key) => [key, { gmv: 0, orders: 0 }]));
    const usersByDay = new Map(dayKeys.map((key) => [key, 0]));
    const orderStatus = new Map<string, number>();
    const storeTotals = new Map<string, { sales: number; orders: number }>();
    const categoryTotals = new Map<string, number>();
    const disputedByDay = new Map(dayKeys.map((key) => [key, 0]));
    const ordersByDay = new Map(dayKeys.map((key) => [key, 0]));
    const activeUsersByDay = new Map(dayKeys.map((key) => [key, new Set<string>()]));
    const activeUsersInRange = new Set<string>();

    ordersSnapshot.docs.forEach((snapshot) => {
      const data = snapshot.data() as Record<string, any>;
      const createdAt = asDate(data.createdAt) || asDate(data.paidAt) || asDate(data.updatedAt);
      if (!createdAt || createdAt < start || createdAt > end) return;
      const key = dayKey(createdAt);
      if (!daySet.has(key)) return;

      const normalizedStatus = String(data.status || "unknown").toLowerCase();
      orderStatus.set(normalizedStatus, (orderStatus.get(normalizedStatus) || 0) + 1);
      ordersByDay.set(key, (ordersByDay.get(key) || 0) + 1);
      const activeUsers = activeUsersByDay.get(key)!;
      [data.buyerId, data.vendorId, data.storeId].filter((id): id is string => typeof id === "string" && id.length > 0).forEach((id) => {
        activeUsers.add(id);
        activeUsersInRange.add(id);
      });
      if (["disputed", "under_review", "open"].includes(normalizedStatus)) {
        disputedByDay.set(key, (disputedByDay.get(key) || 0) + 1);
      }

      if (!isRevenueOrder(data)) return;
      const amount = orderAmount(data);
      const daily = gmv.get(key)!;
      daily.gmv += amount;
      daily.orders += 1;

      const storeId = String(data.vendorId || data.storeId || "unknown");
      const storeTotal = storeTotals.get(storeId) || { sales: 0, orders: 0 };
      storeTotal.sales += amount;
      storeTotal.orders += 1;
      storeTotals.set(storeId, storeTotal);

      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length) {
        items.forEach((item: Record<string, any>) => {
          const productId = String(item.productId || item.id || item.product?.id || data.productId || "");
          const category = normalizedCategory(item.subCategory || item.category || item.mainCategory) ||
            productCategories.get(productId) ||
            productCategory(data) ||
            "Other";
          const itemAmount = asNumber(item.total ?? item.price) * Math.max(1, asNumber(item.quantity ?? item.qty) || 1);
          categoryTotals.set(category, (categoryTotals.get(category) || 0) + (itemAmount || amount / items.length));
        });
      } else {
        const category = productCategories.get(String(data.productId || "")) || productCategory(data) || "Other";
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
      }
    });

    usersSnapshot.docs.forEach((snapshot) => {
      const data = snapshot.data() as Record<string, any>;
      const createdAt = asDate(data.createdAt);
      if (!createdAt || createdAt < start || createdAt > end) return;
      const key = dayKey(createdAt);
      if (daySet.has(key)) usersByDay.set(key, (usersByDay.get(key) || 0) + 1);
    });

    const storeNames = new Map<string, string>();
    storesSnapshot.docs.forEach((snapshot) => {
      const data = snapshot.data() as Record<string, any>;
      storeNames.set(snapshot.id, String(data.name || data.storeName || data.title || snapshot.id));
    });

    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
    const statusLabels: Record<string, string> = {
      paid_held: "Paid / Held",
      shipped: "Shipped",
      completed: "Completed",
      disputed: "Disputed",
      cancelled: "Cancelled",
      pending: "Pending",
      unknown: "Unknown",
    };
    const totalGmv = Array.from(gmv.values()).reduce((total, value) => total + value.gmv, 0);
    const totalOrders = Array.from(ordersByDay.values()).reduce((total, value) => total + value, 0);
    const totalDisputes = Array.from(disputedByDay.values()).reduce((total, value) => total + value, 0);

    return NextResponse.json({
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      summary: {
        totalGmv: Math.round(totalGmv),
        totalOrders,
        activeUsers: activeUsersInRange.size,
        disputeRate: totalOrders ? Number(((totalDisputes / totalOrders) * 100).toFixed(1)) : 0,
      },
      gmvData: dayKeys.map((key) => ({ date: displayDay(key), gmv: Math.round(gmv.get(key)!.gmv), orders: gmv.get(key)!.orders })),
      userGrowth: dayKeys.map((key) => ({ date: displayDay(key), newUsers: usersByDay.get(key) || 0, activeUsers: activeUsersByDay.get(key)?.size || 0 })),
      orderStatus: Array.from(orderStatus.entries()).map(([name, value], index) => ({
        name: statusLabels[name] || name,
        value,
        color: colors[index % colors.length],
      })),
      topStores: Array.from(storeTotals.entries())
        .sort((a, b) => b[1].sales - a[1].sales)
        .slice(0, 10)
        .map(([id, value]) => ({ name: storeNames.get(id) || id, ...value })),
      disputeRate: dayKeys.map((key) => ({
        date: displayDay(key),
        rate: ordersByDay.get(key) ? ((disputedByDay.get(key)! / ordersByDay.get(key)!) * 100).toFixed(1) : "0.0",
      })),
      revenueByCategory: Array.from(categoryTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([category, revenue]) => ({ category, revenue: Math.round(revenue) })),
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json({ error: "Unable to load analytics" }, { status: 500 });
  }
}
