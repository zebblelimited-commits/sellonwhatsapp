"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

const naira = (value: unknown) => `₦${Number(value || 0).toLocaleString("en-NG")}`;

export default function AdminReferralPayoutsTab() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch("/api/admin/referral-payouts", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Referral payouts could not be loaded");
    setPayouts(payload.payouts || []);
  };

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Referral payouts could not be loaded")).finally(() => setLoading(false)); }, []);

  const update = async (payoutId: string, status: string) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    setProcessing(payoutId);
    try {
      const response = await fetch("/api/admin/referral-payouts", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ payoutId, status }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Payout update failed");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payout update failed"); }
    finally { setProcessing(""); }
  };

  const visible = payouts.filter((item) => !search || [item.id, item.userId, item.accountName, item.accountNumber, item.status].some((value) => String(value || "").toLowerCase().includes(search.toLowerCase())));
  if (loading) return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={30} /></div>;

  return <div className="space-y-6 animate-in fade-in duration-300">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-xl font-bold text-gray-900">Referral Payouts</h2><p className="text-sm text-gray-500">Review ₦5,000+ referral wallet withdrawal requests.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests…" className="w-60 rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-green-600" /></div></div>
    {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
    <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="border-b border-gray-100 bg-gray-50"><tr><th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">User</th><th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Amount</th><th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Bank account</th><th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th><th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th></tr></thead><tbody className="divide-y divide-gray-50">{visible.map((item) => <tr key={item.id}><td className="px-6 py-4"><p className="font-bold text-sm">{item.userId}</p><p className="text-[10px] text-gray-400">{item.id}</p></td><td className="px-6 py-4"><p className="font-black text-green-700">{naira(item.amountNaira)}</p><p className="text-[10px] text-gray-400">{Number(item.points || 0).toLocaleString()} points</p></td><td className="px-6 py-4 text-xs"><p className="font-bold">{item.bankName || "—"}</p><p>{item.accountName || "—"}</p><p className="font-mono text-gray-500">{item.accountNumber || "—"}</p></td><td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.status === "paid" ? "bg-green-100 text-green-700" : item.status === "rejected" ? "bg-red-100 text-red-700" : item.status === "approved" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{item.status || "pending"}</span></td><td className="px-6 py-4"><div className="flex gap-2">{item.status === "pending" && <><button disabled={processing === item.id} onClick={() => void update(item.id, "approved")} className="rounded-xl bg-green-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{processing === item.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve</button><button disabled={processing === item.id} onClick={() => void update(item.id, "rejected")} className="rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50"><XCircle size={13} /> Reject</button></>}{item.status === "approved" && <button disabled={processing === item.id} onClick={() => void update(item.id, "paid")} className="rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Mark paid</button>}</div></td></tr>)}</tbody></table></div>{visible.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No referral payout requests found.</div>}</div>
  </div>;
}
