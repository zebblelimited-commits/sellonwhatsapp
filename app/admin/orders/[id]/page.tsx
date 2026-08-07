"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, AlertCircle, Loader2, MessageSquare, Package, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { StatusBadge } from "@/components/admin/StatusBadge";
import DisputeThread from "@/components/disputes/DisputeThread";

type FirestoreValue = { toDate?: () => Date } | Date | string | number | null | undefined;
type OrderRecord = Record<string, unknown> & { id: string };
type DisputeRecord = Record<string, unknown> & { id: string };

const asDate = (value: FirestoreValue) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

const displayDate = (value: FirestoreValue) => asDate(value)?.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) || "—";
const money = (value: unknown) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";

export default function AdminOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    const unsubscribeOrder = onSnapshot(doc(db, "orders", orderId), (snapshot) => {
      setOrder(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as OrderRecord) : null);
      setLoading(false);
      setError("");
    }, (snapshotError) => {
      console.error("Admin order detail listener error:", snapshotError);
      setError("Order details could not be loaded. Check admin permissions and try again.");
      setLoading(false);
    });
    const unsubscribeDisputes = onSnapshot(query(collection(db, "disputes"), where("orderId", "==", orderId)), (snapshot) => {
      setDisputes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DisputeRecord)));
    }, (snapshotError) => console.error("Admin order disputes listener error:", snapshotError));
    return () => {
      unsubscribeOrder();
      unsubscribeDisputes();
    };
  }, [orderId]);

  const activeDispute = useMemo(() => disputes.find((item) => !["closed", "resolved_refund", "resolved_vendor"].includes(String(item.status || "").toLowerCase())) || disputes[0], [disputes]);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-green-600" size={30} /></div>;
  if (!order) return <div className="rounded-3xl bg-white p-10 text-center"><AlertCircle className="mx-auto mb-3 text-red-500" /><p className="font-bold">Order not found</p><button onClick={() => router.back()} className="mt-4 text-sm font-bold text-green-700">Go back</button></div>;

  const status = String(order.status || "pending");
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900"><ArrowLeft size={16} /> Back to orders</button>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-widest text-gray-400">Order detail</p><h1 className="mt-1 text-2xl font-black text-gray-900">#{order.id.slice(-12).toUpperCase()}</h1><p className="mt-1 text-sm text-gray-500">Created {displayDate(order.createdAt as FirestoreValue)}</p></div>
        <StatusBadge status={status} size="md" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2"><Package size={17} className="text-green-600" /><h2 className="font-black">Order and payment</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Product" value={text(order.productName || order.title)} />
            <Info label="Amount" value={money(order.totalAmount)} />
            <Info label="Funds state" value={text(order.fundsState)} />
            <Info label="Escrow amount" value={money(order.escrowReservationAmount || order.totalAmount)} />
            <Info label="Payment reference" value={text(order.paymentReference || order.nombaReference || order.orderId)} />
            <Info label="Last updated" value={displayDate(order.updatedAt as FirestoreValue)} />
          </div>
        </section>
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><ShieldCheck size={17} className="text-purple-600" /><h2 className="font-black">Participants</h2></div>
          <Info label="Buyer" value={text(order.buyerEmail || order.buyerId)} />
          <Info label="Seller" value={text(order.vendorName || order.vendorEmail || order.vendorId)} />
          <Info label="Store" value={text(order.storeName || order.vendorId)} />
        </section>
      </div>
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><MessageSquare size={17} className="text-red-600" /><h2 className="font-black">Disputes</h2></div><span className="text-xs font-bold text-gray-400">{disputes.length} record{disputes.length === 1 ? "" : "s"}</span></div>
        {activeDispute ? <div><div className="mb-3 flex flex-wrap items-center gap-2"><StatusBadge status={String(activeDispute.status || "open")} /><span className="text-xs text-gray-500">{text(activeDispute.reason).replaceAll("_", " ")}</span></div><p className="mb-2 text-sm text-gray-600">{text(activeDispute.description)}</p><DisputeThread disputeId={activeDispute.id} currentRole="admin" currentStatus={String(activeDispute.status || "open")} currentResolution={String(activeDispute.resolution || "")} /></div> : <p className="text-sm text-gray-400">No dispute is attached to this order.</p>}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-gray-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-gray-800">{value}</p></div>;
}
