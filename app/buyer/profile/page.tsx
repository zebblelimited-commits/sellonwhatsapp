"use client";

import { useEffect, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";

export default function BuyerProfile() {
    const { user, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [profile, setProfile] = useState({
        displayName: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        country: "Nigeria",
        postalCode: "",
        bio: "",
        notificationsEnabled: true,
        whatsappNotifications: false,
    });

    useEffect(() => {
        console.log("🔄 Profile useEffect triggered. authLoading:", authLoading, "user:", user?.uid);

        async function loadProfile() {
            if (!user || authLoading) {
                console.log("⏸️ Profile load skipped: user is null or auth is loading.");
                return;
            }

            try {
                console.log("🚀 Starting profile load for:", user.uid);
                setLoading(true);
                const userDoc = await getDoc(doc(db, "users", user.uid));

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setProfile(prev => ({
                        ...prev,
                        displayName: data.displayName || user.displayName || "",
                        email: user.email || "",
                        phone: data.phone || "",
                        address: data.address || "",
                        city: data.city || "",
                        state: data.state || "",
                        country: data.country || "Nigeria",
                        postalCode: data.postalCode || "",
                        bio: data.bio || "",
                        notificationsEnabled: data.notificationsEnabled ?? true,
                        whatsappNotifications: data.whatsappNotifications ?? false,
                    }));
                } else {
                    console.warn("⚠️ User document not found in 'users' collection.");
                    setProfile(prev => ({
                        ...prev,
                        displayName: user.displayName || "",
                        email: user.email || "",
                    }));
                }
            } catch (error: any) {
                console.error("❌ Error loading profile:", error);
                setMessage({ type: "error", text: "Failed to load profile" });
            } finally {
                console.log("✅ Profile load finished.");
                setLoading(false);
            }
        }

        loadProfile();
    }, [user, authLoading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setProfile(prev => ({
            ...prev,
            [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) return;

        try {
            setSaving(true);
            setMessage(null);

            if (profile.displayName !== user.displayName) {
                await updateProfile(user, { displayName: profile.displayName });
            }

            await updateDoc(doc(db, "users", user.uid), {
                displayName: profile.displayName,
                phone: profile.phone,
                address: profile.address,
                city: profile.city,
                state: profile.state,
                country: profile.country,
                postalCode: profile.postalCode,
                bio: profile.bio,
                notificationsEnabled: profile.notificationsEnabled,
                whatsappNotifications: profile.whatsappNotifications,
                updatedAt: new Date(),
            });

            setMessage({ type: "success", text: "Profile updated successfully!" });
        } catch (error: any) {
            console.error("Error updating profile:", error);
            setMessage({ type: "error", text: error.message || "Failed to update profile" });
        } finally {
            setSaving(false);
        }
    };

    console.log("🖥️ Rendering Profile Page. authLoading:", authLoading, "loading:", loading, "user:", !!user);

    // 1. CHECK AUTH LOADING (Green Spinner)
    if (authLoading) {
        console.log("⏳ STUCK: authLoading is true. AuthProvider hasn't finished.");
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                <p className="text-sm text-gray-500">Verifying authentication...</p>
            </div>
        );
    }

    // 2. CHECK IF USER IS LOGGED IN
    if (!user) {
        console.log("⚠️ STUCK: authLoading is false, but user is null.");
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <p className="text-gray-600 font-medium">You must be logged in to view your profile.</p>
                <a href="/login" className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition">
                    Go to Login
                </a>
            </div>
        );
    }

    // 3. CHECK PROFILE DATA LOADING (Blue Spinner)
    if (loading) {
        console.log("⏳ STUCK: loading is true. Firestore getDoc is hanging.");
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center flex-col gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-500">Loading profile data...</p>
            </div>
        );
    }

    // 4. RENDER THE FORM
    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
                    <p className="text-gray-600 mt-2">Manage your personal information and preferences</p>
                </div>

                {message && (
                    <div className={`mb-6 p-4 rounded-lg ${message.type === "success"
                        ? "bg-green-50 border border-green-200 text-green-700"
                        : "bg-red-50 border border-red-200 text-red-700"
                        }`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg divide-y divide-gray-200">
                    <div className="p-6 space-y-6">
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h3>
                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">Full Name</label>
                                    <input type="text" id="displayName" name="displayName" value={profile.displayName} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                                    <input type="email" id="email" name="email" value={profile.email} disabled className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-500 sm:text-sm" />
                                    <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                                </div>
                                <div>
                                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                                    <input type="tel" id="phone" name="phone" value={profile.phone} onChange={handleChange} placeholder="+234 XXX XXX XXXX" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="bio" className="block text-sm font-medium text-gray-700">Bio</label>
                                    <textarea id="bio" name="bio" value={profile.bio} onChange={handleChange} rows={3} placeholder="Tell us a little about yourself..." className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Delivery Address</h3>
                            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <label htmlFor="address" className="block text-sm font-medium text-gray-700">Street Address</label>
                                    <input type="text" id="address" name="address" value={profile.address} onChange={handleChange} placeholder="123 Main St" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="city" className="block text-sm font-medium text-gray-700">City</label>
                                    <input type="text" id="city" name="city" value={profile.city} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="state" className="block text-sm font-medium text-gray-700">State</label>
                                    <input type="text" id="state" name="state" value={profile.state} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700">Postal Code</label>
                                    <input type="text" id="postalCode" name="postalCode" value={profile.postalCode} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label htmlFor="country" className="block text-sm font-medium text-gray-700">Country</label>
                                    <input type="text" id="country" name="country" value={profile.country} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-green-500 focus:border-green-500 sm:text-sm" />
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Preferences</h3>
                            <div className="space-y-4">
                                <div className="flex items-center">
                                    <input type="checkbox" id="notificationsEnabled" name="notificationsEnabled" checked={profile.notificationsEnabled} onChange={handleChange} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded" />
                                    <label htmlFor="notificationsEnabled" className="ml-3 block text-sm text-gray-700">Enable email notifications for orders and updates</label>
                                </div>
                                <div className="flex items-center">
                                    <input type="checkbox" id="whatsappNotifications" name="whatsappNotifications" checked={profile.whatsappNotifications} onChange={handleChange} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded" />
                                    <label htmlFor="whatsappNotifications" className="ml-3 block text-sm text-gray-700">Receive order updates via WhatsApp</label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-gray-50 flex justify-end">
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}