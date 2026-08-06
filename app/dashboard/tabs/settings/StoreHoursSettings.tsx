"use client";
import React, { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Clock, MessageCircle, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function StoreHoursSettings({ storeId, initialSettings }: { storeId: string; initialSettings: any }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hours, setHours] = useState(() => {
    const defaultHours = {
      monday: { open: "09:00", close: "18:00", enabled: true }, tuesday: { open: "09:00", close: "18:00", enabled: true },
      wednesday: { open: "09:00", close: "18:00", enabled: true }, thursday: { open: "09:00", close: "18:00", enabled: true },
      friday: { open: "09:00", close: "18:00", enabled: true }, saturday: { open: "10:00", close: "16:00", enabled: true },
      sunday: { open: "12:00", close: "16:00", enabled: false }
    };
    return initialSettings?.storeHours || defaultHours;
  });
  
  const [autoReply, setAutoReply] = useState(initialSettings?.whatsappAutoReply || {
    enabled: false, message: "Thanks for reaching out! We'll respond within 2 hours during business hours."
  });

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const dayLabels: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      await updateDoc(doc(db, "stores", storeId), { storeHours: hours, whatsappAutoReply: autoReply, updatedAt: serverTimestamp() });
      setMessage({ type: "success", text: "Store hours updated successfully" });
    } catch (error) { setMessage({ type: "error", text: "Failed to save changes." }); } 
    finally { setSaving(false); }
  };

  const updateHour = (day: string, field: "open" | "close" | "enabled", value: any) => {
    setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {message.text}
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Clock size={18} className="text-gray-400" /> Store Hours</h3>
        <p className="text-sm text-gray-500 mb-6">Set your WhatsApp availability. Customers will see these hours on your storefront.</p>
        <div className="space-y-4">
          {days.map(day => (
            <div key={day} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <button onClick={() => updateHour(day, "enabled", !hours[day].enabled)} className={`relative w-10 h-6 rounded-full transition-colors ${hours[day].enabled ? "bg-green-600" : "bg-gray-200"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${hours[day].enabled ? "translate-x-4" : ""}`} />
                </button>
                <span className={`text-sm font-bold ${hours[day].enabled ? "text-gray-900" : "text-gray-400"}`}>{dayLabels[day]}</span>
              </div>
              {hours[day].enabled ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={hours[day].open} onChange={(e) => updateHour(day, "open", e.target.value)} className="p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none" />
                  <span className="text-gray-400">to</span>
                  <input type="time" value={hours[day].close} onChange={(e) => updateHour(day, "close", e.target.value)} className="p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
              ) : (<span className="text-xs font-bold text-gray-400">Closed</span>)}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><MessageCircle size={18} className="text-gray-400" /> WhatsApp Auto-Reply</h3>
          <button onClick={() => setAutoReply(prev => ({ ...prev, enabled: !prev.enabled }))} className={`relative w-12 h-7 rounded-full transition-colors ${autoReply.enabled ? "bg-green-600" : "bg-gray-200"}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${autoReply.enabled ? "translate-x-5" : ""}`} />
          </button>
        </div>
        {autoReply.enabled && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Auto-Reply Message</label>
            <textarea value={autoReply.message} onChange={(e) => setAutoReply(prev => ({ ...prev, message: e.target.value }))} rows={3} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none resize-none" />
          </div>
        )}
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md">
        {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Save Store Hours</>}
      </button>
    </div>
  );
}