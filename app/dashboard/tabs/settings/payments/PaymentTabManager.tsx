"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Banknote, AlertCircle, ChevronsUpDown, Check, CheckCircle2, Save, Loader2 } from "lucide-react";
import PaymentForm from "./PaymentForm";

export default function PaymentTabManager({ storeId, initialSettings }: { storeId: string; initialSettings: any }) {
  const [payoutStatus, setPayoutStatus] = useState("LOADING");
  const [activeAccount, setActiveAccount] = useState({
    bankName: "Loading...", bankCode: "", accountNumber: "----------", accountName: "..."
  });

  useEffect(() => {
    async function loadPaymentData() {
      if (!storeId) return;
      try {
        // ✅ OPTIMIZATION: Use getDoc instead of getDocs(query) for single document lookup
        const storeSnap = await getDoc(doc(db, "stores", storeId));
        if (storeSnap.exists()) {
          const data = storeSnap.data();
          const payout = data.payoutSettings || {};
          setActiveAccount({
            bankName: payout.bankName || "Not Set", accountNumber: payout.accountNumber || "----------",
            accountName: payout.accountName || "No Name Provided", bankCode: payout.bankCode || ""
          });
          setPayoutStatus(payout.status || "VERIFIED");
          return;
        }

        const res = await fetch(`/api/vendor/payout-settings?storeId=${storeId}`);
        if (res.ok) {
          const data = await res.json();
          setActiveAccount({
            bankName: data.bankName || "Not Set", accountNumber: data.accountNumber || "----------",
            accountName: data.accountName || "No Name Provided", bankCode: data.bankCode || ""
          });
          setPayoutStatus(data.status || "VERIFIED");
        }
      } catch (err) { console.error("Failed to load settings", err); }
    }
    loadPaymentData();
  }, [storeId]);

  return (
    <div className="grid w-full min-w-0 max-w-full grid-cols-1 items-start gap-8 overflow-x-hidden lg:grid-cols-12">
      <div className="lg:col-span-7">
        <PaymentForm
          storeId={storeId}
          initialData={activeAccount}
          onComplete={() => setPayoutStatus("PENDING_REVIEW")}
        />
      </div>

      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-gray-900">Active Payout Account</h4>
            <StatusBadge status={payoutStatus} />
          </div>

          <div className="p-5 bg-gray-50 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm"><Banknote size={20} className="text-gray-400" /></div>
              <div><p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Bank</p><p className="text-xs font-bold text-gray-800">{activeAccount.bankName}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Number</p><p className="text-xs font-bold text-gray-800 tracking-wider">{activeAccount.accountNumber}</p></div>
              <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Name</p><p className="text-xs font-bold text-gray-800 truncate">{activeAccount.accountName}</p></div>
            </div>
          </div>

          {payoutStatus === "PENDING_REVIEW" && (
            <div className="flex gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
              <AlertCircle size={14} className="text-amber-600 shrink-0" />
              <p className="text-[10px] font-bold text-amber-700">Changes pending review. Payouts will continue to the old account until verified.</p>
            </div>
          )}
        </div>

        <div className="bg-green-50/50 border border-green-100 rounded-[32px] p-8">
          <h3 className="font-bold text-lg text-green-900 mb-2">SellOnWhatsapp Escrow</h3>
          <p className="text-green-700 text-xs font-medium leading-relaxed">
            Your payout configuration is active. SellOnWhatsapphandles the escrow and releases your 97% share directly to your bank once customers confirm receipt on WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { VERIFIED: "bg-green-100 text-green-700", PENDING_REVIEW: "bg-amber-100 text-amber-700", LOADING: "bg-gray-100 text-gray-400" };
  return <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${styles[status] || styles.LOADING}`}>{(status || "LOADING").replace("_", " ")}</span>;
}
