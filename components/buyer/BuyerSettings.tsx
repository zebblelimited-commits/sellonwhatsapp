"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { 
  Bell, Shield, Phone, LogOut, User, Download, Trash2, 
  ChevronRight, Loader2, CheckCircle2, Moon, Globe, 
  Mail, MessageCircle, AlertTriangle 
} from "lucide-react";
import Image from "next/image";

export function BuyerSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState<any>(null);
  const [prefs, setPrefs] = useState({
    emailNotifs: true,
    whatsappNotifs: true,
    pushNotifs: true
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch buyer profile & preferences
  // Inside BuyerSettings useEffect:
useEffect(() => {
  const user = auth.currentUser;
  if (!user) {
    router.push("/login");
    return;
  }

  const unsub = onSnapshot(
    doc(db, "buyers", user.uid), 
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBuyer(data);
        setPrefs(prev => ({
          ...prev,
          emailNotifs: data.preferences?.emailNotifs ?? true,
          whatsappNotifs: data.preferences?.whatsappNotifs ?? true,
          pushNotifs: data.preferences?.pushNotifs ?? true
        }));
      }
      setLoading(false);
    },
    (error) => {
      // ✅ Handle permission errors gracefully
      console.error("Failed to load buyer profile:", error);
      
      if (error.code === "permission-denied") {
        setMessage({ 
          type: "error", 
          text: "Unable to load settings. Please check your account permissions." 
        });
        // Optional: Redirect to login if truly unauthorized
        // router.push("/login");
      }
      
      setLoading(false);
    }
  );

  return () => unsub();
}, [router]);

  // Clear auto-dismiss messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handlePrefToggle = async (key: string, value: boolean) => {
  const newPrefs = { ...prefs, [key]: value };
  setPrefs(newPrefs);
  setSaving(true);
  
  try {
    if (auth.currentUser) {
      // Inside handlePrefToggle, before updateDoc:
      console.log("🔐 Updating buyer profile:", {
        uid: auth.currentUser?.uid,
        path: `buyers/${auth.currentUser?.uid}`,
        fields: Object.keys({ preferences: newPrefs, updatedAt: serverTimestamp() }),
        newPrefs: newPrefs
      });

      // ✅ Only update the 'preferences' field (matches rules)
      await updateDoc(doc(db, "buyers", auth.currentUser.uid), {
        preferences: newPrefs,
        updatedAt: serverTimestamp()
      });
      setMessage({ type: "success", text: "Preferences updated successfully" });
    }
  } catch (err: any) {
    console.error("Failed to update preferences:", err);
    
    // ✅ Revert UI on failure
    setPrefs(prefs);
    
    // ✅ Show user-friendly error
    if (err.code === "permission-denied") {
      setMessage({ type: "error", text: "Permission denied. Please contact support." });
    } else {
      setMessage({ type: "error", text: "Failed to save changes. Please try again." });
    }
  } finally {
    setSaving(false);
  }
};

  const handleSignOut = async () => {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    try {
      await signOut(auth);
      await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
      router.replace("/login");
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={24} />
      </div>
    );
  }

  const displayName = buyer ? `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() : "Buyer";
  const userEmail = buyer?.email || auth.currentUser?.email || "user@example.com";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      {/* Auto-dismiss Message */}
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
          message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Profile Header */}
      <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0">
          {displayName.charAt(0).toUpperCase() || "B"}
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-gray-900 truncate">{displayName}</h2>
          <p className="text-xs text-gray-400 truncate">{userEmail}</p>
        </div>
        <button className="ml-auto p-2 hover:bg-gray-50 rounded-xl transition-colors">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <Bell size={18} className="text-gray-400" />
          <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
        </div>
        <div className="divide-y divide-gray-50">
          <SettingToggle 
            icon={<Mail size={16} />} 
            label="Email Notifications" 
            desc="Order updates & receipts" 
            checked={prefs.emailNotifs} 
            onChange={(v) => handlePrefToggle("emailNotifs", v)} 
          />
          <SettingToggle 
            icon={<MessageCircle size={16} />} 
            label="WhatsApp Alerts" 
            desc="Delivery & shipping updates" 
            checked={prefs.whatsappNotifs} 
            onChange={(v) => handlePrefToggle("whatsappNotifs", v)} 
          />
          <SettingToggle 
            icon={<Bell size={16} />} 
            label="Push Notifications" 
            desc="App & browser alerts" 
            checked={prefs.pushNotifs} 
            onChange={(v) => handlePrefToggle("pushNotifs", v)} 
          />
        </div>
      </div>

      {/* Security & Privacy */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <Shield size={18} className="text-gray-400" />
          <h3 className="font-bold text-gray-900 text-sm">Security & Privacy</h3>
        </div>
        <div className="divide-y divide-gray-50">
          <SettingItem icon={<Globe size={16} />} label="Change Password" desc="Update your account password" href="/settings/password" />
          <SettingItem icon={<Download size={16} />} label="Export Data" desc="Download your purchase history" />
          <SettingItem icon={<Trash2 size={16} />} label="Delete Account" desc="Permanently remove your account" danger />
        </div>
      </div>

      {/* Support */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <Phone size={18} className="text-gray-400" />
          <h3 className="font-bold text-gray-900 text-sm">Support</h3>
        </div>
        <div className="divide-y divide-gray-50">
          <SettingItem icon={<MessageCircle size={16} />} label="Help Center" desc="Browse FAQs & guides" href="/support" />
          <SettingItem icon={<Mail size={16} />} label="Contact Support" desc="Email us at help@zebble.com" href="mailto:help@zebble.com" />
        </div>
      </div>

      {/* Sign Out */}
      <button 
        onClick={handleSignOut}
        className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
      >
        <LogOut size={18} /> Sign Out
      </button>

      <p className="text-center text-[10px] text-gray-300 uppercase tracking-widest">
        Zebble Buyer App v1.0.0
      </p>
    </div>
  );
}

// --- Reusable UI Components ---

function SettingToggle({ icon, label, desc, checked, onChange }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-50 rounded-lg text-gray-400">{icon}</div>
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="text-[10px] text-gray-400 font-medium">{desc}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? "bg-green-600" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

function SettingItem({ icon, label, desc, href, danger }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  href?: string;
  danger?: boolean;
}) {
  const content = (
    <div className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${danger ? "text-red-600" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${danger ? "bg-red-50 text-red-400" : "bg-gray-50 text-gray-400"}`}>{icon}</div>
        <div>
          <p className="text-sm font-bold">{label}</p>
          <p className={`text-[10px] font-medium ${danger ? "text-red-400" : "text-gray-400"}`}>{desc}</p>
        </div>
      </div>
      <ChevronRight size={16} className={danger ? "text-red-300" : "text-gray-300"} />
    </div>
  );

  return href ? (
    <a href={href} target={href.startsWith("mailto") ? "_self" : "_blank"} rel="noopener noreferrer">{content}</a>
  ) : (
    <div onClick={() => console.log("Clicked:", label)}>{content}</div>
  );
}
