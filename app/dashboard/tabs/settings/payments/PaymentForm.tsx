"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ChevronsUpDown, Check, CheckCircle2, Save, Loader2, AlertCircle } from "lucide-react";

export default function PaymentForm({ storeId, initialData, onComplete }: { storeId: string; initialData: any; onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [formData, setFormData] = useState({ bankName: "", bankCode: "", accountNumber: "", accountName: "" });

  // ✅ UX FIX: Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (initialData.bankName !== "Loading...") setFormData(initialData);
  }, [initialData]);

  useEffect(() => {
    async function fetchBanks() {
      try {
        setBanksLoading(true);
        const res = await fetch("/api/webhooks/nomba/banks");
        if (!res.ok) throw new Error("Failed to fetch banks");
        const data = await res.json();
        const formattedBanks = (data?.banks || []).map((bank: any) => ({ name: bank.name, code: bank.code })).sort((a: any, b: any) => a.name.localeCompare(b.name));
        setBanks(formattedBanks);
      } catch (err) { setError("Unable to load banks"); } 
      finally { setBanksLoading(false); }
    }
    fetchBanks();
  }, []);

  const filteredBanks = useMemo(() => banks.filter(bank => bank.name.toLowerCase().includes(search.toLowerCase())), [banks, search]);

  const handleSave = async () => {
    if (!formData.bankCode || !formData.accountNumber) return setError("Please fill in all bank details.");
    setLoading(true); setError(null);
    try {
      await updateDoc(doc(db, "stores", storeId), {
        payoutSettings: { ...formData, status: "PENDING_REVIEW", submittedAt: serverTimestamp(), updatedAt: serverTimestamp() }
      });
      setLoading(false); setShowModal(true);
    } catch (err: any) { setError(err.message || "Failed to save."); setLoading(false); }
  };

  return (
    <>
      <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm space-y-6">
        <h3 className="font-bold text-lg">Update Payment Details</h3>
        {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[10px] font-bold flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5 relative" ref={dropdownRef}>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Select Bank</label>
            <div onClick={() => setIsOpen(!isOpen)} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold flex justify-between items-center cursor-pointer">
              <span>{banksLoading ? "Loading banks..." : formData.bankName || "Select Your Bank"}</span>
              <ChevronsUpDown size={14} />
            </div>
            {isOpen && (
              <div className="absolute top-full left-0 w-full bg-white border rounded-2xl mt-2 shadow-xl z-50 max-h-80 overflow-hidden">
                <input autoFocus className="w-full p-4 text-xs font-bold border-b outline-none" placeholder="Search banks..." onChange={(e) => setSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
                <div className="max-h-60 overflow-y-auto">
                  {filteredBanks.length === 0 ? (
                    <div className="p-4 text-xs text-gray-400 text-center">{search ? "No banks found" : "Start typing to search"}</div>
                  ) : (
                    filteredBanks.map((b) => (
                      <div key={b.code} onClick={() => { setFormData({ ...formData, bankName: b.name, bankCode: b.code }); setIsOpen(false); }} className="p-3 text-xs font-bold hover:bg-green-50 cursor-pointer flex items-center justify-between">
                        {b.name} {formData.bankCode === b.code && <Check size={14} className="text-green-600" />}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Account Number</label>
            <input placeholder="0123456789" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:border-green-200 transition-all" maxLength={10} />
            {formData.accountNumber.length === 10 && <p className="text-[10px] text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> Valid account number format</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Account Name</label>
            <input placeholder="Enter Full Account Name" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold outline-none focus:bg-white focus:border-green-200 transition-all" />
            <p className="text-[10px] text-gray-400">Must match the name on your bank account for verification.</p>
          </div>
        </div>

        <button onClick={handleSave} disabled={loading} className="w-full py-4 bg-green-600 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} {loading ? "Saving..." : "Submit for Review"}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95">
            <CheckCircle2 size={40} className="text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Request Submitted</h3>
            <p className="text-gray-500 text-sm mb-8 font-medium">Your changes have been sent to the <span className="text-green-600 font-bold">Zebble</span> review team.</p>
            <button onClick={() => { setShowModal(false); onComplete(); }} className="w-full py-4 bg-gray-900 text-white rounded-2xl text-xs font-bold active:scale-95 transition-transform">Continue</button>
          </div>
        </div>
      )}
    </>
  );
}