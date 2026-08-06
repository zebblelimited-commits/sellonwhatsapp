"use client";
import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Mail, MessageCircle, Bell, Save, Loader2, CheckCircle2, AlertCircle, ShoppingCart, Banknote } from "lucide-react";

export default function NotificationsSettings({ storeId, initialSettings }: { storeId: string; initialSettings: any }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [prefs, setPrefs] = useState(() => ({
    email: { orders: initialSettings?.notifications?.email?.orders ?? true, payouts: initialSettings?.notifications?.email?.payouts ?? true, disputes: initialSettings?.notifications?.email?.disputes ?? true, marketing: initialSettings?.notifications?.email?.marketing ?? false },
    whatsapp: { orders: initialSettings?.notifications?.whatsapp?.orders ?? true, payouts: initialSettings?.notifications?.whatsapp?.payouts ?? false, disputes: initialSettings?.notifications?.whatsapp?.disputes ?? true },
    push: { orders: initialSettings?.notifications?.push?.orders ?? true, general: initialSettings?.notifications?.push?.general ?? true }
  }));

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      await updateDoc(doc(db, "stores", storeId), { notifications: prefs, updatedAt: serverTimestamp() });
      setMessage({ type: "success", text: "Notification preferences updated" });
    } catch (error) { setMessage({ type: "error", text: "Failed to save changes" }); } 
    finally { setSaving(false); }
  };

  const ToggleRow = ({ icon, label, desc, checked, onChange }: any) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white rounded-lg text-gray-400">{icon}</div>
        <div><p className="text-sm font-bold text-gray-900">{label}</p><p className="text-[10px] text-gray-400">{desc}</p></div>
      </div>
      <button onClick={() => onChange(!checked)} className={`relative w-10 h-6 rounded-full transition-colors ${checked ? "bg-green-600" : "bg-gray-200"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {message.text}
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Mail size={18} className="text-gray-400" /> Email Notifications</h3>
        <div className="space-y-3">
          <ToggleRow icon={<ShoppingCart size={16} />} label="New Orders" desc="Get notified when you receive a new order" checked={prefs.email.orders} onChange={(v: boolean) => setPrefs(p => ({ ...p, email: { ...p.email, orders: v } }))} />
          <ToggleRow icon={<Banknote size={16} />} label="Payouts & Withdrawals" desc="Updates about your payouts and withdrawal status" checked={prefs.email.payouts} onChange={(v: boolean) => setPrefs(p => ({ ...p, email: { ...p.email, payouts: v } }))} />
          <ToggleRow icon={<AlertCircle size={16} />} label="Disputes & Issues" desc="Alerts about customer disputes or order issues" checked={prefs.email.disputes} onChange={(v: boolean) => setPrefs(p => ({ ...p, email: { ...p.email, disputes: v } }))} />
          <ToggleRow icon={<Bell size={16} />} label="Promotions & Updates" desc="Platform news, tips, and promotional offers" checked={prefs.email.marketing} onChange={(v: boolean) => setPrefs(p => ({ ...p, email: { ...p.email, marketing: v } }))} />
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><MessageCircle size={18} className="text-[#25D366]" /> WhatsApp Notifications</h3>
        <div className="space-y-3">
          <ToggleRow icon={<ShoppingCart size={16} />} label="New Orders" desc="Instant WhatsApp alert for new orders" checked={prefs.whatsapp.orders} onChange={(v: boolean) => setPrefs(p => ({ ...p, whatsapp: { ...p.whatsapp, orders: v } }))} />
          <ToggleRow icon={<Banknote size={16} />} label="Payout Confirmations" desc="Get notified when payouts are processed" checked={prefs.whatsapp.payouts} onChange={(v: boolean) => setPrefs(p => ({ ...p, whatsapp: { ...p.whatsapp, payouts: v } }))} />
          <ToggleRow icon={<AlertCircle size={16} />} label="Urgent Disputes" desc="Critical alerts for active disputes" checked={prefs.whatsapp.disputes} onChange={(v: boolean) => setPrefs(p => ({ ...p, whatsapp: { ...p.whatsapp, disputes: v } }))} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md">
        {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Preferences</>}
      </button>
    </div>
  );
}