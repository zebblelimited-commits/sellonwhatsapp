"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type ShippingRecord = {
  id: string;
  orderId: string;
  storeName: string;
  courierName: string;
  courierId?: string;
  status: string;
  orderStatus: string;
  shippingCost: number;
  estimatedDays?: string;
  pickupAddress: string;
  deliveryAddress: any;
  createdAt: Date;
  trackingId?: string;
  items: any[];
};

const statusMeta: Record<string, { label: string; tone: string; icon: typeof Clock3 }> = {
  pending_payment: { label: "Payment pending", tone: "bg-amber-50 text-amber-700 border-amber-100", icon: Clock3 },
  paid_held: { label: "Preparing shipment", tone: "bg-amber-50 text-amber-700 border-amber-100", icon: Clock3 },
  pending_pickup: { label: "Awaiting pickup", tone: "bg-blue-50 text-blue-700 border-blue-100", icon: PackageCheck },
  awaiting_pickup: { label: "Pickup scheduled", tone: "bg-blue-50 text-blue-700 border-blue-100", icon: PackageCheck },
  preparing: { label: "Courier preparing order", tone: "bg-blue-50 text-blue-700 border-blue-100", icon: PackageCheck },
  shipped: { label: "In transit", tone: "bg-indigo-50 text-indigo-700 border-indigo-100", icon: Truck },
  out_for_delivery: { label: "Out for delivery", tone: "bg-purple-50 text-purple-700 border-purple-100", icon: Truck },
  completed: { label: "Delivered", tone: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertCircle },
  self_arranged: { label: "Self-arranged delivery", tone: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: MapPin },
};

function asDate(value: any): Date {
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function addressText(address: any): string {
  if (!address) return "Address not provided";
  if (typeof address === "string") return address;
  return [address.address, address.street, address.city, address.lga, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ") || "Address not provided";
}

function normaliseStatus(order: any, shipment: any): string {
  const orderStatus = String(order?.status || "pending_payment").trim().toLowerCase();
  // Checkout creates the shipment record before payment is confirmed. Keep
  // that important state visible instead of showing "awaiting pickup" early.
  if (orderStatus === "pending_payment") return orderStatus;
  return String(shipment?.status || orderStatus).trim().toLowerCase();
}

function statusForDisplay(record: ShippingRecord) {
  return statusMeta[record.orderStatus] || statusMeta[record.status] || statusMeta.pending_payment;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value || 0);
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function BuyerShipping({ buyerId }: { buyerId?: string }) {
  const [records, setRecords] = useState<ShippingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ShippingRecord | null>(null);

  useEffect(() => {
    let stopOrders = () => {};
    let stopShipments = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopOrders();
      stopShipments();
      const uid = buyerId || user?.uid;
      if (!uid) {
        setRecords([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      let orders: any[] = [];
      let shipments: any[] = [];
      const publish = () => {
        const shipmentByOrder = new Map(shipments.map((shipment) => [shipment.orderId, shipment]));
        const merged = new Map<string, ShippingRecord>();
        orders.forEach((order) => {
          const shipment = shipmentByOrder.get(order.id);
          const isNonPhysical = ["service", "booking", "utility"].includes(String(order.orderType || order.productType || "").toLowerCase());
          if (isNonPhysical && !shipment) return;
          merged.set(order.id, {
            id: shipment?.id || order.id,
            orderId: order.id,
            storeName: order.storeName || "Seller",
            courierName: shipment?.courierName || order.courierName || order.shippingMethod || "Courier assignment pending",
            courierId: shipment?.courierId || order.courierId,
            status: String(shipment?.status || "").toLowerCase(),
            orderStatus: normaliseStatus(order, shipment),
            shippingCost: Number(shipment?.shippingCost ?? order.shippingCost ?? order.deliveryFee ?? 0),
            estimatedDays: order.estimatedDays,
            pickupAddress: addressText(shipment?.pickupAddress || order.pickupAddress),
            deliveryAddress: shipment?.deliveryAddress || order.deliveryAddress,
            createdAt: asDate(shipment?.createdAt || order.createdAt),
            trackingId: shipment?.trackingId || order.trackingId,
            items: Array.isArray(order.items) ? order.items : [],
          });
        });
        shipments.forEach((shipment) => {
          if (merged.has(shipment.orderId)) return;
          merged.set(shipment.orderId, {
            id: shipment.id,
            orderId: shipment.orderId || shipment.id,
            storeName: shipment.storeName || "Seller",
            courierName: shipment.courierName || "Courier",
            courierId: shipment.courierId,
            status: String(shipment.status || "pending_pickup").toLowerCase(),
            orderStatus: String(shipment.status || "pending_pickup").toLowerCase(),
            shippingCost: Number(shipment.shippingCost || 0),
            estimatedDays: shipment.estimatedDays,
            pickupAddress: addressText(shipment.pickupAddress),
            deliveryAddress: shipment.deliveryAddress,
            createdAt: asDate(shipment.createdAt),
            trackingId: shipment.trackingId,
            items: [],
          });
        });
        setRecords(Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        setLoading(false);
      };

      stopOrders = onSnapshot(
        query(collection(db, "orders"), where("buyerId", "==", uid), limit(100)),
        (snapshot) => { orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); publish(); },
        (snapshotError) => { console.error("Buyer shipping orders listener error:", snapshotError); setError("Orders could not be loaded. Please refresh and try again."); setLoading(false); },
      );
      stopShipments = onSnapshot(
        query(collection(db, "shipments"), where("buyerId", "==", uid), limit(100)),
        (snapshot) => { shipments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); publish(); },
        (snapshotError) => { console.warn("Shipment details unavailable; using order data:", snapshotError); publish(); },
      );
    });
    return () => { stopAuth(); stopOrders(); stopShipments(); };
  }, [buyerId]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const haystack = [record.orderId, record.storeName, record.courierName, ...record.items.map((item) => item.name)].join(" ").toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesFilter = filter === "all" || record.orderStatus === filter || record.status === filter;
    return matchesSearch && matchesFilter;
  }), [filter, records, search]);

  const counts = {
    active: records.filter((record) => ["paid_held", "pending_pickup", "shipped", "out_for_delivery"].includes(record.orderStatus) || ["pending_pickup", "shipped", "out_for_delivery"].includes(record.status)).length,
    delivered: records.filter((record) => record.orderStatus === "completed").length,
    spend: records.reduce((total, record) => total + record.shippingCost, 0),
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Delivery command centre</p><h2 className="text-2xl font-black tracking-tight sm:text-3xl">Track every delivery in one place.</h2><p className="mt-2 max-w-xl text-sm font-medium text-slate-300">Follow your order from seller pickup to your delivery address with live courier and status information.</p></div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold text-emerald-100"><Truck size={16} /> Courier aggregation active</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Active deliveries" value={String(counts.active)} detail="Orders currently moving" icon={<Truck size={18} />} tone="green" />
        <Metric label="Delivered orders" value={String(counts.delivered)} detail="Successfully completed" icon={<CheckCircle2 size={18} />} tone="blue" />
        <Metric label="Delivery fees" value={formatCurrency(counts.spend)} detail="Across visible shipments" icon={<PackageCheck size={18} />} tone="amber" />
      </div>

      <div className="rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-lg font-black text-gray-900">Your shipments</h3><p className="mt-1 text-xs font-medium text-gray-500">{visibleRecords.length} shipment{visibleRecords.length === 1 ? "" : "s"} shown</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order or courier" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-emerald-500 sm:w-56" /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-emerald-500"><option value="all">All statuses</option><option value="paid_held">Preparing</option><option value="pending_pickup">Awaiting pickup</option><option value="shipped">In transit</option><option value="completed">Delivered</option></select></div></div>
        {error && <div className="mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertCircle size={15} /> {error}</div>}
        {loading ? <LoadingRows /> : visibleRecords.length === 0 ? <EmptyState /> : <div className="space-y-3">{visibleRecords.map((record) => <ShipmentRow key={record.id} record={record} onClick={() => setSelected(record)} />)}</div>}
      </div>

      {selected && <ShipmentDetails record={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: "green" | "blue" | "amber" }) {
  const styles = { green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700" };
  return <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${styles[tone]}`}>{icon}</div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 text-2xl font-black tracking-tight text-gray-900">{value}</p><p className="mt-1 text-xs font-medium text-gray-500">{detail}</p></div>;
}

function ShipmentRow({ record, onClick }: { record: ShippingRecord; onClick: () => void }) {
  const meta = statusForDisplay(record); const Icon = meta.icon;
  return <button onClick={onClick} className="group flex w-full flex-col gap-4 rounded-2xl border border-gray-100 p-4 text-left transition hover:border-emerald-200 hover:shadow-md sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck size={19} /></div><div className="min-w-0"><p className="truncate text-sm font-black text-gray-900">{record.storeName}</p><p className="mt-1 truncate text-xs font-medium text-gray-500">Order {record.orderId} · {formatDate(record.createdAt)}</p></div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${meta.tone}`}><Icon size={12} /> {meta.label}</span><p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-600"><Truck size={13} className="text-gray-400" /> {record.courierName}</p></div><ChevronRight size={18} className="text-gray-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" /></div></button>;
}

function ShipmentDetails({ record, onClose }: { record: ShippingRecord; onClose: () => void }) {
  const meta = statusForDisplay(record); const Icon = meta.icon;
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Shipment details</p><h3 className="mt-1 text-xl font-black text-gray-900">{record.storeName}</h3><p className="mt-1 text-xs font-bold text-gray-400">Order {record.orderId}</p></div><button onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-black text-gray-500 hover:bg-gray-100">Close</button></div><div className="mt-6 rounded-2xl bg-gray-50 p-4"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${meta.tone}`}><Icon size={13} /> {meta.label}</span><div className="mt-5 grid gap-4 sm:grid-cols-2"><Address label="Pickup from seller" value={record.pickupAddress} /><Address label="Deliver to you" value={addressText(record.deliveryAddress)} /></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Courier" value={record.courierName} /><Info label="Estimated time" value={record.estimatedDays || "Provided by courier"} /><Info label="Delivery fee" value={formatCurrency(record.shippingCost)} /></div>{record.trackingId && <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Tracking reference</p><p className="mt-1 break-all text-sm font-black text-indigo-950">{record.trackingId}</p></div>}</div></div>;
}

function Address({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="flex items-center gap-2 text-emerald-700"><MapPin size={15} /><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p></div><p className="mt-2 text-sm font-bold leading-6 text-gray-800">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p><p className="mt-2 text-sm font-black text-gray-900">{value}</p></div>; }
function LoadingRows() { return <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>; }
function EmptyState() { return <div className="rounded-2xl bg-gray-50 p-10 text-center"><PackageCheck className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-black text-gray-700">No shipments found</p><p className="mt-1 text-xs font-medium text-gray-400">Your courier and self-arranged deliveries will appear here after checkout.</p></div>; }
