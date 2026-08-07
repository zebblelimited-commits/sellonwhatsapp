"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, AlertCircle, Loader2, MessageSquare, Package, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { StatusBadge } from "@/components/admin/StatusBadge";
import DisputeThread from "@/components/disputes/DisputeThread";

type DisputeRecord = Record<string, unknown> & { id: string };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";
const money = (value: unknown) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const displayDate = (value: unknown) => {
  if (!value) return "—";
  const date = typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
};

export default function AdminDisputeDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const disputeId = params.id;
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!disputeId) return;
    const unsubscribe = onSnapshot(doc(db, "disputes", disputeId), (snapshot) => {
      setDispute(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as DisputeRecord) : null);
      setLoading(false);
      setError("");
    }, (snapshotError) => {
      console.error("Admin dispute detail listener error:", snapshotError);
      setError("Dispute details could not be loaded. Check admin permissions and try again.");
      setLoading(false);
    });
    return unsubscribe;
  }, [disputeId]);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-green-600" size={30} /></div>;
  if (!dispute) return <div className="rounded-3xl bg-white p-10 text-center"><AlertCircle className="mx-auto mb-3 text-red-500" /><p className="font-bold">Dispute not found</p><button onClick={() => router.back()} className="mt-4 text-sm font-bold text-green-700">Go back</button></div>;

  const status = String(dispute.status || "open");
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900"><ArrowLeft size={16} /> Back to disputes</button>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-gray-400">Dispute detail</p><h1 className="mt-1 text-2xl font-black text-gray-900">#{dispute.id.slice(-12).toUpperCase()}</h1><p className="mt-1 text-sm text-gray-500">Created {displayDate(dispute.createdAt)}</p></div><StatusBadge status={status} size="md" /></div>
      <section className="grid gap-4 md:grid-cols-3">
        <Info icon={<MessageSquare size={16} />} label="Reason" value={text(dispute.reason).replaceAll("_", " ")} />
        <Info icon={<Package size={16} />} label="Order" value={text(dispute.orderId)} />
        <Info icon={<Users size={16} />} label="Amount" value={money(dispute.amount)} />
      </section>
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-2 font-black">Opening statement</h2><p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">{text(dispute.description)}</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p><span className="font-bold text-gray-400">Buyer:</span> {text(dispute.buyerEmail || dispute.buyerId)}</p><p><span className="font-bold text-gray-400">Seller:</span> {text(dispute.vendorName || dispute.vendorId)}</p><p><span className="font-bold text-gray-400">Financial outcome:</span> {text(dispute.financialOutcome)}</p><p><span className="font-bold text-gray-400">Resolution:</span> {text(dispute.resolution)}</p></div></section>
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><DisputeThread disputeId={dispute.id} currentRole="admin" currentStatus={status} currentResolution={String(dispute.resolution || "")} /></section>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><div className="mb-2 flex items-center gap-2 text-green-600">{icon}<span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span></div><p className="break-words text-sm font-bold capitalize text-gray-800">{value}</p></div>;
}
