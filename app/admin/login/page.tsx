"use client"; // ✅ MUST be first line
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, ShieldCheck } from "lucide-react";

// Firebase Imports
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function AdminLogin() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Admin-specific image carousel
  const slides = [
    { id: 1, img: "/images/admin-bg1.jpg", title: "Secure Platform Management", desc: "Monitor users, stores, and transactions in real-time." },
    { id: 2, img: "/images/admin-bg2.jpg", title: "Dispute Resolution Center", desc: "Review and resolve customer disputes with full audit trails." },
    { id: 3, img: "/images/admin-bg1.jpg", title: "Payout Approval Workflow", desc: "Approve vendor payouts with dual-verification security." },
    { id: 4, img: "/images/admin-bg2.jpg", title: "Analytics Dashboard", desc: "Track GMV, user growth, and platform health metrics." },
  ];

  // Auto-rotate carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  // ✅ FIXED: Admin-specific login logic + Session Cookie Minting
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      console.log("🔐 Admin login attempt:", { email });

      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("✅ Auth successful:", { uid: user.uid, email: user.email });

      // 2. Get admin doc and verify status
      const adminRef = doc(db, "admins", user.uid);
      const adminDoc = await getDoc(adminRef);

      if (!adminDoc.exists()) {
        await signOut(auth);
        throw new Error("Access denied: Admin account not found");
      }

      const adminData = adminDoc.data();
      if (!adminData?.isActive) {
        await signOut(auth);
        throw new Error("Access denied: Admin account is not active");
      }

      // 3. Try to update lastLogin (with graceful fallback)
      try {
        await updateDoc(adminRef, {
          lastLogin: new Date(),
          updatedAt: new Date()
        });
      } catch (updateErr: any) {
        console.warn("⚠️ Could not update lastLogin (non-critical):", updateErr.message);
      }

      // ✅ 4. CRITICAL FIX: Mint the session cookie for the Middleware
      // Without this, the middleware will block /admin and redirect back to login
      console.log("🍪 Minting session cookie...");
      const idToken = await user.getIdToken();
      const sessionResponse = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!sessionResponse.ok) {
        console.error("Failed to create session cookie");
        // We log it but don't block login entirely, though middleware will likely block them next
      }

      // 5. Redirect to admin dashboard
      console.log("🚀 Redirecting to admin dashboard...");
      router.push("/admin");
      router.refresh();

    } catch (err: any) {
      console.error("❌ Login failed:", {
        code: err.code,
        message: err.message,
        name: err.name
      });

      // User-friendly error messages
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setError("Invalid email or password");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later");
      } else if (err.message?.includes("Access denied")) {
        setError(err.message);
      } else if (err.code === "permission-denied") {
        setError("Permission error. Please contact support.");
      } else {
        setError("Login failed. Please try again");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`${font.className} flex min-h-screen bg-white`}>
      {/* LEFT SECTION: Image Carousel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gray-900">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${index === currentSlide ? "opacity-100" : "opacity-0"}`}
          >
            <Image
              src={slide.img}
              alt={slide.title}
              fill
              className="object-cover"
              priority={index === 0}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        ))}
        {/* Carousel Content */}
        <div className="absolute bottom-20 left-16 right-16 z-20 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <span className="font-bold text-lg">Zebble Admin Portal</span>
          </div>
          <div className="font-bold text-3xl mb-4 leading-tight">
            {slides[currentSlide].title}
          </div>
          <p className="text-gray-200 text-lg max-w-md">
            {slides[currentSlide].desc}
          </p>
          <div className="flex gap-2 mt-8">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ${i === currentSlide ? "w-8 bg-green-500" : "w-2 bg-white/30"
                  }`}
              />
            ))}
          </div>
        </div>
        {/* Security Badge */}
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur rounded-full border border-white/20">
          <ShieldCheck size={14} className="text-green-400" />
          <span className="text-xs font-bold text-white">Quantum-Secured</span>
        </div>
      </div>

      {/* RIGHT SECTION: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-12 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          {/* Logo/Header */}
          <div className="mb-10 flex items-center gap-3">
            <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center">
              <ShieldCheck size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900">Admin Portal</h1>
              <p className="text-gray-500 text-sm font-medium">Secure access for Zebble administrators</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center gap-3 text-sm font-medium animate-in fade-in zoom-in-95">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {/* Login Form */}
          <form className="space-y-5" onSubmit={handleLogin}>
            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 ml-1">Admin Email</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-600 transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@zebble.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-green-500/10 focus:border-green-600 transition-all font-medium text-sm"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-sm font-bold text-gray-700">Password</label>
                <Link
                  href="/admin/forgot-password"
                  className="text-xs font-bold text-green-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-green-600 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-green-500/10 focus:border-green-600 transition-all font-medium text-sm"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-green-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={20} className="animate-spin" /> Verifying...</>
              ) : (
                <><ShieldCheck size={18} /> Access Admin Portal</>
              )}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-start gap-3">
              <ShieldCheck size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
                  🔐 All admin actions are logged and monitored • Session timeout: 1 hour •
                  <span className="block mt-1">2FA required for sensitive operations</span>
                </p>
              </div>
            </div>
          </div>

          {/* Back to App Link */}
          <p className="mt-8 text-center text-sm text-gray-500 font-medium">
            Not an admin? <Link href="/" className="text-green-600 font-bold hover:underline px-2 py-1 rounded-lg hover:bg-[#ecfcca] transition-all">Return to Sowa</Link>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-8 text-center lg:text-left">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            © {new Date().getFullYear()} Zebble Quantum Solutions LTD • Admin Portal v1.0
          </p>
        </div>
      </div>
    </main>
  );
}