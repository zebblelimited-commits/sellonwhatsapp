"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, UserSearch } from "lucide-react";

// Firebase Imports
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getApps } from "firebase/app";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  
  // Logic States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slides = [
    { id: 1, img: "/images/login1.jpg" },
    { id: 2, img: "/images/login2.jpg" },
    { id: 3, img: "/images/login3.jpg" },
    { id: 4, img: "/images/login4.jpg" },
    { id: 5, img: "/images/login5.jpg" },
  ];

  useEffect(() => {
    const timer = setInterval(() => setCurrentSlide((prev) => (prev + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  // Debug Firebase Auth configuration
  useEffect(() => {
    console.log("=== FIREBASE AUTH DEBUG ===");
    console.log("Current hostname:", window.location.hostname);
    console.log("Auth domain:", auth.config?.authDomain);
    console.log("Auth app name:", auth.app?.name);
    console.log("Firebase apps count:", getApps().length);
    
    if (auth) {
      console.log("✅ Auth initialized");
    } else {
      console.log("❌ Auth NOT initialized");
    }
  }, []);

  // Helper to bake the session cookie for Middleware
  const bakeSessionCookie = async (): Promise<{ role?: string }> => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Unable to create a login session");

    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to create a login session");
    return data;
  };

  // Route using the server-resolved role. The Firestore fallback keeps old
  // accounts working while they are migrated to the canonical collections.
  const routeUserByRole = async (uid: string, resolvedRole?: string) => {
    if (resolvedRole === "admin") {
      router.replace("/admin");
      return;
    }
    if (resolvedRole === "vendor") {
      router.replace("/dashboard");
      return;
    }
    if (resolvedRole === "buyer") {
      router.replace("/buyer/dashboard");
      return;
    }

    const [adminDoc, storeDoc, vendorDoc, buyerDoc, userDoc] = await Promise.all([
      getDoc(doc(db, "admins", uid)).catch(() => null),
      getDoc(doc(db, "stores", uid)),
      getDoc(doc(db, "vendors", uid)).catch(() => null),
      getDoc(doc(db, "buyers", uid)),
      getDoc(doc(db, "users", uid)).catch(() => null),
    ]);

    if (adminDoc?.exists() && adminDoc.data()?.isActive === true) {
      router.replace("/admin");
      return;
    }
    if (storeDoc.exists() || vendorDoc?.exists()) {
      router.replace("/dashboard");
      return;
    }
    if (buyerDoc.exists() || userDoc?.exists()) {
      router.replace("/buyer/dashboard");
      return;
    }

    router.replace("/register/onboarding/role");
  };

  // Email/Password Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // 1. Bake the session cookie for Middleware
      const session = await bakeSessionCookie();

      // 2. Route based on role
      await routeUserByRole(userCredential.user.uid, session.role);
    } catch (err: any) {
      console.error("Login error details:", err.code, err.message);
      
      // Show the REAL Firebase error
      switch (err.code) {
        case 'auth/user-not-found':
          setError("No account found with this email. Please check or create an account.");
          break;
        case 'auth/wrong-password':
          setError("Incorrect password. Please try again.");
          break;
        case 'auth/invalid-credential':
          setError("Invalid email or password. Please try again.");
          break;
        case 'auth/invalid-email':
          setError("Please enter a valid email address.");
          break;
        case 'auth/user-disabled':
          setError("This account has been disabled. Please contact support.");
          break;
        case 'auth/too-many-requests':
          setError("Too many login attempts. Please try again later or reset your password.");
          break;
        case 'auth/network-request-failed':
          setError("Network error. Please check your connection.");
          break;
        case 'auth/unauthorized-domain':
          setError(`This domain (${window.location.hostname}) is not authorized for authentication. Please use a different URL or contact support.`);
          break;
        case 'auth/operation-not-allowed':
          setError("Email/Password sign-in is not enabled. Please contact support.");
          break;
        default:
          setError(`Login failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const session = await bakeSessionCookie();
      await routeUserByRole(result.user.uid, session.role);
    } catch (err: any) {
      console.error("Google login error:", err.code, err.message);
      setError(err.code === "auth/unauthorized-domain"
        ? `This domain (${window.location.hostname}) is not authorized for Google sign-in.`
        : err.code === "auth/popup-closed-by-user"
          ? "Google sign-in was cancelled."
          : err.code === "auth/popup-blocked"
            ? "Your browser blocked the Google sign-in popup. Please allow popups and try again."
            : "Google sign-in could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`${font.className} flex min-h-screen bg-white`}>
      {/* LEFT SECTION */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gray-900">
        {slides.map((slide, index) => (
          <div key={slide.id} className={`absolute inset-0 transition-opacity duration-1000 ${index === currentSlide ? "opacity-100" : "opacity-0"}`}>
            <Image src={slide.img} alt="slide" fill className="object-cover" priority={index === 0} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        ))}
        <div className="absolute bottom-20 left-16 right-16 z-20 text-white">
          <div className="font-bold text-4xl mb-4 leading-tight">Start selling to millions on <br/> <span className="text-green-400">WhatsApp in minutes.</span></div>
          <p className="text-gray-200 text-lg max-w-md">Join over 2,000+ Nigerian vendors growing with SellOnWhatsApp.</p>
          <div className="flex gap-2 mt-8">
            {slides.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === currentSlide ? "w-8 bg-green-500" : "w-2 bg-white/30"}`} />
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: LOGIN FORM */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-12 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-500 font-medium">Access your account or browse the market.</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-medium animate-in fade-in zoom-in-95">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-600 transition-colors"><Mail size={18} /></div>
                <input 
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com" 
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-green-500/10 focus:border-green-600 transition-all font-medium text-sm" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-sm font-bold text-gray-700">Password</label>
                <Link href="/forgot-password" className="text-xs font-bold text-green-600 hover:underline">Forgot password?</Link>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-600 transition-colors"><Lock size={18} /></div>
                <input 
                  type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-green-500/10 focus:border-green-600 transition-all font-medium text-sm" 
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>

            <button 
              type="submit" disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-green-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : "Sign In to Account"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* OR DIVIDER */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400 font-bold tracking-wider uppercase text-xs">Or continue with</span>
            </div>
          </div>

          {/* GOOGLE BUTTON */}
          <button 
            type="button" 
            onClick={handleGoogleLogin} 
            disabled={loading}
            className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70 mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* GUEST BUTTON */}
          <button 
            type="button"
            onClick={() => router.push("/explore")}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 text-gray-600 font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <UserSearch size={18} className="text-orange-500" />
            Browse as Guest
          </button>

          <p className="mt-8 text-center text-sm text-gray-500 font-medium">
            Don't have an account? <Link href="/register" className="text-green-600 font-bold hover:underline px-2 py-1 rounded-lg hover:bg-[#ecfcca] transition-all">Create account now</Link>
          </p>
        </div>

        <div className="mt-auto pt-8 text-center lg:text-left">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            © {new Date().getFullYear()} Zebble Quantum Solutions LTD.
          </p>
        </div>
      </div>
    </main>
  );
}
