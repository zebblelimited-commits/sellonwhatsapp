"use client";
import { useState } from "react";
import { Info, CheckCircle2, Clock, XCircle, Copy } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PayoutRecord {
  id: string;
  status?: string;
  requestedAt?: { toDate?: () => Date } | string | number;
  netAmount?: number;
  grossAmount?: number;
  amount?: number;
  providerReference?: string;
  nombaReference?: string;
  providerStatus?: string;
}

interface PayoutsTabProps {
  payoutHistory?: PayoutRecord[];
}

export default function PayoutsTab({ payoutHistory = [] }: PayoutsTabProps) {
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(id);
    setTimeout(() => setCopiedRef(null), 1500);
  };

  const history = payoutHistory; 
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status.toLowerCase() === "approved" ? "processing" : status.toLowerCase();
    const config: Record<string, { label: string, icon: LucideIcon, bg: string, text: string }> = {
      completed: { label: "Completed", icon: CheckCircle2, bg: "bg-green-100", text: "text-green-700" },
      pending: { label: "Pending", icon: Clock, bg: "bg-yellow-100", text: "text-yellow-700" },
      processing: { label: "Processing", icon: Clock, bg: "bg-blue-100", text: "text-blue-700" },
      failed: { label: "Failed", icon: XCircle, bg: "bg-red-100", text: "text-red-700" },
      refunded: { label: "Refunded", icon: CheckCircle2, bg: "bg-orange-100", text: "text-orange-700" }
    };
    const { label, icon: Icon, bg, text } = config[normalizedStatus] || config.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${bg} ${text}`}>
        <Icon size={12} /> {label}
      </span>
    );
  };

  return (
    <div className="animate-in fade-in duration-500">
      {/* Payout History Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Info size={18} className="text-gray-400" /> Payout History
          </h3>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            {history.length} Transactions
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 font-semibold">Reference</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((item) => {
                const requestedAt = item.requestedAt;
                const payoutDate = requestedAt && typeof requestedAt === "object" && typeof requestedAt.toDate === "function"
                  ? requestedAt.toDate()
                  : typeof requestedAt === "string" || typeof requestedAt === "number"
                    ? new Date(requestedAt)
                    : new Date();
                const displayAmount = item.netAmount ?? item.grossAmount ?? item.amount ?? 0;
                const shortRef = item.id ? `PAY-${item.id.slice(-6).toUpperCase()}` : 'N/A';
                
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4 font-mono text-sm font-medium text-gray-700"><p>{shortRef}</p><p className="mt-1 text-[10px] font-normal text-gray-400">Provider: {item.providerReference || item.nombaReference || '—'}</p></td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {!isNaN(payoutDate.getTime()) 
                        ? payoutDate.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' }) 
                        : '—'}
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {typeof displayAmount === 'number' && !isNaN(displayAmount) 
                        ? formatCurrency(displayAmount) 
                        : '—'}
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(item.status || "pending")}</td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        onClick={() => copyToClipboard(item.id, item.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                        title="Copy Reference"
                      >
                        {copiedRef === item.id ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {history.length === 0 && (
          <div className="p-12 text-center text-gray-400 text-sm font-medium">
            No payout history available yet.
          </div>
        )}
      </div>
    </div>
  );
}
