"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart2,
  Eye,
  MessageCircle,
  MousePointer2,
  Percent,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { auth, db } from "@/lib/firebase";

type TimeRange = "7D" | "1M" | "6M" | "1Y";
type FirestoreDate = { toDate?: () => Date } | Date | string | number | null | undefined;

interface Order {
  id: string;
  totalAmount?: number;
  total?: number;
  createdAt?: FirestoreDate;
  status?: string;
  paymentStatus?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  whatsappNumber?: string;
  phone?: string;
  deliveryState?: string;
}

interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
}

interface AnalyticsEvent {
  id: string;
  eventType?: string;
  timestamp?: FirestoreDate;
}

interface StoreStats {
  totalSales?: number;
}

interface AnalyticsTabProps {
  orders?: Order[];
  stats?: StoreStats;
  storeId: string;
  views?: number;
  clicks?: number;
  buyNowClicks?: number;
}

interface Bucket {
  key: string;
  label: string;
}

const RANGE_DAYS: Record<TimeRange, number> = { "7D": 7, "1M": 30, "6M": 183, "1Y": 366 };

const compactNumber = (value: number) => Intl.NumberFormat("en-NG", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format(Number.isFinite(value) ? value : 0);

const money = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

const toDate = (value: FirestoreDate) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

const amountOf = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizedStatus = (order: Order) => {
  const status = String(order.status || "").trim().toUpperCase();
  if (["COMPLETED", "DELIVERED"].includes(status)) return "COMPLETED";
  if (["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
  if (["PAID", "HELD", "PAID_HELD", "DISPUTED", "UNDER_REVIEW"].includes(status)) return status === "UNDER_REVIEW" ? "DISPUTED" : status === "PAID" || status === "HELD" ? "PAID_HELD" : status;
  if (["PENDING", "PENDING_PAYMENT", "PROCESSING"].includes(status)) return "PENDING";
  return status || "PENDING";
};

const isPaidOrder = (order: Order) => {
  const status = normalizedStatus(order);
  return ["PAID_HELD", "SHIPPED", "COMPLETED", "DISPUTED"].includes(status) || String(order.paymentStatus || "").toLowerCase() === "paid";
};

const rangeWindow = (range: TimeRange) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const bucketFormat = (date: Date, range: TimeRange) => {
  if (range === "6M" || range === "1Y") return date.toLocaleDateString("en-NG", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
};

const bucketKey = (date: Date, range: TimeRange) => {
  if (range === "6M" || range === "1Y") return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const makeBuckets = (range: TimeRange, end: Date): Bucket[] => {
  const count = range === "7D" ? 7 : range === "1M" ? 30 : range === "6M" ? 7 : 13;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    if (range === "6M" || range === "1Y") {
      date.setDate(1);
      date.setMonth(date.getMonth() - (count - 1 - index));
    } else {
      date.setDate(date.getDate() - (count - 1 - index));
    }
    return { key: bucketKey(date, range), label: bucketFormat(date, range) };
  });
};

export default function AnalyticsTab({ orders = [], stats = {}, storeId }: AnalyticsTabProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7D");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsEvent[]>([]);
  const [customerDetails, setCustomerDetails] = useState<Record<string, CustomerDetails>>({});
  const [loading, setLoading] = useState(Boolean(storeId));
  const [error, setError] = useState("");

  const windowRange = useMemo(() => rangeWindow(timeRange), [timeRange]);

  useEffect(() => {
    if (!storeId) {
      setAnalyticsData([]);
      setLoading(false);
      setError("No store was found for this analytics account.");
      return;
    }

    let cancelled = false;
    const fetchAnalytics = async () => {
      setLoading(true);
      setError("");
      try {
        const analyticsQuery = query(
          collection(db, "analytics"),
          where("storeId", "==", storeId),
          where("timestamp", ">=", Timestamp.fromDate(windowRange.start)),
          where("timestamp", "<=", Timestamp.fromDate(windowRange.end)),
        );
        const snapshot = await getDocs(analyticsQuery);
        if (!cancelled) {
          setAnalyticsData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AnalyticsEvent)));
        }
      } catch (fetchError) {
        console.error("[AnalyticsTab] Analytics query failed:", fetchError);
        if (!cancelled) {
          setAnalyticsData([]);
          setError("Analytics could not be loaded. Check Firestore permissions, indexes, and your connection.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchAnalytics();
    return () => { cancelled = true; };
  }, [storeId, windowRange]);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const date = toDate(order.createdAt);
    return Boolean(date && date >= windowRange.start && date <= windowRange.end);
  }), [orders, windowRange]);

  const orderIds = useMemo(() => [...filteredOrders]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, 100)
    .map((order) => order.id)
    .filter(Boolean)
    .join(","), [filteredOrders]);

  useEffect(() => {
    if (!storeId || !orderIds) {
      setCustomerDetails({});
      return;
    }

    let cancelled = false;
    const loadCustomerDetails = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const response = await fetch("/api/vendor/analytics/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: orderIds.split(",") }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Customer details could not be loaded");
        if (!cancelled) setCustomerDetails(payload.customers || {});
      } catch (customerError) {
        console.error("[AnalyticsTab] Customer details lookup failed:", customerError);
        if (!cancelled) setCustomerDetails({});
      }
    };

    void loadCustomerDetails();
    return () => { cancelled = true; };
  }, [storeId, orderIds]);

  const paidOrders = useMemo(() => filteredOrders.filter(isPaidOrder), [filteredOrders]);
  const buckets = useMemo(() => makeBuckets(timeRange, windowRange.end), [timeRange, windowRange.end]);

  const realStats = useMemo(() => {
    const count = (eventType: string) => analyticsData.filter((event) => event.eventType === eventType).length;
    const views = count("view");
    const buyNowClicks = count("buy_now_click");
    const clicks = count("click");
    const whatsappClicks = count("whatsapp_click");
    return {
      views,
      clicks,
      buyNowClicks,
      whatsappClicks,
      totalEvents: analyticsData.length,
      conversionRate: views ? ((buyNowClicks / views) * 100).toFixed(1) : "0.0",
      revenue: paidOrders.reduce((total, order) => total + amountOf(order.totalAmount ?? order.total), 0),
    };
  }, [analyticsData, paidOrders]);

  const salesData = useMemo(() => {
    const values = new Map(buckets.map((bucket) => [bucket.key, { date: bucket.label, Sales: 0 }]));
    paidOrders.forEach((order) => {
      const date = toDate(order.createdAt);
      if (!date) return;
      const bucket = values.get(bucketKey(date, timeRange));
      if (bucket) bucket.Sales += amountOf(order.totalAmount ?? order.total);
    });
    return [...values.values()];
  }, [buckets, paidOrders, timeRange]);

  const escrowData = useMemo(() => {
    const totals = { locked: 0, released: 0, pending: 0 };
    filteredOrders.forEach((order) => {
      const amount = amountOf(order.totalAmount ?? order.total);
      const status = normalizedStatus(order);
      if (["PAID_HELD", "SHIPPED", "DISPUTED"].includes(status)) totals.locked += amount;
      else if (status === "COMPLETED") totals.released += amount;
      else if (status === "PENDING") totals.pending += amount;
    });
    return [
      { name: "Locked in Escrow", amount: totals.locked, color: "#10b981" },
      { name: "Released Funds", amount: totals.released, color: "#3b82f6" },
      { name: "Pending Payment", amount: totals.pending, color: "#a855f7" },
    ];
  }, [filteredOrders]);

  const hourlyData = useMemo(() => {
    const values = Array.from({ length: 6 }, (_, index) => ({
      hour: ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"][index],
      Views: 0,
      Clicks: 0,
      Orders: 0,
    }));
    const slot = (hour: number) => hour < 4 ? 0 : hour < 8 ? 1 : hour < 12 ? 2 : hour < 16 ? 3 : hour < 20 ? 4 : 5;
    analyticsData.forEach((event) => {
      const date = toDate(event.timestamp);
      if (!date) return;
      const item = values[slot(date.getHours())];
      if (event.eventType === "view") item.Views += 1;
      if (["click", "buy_now_click", "whatsapp_click"].includes(String(event.eventType))) item.Clicks += 1;
    });
    paidOrders.forEach((order) => {
      const date = toDate(order.createdAt);
      if (date) values[slot(date.getHours())].Orders += 1;
    });
    return values;
  }, [analyticsData, paidOrders]);

  const aovData = useMemo(() => {
    const values = new Map(buckets.map((bucket) => [bucket.key, { date: bucket.label, AOV: 0, amount: 0, count: 0 }]));
    paidOrders.forEach((order) => {
      const date = toDate(order.createdAt);
      if (!date) return;
      const bucket = values.get(bucketKey(date, timeRange));
      if (bucket) {
        bucket.amount += amountOf(order.totalAmount ?? order.total);
        bucket.count += 1;
        bucket.AOV = bucket.count ? Math.round(bucket.amount / bucket.count) : 0;
      }
    });
    return [...values.values()];
  }, [buckets, paidOrders, timeRange]);

  const recentOrders = useMemo(() => [...filteredOrders]
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
    .slice(0, 10), [filteredOrders]);

  if (loading) return <AnalyticsLoading />;

  return (
    <div className="w-full min-w-0 max-w-full space-y-8 overflow-x-hidden pb-10 font-plus-jakarta">
      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{error}</div>}

      <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <AnalyticsCard label="Period Revenue" value={money(realStats.revenue)} icon={<ShoppingBag size={18} />} iconColor="text-emerald-700" iconBg="bg-emerald-50" subtitle={`${timeRange} paid orders`} />
        <AnalyticsCard label="Views" value={realStats.views.toLocaleString()} icon={<Eye size={18} />} iconColor="text-blue-600" iconBg="bg-blue-50" subtitle={`${timeRange} period`} />
        <AnalyticsCard label="Clicks" value={realStats.clicks.toLocaleString()} icon={<MousePointer2 size={18} />} iconColor="text-indigo-600" iconBg="bg-indigo-50" subtitle="Product/store clicks" />
        <AnalyticsCard label="Buy Now" value={realStats.buyNowClicks.toLocaleString()} icon={<ShoppingBag size={18} />} iconColor="text-purple-600" iconBg="bg-purple-50" subtitle="Purchase intents" />
        <AnalyticsCard label="WhatsApp Clicks" value={realStats.whatsappClicks.toLocaleString()} icon={<MessageCircle size={18} />} iconColor="text-green-600" iconBg="bg-green-50" subtitle="Direct chats" />
        <AnalyticsCard label="Conversion" value={`${realStats.conversionRate}%`} icon={<Percent size={18} />} iconColor="text-emerald-600" iconBg="bg-emerald-50" subtitle="Buy Now / Views" />
        <AnalyticsCard label="Total Events" value={realStats.totalEvents.toLocaleString()} icon={<Activity size={18} />} iconColor="text-slate-600" iconBg="bg-slate-50" subtitle="Tracked actions" />
        <AnalyticsCard label="Lifetime Sales" value={money(amountOf(stats.totalSales))} icon={<TrendingUp size={18} />} iconColor="text-green-700" iconBg="bg-green-50" subtitle="Seller ledger total" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {([['7D', '7 Days'], ['1M', '1 Month'], ['6M', '6 Months'], ['1Y', '1 Year']] as const).map(([value, label]) => (
          <button key={value} onClick={() => setTimeRange(value)} className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${timeRange === value ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white text-slate-500 hover:border-slate-400"}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <ChartPanel title="Sales Velocity" subtitle={`Paid order revenue · ${timeRange}`} icon={<TrendingUp size={16} className="text-emerald-600" />} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs><linearGradient id="analyticsSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.22} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis axisLine={false} tickLine={false} width={55} tickFormatter={(value) => `₦${compactNumber(Number(value))}`} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip formatter={(value) => [money(Number(value)), "Revenue"]} />
              <Area type="monotone" dataKey="Sales" stroke="#10b981" strokeWidth={2} fill="url(#analyticsSalesFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Order Value by State" subtitle={`Orders created · ${timeRange}`} icon={<ShieldCheck size={16} className="text-purple-600" />}>
          <div className="h-44 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={escrowData} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={3} dataKey="amount">{escrowData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => [money(Number(value)), "Amount"]} /></PieChart></ResponsiveContainer></div>
          <div className="mt-5 space-y-3">{escrowData.map((entry) => <div key={entry.name} className="flex items-center justify-between border-b border-slate-50 pb-2 text-[10px] font-black uppercase"><span style={{ color: entry.color }}>{entry.name.replace(" Funds", "").replace(" in Escrow", "")}</span><span className="text-slate-900">{money(entry.amount)}</span></div>)}</div>
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ChartPanel title="Hourly Traffic vs Orders" subtitle="Actual tracked events and paid orders" icon={<BarChart2 size={16} className="text-blue-600" />}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" /><XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><Tooltip /><Bar dataKey="Views" fill="#3b82f6" radius={[4, 4, 0, 0]} /><Bar dataKey="Clicks" fill="#6366f1" radius={[4, 4, 0, 0]} /><Bar dataKey="Orders" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Average Order Value" subtitle={`Paid orders · ${timeRange}`} icon={<Activity size={16} className="text-purple-600" />}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={aovData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><YAxis axisLine={false} tickLine={false} width={55} tickFormatter={(value) => `₦${compactNumber(Number(value))}`} tick={{ fontSize: 10, fill: "#64748b" }} /><Tooltip formatter={(value) => [money(Number(value)), "AOV"]} /><Line type="monotone" dataKey="AOV" stroke="#a855f7" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
        </ChartPanel>
      </div>

      <section className="overflow-hidden rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-6"><h3 className="text-[11px] font-black uppercase tracking-tight text-slate-900">Recent Transactions</h3><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Paid and pending orders in the selected period</p></div>
        {recentOrders.length === 0 ? <EmptyState message="No orders were recorded in this period." /> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-slate-100">{["ID", "Customer", "Contact", "Location", "Status", "Amount", "Date"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-[9px] font-black uppercase text-slate-500">{heading}</th>)}</tr></thead><tbody>{recentOrders.map((order) => { const details = customerDetails[order.id]; const email = order.customerEmail || order.buyerEmail || details?.email || ""; const phone = order.customerPhone || order.buyerPhone || order.whatsappNumber || order.phone || details?.phone || ""; const name = order.customerName || order.buyerName || details?.name || (email ? email.split("@")[0] : "") || phone || "Anonymous"; return <tr key={order.id} className="border-b border-gray-100/50 last:border-0 hover:bg-slate-50/50"><td className="px-3 py-4 font-mono text-[10px] font-bold">#{order.id.slice(-6).toUpperCase()}</td><td className="px-3 py-4"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-[10px] font-black text-white">{name.charAt(0).toUpperCase()}</div><span className="text-[11px] font-black">{name}</span></div></td><td className="px-3 py-4 text-[10px]">{phone || email || "—"}</td><td className="px-3 py-4 text-[10px]">{order.deliveryState || "—"}</td><td className="px-3 py-4"><StatusBadge status={normalizedStatus(order)} /></td><td className="px-3 py-4 text-right text-[11px] font-black">{money(amountOf(order.totalAmount))}</td><td className="whitespace-nowrap px-3 py-4 text-right text-[10px]">{toDate(order.createdAt)?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) || "—"}</td></tr>; })}</tbody></table></div>}
      </section>
    </div>
  );
}

function AnalyticsLoading() {
  return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" /></div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">{message}</div>;
}

function ChartPanel({ title, subtitle, icon, className = "", children }: { title: string; subtitle: string; icon: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-8 ${className}`}><div className="mb-5 flex min-w-0 items-start gap-2 sm:mb-6"><div className="shrink-0">{icon}</div><div className="min-w-0"><h3 className="truncate text-[11px] font-black uppercase tracking-tight text-slate-900">{title}</h3><p className="mt-1 truncate text-[9px] font-bold uppercase tracking-widest text-slate-500">{subtitle}</p></div></div><div className="h-52 w-full min-w-0 sm:h-64">{children}</div></section>;
}

function AnalyticsCard({ label, value, icon, iconColor, iconBg, subtitle }: { label: string; value: string; icon: React.ReactNode; iconColor: string; iconBg: string; subtitle: string }) {
  return <div className="flex h-full items-center gap-4 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>{icon}</div><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</p><h3 className="truncate text-lg font-black tracking-tight text-gray-900">{value}</h3><p className="truncate text-[9px] font-extrabold uppercase text-green-500">{subtitle}</p></div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { PAID_HELD: "bg-emerald-50 text-emerald-700 border-emerald-100", SHIPPED: "bg-blue-50 text-blue-700 border-blue-100", COMPLETED: "bg-indigo-50 text-indigo-700 border-indigo-100", DISPUTED: "bg-red-50 text-red-700 border-red-100", PENDING: "bg-slate-50 text-slate-500 border-slate-100" };
  return <span className={`rounded-md border px-2 py-0.5 text-[8px] font-black uppercase ${colors[status] || colors.PENDING}`}>{status.replace("_", " ")}</span>;
}
