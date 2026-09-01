"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import {
  Store, ShoppingBag, Loader2, AlertCircle, Globe
} from "lucide-react";
import { signInWithPopup } from "firebase/auth";
import { auth, db, googleProvider } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { setUserRole } from "@/lib/auth-actions";
import { triggerWelcomeNotifications } from "@/lib/client-welcome";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function RoleSelectionPage() {
  const router = useRouter();
  const [role, setRole] = useState<'vendor' | 'buyer' | null>(null);
  const [storeName, setStoreName] = useState("");
  const [username, setUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Check if username is already taken in Firestore
  const checkUsername = async (uname: string) => {
    const docRef = doc(db, "usernames", uname.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  };

  const handleGoogleSignIn = async () => {
    if (!role) {
      setError("Please select how you want to use the platform.");
      return;
    }

    // Validate Vendor fields before opening the Google popup
    if (role === "vendor") {
      if (!storeName.trim()) {
        setError("Please enter your store name.");
        return;
      }
      if (!username.trim()) {
        setError("Please choose a unique username for your store.");
        return;
      }

      setIsSaving(true);
      setError("");

      // Check username availability
      const taken = await checkUsername(username);
      if (taken) {
        setError("This store username is already taken. Please choose another.");
        setIsSaving(false);
        return;
      }
    } else {
      setIsSaving(true);
      setError("");
    }

    try {
      // 1. Trigger Google Auth
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userData = {
        uid: user.uid,
        role,
        email: user.email,
        displayName: user.displayName || "",
        firstName: user.displayName?.split(" ")[0] || "",
        lastName: user.displayName?.split(" ").slice(1).join(" ") || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 2. ✅ FIX: Save to the CORRECT Firestore collections ("vendors" and "users")
      // ✅ FIX: Added { merge: true } to prevent "update" rule violations if doc exists
      if (role === "vendor") {
        await Promise.all([
          // Write to 'vendors' (Matches AuthProvider & Backend)
          setDoc(doc(db, "vendors", user.uid), userData, { merge: true }),

          // Write to 'stores' (Needed for public storefronts & Analytics)
          setDoc(doc(db, "stores", user.uid), {
            ...userData,
            storeName: storeName.trim(),
            username: username.toLowerCase().trim(),
            isVerified: false,
            verificationTier: null
          }, { merge: true }),

          // Claim username
          setDoc(doc(db, "usernames", username.toLowerCase().trim()), {
            uid: user.uid,
            claimedAt: serverTimestamp()
          }, { merge: true })
        ]);
      } else {
        // Write to 'users' (Matches AuthProvider & BuyerProfile)
        await setDoc(doc(db, "users", user.uid), userData, { merge: true });
      }

      // 3. Set Custom Claims & Bake Cookie
      await setUserRole(user.uid, role as 'vendor' | 'buyer');
      await user.getIdToken(true);

      const newIdToken = await user.getIdToken();
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: newIdToken }),
      });

      triggerWelcomeNotifications(user, role);

      // 4. Route to Dashboard
      router.push(role === "vendor" ? "/dashboard" : "/buyer/dashboard");

    } catch (err: any) {
      console.error("Google sign-in error:", err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(`Sign-In failed: ${err.message || "Please try again."}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Clean username input (lowercase, no special characters except underscores)
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanValue = e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    setUsername(cleanValue);
  };

  return (
    <main className={`${font.className} flex h-screen bg-white overflow-hidden`}>
      {/* LEFT SIDEBAR (Desktop) */}
      <div className="hidden lg:flex lg:w-1/3 relative overflow-hidden bg-green-900">
        <Image src="/images/login1.jpg" alt="Join Zebble" fill className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-transparent to-transparent" />
        <div className="absolute bottom-12 left-10 right-10 z-20 text-white font-bold text-2xl whitespace-pre-line">
          Join the marketplace {"\n"}in minutes.
        </div>
      </div>

      {/* RIGHT FORM SECTION */}
      <div className="w-full lg:w-2/3 flex flex-col justify-center px-6 md:px-12 lg:px-20 py-12 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
            <p className="text-gray-500 font-medium">Join thousands growing their business on Zebble.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-medium animate-in fade-in zoom-in-95">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <div className="space-y-6">
            {/* ROLE SELECTION CARDS */}
            <div>
              <label className="text-sm font-bold text-gray-700 mb-3 block">I want to...</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setRole("vendor")}
                  className={`group p-5 border-2 rounded-2xl flex flex-col items-start gap-3 transition-all active:scale-[0.98] ${role === "vendor"
                      ? "border-green-600 bg-green-50/50 shadow-lg shadow-green-100"
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <div className={`p-2.5 rounded-xl transition-colors ${role === "vendor" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"}`}>
                    <Store size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-gray-900">Sell Products</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a store & grow</div>
                  </div>
                </button>

                <button
                  onClick={() => setRole("buyer")}
                  className={`group p-5 border-2 rounded-2xl flex flex-col items-start gap-3 transition-all active:scale-[0.98] ${role === "buyer"
                      ? "border-blue-600 bg-blue-50/50 shadow-lg shadow-blue-100"
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <div className={`p-2.5 rounded-xl transition-colors ${role === "buyer" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"}`}>
                    <ShoppingBag size={22} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-gray-900">Shop & Follow</div>
                    <div className="text-xs text-gray-500 mt-0.5">Discover unique items</div>
                  </div>
                </button>
              </div>
            </div>

            {/* VENDOR SPECIFIC FIELDS (Animated) */}
            {role === "vendor" && (
              <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">Store Name</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g. Jane's Fashion"
                    className="form-input-compact"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700 mb-1.5 block">Store Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="e.g. janesfashion"
                    className="form-input-compact"
                  />
                  <div className={`mt-2 p-2.5 rounded-xl border border-dashed flex items-center gap-2 ${username ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                    <Globe size={12} className={username ? 'text-green-600' : 'text-gray-400'} />
                    <span className="text-[10px] font-bold text-gray-800">
                      sellonwhatsapp.com/<span className="text-green-600">{username || "username"}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* DIVIDER */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
            </div>

            {/* GOOGLE SIGN-IN BUTTON */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isSaving || !role}
              className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400 mt-4">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .form-input-compact { width: 100%; padding: 12px 14px; background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 14px; outline: none; font-size: 0.8rem; transition: all 0.2s; font-weight: 500; }
        .form-input-compact:focus { background-color: white; border-color: #16a34a; }
      `}</style>
    </main>
  );
}
