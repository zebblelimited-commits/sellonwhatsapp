"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { auth } from "@/lib/firebase";

type AuditLog = {
  id: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  performedBy?: string;
  performedByEmail?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  createdAt?: string;
};

export default function AdminAuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Your admin session has expired.");
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      const response = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Audit logs could not be loaded");
      setLogs(payload.logs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Audit logs could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [action, targetType]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLogs(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Audit logs</h2>
          <p className="text-sm text-gray-500">Review administrative actions and security events.</p>
        </div>
        <button onClick={() => void loadLogs()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-green-500">
          <option value="">All targets</option>
          <option value="admin">Admin</option><option value="user">User</option><option value="vendor">Vendor</option><option value="store">Store</option>
          <option value="order">Order</option><option value="payout">Payout</option><option value="dispute">Dispute</option><option value="system">System</option>
        </select>
        <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter action..." className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" />
      </div>
      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
        {loading ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={28} /></div> : logs.length === 0 ? <p className="p-10 text-center text-sm text-gray-500">No audit events match these filters.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400"><tr><th className="px-5 py-4">Time</th><th className="px-5 py-4">Action</th><th className="px-5 py-4">Target</th><th className="px-5 py-4">Performed by</th><th className="px-5 py-4">Details</th></tr></thead>
            <tbody className="divide-y divide-gray-50">{logs.map((log) => <tr key={log.id} className="align-top hover:bg-gray-50/60">
              <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{log.timestamp || log.createdAt ? new Date(log.timestamp || log.createdAt || "").toLocaleString("en-NG") : "—"}</td>
              <td className="px-5 py-4 font-bold text-gray-900">{log.action || "—"}</td>
              <td className="px-5 py-4 text-xs text-gray-600">{log.targetType || "—"}<br /><span className="text-gray-400">{log.targetId || ""}</span></td>
              <td className="px-5 py-4 text-xs text-gray-600">{log.performedByEmail || log.performedBy || "System"}</td>
              <td className="max-w-xs px-5 py-4 text-xs text-gray-500"><pre className="whitespace-pre-wrap break-words font-sans">{log.details ? JSON.stringify(log.details) : "—"}</pre></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
