"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { adminMutation } from "@/components/admin/adminApi";

type VerificationRequest = {
  id: string;
  storeId?: string;
  storeName?: string;
  ownerName?: string;
  ownerEmail?: string;
  cacNumber?: string;
  businessAddress?: string;
  whatsappNumber?: string;
  status?: string;
  submittedAt?: string;
  createdAt?: string;
  reviewNotes?: string;
  cacDocument?: DocumentUpload;
  identification?: { type?: string; document?: DocumentUpload };
  payoutDetails?: { bankName?: string; accountName?: string; accountNumber?: string };
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string };
  documents?: DocumentUpload[];
};

type DocumentUpload = {
  type?: string;
  url?: string;
  secure_url?: string;
  secureUrl?: string;
  fileUrl?: string;
  downloadUrl?: string;
  uploadedAt?: string;
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG");
}

function maskAccount(value?: string) {
  if (!value) return "Not provided";
  return value.length > 4 ? `••••${value.slice(-4)}` : "••••";
}

function documentUrl(document?: DocumentUpload) {
  return document?.url || document?.secure_url || document?.secureUrl || document?.fileUrl || document?.downloadUrl || "";
}

function documentsFor(request: VerificationRequest) {
  const documents = (request.documents || []).map((document) => ({ ...document, url: documentUrl(document) })).filter((document) => document.url);
  const cacUrl = documentUrl(request.cacDocument);
  if (cacUrl && !documents.some((item) => item.url === cacUrl)) {
    documents.push({ type: "CAC certificate", url: cacUrl, uploadedAt: request.cacDocument?.uploadedAt });
  }
  const idUrl = documentUrl(request.identification?.document);
  if (idUrl && !documents.some((item) => item.url === idUrl)) {
    documents.push({ type: `${request.identification?.type || "Government ID"}`, url: idUrl, uploadedAt: request.identification?.document?.uploadedAt });
  }
  return documents;
}

export default function AdminVerificationsTab() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [selected, setSelected] = useState<VerificationRequest | null>(null);
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
      const response = await fetch(`/api/admin/verifications?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Verification requests could not be loaded");
      setRequests(payload.requests || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Verification requests could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  const selectedDocuments = useMemo(() => selected ? documentsFor(selected) : [], [selected]);
  const selectedPayoutDetails = selected?.payoutDetails || selected?.bankDetails;

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    if (decision === "reject" && !notes.trim()) {
      setError("Add a rejection reason before rejecting this request.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      await adminMutation("/api/admin/verifications", { requestId: selected.id, decision, notes: notes.trim() });
      setSelected(null);
      setNotes("");
      await loadRequests();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Verification decision failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Business verification</h2>
          <p className="text-sm text-gray-500">Review CAC/registration, owner ID, address, and payout details before awarding the Verified Business badge.</p>
        </div>
        <div className="flex gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:ring-green-500">
            <option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All requests</option>
          </select>
          <button onClick={() => void loadRequests()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900">
        <strong>Verification scope:</strong> This review controls the seller’s business badge. Bank details are shown masked and remain payout information; they do not make a store publicly verified by themselves.
      </div>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      {loading ? <div className="rounded-[28px] bg-white p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={30} /></div> : requests.length === 0 ? <div className="rounded-[28px] border border-gray-100 bg-white p-12 text-center"><ShieldCheck size={44} className="mx-auto mb-3 text-gray-300" /><p className="font-bold text-gray-800">No {status === "all" ? "" : status} verification requests</p><p className="mt-1 text-sm text-gray-500">New seller submissions will appear here.</p></div> : <div className="space-y-3">{requests.map((request) => <div key={request.id} className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{request.storeName || "Unnamed store"}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${request.status === "approved" ? "bg-green-100 text-green-700" : request.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{request.status || "pending"}</span></div><p className="mt-1 text-xs text-gray-500">Owner: {request.ownerName || "—"} · CAC: {request.cacNumber || "—"}</p><p className="mt-1 text-[10px] text-gray-400">Submitted {formatDate(request.submittedAt || request.createdAt)}</p></div><button onClick={() => { setSelected(request); setNotes(request.reviewNotes || ""); setError(""); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">Review</button></div></div>)}</div>}

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-gray-900">Review {selected.storeName || "business"}</h3><p className="text-xs text-gray-500">Request submitted {formatDate(selected.submittedAt || selected.createdAt)}</p></div><button onClick={() => setSelected(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-gray-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Business identity</p><p className="mt-2 text-sm"><strong>Owner:</strong> {selected.ownerName || "—"}</p><p className="text-sm"><strong>Email:</strong> {selected.ownerEmail || "—"}</p><p className="text-sm"><strong>CAC:</strong> {selected.cacNumber || "—"}</p><p className="text-sm"><strong>Address:</strong> {selected.businessAddress || "—"}</p><p className="text-sm"><strong>Contact:</strong> {selected.whatsappNumber || "—"}</p></div><div className="rounded-2xl bg-gray-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Payout details</p><p className="mt-2 text-sm"><strong>Bank:</strong> {selectedPayoutDetails?.bankName || "—"}</p><p className="text-sm"><strong>Account name:</strong> {selectedPayoutDetails?.accountName || "—"}</p><p className="text-sm"><strong>Account:</strong> {maskAccount(selectedPayoutDetails?.accountNumber)}</p><p className="mt-2 text-[10px] text-gray-400">Sensitive payout data is masked in this review.</p></div></div><div className="mt-5"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Submitted documents</p><div className="space-y-2">{selectedDocuments.length ? selectedDocuments.map((document, index) => <a key={`${document.url}-${index}`} href={document.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-sm hover:bg-gray-100"><span className="flex items-center gap-2 font-bold text-gray-800"><FileText size={16} className="text-gray-400" />{document.type || "Document"}</span><ExternalLink size={15} className="text-gray-400" /></a>) : <p className="text-sm text-gray-500">No document links were submitted.</p>}</div></div><label className="mt-5 block text-xs font-bold text-gray-600">Review notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Required when rejecting; optional when approving" className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" /></label><div className="mt-5 flex gap-3"><button disabled={processing} onClick={() => void decide("reject")} className="flex-1 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 disabled:opacity-50">{processing ? "Processing…" : "Reject"}</button><button disabled={processing} onClick={() => void decide("approve")} className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{processing ? "Processing…" : "Approve business"}</button></div></div></div>}
    </div>
  );
}
