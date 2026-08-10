"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import {
  ArrowRight, Loader2, AlertCircle, Globe,
  Eye, EyeOff, ShoppingBag, Store, MapPin, UserSearch
} from "lucide-react";

// Firebase Imports
import { auth, db, googleProvider } from "@/lib/firebase";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// Import the Server Action to set Custom Claims
import { setUserRole } from "@/lib/auth-actions";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function RegisterPage() {
  const router = useRouter();
  
  // UI States
  const [role, setRole] = useState<'vendor' | 'buyer' | 'guest' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Form Data
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", password: "", 
    storeName: "", username: "", address: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setError("");
    const { name, value } = e.target;
    if (name === "username") {
      const cleanValue = value.replace(/[@\s!#$%^&*()_+={}|;:'"<>,.?/|`~\[\]\\]/g, "").toLowerCase();
      setFormData((prev) => ({ ...prev, [name]: cleanValue }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const checkUsername = async (username: string) => {
    const docRef = doc(db, "usernames", username.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError("");

      if (role === 'guest') { 
        router.push("/explore"); 
        return; 
      }

      // Basic validation
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
        setError("Please fill in all required fields.");
        setIsSaving(false);
        return;
      }

      if (role === "vendor" && (!formData.storeName || !formData.username)) {
        setError("Store name and username are required.");
        setIsSaving(false);
        return;
      }

      if (role === "buyer" && !formData.address) {
         setError("Delivery address is required.");
         setIsSaving(false);
         return;
      }

      // ✅ 1. Create Firebase Auth account FIRST
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // ✅ 2. NOW check username availability
      if (role === "vendor") {
        const taken = await checkUsername(formData.username);
        if (taken) { 
          await user.delete(); 
          setError("This store username is already taken."); 
          setIsSaving(false);
          return; 
        }
      }

      const userData = {
        uid: user.uid, 
        role, 
        firstName: formData.firstName, 
        lastName: formData.lastName,
        email: formData.email, 
        createdAt: serverTimestamp()
      };

      if (role === "vendor") {
        await Promise.all([
          setDoc(doc(db, "stores", user.uid), {
            ...userData, 
            storeName: formData.storeName, 
            username: formData.username
          }),
          setDoc(doc(db, "usernames", formData.username.toLowerCase()), { 
            uid: user.uid,
            claimedAt: serverTimestamp()
          })
        ]);
      } else {
        await setDoc(doc(db, "buyers", user.uid), { 
          ...userData, 
          address: formData.address 
        });
      }

      // ✅ Set Custom Claims so Middleware knows their role
      await setUserRole(user.uid, role as any); 

      // ✅ Force refresh the token to include the new claims
      await user.getIdToken(true);

      // ✅ Bake the session cookie
      const newIdToken = await user.getIdToken();
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: newIdToken }),
      });

      localStorage.removeItem("registration_progress");
      
      // ✅ Route to dashboard
      router.push(role === "vendor" ? "/dashboard" : "/buyer/dashboard");
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please log in instead.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password must be at least 6 characters.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error. Please check your connection.");
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

    // ✅ UPDATED: Handle Google Sign-Up for Seller/Buyer
  const handleGoogleSignUp = async () => {
    setIsSaving(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user already has a role (e.g. they logged in with Google before)
      const vendorDoc = await getDoc(doc(db, "stores", user.uid));
      const buyerDoc = await getDoc(doc(db, "buyers", user.uid));

      if (vendorDoc.exists() || buyerDoc.exists()) {
        // If they already have a role, take them to their dashboard
        router.push(vendorDoc.exists() ? "/dashboard" : "/buyer/dashboard");
        return;
      }

      // ✅ FIX: If they are a new user, redirect them to the Role Selection page
      // to collect their Store Name and Username (just like the Login page does).
      router.push("/register/onboarding/role");
      
    } catch (err: any) {
      console.error("Google sign-up error:", err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError("Google Sign-In failed. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={`${font.className} flex h-screen bg-white overflow-hidden`}>
      {/* LEFT SIDEBAR */}
      <div className="hidden lg:flex lg:w-1/3 relative overflow-hidden bg-green-900">
        <Image src="/images/login1.jpg" alt="Register" fill className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-transparent to-transparent" />
        <div className="absolute bottom-12 left-10 right-10 z-20 text-white font-bold text-2xl whitespace-pre-line">
          Join the marketplace {"\n"}in minutes.
        </div>
      </div>

      {/* RIGHT FORM SECTION */}
      <div className="w-full lg:w-2/3 flex flex-col px-6 md:px-12 lg:px-20 py-8 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          
          {/* Back Button */}
          <div className="flex justify-between items-center mb-6 h-8">
            {role && (
              <button onClick={() => setRole(null)} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-900 font-bold text-xs transition-colors">
                <ArrowRight size={14} className="rotate-180" /> Back
              </button>
            )}
          </div>

          {/* ROLE SELECTION */}
          {!role && (
            <section className="animate-in fade-in zoom-in-95 duration-500">
              <header className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Get Started</h1>
                <p className="text-sm text-gray-500 font-medium">Choose how you want to use the platform.</p>
              </header>
              <div className="flex flex-col gap-3">
                <button onClick={() => setRole("vendor")} className="role-card group hover:border-green-600 hover:bg-green-50/50 active:scale-[0.98]">
                  <div className="role-icon bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-green-600"> <Store size={20}/> </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-gray-900">I am a Seller</span>
                    <span className="text-xs text-gray-500">I want to create a store and sell.</span>
                  </div>
                </button>
                <button onClick={() => setRole("buyer")} className="role-card group hover:border-blue-600 hover:bg-blue-50/50 active:scale-[0.98]">
                  <div className="role-icon bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600"> <ShoppingBag size={20}/> </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-gray-900">I am a Buyer</span>
                    <span className="text-xs text-gray-500">I want to follow stores and buy.</span>
                  </div>
                </button>
                <button onClick={() => setRole("guest")} className="role-card group hover:border-orange-600 hover:bg-orange-50/50 active:scale-[0.98]">
                  <div className="role-icon bg-gray-100 text-gray-400 group-hover:bg-orange-100 group-hover:text-orange-600"> <UserSearch size={20}/> </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-gray-900">Guest</span>
                    <span className="text-xs text-gray-500">I want to browse stores and items.</span>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* GUEST CONTINUE */}
          {role === 'guest' && (
            <section className="animate-in slide-in-from-right-2 duration-300 text-center py-4">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4"> <UserSearch size={32}/> </div>
              <h1 className="text-xl font-bold mb-2">Continue as Guest</h1>
              <p className="text-sm text-gray-600 mb-8 font-medium">Browse all stores and items without an account.</p>
              <button onClick={handleFinalSubmit} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md active:scale-[0.98]">Start Browsing</button>
            </section>
          )}

          {/* REGISTRATION FORM */}
          {role && role !== 'guest' && (
            <section className="animate-in slide-in-from-right-2 duration-300">
              <header className="mb-6">
                {/* ✅ UPDATED TITLE HERE */}
                <h1 className="text-xl font-bold text-gray-900">
                  {role === 'vendor' ? 'Seller' : 'Buyer'} Registration
                </h1>
                <p className="text-xs text-gray-500 font-medium">Please provide your basic information.</p>
              </header>
              
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-[11px] rounded-xl flex items-center gap-2"> <AlertCircle size={14} /> {error} </div>}
              
              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="First Name" className="form-input-compact" required />
                  <input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Last Name" className="form-input-compact" required />
                </div>
                <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email Address" className="form-input-compact" required />
                <div className="relative">
                  <input name="password" value={formData.password} onChange={handleChange} type={showPassword ? "text" : "password"} placeholder="Password" className="form-input-compact pr-10" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
                
                {role === "vendor" ? (
                  <>
                    <input name="storeName" value={formData.storeName} onChange={handleChange} placeholder="Store Name" className="form-input-compact" required />
                    <div className="space-y-1">
                      <input name="username" value={formData.username} onChange={handleChange} placeholder="username" className="form-input-compact" required />
                      <div className={`mt-2 p-2.5 rounded-xl border border-dashed flex items-center gap-2 ${formData.username ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                        <Globe size={12} className={formData.username ? 'text-green-600' : 'text-gray-400'} />
                        <span className="text-[10px] font-bold text-gray-800">sellonwhatsapp.com/<span className="text-green-600">{formData.username || "username"}</span></span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative">
                  {/* Adjusted icon position slightly for better alignment */}
                  <MapPin className="absolute left-4 top-5 text-gray-400" size={16} />
                  
                  {/* Added !pl-12 (48px) and !pt-4 to override the base form-input-compact padding */}
                  <textarea 
                    name="address" 
                    value={formData.address} 
                    onChange={handleChange} 
                    placeholder="Full Delivery Address" 
                    className="form-input-compact !pl-12 h-24 !pt-4 resize-none" 
                    required 
                  />
                </div>
                )}
                
                <button 
                  type="submit" 
                  disabled={isSaving} 
                  className={`w-full mt-4 text-white font-bold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md active:scale-[0.98] disabled:opacity-70 ${role === 'vendor' ? 'bg-green-600' : 'bg-blue-600'}`}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : "Create Account"}
                  {!isSaving && <ArrowRight size={14} />}
                </button>
              </form>

              {/* ✅ NEW: OR DIVIDER & GOOGLE BUTTON */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-4 bg-white text-gray-400 font-bold tracking-wider uppercase">Or continue with</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleGoogleSignUp} 
                disabled={isSaving}
                className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>
            </section>
          )}

          <p className="mt-8 text-center text-xs text-gray-500 font-medium">Already have an account? <Link href="/login" className="text-green-600 font-bold hover:underline">Login</Link></p>
        </div>
      </div>

      <style jsx>{`
        .form-input-compact { width: 100%; padding: 12px 14px; background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 14px; outline: none; font-size: 0.8rem; transition: all 0.2s; font-weight: 500; }
        .form-input-compact:focus { background-color: white; border-color: #16a34a; }
        .role-card { display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 1.25rem; border: 1px solid #f3f4f6; transition: all 0.3s; width: 100%; cursor: pointer; }
        .role-icon { width: 2.5rem; height: 2.5rem; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e7eb; transition: all 0.3s; }
      `}</style>
    </main>
  );
}
