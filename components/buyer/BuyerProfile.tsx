"use client";
import React, { useEffect, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import {
    User, Mail, Phone, MapPin, Save, CheckCircle,
    Loader2, AlertTriangle, X, MessageCircle, FileText, Globe
} from "lucide-react";

export function BuyerProfile() {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [originalProfile, setOriginalProfile] = useState<any>(null);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        // ℹ️ Using 'users' collection to match your AuthProvider logic
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
                        bio: "",
                        address: "",
                        city: "",
                        state: "",
                        country: "Nigeria",
                        postalCode: "",
                        notificationsEnabled: true,
                        whatsappNotifications: false
                    };
                    setProfile(defaultData);
                    setOriginalProfile(defaultData);
                }
                setLoading(false);
            },
            (error) => {
                console.error("Failed to load profile:", error);
                setMessage({ type: "error", text: "Unable to load profile." });
                setLoading(false);
            }
        );

        return () => unsub();
    }, []);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    // Deep compare to detect any changes across all fields
    const hasChanges = profile && originalProfile && JSON.stringify(profile) !== JSON.stringify(originalProfile);

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

            await updateDoc(doc(db, "users", user.uid), {
                displayName: profile.displayName,
                phone: profile.phone || "",
                bio: profile.bio || "",
                address: profile.address || "",
                city: profile.city || "",
                state: profile.state || "",
                country: profile.country || "Nigeria",
                postalCode: profile.postalCode || "",
                notificationsEnabled: profile.notificationsEnabled ?? true,
                whatsappNotifications: profile.whatsappNotifications ?? false,
                updatedAt: serverTimestamp()
            });

            setOriginalProfile(profile);
            setMessage({ type: "success", text: "Profile updated successfully!" });

        } catch (error: any) {
            console.error("Update error:", error);
            setMessage({ type: "error", text: error.message || "Failed to update profile." });
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
                <p className="font-bold text-gray-600">Could not load profile details.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-2xl mx-auto">

            {/* Auto-dismiss Message */}
            {message && (
                <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                    {message.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                    {message.text}
                    <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70"><X size={14} /></button>
                </div>
            )}

            {/* Main Card */}
            <div className="bg-white p-6 md:p-8 rounded-[32px] border border-gray-100 shadow-sm">
                <div className="flex items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
                    <div className="flex items-center gap-4 md:gap-5">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-50 rounded-2xl md:rounded-[28px] flex items-center justify-center text-green-600 border border-green-100 shrink-0">
                            <User size={32} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg md:text-2xl font-black text-gray-900 truncate">My Profile</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">
                                Manage your personal info & preferences
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-6 md:space-y-8">

                    {/* PERSONAL INFORMATION */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Personal Information</h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                    <input
                                        type="text"
                                        value={profile?.displayName || ""}
                                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                                        className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="Enter your full name"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 opacity-70">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                    <input
                                        type="email"
                                        value={profile?.email || auth.currentUser?.email || ""}
                                        readOnly
                                        className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-100 border border-gray-100 rounded-2xl text-sm font-bold cursor-not-allowed"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 ml-1">Email cannot be changed.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                    <input
                                        type="tel"
                                        value={profile?.phone || ""}
                                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                        className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="+234 XXX XXX XXXX"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Bio</label>
                                <div className="relative">
                                    <FileText className="absolute left-4 top-4 text-gray-300" size={18} />
                                    <textarea
                                        value={profile?.bio || ""}
                                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                                        rows={3}
                                        className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all resize-none"
                                        placeholder="Tell us a little about yourself..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DELIVERY ADDRESS */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Delivery Address</h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Street Address</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-4 text-gray-300" size={18} />
                                    <input
                                        type="text"
                                        value={profile?.address || ""}
                                        onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                                        className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="123 Main St"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">City</label>
                                    <input
                                        type="text"
                                        value={profile?.city || ""}
                                        onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                                        className="w-full px-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="City"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                                    <input
                                        type="text"
                                        value={profile?.state || ""}
                                        onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                                        className="w-full px-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="State"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Postal Code</label>
                                    <input
                                        type="text"
                                        value={profile?.postalCode || ""}
                                        onChange={(e) => setProfile({ ...profile, postalCode: e.target.value })}
                                        className="w-full px-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                        placeholder="Postal Code"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Country</label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                        <input
                                            type="text"
                                            value={profile?.country || "Nigeria"}
                                            onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                                            className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                                            placeholder="Country"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* NOTIFICATIONS */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Notification Preferences</h3>

                        <div className="space-y-3">
                            <label className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-xl shadow-sm">
                                        <Mail size={18} className="text-gray-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Email Notifications</p>
                                        <p className="text-[10px] text-gray-500">Receive updates about orders and promotions</p>
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={profile?.notificationsEnabled ?? true}
                                    onChange={(e) => setProfile({ ...profile, notificationsEnabled: e.target.checked })}
                                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300 cursor-pointer"
                                />
                            </label>

                            <label className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white rounded-xl shadow-sm">
                                        <MessageCircle size={18} className="text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">WhatsApp Notifications</p>
                                        <p className="text-[10px] text-gray-500">Get delivery alerts via WhatsApp</p>
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={profile?.whatsappNotifications ?? false}
                                    onChange={(e) => setProfile({ ...profile, whatsappNotifications: e.target.checked })}
                                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500 border-gray-300 cursor-pointer"
                                />
                            </label>
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="submit"
                            disabled={saving || !hasChanges}
                            className="flex-1 py-3 md:py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            {saving ? (
                                <><Loader2 size={18} className="animate-spin" /> Saving...</>
                            ) : (
                                <><Save size={18} /> Save Changes</>
                            )}
                        </button>

                        {hasChanges && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="flex-1 sm:flex-none px-6 py-3 md:py-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                            >
                                <X size={18} /> Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}