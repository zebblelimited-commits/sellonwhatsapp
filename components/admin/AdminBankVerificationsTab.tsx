"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { adminMutation } from "@/components/admin/adminApi";

type BankVerification = {
  id: string;
  storeId: string;
  vendorId?: string;
  storeName?: string;
  username?: string;
  ownerName?: string;
  ownerEmail?: string;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumber?: string;
  maskedAccountNumber?: string;
  status?: string;
  submittedAt?: string;
  reviewNotes?: string;
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG");
}

export default function AdminBankVerificationsTab() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState<BankVerification[]>([]);
  const [selected, setSelected] = useState<BankVerification | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Your admin session has expired.");
      const response = await fetch(`/api/admin/bank-verifications?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Bank verification requests could not be loaded");
      setRequests(payload.verifications || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bank verification requests could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    if (decision === "reject" && !notes.trim()) {
      setError("Add a rejection reason before rejecting this account.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      await adminMutation("/api/admin/bank-verifications", {
        storeId: selected.storeId,
        decision,
        notes: notes.trim(),
      });
      setSelected(null);
      setNotes("");
      await loadRequests();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Bank verification decision failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Payment bank verification</h2>
          <p className="text-sm text-gray-500">Confirm seller payout bank details before withdrawals are enabled.</p>
        </div>
        <div className="flex gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:ring-green-500">
            <option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All accounts</option>
          </select>
          <button type="button" onClick={() => void loadRequests()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Financial control:</strong> approving confirms the submitted bank details. Reject an account when the account name or bank information cannot be verified. Every decision is transaction-safe and written to the audit log.
      </div>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      {loading ? <div className="rounded-[28px] bg-white p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={30} /></div> : requests.length === 0 ? <div className="rounded-[28px] border border-gray-100 bg-white p-12 text-center"><Landmark size={44} className="mx-auto mb-3 text-gray-300" /><p className="font-bold text-gray-800">No {status === "all" ? "" : status} bank verification requests</p><p className="mt-1 text-sm text-gray-500">Seller payout accounts submitted for review will appear here.</p></div> : <div className="space-y-3">{requests.map((request) => <div key={request.id} className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{request.storeName || "Unnamed store"}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${request.status === "approved" ? "bg-green-100 text-green-700" : request.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{request.status || "pending"}</span></div><p className="mt-1 text-xs text-gray-500">{request.ownerName || "—"}{request.ownerEmail ? ` · ${request.ownerEmail}` : ""}</p><p className="mt-2 text-xs font-bold text-gray-700">{request.bankName || "—"} · {request.maskedAccountNumber || "Not provided"} · {request.accountName || "—"}</p><p className="mt-1 text-[10px] text-gray-400">Submitted {formatDate(request.submittedAt)}</p></div><button type="button" onClick={() => { setSelected(request); setNotes(request.reviewNotes || ""); setError(""); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">Review</button></div></div>)}</div>}

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-gray-900">Review payout account</h3><p className="text-xs text-gray-500">{selected.storeName || "Unnamed store"} · submitted {formatDate(selected.submittedAt)}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Seller</p><p className="mt-1 text-sm font-bold text-gray-800">{selected.ownerName || "—"}</p><p className="text-xs text-gray-500">{selected.ownerEmail || selected.vendorId || "—"}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Bank</p><p className="mt-1 text-sm font-bold text-gray-800">{selected.bankName || "—"}</p><p className="text-xs text-gray-500">Code: {selected.bankCode || "—"}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Account name</p><p className="mt-1 text-sm font-bold text-gray-800">{selected.accountName || "—"}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Account number</p><p className="mt-1 text-sm font-bold tracking-wider text-gray-800">{selected.accountNumber || selected.maskedAccountNumber || "Not provided"}</p></div></div><label className="mt-5 block text-xs font-bold text-gray-600">Review notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Required when rejecting; optional when approving" className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" /></label><div className="mt-5 flex gap-3"><button type="button" disabled={processing} onClick={() => void decide("reject")} className="flex-1 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-50">{processing ? "Processing…" : "Reject"}</button><button type="button" disabled={processing} onClick={() => void decide("approve")} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{processing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}{processing ? "Processing…" : "Approve account"}</button></div></div></div>}
    </div>
  );
}
