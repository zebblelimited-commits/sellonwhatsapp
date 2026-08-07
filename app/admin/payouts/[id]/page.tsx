"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Clock3, DollarSign, FileText, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { adminMutation } from "@/components/admin/adminApi";
import { StatusBadge } from "@/components/admin/StatusBadge";

type PayoutRecord = Record<string, unknown> & { id: string };
const money = (value: unknown) => `₦${Number(value || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const firstValue = (source: Record<string, unknown>, ...keys: string[]) => keys.map((key) => source[key]).find((value) => value !== undefined && value !== null && value !== "");
const dateValue = (value: unknown) => {
  if (!value) return "—";
  const date = typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
};

export default function AdminPayoutDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const payoutId = params.id;
  const [payout, setPayout] = useState<PayoutRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!payoutId) return;
    const unsubscribe = onSnapshot(doc(db, "payouts", payoutId), (snapshot) => {
      if (snapshot.exists()) {
        const next = { id: snapshot.id, ...snapshot.data() } as PayoutRecord;
        setPayout(next);
        setProviderReference((current) => current || text(next.providerReference || next.nombaReference || next.reference) === "—" ? current : text(next.providerReference || next.nombaReference || next.reference));
      } else {
        setPayout(null);
      }
      setLoading(false);
    }, (snapshotError) => {
      console.error("Admin payout detail listener error:", snapshotError);
      setError("Payout details could not be loaded. Check admin permissions and try again.");
      setLoading(false);
    });
    return unsubscribe;
  }, [payoutId]);

  const reconcile = async (status: "processing" | "completed" | "failed" | "refunded") => {
    if (!payout) return;
    if ((status === "failed" || status === "refunded") && !reason.trim()) {
      setError("Enter a reconciliation reason first.");
      return;
    }
    if (status === "completed" && !providerReference.trim()) {
      setError("Enter the provider reference before confirming completion.");
      return;
    }
    setActionLoading(status);
    setError("");
    try {
      await adminMutation(`/api/admin/payouts/${encodeURIComponent(payout.id)}/reconcile`, {
        status,
        reason: reason.trim(),
        providerReference: providerReference.trim(),
      });
      setReason("");
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : "Payout reconciliation failed");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-green-600" size={30} /></div>;
  if (!payout) return <div className="rounded-3xl bg-white p-10 text-center"><ShieldAlert className="mx-auto mb-3 text-red-500" /><p className="font-bold">Payout not found</p><button onClick={() => router.back()} className="mt-4 text-sm font-bold text-green-700">Go back</button></div>;

  const rawStatus = String(payout.status || "pending").toLowerCase();
  const status = rawStatus === "approved" ? "processing" : rawStatus;
  const canProcess = status === "pending";
  const canResolve = ["pending", "processing"].includes(status);
  const canComplete = canResolve;
  const nestedPayoutDetails = record(payout.payoutSettings || payout.bankDetails || payout.details);
  const sellerId = firstValue(payout, "vendorId", "storeId") || firstValue(nestedPayoutDetails, "vendorId", "storeId");
  const bankName = firstValue(payout, "bankName", "bank") || firstValue(nestedPayoutDetails, "bankName", "bank");
  const accountNumber = firstValue(payout, "accountNumber", "account") || firstValue(nestedPayoutDetails, "accountNumber", "account");
  const accountName = firstValue(payout, "accountName", "name") || firstValue(nestedPayoutDetails, "accountName", "name");
  const grossAmount = firstValue(payout, "grossAmount", "amount", "requestedAmount") || firstValue(nestedPayoutDetails, "grossAmount", "amount");
  const platformFee = firstValue(payout, "platformFee", "fee") || firstValue(nestedPayoutDetails, "platformFee", "fee");
  const netAmount = firstValue(payout, "netAmount", "netPayout") || firstValue(nestedPayoutDetails, "netAmount", "netPayout");
  const internalReference = text(firstValue(payout, "nombaReference", "transferReference", "reference") || payout.id);
  const providerReferenceValue = text(firstValue(payout, "providerReference")) !== "—"
    ? text(firstValue(payout, "providerReference"))
    : ["failed", "refunded"].includes(status) ? "Not issued — gateway rejected" : "Awaiting provider response";
  const providerStatusValue = text(firstValue(payout, "providerStatus", "gatewayStatus")) !== "—"
    ? text(firstValue(payout, "providerStatus", "gatewayStatus"))
    : ["failed", "refunded"].includes(status) ? "REJECTED" : "Awaiting provider response";
  const gatewayTimestamp = firstValue(payout, "gatewaySubmittedAt", "gatewayAttemptedAt") || (status === "failed" ? payout.requestedAt : undefined);
  const completedTimestamp = firstValue(payout, "completedAt");
  const balanceRestoredTimestamp = firstValue(payout, "balanceRestoredAt");
  const reconciledTimestamp = firstValue(payout, "reconciledAt", "refundedAt");
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900"><ArrowLeft size={16} /> Back to payouts</button>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-gray-400">Payout detail</p><h1 className="mt-1 break-all text-2xl font-black text-gray-900">{payout.id}</h1><p className="mt-1 text-sm text-gray-500">Requested {dateValue(payout.requestedAt || payout.createdAt)}</p></div><StatusBadge status={status} size="md" /></div>
      <div className="grid gap-4 md:grid-cols-3"><Info icon={<DollarSign size={16} />} label="Gross amount" value={money(grossAmount)} /><Info icon={<DollarSign size={16} />} label="Platform fee" value={money(platformFee)} /><Info icon={<DollarSign size={16} />} label="Net payout" value={money(netAmount)} /></div>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-black"><FileText size={17} className="text-green-600" /> Provider and seller</h2><Info label="Seller" value={text(sellerId)} /><Info label="Bank" value={`${text(bankName)} · ${text(accountNumber)}`} /><Info label="Account name" value={text(accountName)} /><Info label="Nomba reference" value={internalReference} /><Info label="Provider reference" value={providerReferenceValue} /><Info label="Provider status" value={providerStatusValue} />{Boolean(payout.providerMessage) && <Info label="Provider message" value={text(payout.providerMessage)} />}</div>
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-black"><Clock3 size={17} className="text-purple-600" /> Reconciliation timeline</h2><Info label="Gateway attempt" value={dateValue(gatewayTimestamp)} /><Info label="Completed" value={completedTimestamp ? dateValue(completedTimestamp) : status === "completed" ? "Completed timestamp not recorded" : "Not completed"} /><Info label="Balance restored" value={balanceRestoredTimestamp ? dateValue(balanceRestoredTimestamp) : status === "failed" || status === "refunded" ? "Restoration timestamp not recorded" : "Not applicable"} /><Info label="Reconciled" value={reconciledTimestamp ? dateValue(reconciledTimestamp) : status === "failed" || status === "refunded" ? "Reconciliation timestamp not recorded" : "Not reconciled"} /><Info label="Reason" value={text(payout.reconciliationReason || payout.failureReason || payout.refundReason)} /></div>
      </section>
      {(canProcess || canResolve) && <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-1 flex items-center gap-2 font-black"><RefreshCw size={17} className="text-blue-600" /> Safe reconciliation controls</h2><p className="mb-4 text-xs text-gray-500">Completion requires a provider reference. Failed/refunded actions restore the reserved gross amount only once.</p><div className="grid gap-3 md:grid-cols-2"><input value={providerReference} onChange={(event) => setProviderReference(event.target.value)} placeholder="Provider reference (required for completion)" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-600" /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for failed/refunded action" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-600" /></div><div className="mt-4 flex flex-wrap gap-2">{canProcess && <ActionButton label="Mark processing" icon={<RefreshCw size={14} />} loading={actionLoading === "processing"} onClick={() => reconcile("processing")} />}{canComplete && <ActionButton label="Confirm completed" icon={<CheckCircle2 size={14} />} loading={actionLoading === "completed"} onClick={() => reconcile("completed")} />}{canResolve && <ActionButton label="Mark failed + restore" icon={<XCircle size={14} />} loading={actionLoading === "failed"} onClick={() => reconcile("failed")} />}{canResolve && <ActionButton label="Mark refunded + restore" icon={<RefreshCw size={14} />} loading={actionLoading === "refunded"} onClick={() => reconcile("refunded")} danger />}</div></section>}
      {(["failed", "refunded"].includes(status) && !balanceRestoredTimestamp) && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">This payout has no balance-restoration timestamp. Verify the seller ledger before taking any further financial action; the system will not assume the balance was restored.</div>}
      {Boolean(payout.balanceRestoredAt) && <div className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">The seller balance was already restored for this payout. Reconciliation actions cannot restore it a second time.</div>}
    </div>
  );
}

function Info({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return <div className="mb-3 rounded-2xl bg-gray-50 p-3"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-400">{icon}{label}</p><p className="mt-1 break-words text-sm font-bold text-gray-800">{value}</p></div>;
}

function ActionButton({ label, icon, loading, onClick, danger = false }: { label: string; icon: React.ReactNode; loading: boolean; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} disabled={loading} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "bg-orange-600 hover:bg-orange-700" : "bg-gray-900 hover:bg-black"}`}>{loading ? <Loader2 size={14} className="animate-spin" /> : icon}{label}</button>;
}
