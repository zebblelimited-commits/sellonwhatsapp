"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, MapPin, PackageCheck, Search, Truck } from "lucide-react";
import { auth, db } from "@/lib/firebase";

type SellerShipment = {
  id: string; orderId: string; buyerName: string; buyerPhone: string; courierName: string;
  status: string; shippingCost: number; pickupAddress: string; deliveryAddress: string;
  createdAt: Date; trackingId?: string; items: any[];
};

const statusConfig: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  pending_payment: { label: "Payment pending", className: "bg-amber-50 text-amber-700 border-amber-100", icon: Clock3 },
  paid_held: { label: "Ready for fulfilment", className: "bg-amber-50 text-amber-700 border-amber-100", icon: Clock3 },
  pending_pickup: { label: "Awaiting courier pickup", className: "bg-blue-50 text-blue-700 border-blue-100", icon: PackageCheck },
  shipped: { label: "In transit", className: "bg-indigo-50 text-indigo-700 border-indigo-100", icon: Truck },
  out_for_delivery: { label: "Out for delivery", className: "bg-purple-50 text-purple-700 border-purple-100", icon: Truck },
  completed: { label: "Delivered", className: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertCircle },
};

function dateOf(value: any) { if (value?.toDate) return value.toDate(); if (value?.seconds) return new Date(value.seconds * 1000); const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? new Date() : date; }
function addressOf(value: any) { if (!value) return "Address not provided"; if (typeof value === "string") return value; return [value.address, value.street, value.city, value.lga, value.state, value.postalCode].filter(Boolean).join(", ") || "Address not provided"; }
function money(value: number) { return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value || 0); }
function effectiveStatus(order: any, shipment: any) {
  const orderStatus = String(order?.status || "pending_payment").trim().toLowerCase();
  const shipmentStatus = String(shipment?.status || "").trim().toLowerCase();
  if (orderStatus === "pending_payment") return orderStatus;
  if (["completed", "cancelled", "disputed"].includes(orderStatus)) return orderStatus;
  if (["shipped", "out_for_delivery"].includes(orderStatus)) return orderStatus;
  return shipmentStatus || orderStatus;
}

export default function ShippingTab() {
  const [shipments, setShipments] = useState<SellerShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<SellerShipment | null>(null);

  useEffect(() => {
    let stopOrders = () => {}; let stopShipments = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopOrders(); stopShipments();
      if (!user) { setShipments([]); setLoading(false); return; }
      setLoading(true); setError("");
      const orderSources = new Map<string, any[]>(); let shipmentRows: any[] = [];
      const publish = () => {
        const shipmentByOrder = new Map(shipmentRows.map((row) => [row.orderId, row]));
        const merged = new Map<string, SellerShipment>();
        orderSources.forEach((rows) => rows.forEach((order) => {
          const shipment = shipmentByOrder.get(order.id);
          const isNonPhysical = ["service", "booking", "utility"].includes(String(order.orderType || order.productType || "").toLowerCase());
          if (isNonPhysical && !shipment) return;
          merged.set(order.id, {
            id: shipment?.id || order.id, orderId: order.id,
            buyerName: order.customerName || order.buyerName || "Buyer",
            buyerPhone: order.customerPhone || order.buyerPhone || order.phone || "",
            courierName: shipment?.courierName || order.courierName || order.shippingMethod || "Courier assignment pending",
            status: effectiveStatus(order, shipment), shippingCost: Number(shipment?.shippingCost ?? order.shippingCost ?? order.deliveryFee ?? 0),
            pickupAddress: addressOf(shipment?.pickupAddress || order.pickupAddress), deliveryAddress: addressOf(shipment?.deliveryAddress || order.deliveryAddress),
            createdAt: dateOf(shipment?.createdAt || order.createdAt), trackingId: shipment?.trackingId || order.trackingId,
            items: Array.isArray(order.items) ? order.items : [],
          });
        }));
        shipmentRows.forEach((shipment) => { if (merged.has(shipment.orderId)) return; merged.set(shipment.orderId, { id: shipment.id, orderId: shipment.orderId || shipment.id, buyerName: shipment.customerName || "Buyer", buyerPhone: shipment.customerPhone || "", courierName: shipment.courierName || "Courier", status: String(shipment.status || "pending_pickup").toLowerCase(), shippingCost: Number(shipment.shippingCost || 0), pickupAddress: addressOf(shipment.pickupAddress), deliveryAddress: addressOf(shipment.deliveryAddress), createdAt: dateOf(shipment.createdAt), trackingId: shipment.trackingId, items: [] }); });
        setShipments(Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())); setLoading(false);
      };
      const stops = (["storeId", "vendorId"] as const).map((field) => {
        const rows: any[] = []; orderSources.set(field, rows);
        return onSnapshot(query(collection(db, "orders"), where(field, "==", user.uid), limit(100)), (snapshot) => { rows.splice(0, rows.length, ...snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); publish(); }, (listenerError) => { console.error(`Seller shipping ${field} listener error:`, listenerError); setError("Some orders could not be loaded. Check seller permissions and refresh."); setLoading(false); });
      });
      stopOrders = () => stops.forEach((stop) => stop());
      stopShipments = onSnapshot(query(collection(db, "shipments"), where("storeId", "==", user.uid), limit(100)), (snapshot) => { shipmentRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); publish(); }, (listenerError) => { console.warn("Shipment details unavailable; using order data:", listenerError); publish(); });
    });
    return () => { stopAuth(); stopOrders(); stopShipments(); };
  }, []);

  const visible = useMemo(() => shipments.filter((item) => {
    const text = [item.orderId, item.buyerName, item.buyerPhone, item.courierName, ...item.items.map((product) => product.name)].join(" ").toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase())) && (filter === "all" || item.status === filter);
  }), [filter, search, shipments]);
  const active = shipments.filter((item) => ["paid_held", "pending_pickup", "shipped", "out_for_delivery"].includes(item.status)).length;
  const delivered = shipments.filter((item) => item.status === "completed").length;
  const fees = shipments.reduce((total, item) => total + item.shippingCost, 0);

  return <section className="space-y-6 animate-in fade-in duration-300">
    <div className="rounded-[28px] bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Seller fulfilment</p><h2 className="text-2xl font-black tracking-tight sm:text-3xl">Your delivery operations, at a glance.</h2><p className="mt-2 max-w-xl text-sm font-medium text-slate-300">See what is waiting for pickup, what is moving, and where every order is headed.</p></div><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold text-emerald-100"><Truck size={16} /> Aggregator managed</div></div></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Metric label="Active shipments" value={String(active)} detail="Need fulfilment attention" icon={<Truck size={18} />} tone="green" /><Metric label="Delivered" value={String(delivered)} detail="Completed deliveries" icon={<CheckCircle2 size={18} />} tone="blue" /><Metric label="Shipping fees" value={money(fees)} detail="Customer delivery fees" icon={<PackageCheck size={18} />} tone="amber" /></div>
    <div className="rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-lg font-black text-gray-900">Shipment queue</h3><p className="mt-1 text-xs font-medium text-gray-500">{visible.length} shipment{visible.length === 1 ? "" : "s"} shown</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search buyer or order" className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-emerald-500 sm:w-56" /></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-emerald-500"><option value="all">All statuses</option><option value="paid_held">Ready for fulfilment</option><option value="pending_pickup">Awaiting pickup</option><option value="shipped">In transit</option><option value="completed">Delivered</option></select></div></div>{error && <div className="mb-4 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800"><AlertCircle size={15} /> {error}</div>}{loading ? <Loading /> : visible.length === 0 ? <Empty /> : <div className="space-y-3">{visible.map((item) => <ShipmentRow key={item.id} shipment={item} onClick={() => setSelected(item)} />)}</div>}</div>
    {selected && <Details shipment={selected} onClose={() => setSelected(null)} />}
  </section>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: "green" | "blue" | "amber" }) { const color = { green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700" }[tone]; return <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${color}`}>{icon}</div><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 text-2xl font-black tracking-tight text-gray-900">{value}</p><p className="mt-1 text-xs font-medium text-gray-500">{detail}</p></div>; }
function ShipmentRow({ shipment, onClick }: { shipment: SellerShipment; onClick: () => void }) { const config = statusConfig[shipment.status] || statusConfig.pending_payment; const Icon = config.icon; return <button onClick={onClick} className="group flex w-full flex-col gap-4 rounded-2xl border border-gray-100 p-4 text-left transition hover:border-emerald-200 hover:shadow-md sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck size={19} /></div><div className="min-w-0"><p className="truncate text-sm font-black text-gray-900">{shipment.buyerName}</p><p className="mt-1 truncate text-xs font-medium text-gray-500">Order {shipment.orderId} · {shipment.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p></div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><div><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${config.className}`}><Icon size={12} /> {config.label}</span><p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-600"><Truck size={13} className="text-gray-400" /> {shipment.courierName}</p></div><ChevronRight size={18} className="text-gray-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" /></div></button>; }
function Details({ shipment, onClose }: { shipment: SellerShipment; onClose: () => void }) { const config = statusConfig[shipment.status] || statusConfig.pending_payment; const Icon = config.icon; return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Shipment details</p><h3 className="mt-1 text-xl font-black text-gray-900">{shipment.buyerName}</h3><p className="mt-1 text-xs font-bold text-gray-400">Order {shipment.orderId}{shipment.buyerPhone ? ` · ${shipment.buyerPhone}` : ""}</p></div><button onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-black text-gray-500 hover:bg-gray-100">Close</button></div><div className="mt-6 rounded-2xl bg-gray-50 p-4"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${config.className}`}><Icon size={13} /> {config.label}</span><div className="mt-5 grid gap-4 sm:grid-cols-2"><Address label="Pickup from your store" value={shipment.pickupAddress} /><Address label="Deliver to buyer" value={shipment.deliveryAddress} /></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Courier" value={shipment.courierName} /><Info label="Delivery fee" value={money(shipment.shippingCost)} /><Info label="Items" value={String(shipment.items.length || 1)} /></div>{shipment.trackingId && <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Tracking reference</p><p className="mt-1 break-all text-sm font-black text-indigo-950">{shipment.trackingId}</p></div>}</div></div>; }
function Address({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-200 bg-white p-4"><div className="flex items-center gap-2 text-emerald-700"><MapPin size={15} /><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p></div><p className="mt-2 text-sm font-bold leading-6 text-gray-800">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p><p className="mt-2 text-sm font-black text-gray-900">{value}</p></div>; }
function Loading() { return <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>; }
function Empty() { return <div className="rounded-2xl bg-gray-50 p-10 text-center"><PackageCheck className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-black text-gray-700">No shipments found</p><p className="mt-1 text-xs font-medium text-gray-400">Orders with courier delivery will appear here.</p></div>; }
