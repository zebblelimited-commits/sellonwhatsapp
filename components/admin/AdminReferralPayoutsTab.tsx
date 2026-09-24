"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Search, XCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

const naira = (value: unknown) => "₦" + Number(value || 0).toLocaleString("en-NG");
const dateText = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—";

function statusClass(status: string) {
  if (status === "paid" || status === "approved") return "bg-green-100 text-green-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  if (status === "processing") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export default function AdminReferralPayoutsTab() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [search, setSearch] = useState("");
  const [messageFor, setMessageFor] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch("/api/admin/referral-payouts", {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Referral payout records could not be loaded");
    setPayouts(payload.payouts || []);
    setAccounts(payload.accounts || []);
  };

  useEffect(() => {
    void load()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Referral payout records could not be loaded"))
      .finally(() => setLoading(false));
  }, []);

  const mutate = async (body: Record<string, unknown>, key: string) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    setError("");
    setProcessing(key);
    try {
      const response = await fetch("/api/admin/referral-payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Referral payout action failed");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Referral payout action failed");
    } finally {
      setProcessing("");
    }
  };

  const sendMessage = async () => {
    if (!messageFor || !message.trim()) return;
    await mutate({ action: "message", userId: messageFor, message: message.trim() }, "message:" + messageFor);
    setMessage("");
    setMessageFor("");
  };

  const query = search.toLowerCase();
  const visiblePayouts = payouts.filter((item) =>
    !query || [item.id, item.userId, item.accountName, item.accountNumber, item.status]
      .some((value) => String(value || "").toLowerCase().includes(query))
  );
  const visibleAccounts = accounts.filter((item) =>
    !query || [item.userId, item.name, item.email, item.bankName, item.accountName, item.accountNumber, item.status]
      .some((value) => String(value || "").toLowerCase().includes(query))
  );

  if (loading) return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={30} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Referral Payouts</h2>
          <p className="text-sm text-gray-500">Review payout accounts, withdrawal requests, and Nomba transfer status.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" className="w-64 rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-green-600" />
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-6">
          <h3 className="font-bold text-gray-900">Saved payout accounts</h3>
          <p className="mt-1 text-xs text-gray-500">Review the verified bank account before allowing referral withdrawals.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">User</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Bank account</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Submitted</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleAccounts.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-900">{item.name}</p>
                    <p className="text-[10px] text-gray-400">{item.email || item.userId}</p>
                    <p className="font-mono text-[10px] text-gray-400">{item.userId}</p>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <p className="font-bold">{item.bankName || "—"} <span className="font-normal text-gray-400">({item.bankCode || "—"})</span></p>
                    <p>{item.accountName || "—"}</p>
                    <p className="font-mono text-gray-500">{item.accountNumber || "—"}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">{dateText(item.submittedAt)}</td>
                  <td className="px-6 py-4">
                    <span className={"rounded-full px-2 py-1 text-[9px] font-black uppercase " + statusClass(item.status)}>{item.status || "pending_review"}</span>
                    {item.reviewNote && <p className="mt-2 max-w-[180px] text-[10px] text-gray-400">{item.reviewNote}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {item.status === "pending_review" && (
                        <>
                          <button disabled={processing === "account:" + item.userId} onClick={() => void mutate({ action: "account-decision", userId: item.userId, decision: "approved" }, "account:" + item.userId)} className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">
                            {processing === "account:" + item.userId ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                          </button>
                          <button disabled={processing === "account:" + item.userId} onClick={() => void mutate({ action: "account-decision", userId: item.userId, decision: "rejected" }, "account:" + item.userId)} className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50">
                            <XCircle size={13} /> Reject
                          </button>
                        </>
                      )}
                      <button onClick={() => setMessageFor(messageFor === item.userId ? "" : item.userId)} className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-bold text-gray-700">
                        <MessageSquare size={13} /> Message
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleAccounts.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No saved referral payout accounts found.</div>}
        {messageFor && (
          <div className="border-t border-gray-100 bg-gray-50 p-5">
            <p className="mb-2 text-xs font-bold text-gray-700">Message user {messageFor}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={2} placeholder="Write a message about the payout account…" className="min-h-16 flex-1 rounded-xl border border-gray-200 bg-white p-3 text-xs outline-none focus:border-green-600" />
              <button disabled={!message.trim() || processing === "message:" + messageFor} onClick={() => void sendMessage()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {processing === "message:" + messageFor ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />} Send message
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-6">
          <h3 className="font-bold text-gray-900">Withdrawal requests</h3>
          <p className="mt-1 text-xs text-gray-500">Approve a request, execute it through Nomba, or reject it to return the points.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">User</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Bank account</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiblePayouts.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4"><p className="text-sm font-bold">{item.userId}</p><p className="text-[10px] text-gray-400">{item.id}</p></td>
                  <td className="px-6 py-4"><p className="font-black text-green-700">{naira(item.amountNaira)}</p><p className="text-[10px] text-gray-400">{Number(item.points || 0).toLocaleString()} points</p></td>
                  <td className="px-6 py-4 text-xs"><p className="font-bold">{item.bankName || "—"}</p><p>{item.accountName || "—"}</p><p className="font-mono text-gray-500">{item.accountNumber || "—"}</p></td>
                  <td className="px-6 py-4"><span className={"rounded-full px-2 py-1 text-[9px] font-black uppercase " + statusClass(item.status)}>{item.status || "pending"}</span>{item.providerStatus && <p className="mt-2 text-[10px] text-gray-400">Nomba: {item.providerStatus}</p>}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {item.status === "pending" && (
                        <>
                          <button disabled={processing === item.id} onClick={() => void mutate({ payoutId: item.id, status: "approved" }, item.id)} className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{processing === item.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve</button>
                          <button disabled={processing === item.id} onClick={() => void mutate({ payoutId: item.id, status: "rejected" }, item.id)} className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50"><XCircle size={13} /> Reject</button>
                        </>
                      )}
                      {item.status === "approved" && <button disabled={processing === item.id} onClick={() => void mutate({ action: "execute", payoutId: item.id }, item.id)} className="rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{processing === item.id ? <Loader2 size={13} className="inline animate-spin" /> : "Execute payout"}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visiblePayouts.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No referral withdrawal requests found.</div>}
      </section>
    </div>
  );
}
