"use client";
import React, { useState, useEffect } from "react";
import { Loader2, Lock, Clock, Bell, CreditCard } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

// Import Sub-Components
import SecuritySettings from "./SecuritySettings";
import StoreHoursSettings from "./StoreHoursSettings";
import NotificationsSettings from "./NotificationsSettings";
import PaymentTabManager from "./payments/PaymentTabManager";

export default function SettingsTab({ storeId }: { storeId: string }) {
  const [subTab, setSubTab] = useState("payment");
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const unsub = onSnapshot(doc(db, "stores", storeId), (docSnap) => {
      if (docSnap.exists()) setStoreSettings(docSnap.data());
      setLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden animate-in fade-in duration-500">
      <div className="flex flex-wrap gap-2 mb-8 bg-gray-100/50 p-1.5 rounded-2xl w-fit">
        <SubTabBtn active={subTab === "security"} label="Security" icon={<Lock size={14} />} onClick={() => setSubTab("security")} />
        <SubTabBtn active={subTab === "hours"} label="Store Hours" icon={<Clock size={14} />} onClick={() => setSubTab("hours")} />
        <SubTabBtn active={subTab === "notifications"} label="Notifications" icon={<Bell size={14} />} onClick={() => setSubTab("notifications")} />
        <SubTabBtn active={subTab === "payment"} label="Payments" icon={<CreditCard size={14} />} onClick={() => setSubTab("payment")} />
      </div>

      <div className="w-full min-w-0 max-w-6xl">
        {subTab === "payment" && <PaymentTabManager storeId={storeId} initialSettings={storeSettings} />}
        {subTab === "security" && <SecuritySettings storeId={storeId} initialSettings={storeSettings} />}
        {subTab === "hours" && <StoreHoursSettings storeId={storeId} initialSettings={storeSettings} />}
        {subTab === "notifications" && <NotificationsSettings storeId={storeId} initialSettings={storeSettings} />}
      </div>
    </div>
  );
}

function SubTabBtn({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) { 
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${active ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
      {icon} {label}
    </button>
  ); 
}
