"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, serverTimestamp } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { 
  Bell, Shield, Phone, LogOut, User, Download, Trash2, 
  ChevronRight, Loader2, CheckCircle2, Globe,
  Mail, MessageCircle, AlertTriangle, MapPin
} from "lucide-react";

export function BuyerSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState<any>(null);
  const [prefs, setPrefs] = useState({
    emailNotifs: true,
    whatsappNotifs: true,
    pushNotifs: true
  });
  const [locationForm, setLocationForm] = useState({
    address: "",
    city: "",
    state: "",
    lga: "",
    postalCode: "",
    latitude: "",
    longitude: "",
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch buyer profile & preferences
  // Inside BuyerSettings useEffect:
useEffect(() => {
  const user = auth.currentUser;
  if (!user) {
    router.push("/login");
    return;
  }

  const applyProfileData = (data: any) => {
    const savedLocation = data.location && typeof data.location === "object" ? data.location : {};
    const shippingAddress = data.shippingAddress && typeof data.shippingAddress === "object" ? data.shippingAddress : {};
    setBuyer((previous: any) => ({ ...(previous || {}), ...data }));
    setLocationForm((previous) => ({
      address: typeof data.address === "string" ? data.address : typeof data.shippingAddress === "string" ? data.shippingAddress : shippingAddress.address ?? savedLocation.address ?? previous.address,
      city: data.city ?? shippingAddress.city ?? savedLocation.city ?? previous.city,
      state: data.state ?? shippingAddress.state ?? savedLocation.state ?? previous.state,
      lga: data.lga ?? shippingAddress.lga ?? savedLocation.lga ?? previous.lga,
      postalCode: data.postalCode ?? shippingAddress.postalCode ?? savedLocation.postalCode ?? previous.postalCode,
      latitude: data.latitude ?? savedLocation.latitude ?? savedLocation.lat ?? shippingAddress.latitude ?? shippingAddress.lat ?? previous.latitude,
      longitude: data.longitude ?? savedLocation.longitude ?? savedLocation.lng ?? shippingAddress.longitude ?? shippingAddress.lng ?? previous.longitude,
    }));
  };

  const unsubBuyer = onSnapshot(
    doc(db, "buyers", user.uid), 
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        applyProfileData(data);
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

  // Checkout reads the users document after merging it with buyers. Listen to
  // it here as well so settings and checkout always use the same location.
  const unsubUser = onSnapshot(
    doc(db, "users", user.uid),
    (docSnap) => {
      if (docSnap.exists()) applyProfileData(docSnap.data());
    },
    (error) => console.error("Failed to load buyer location:", error),
  );

  return () => {
    unsubBuyer();
    unsubUser();
  };
}, [router]);

  // Clear auto-dismiss messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

const handlePrefToggle = async (key: string, value: boolean) => {
  if (key === "pushNotifs" && value && typeof window !== "undefined" && "Notification" in window) {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage({ type: "error", text: "Browser notifications are blocked. Allow them in your browser settings first." });
      return;
    }
  }
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

  const handleSaveLocation = async () => {
    const user = auth.currentUser;
    if (!user || savingLocation) return;

    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);
    if (!locationForm.address.trim() || !locationForm.state.trim()) {
      setMessage({ type: "error", text: "Enter your delivery address and state before saving." });
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setMessage({ type: "error", text: "Enter valid latitude and longitude coordinates." });
      return;
    }

    setSavingLocation(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        address: locationForm.address.trim(),
        shippingAddress: locationForm.address.trim(),
        city: locationForm.city.trim(),
        state: locationForm.state.trim(),
        lga: locationForm.lga.trim(),
        postalCode: locationForm.postalCode.trim(),
        latitude,
        longitude,
        location: {
          latitude,
          longitude,
          address: locationForm.address.trim(),
          city: locationForm.city.trim(),
          state: locationForm.state.trim(),
          lga: locationForm.lga.trim(),
          postalCode: locationForm.postalCode.trim(),
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage({ type: "success", text: "Delivery location saved successfully." });
    } catch (error) {
      console.error("Failed to save buyer delivery location:", error);
      setMessage({ type: "error", text: "We could not save your delivery location. Please try again." });
    } finally {
      setSavingLocation(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage({ type: "error", text: "Your browser does not support location access." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationForm((previous) => ({
          ...previous,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setMessage({ type: "success", text: "Current location captured. Save the delivery location to keep it." });
      },
      () => setMessage({ type: "error", text: "Location permission was not granted. Enter the coordinates manually instead." }),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
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

  const handleExportData = async () => {
    const user = auth.currentUser;
    if (!user || exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      const snapshot = await getDocs(query(collection(db, "orders"), where("buyerId", "==", user.uid)));
      const purchases = snapshot.docs.map((orderDoc) => serializeForDownload({ id: orderDoc.id, ...orderDoc.data() }));
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), purchases }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sellonwhatsapp-purchase-history-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: `${purchases.length} purchase${purchases.length === 1 ? "" : "s"} exported successfully.` });
    } catch (error) {
      console.error("Purchase history export failed:", error);
      setMessage({ type: "error", text: "We could not export your purchase history. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const user = auth.currentUser;
    if (!user || deleting) return;
    const confirmed = window.confirm("Delete your SellOnWhatsApp account permanently? Your profile will be removed and this action cannot be undone.");
    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account deletion failed");
      await signOut(auth);
      await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
      router.replace("/");
    } catch (error: any) {
      console.error("Account deletion failed:", error);
      setMessage({ type: "error", text: error?.message || "Account deletion failed. Please contact support." });
      setDeleting(false);
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

      {/* Delivery Location */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <Globe size={18} className="text-gray-400" />
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Delivery Location</h3>
            <p className="text-[10px] text-gray-400 font-medium">Used for nearby stores and Chowdeck delivery pricing</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={locationForm.address}
            onChange={(event) => setLocationForm({ ...locationForm, address: event.target.value })}
            placeholder="Street address"
            className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input value={locationForm.city} onChange={(event) => setLocationForm({ ...locationForm, city: event.target.value })} placeholder="City" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
            <input value={locationForm.lga} onChange={(event) => setLocationForm({ ...locationForm, lga: event.target.value })} placeholder="LGA" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={locationForm.state} onChange={(event) => setLocationForm({ ...locationForm, state: event.target.value })} placeholder="State" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
            <input value={locationForm.postalCode} onChange={(event) => setLocationForm({ ...locationForm, postalCode: event.target.value })} placeholder="Postal code" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-gray-700">Map Coordinates *</p>
              <button type="button" onClick={handleUseCurrentLocation} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700 hover:bg-green-100">
                <MapPin size={12} /> Use current location
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="any" required value={locationForm.latitude} onChange={(event) => setLocationForm({ ...locationForm, latitude: event.target.value })} placeholder="Latitude e.g. 6.579" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
              <input type="number" step="any" required value={locationForm.longitude} onChange={(event) => setLocationForm({ ...locationForm, longitude: event.target.value })} placeholder="Longitude e.g. 3.349" className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-green-500" />
            </div>
            <p className="mt-1 text-[10px] text-gray-400">In Google Maps, right-click the exact delivery point and copy the coordinates.</p>
          </div>
          <button onClick={handleSaveLocation} disabled={savingLocation} className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
            {savingLocation ? "Saving location…" : "Save delivery location"}
          </button>
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
          <SettingItem icon={<Download size={16} />} label="Export Data" desc={exporting ? "Preparing your purchase history..." : "Download your purchase history"} onClick={handleExportData} />
          <SettingItem icon={<Trash2 size={16} />} label="Delete Account" desc={deleting ? "Deleting your account..." : "Permanently remove your account"} danger onClick={handleDeleteAccount} />
        </div>
      </div>

      {/* Support */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-2">
          <Phone size={18} className="text-gray-400" />
          <h3 className="font-bold text-gray-900 text-sm">Support</h3>
        </div>
        <div className="divide-y divide-gray-50">
          <SettingItem icon={<MessageCircle size={16} />} label="Help Center" desc="Browse FAQs & guides" href="/faq" />
          <SettingItem icon={<Mail size={16} />} label="Contact Support" desc="Email support@sellonwhatsapp.com" href="mailto:support@sellonwhatsapp.com" />
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

function SettingItem({ icon, label, desc, href, danger, onClick }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
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
    <a href={href} target={href.startsWith("mailto") ? "_self" : undefined} rel={href.startsWith("mailto") ? undefined : "noopener noreferrer"}>{content}</a>
  ) : (
    <button type="button" onClick={onClick} className="block w-full text-left">{content}</button>
  );
}

function serializeForDownload(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serializeForDownload);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeForDownload(entry)]));
  }
  return value;
}
