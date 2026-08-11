"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  ArrowUpRight, ShieldCheck, Info, Loader2,
  Clock, CheckCircle2, XCircle, Copy, ChevronRight, Crown,
  Wallet, Lock, CreditCard, Building2, AlertCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface BankDetails {
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

interface PayoutRecord {
  id: string;
  status?: string;
  requestedAt?: { toDate?: () => Date } | string | number;
  netAmount?: number;
  grossAmount?: number;
  amount?: number;
  platformFee?: number;
  providerReference?: string;
  nombaReference?: string;
  providerStatus?: string;
  balanceRestoredAt?: { toDate?: () => Date } | string | number;
}

interface WithdrawTabProps {
  stats: {
    availableBalance?: number;
    escrowBalance?: number;
    totalSales?: number;
    isPartner?: boolean;
    partnerExpiry?: string;
  };
  bankDetails?: BankDetails;
  payoutHistory?: PayoutRecord[];
}

export default function WithdrawTab({ stats, bankDetails, payoutHistory = [] }: WithdrawTabProps) {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const withdrawalControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    withdrawalControllerRef.current?.abort();
  }, []);

  // ✅ DYNAMIC FEE CALCULATION
  const isPartnerActive = Boolean(stats?.isPartner && stats?.partnerExpiry && new Date(stats.partnerExpiry) > new Date());
  const SOWA_FEE_PERCENT = isPartnerActive ? 0.015 : 0.03; 
  const FEE_DISPLAY = isPartnerActive ? '1.5%' : '3%';
  
  const rawAvailableValue = Number(stats?.availableBalance ?? 0);
  const rawAvailable = Number.isFinite(rawAvailableValue) ? Math.max(0, rawAvailableValue) : 0;
  const availableSowaFee = rawAvailable * SOWA_FEE_PERCENT;
  const netAvailable = rawAvailable - availableSowaFee;
  const rawEscrow = Number(stats?.escrowBalance ?? 0);
  const escrowBalance = Number.isFinite(rawEscrow) ? Math.max(0, rawEscrow) : 0;

  useEffect(() => {
    if (netAvailable > 0 && !withdrawAmount) {
      // This effect fills the initial amount after the canonical ledger loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWithdrawAmount(netAvailable.toString());
    }
  }, [netAvailable, withdrawAmount]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

  const handleWithdraw = async () => {
    if (isWithdrawing || withdrawalControllerRef.current) return;

    const amount = parseFloat(withdrawAmount) || 0;
    if (amount <= 0 || amount > netAvailable) {
      setNotification({ type: 'error', message: 'Invalid amount. Please enter a valid value up to your available balance.' });
      return;
    }
    const controller = new AbortController();
    withdrawalControllerRef.current = controller;
    const requestTimeout = window.setTimeout(() => controller.abort(), 35000);
    setIsWithdrawing(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const idToken = await user.getIdToken();
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ amount }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal request failed');
      if (mountedRef.current) {
        setNotification({
          type: 'success',
          message: data.pending
            ? `⏳ ${data.message}`
            : `✅ Successfully requested withdrawal of ${formatCurrency(amount)}`,
        });
        setWithdrawAmount("");
      }
    } catch (error: unknown) {
      const isAbortError = error instanceof DOMException
        ? error.name === "AbortError"
        : error instanceof Error && error.name === "AbortError";
      if (isAbortError) return;
      console.error("Withdrawal failed:", error);
      if (mountedRef.current) {
        setNotification({ type: 'error', message: `❌ ${error instanceof Error ? error.message : 'Withdrawal failed. Please try again.'}` });
      }
    } finally {
      window.clearTimeout(requestTimeout);
      if (withdrawalControllerRef.current === controller) {
        withdrawalControllerRef.current = null;
        if (mountedRef.current) setIsWithdrawing(false);
      }
    }
  };

  const handleQuickPercent = (percent: number) => setWithdrawAmount(Math.floor(netAvailable * (percent / 100)).toString());
  
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
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden animate-in fade-in duration-500">
      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-medium animate-in slide-in-from-top-2 ${
          notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {notification.message}
        </div>
      )}

      {/* 🌟 TOP SECTION: 3 Cards in a Row (Reverted to your original layout) */}
      <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 md:grid-cols-3">
        
        {/* Card 1: Withdraw to Bank (GREEN BACKGROUND - ENHANCED FONTS) */}
        <div className={`min-w-0 max-w-full rounded-3xl shadow-sm p-6 min-h-[280px] flex flex-col ${
          isPartnerActive 
            ? 'bg-gradient-to-br from-amber-400 to-orange-500 border border-amber-300' 
            : 'bg-gradient-to-br from-green-500 to-emerald-600 border border-green-400'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <ArrowUpRight size={24} className="text-white" />
            </div>
            {isPartnerActive && (
              <div className="flex items-center gap-1 bg-white/30 backdrop-blur-sm px-2 py-1 rounded-full border border-white/40">
                <Crown size={12} className="text-white" />
                <span className="text-[9px] font-black text-white uppercase">1.5% Fee</span>
              </div>
            )}
          </div>
          
          {/* 🌟 ENHANCED TYPOGRAPHY FOR EMPHASIS */}
          <p className="text-x font-black text-white uppercase tracking-wider mb-1">Withdraw to Bank</p>
          <p className="text-xl font-black text-white mb-4">Net: {formatCurrency(netAvailable)}</p>

          {/* Compact Withdraw Form INSIDE the green card */}
          <div className="mt-auto space-y-2">
            {/* Quick % Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  onClick={() => handleQuickPercent(p)}
                  disabled={isWithdrawing}
                  className="py-2 rounded-lg text-sm font-black bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-all"
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-white/70">₦</span>
              <input 
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isWithdrawing}
                max={netAvailable}
                className="w-full bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl pl-10 pr-16 py-3 text-xl font-black text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
                placeholder="0"
              />
              <button 
                onClick={() => setWithdrawAmount(netAvailable.toString())}
                disabled={isWithdrawing}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/20 hover:bg-white/30 rounded-md text-[9px] font-bold text-white transition-colors"
              >
                MAX
              </button>
            </div>

            {/* Withdraw Button */}
            <button 
              onClick={handleWithdraw}
              disabled={isWithdrawing || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > netAvailable || netAvailable <= 0}
              className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-gray-50 text-gray-900"
            >
              {isWithdrawing ? (
                <>Processing <Loader2 size={14} className="animate-spin" /></>
              ) : netAvailable <= 0 ? (
                <>No Funds Available</>
              ) : (
                <>Withdraw {formatCurrency(parseFloat(withdrawAmount) || 0)} <ArrowUpRight size={14} /></>
              )}
            </button>
          </div>
        </div>

        {/* Card 2: Funds in Escrow (Changed from Total Sales) */}
        <div className="min-w-0 max-w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-6 min-h-[280px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
              <Lock size={24} className="text-purple-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Funds in Escrow</p>
          <h3 className="text-2xl font-black text-gray-900 mb-2">{formatCurrency(escrowBalance)}</h3>
          <p className="text-xs text-gray-400 mb-4">Locked until delivery</p>
          <div className="mt-auto pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
              <span className="font-bold uppercase tracking-wider text-[10px]">Secured Ledger</span>
            </div>
          </div>
        </div>

        {/* Card 3: Available Balance (Left exactly as requested) */}
        <div className="min-w-0 max-w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-6 min-h-[280px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Wallet size={24} className="text-blue-600" />
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Available Balance</p>
          <h3 className="text-2xl font-black text-gray-900 mb-2">{formatCurrency(rawAvailable)}</h3>
          <p className="text-xs text-gray-400 mb-4">Gross balance before fees</p>
          <div className="mt-auto pt-4 border-t border-gray-100 space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-500 font-medium">Platform Fee ({FEE_DISPLAY})</span>
              <span className="text-red-500 font-bold">-{formatCurrency(availableSowaFee)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-700 font-bold">Net Withdrawable</span>
              <span className="text-green-600 font-black">{formatCurrency(netAvailable)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 PAYOUT DESTINATION (Fetches and displays bank details) */}
      <div className="min-w-0 max-w-full overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={18} className="text-gray-400" /> Payout Destination
          </h3>
          {bankDetails?.accountNumber && (
            <Link href="/dashboard?tab=settings" className="text-[10px] font-black text-green-600 hover:text-green-700 uppercase tracking-wider flex items-center gap-1">
              Edit Settings <ChevronRight size={12} />
            </Link>
          )}
        </div>
        
        {bankDetails?.accountNumber ? (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <CreditCard size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">{bankDetails.bankName || "Bank Account"}</p>
                <p className="text-xs text-gray-500 font-medium">
                  {bankDetails.accountNumber} • {bankDetails.accountName || "Account Holder"}
                </p>
              </div>
            </div>
            <ShieldCheck size={24} className="text-green-600 shrink-0" />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-black text-red-900">No Bank Account Linked</p>
                <p className="text-xs text-red-600 font-medium">Please add a bank account to process withdrawals.</p>
              </div>
            </div>
            <Link href="/dashboard?tab=settings" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors">
              Add Account
            </Link>
          </div>
        )}
      </div>

      {/* Payout History */}
      <div className="min-w-0 max-w-full overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Info size={18} className="text-gray-400" /> Payout History
          </h3>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{history.length} Transactions</span>
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
          <div className="p-8 text-center text-gray-400 text-sm">
            No payout history available yet.
          </div>
        )}
      </div>

      {/* Payout Guidelines */}
      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
        <h4 className="font-bold text-gray-900 mb-3 text-sm">💡 Payout Guidelines</h4>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="mt-0.5 text-green-600 shrink-0" />
            <span>
              <strong>{FEE_DISPLAY} SOWA platform fee</strong> is deducted automatically at withdrawal. 
              {isPartnerActive && <span className="text-amber-600 font-bold"> (You are enjoying reduced fees as a Partner!)</span>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="mt-0.5 text-green-600 shrink-0" />
            <span>Funds are processed to your linked bank account within 24 hours.</span>
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={16} className="mt-0.5 text-green-600 shrink-0" />
            <span>Escrow funds only release after buyer confirms delivery or dispute window closes.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
