"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import {
  User, Mail, MapPin, Phone, Shield, Save, CheckCircle,
  Loader2, AlertTriangle, Edit2, X
} from "lucide-react";

// ✅ NAMED EXPORT: BuyerAccount
export function BuyerAccount({ onEditProfile }: { onEditProfile?: () => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [originalProfile, setOriginalProfile] = useState<any>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/login");
      return;
    }

    // ✅ FIX: Reads from 'users' collection to match AuthProvider and Profile tab
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(data);
          setOriginalProfile(data);
        } else {
          // Fallback if document doesn't exist yet
          const defaultData = {
            displayName: user.displayName || "",
            email: user.email || "",
            phone: "",
            address: "",
          };
          setProfile(defaultData);
          setOriginalProfile(defaultData);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load account:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // ✅ FIX: Updated field names to match the 'users' collection schema
  const hasChanges = profile && originalProfile && (
    profile.displayName !== originalProfile.displayName ||
    profile.phone !== originalProfile.phone ||
    profile.address !== originalProfile.address
  );

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !profile) return;

    setSaving(true);
    setMessage(null);

    try {
      if (profile.displayName !== originalProfile?.displayName) {
        await updateProfile(user, { displayName: profile.displayName });
      }

      // ✅ FIX: Saves to 'users' collection with correct field names
      await updateDoc(doc(db, "users", user.uid), {
        displayName: profile.displayName,
        phone: profile.phone || "",
        address: profile.address || "",
        updatedAt: serverTimestamp()
      });

      setOriginalProfile(profile);
      setMessage({ type: "success", text: "Account updated successfully!" });

    } catch (error: any) {
      console.error("Update error:", error);
      setMessage({ type: "error", text: "Failed to update account." });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setProfile(originalProfile);
    setMessage(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto text-red-400 mb-4" size={40} />
        <p className="font-bold text-gray-600">Could not load account details.</p>
      </div>
    );
  }

  const userEmail = auth.currentUser?.email || profile.email || "user@example.com";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-2xl mx-auto">

      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
          {message.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-gray-100 shadow-sm">
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-green-50 rounded-2xl md:rounded-[28px] flex items-center justify-center text-green-600 border border-green-100 shrink-0">
              <User size={32} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-black text-gray-900 truncate">Account Summary</h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">
                Zebble Buyer ID: {auth.currentUser?.uid.slice(0, 8)}...
              </p>
            </div>
          </div>

          {/* ✅ Switches to the Profile Tab */}
          <button
            onClick={() => onEditProfile ? onEditProfile() : null}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-green-50 border border-gray-200 hover:border-green-500 text-gray-700 hover:text-green-600 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm shrink-0"
          >
            <Edit2 size={16} />
            <span className="hidden sm:inline">Edit Profile</span>
          </button>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4 md:space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              {/* ✅ FIX: Maps to displayName */}
              <input type="text" value={profile?.displayName || ""} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="Enter your name" />
            </div>
          </div>

          <div className="space-y-2 opacity-70">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input type="email" value={userEmail} readOnly className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-100 border border-gray-100 rounded-2xl text-sm font-bold cursor-not-allowed" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Number</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              {/* ✅ FIX: Maps to 'phone' (matches Profile tab and DB schema) */}
              <input type="tel" value={profile?.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all" placeholder="e.g. +234 801 234 5678" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Default Delivery Address</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-4 text-gray-300" size={18} />
              {/* ✅ FIX: Maps to 'address' (matches Profile tab and DB schema) */}
              <textarea value={profile?.address || ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} rows={3} className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all resize-none" placeholder="Enter your delivery address..." />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="submit" disabled={saving || !hasChanges} className="flex-1 py-3 md:py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
              {saving ? (<><Loader2 size={18} className="animate-spin" /> Saving...</>) : (<><Save size={18} /> Save Changes</>)}
            </button>
            {hasChanges && (
              <button type="button" onClick={handleCancel} disabled={saving} className="flex-1 sm:flex-none px-6 py-3 md:py-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                <X size={18} /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl md:rounded-[32px] flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-2.5 md:p-3 bg-blue-600 text-white rounded-xl md:rounded-2xl shrink-0">
            <Shield size={20} />
          </div>
          <div>
            <h4 className="text-sm font-black text-blue-900">Buyer Protection</h4>
            <p className="text-[10px] text-blue-700 font-medium">Account verified for secure escrow transactions.</p>
          </div>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-full text-[10px] font-black text-blue-600 border border-blue-200 uppercase tracking-wide shrink-0">Active</div>
      </div>
    </div>
  );
}