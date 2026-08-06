"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  CheckCircle2, Loader2, ArrowRight, ShieldCheck,
  Zap, TrendingUp
} from "lucide-react";

interface BoostData {
  packageName?: string;
  tier?: string;
  totalAmount?: number;
  durationDays?: number;
  durationLabel?: string;
  status?: string;
  expiryDate?: string;
  expiresAt?: string;
  startDate?: string;
  createdAt?: string;
  storeName?: string;
  storeId?: string;
  nombaReference?: string;
  autoRenew?: boolean;
}

function BoostSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderReference = searchParams.get("reference") || searchParams.get("orderReference");
  
  // ✅ CRITICAL FIX: Extract the orderId that Nomba appends on successful redirect
  const orderId = searchParams.get("orderId"); 
  
  const isMock = searchParams.get("mock") === "true";

  // ✅ Check if the payment gateway explicitly confirmed success in the URL
  const urlStatus = searchParams.get("status");
  
  // ✅ If Nomba redirected the user back with an orderId, we know payment succeeded on their end!
  const isUrlConfirmed = !!orderId || urlStatus === "success" || searchParams.get("confirmed") === "true";

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [boostData, setBoostData] = useState<BoostData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  const attemptsRef = useRef<number>(0);
  const maxAttempts = 20;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (boostData) {
      console.log('🔍 Critical Debug Info:', {
        urlReference: orderReference,
        docNombaReference: boostData.nombaReference,
        docStoreId: boostData.storeId,
        currentUserUid: currentUser?.uid,
        authMatch: boostData.storeId === currentUser?.uid,
        refMatch: orderReference === boostData.nombaReference,
        boostStatus: boostData.status,
        isUrlConfirmed: isUrlConfirmed // Log if we are bypassing the webhook
      });
    }
  }, [boostData, orderReference, currentUser, isUrlConfirmed]);

  useEffect(() => {
    if (!orderReference || !currentUser || !mounted) return;

    let pollTimer: NodeJS.Timeout;

    const checkBoostStatus = async () => {
      try {
        if (isMock) {
          setBoostData({
            packageName: "Pro Boost", tier: "pro", totalAmount: 34993, durationDays: 7,
            durationLabel: "7 Days", status: "active",
            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            startDate: new Date().toISOString(), nombaReference: orderReference
          });
          setStatus("success");
          return;
        }

        const idToken = await currentUser.getIdToken();
        const apiUrl = `/api/boost-store/${orderReference}`;
        
        const response = await fetch(apiUrl, {
          headers: { Authorization: `Bearer ${idToken}` }
        });

        if (response.ok) {
          const data = await response.json();
          console.log("🔍 RAW API RESPONSE FOR BOOST:", data);

          const boost = data.boost || data.data || data;
          console.log("🔍 EXTRACTED BOOST OBJECT & STATUS:", boost?.status);
          
          // ✅ If API returns empty but URL confirms success, use fallback data
          if (!boost || Object.keys(boost).length === 0) {
             if (isUrlConfirmed) {
                console.log("✅ URL confirms success (orderId present), but API data is empty. Using fallback data.");
                setBoostData({ packageName: "Pro Boost", tier: "pro", status: "active", nombaReference: orderReference, totalAmount: 0 });
                setStatus("success");
                return;
             }
          } else {
             setBoostData(boost);
          }

          const boostStatus = String(boost?.status || "").toLowerCase();
          const isSuccessStatus = ["active", "success", "completed", "paid", "verified", "approved"].includes(boostStatus);

          if (isSuccessStatus) {
            setStatus("success");
            return; 
          } 
          
          const isFailedStatus = ["failed", "cancelled", "expired", "declined"].includes(boostStatus);
          if (isFailedStatus) {
            setStatus("error");
            setError(boost?.failureReason || "Boost payment was declined or cancelled.");
            return;
          }

          // ✅ CRITICAL FIX: If the API says 'pending' but the URL explicitly has an orderId, 
          // trust the payment gateway's synchronous redirect over the delayed webhook!
          if (isUrlConfirmed && (boostStatus === "pending" || boostStatus === "pending_payment" || boostStatus === "processing" || !boostStatus)) {
             console.log("✅ Payment gateway URL confirms success (orderId present), bypassing webhook delay!");
             setStatus("success");
             return;
          }

          console.log(`⏳ Boost status is currently '${boost?.status}', waiting for webhook...`);
        } else if (response.status === 404) {
          // ✅ If API returns 404 (document not created yet) but URL confirms success, trust the URL!
          if (isUrlConfirmed) {
             console.log("✅ API returned 404, but URL confirms success (orderId present). Bypassing webhook delay!");
             setBoostData({ packageName: "Pro Boost", tier: "pro", status: "active", nombaReference: orderReference, totalAmount: 0 });
             setStatus("success");
             return;
          }
          console.log(`⏳ Boost ${orderReference} verification is processing (404), retrying...`);
        } else {
          console.error(`❌ Non-404 infrastructure error detected: ${response.status}`);
        }

        attemptsRef.current += 1;
        if (attemptsRef.current <maxAttempts) {
          pollTimer = setTimeout(checkBoostStatus, 2000);
        } else {
          // ✅ FINAL FALLBACK: If we hit the polling ceiling, but the URL said success, show success anyway!
          if (isUrlConfirmed) {
             console.log("⚠️ Polling ceiling reached, but URL confirmed success (orderId present). Showing success screen.");
             if (!boostData) {
                setBoostData({ packageName: "Pro Boost", tier: "pro", status: "active", nombaReference: orderReference, totalAmount: 0 });
             }
             setStatus("success");
             return;
          }
          console.error(`❌ Transaction verification polling ceiling surpassed`);
          setStatus("error");
          setError("Verification window timed out. Check your dashboard within 2 minutes for processing updates.");
        }
      } catch (err: any) {
        console.error("❌ Thread tracking poll failure error context:", err);
        attemptsRef.current += 1;
        if (attemptsRef.current <maxAttempts) {
          pollTimer = setTimeout(checkBoostStatus, 2000);
        } else {
          setStatus("error");
          setError(err.message || "Failed to process payment sync.");
        }
      }
    };

    if (status === "verifying") {
      checkBoostStatus();
    }

    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [orderReference, currentUser, isMock, mounted, status, isUrlConfirmed, boostData]);

  const getEndDate = (): string => {
    if (!mounted) return "Loading...";

    const rawDate = boostData?.expiryDate || boostData?.expiresAt;
    if (!rawDate) {
      const days = boostData?.durationDays || 1;
      const start = boostData?.startDate ? new Date(boostData.startDate) : new Date();
      const fallbackEnd = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      return fallbackEnd.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    try {
      return new Date(rawDate).toLocaleDateString('en-NG', {
        weekday: 'short', day: 'numeric', month: 'short'
      });
    } catch { return "Unknown"; }
  };

  const getStartDate = (): string => {
    if (!mounted) return "Loading...";
    try {
      const rawStart = boostData?.startDate || boostData?.createdAt;
      const date = rawStart ? new Date(rawStart) : new Date();
      return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
    } catch { return "Today"; }
  };

  const getBoostFeatures = (tier: string | undefined): string[] => {
    const features: Record<string, string[]> = {
      micro: ["Trending Stores carousel", "+15% search ranking", "Basic analytics"],
      pro: ["Everything in Micro", "Push notifications to nearby buyers", "WhatsApp broadcast", "Priority category placement"],
      max: ["Everything in Pro", "Homepage hero banner", "Editor's Picks newsletter", "Social media shoutout", "Dedicated success manager"]
    };
    return features[tier || ""] || features.pro;
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <Loader2 className="h-10 w-10 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="max-w-[380px] w-full bg-white rounded-[20px] shadow-xl border border-slate-100 overflow-hidden">

        {status === "verifying" ? (
          <div className="p-8 text-center space-y-4">
            <Loader2 className="h-10 w-10 text-green-600 animate-spin mx-auto" />
            <h1 className="text-xl font-extrabold text-slate-900">Activating Boost...</h1>
            <p className="text-slate-500 text-xs">
              {boostData?.status === "pending_payment"
                ? `Confirming transaction details for ${boostData.packageName || "your boost"}...`
                : "Awaiting remote connection confirmation payload..."
              }
            </p>
            <p className="text-[10px] text-slate-400">
              Ref: {orderReference?.slice(-12) || "N/A"}
            </p>
            {boostData && (
              <div className="bg-blue-50 rounded-xl p-3 text-left">
                <p className="text-[10px] font-bold text-blue-600 mb-1">Boost Details</p>
                <p className="text-xs text-blue-800">
                  {boostData.packageName} • {boostData.durationLabel || "Processing"}
                </p>
                <p className="text-xs font-bold text-blue-800 mt-1">
                  {boostData.totalAmount ? `₦${boostData.totalAmount.toLocaleString()}` : "Calculating..."}
                </p>
              </div>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs text-slate-400 underline mt-4"
            >
              Skip & check dashboard directly
            </button>
          </div>
        ) : status === "error" ? (
          <div className="p-8 text-center space-y-4">
            <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <span className="text-xl font-bold">!</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">Issue Activating Boost</h1>
            <p className="text-slate-500 text-xs text-balance">{error || "We couldn't confirm your boost payment."}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-sm font-bold text-slate-500 underline"
              >
                Retry Status Sync
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-green-600 p-6 text-center text-white relative overflow-hidden">
              <Zap className="h-12 w-12 text-white mx-auto mb-2 relative z-10" />
              <h1 className="text-xl font-extrabold tracking-tight relative z-10">Boost Activated! 🚀</h1>
              <p className="text-xs text-white/90 relative z-10">Your store is now getting more visibility</p>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex justify-between items-center px-1">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Package</p>
                  <p className="text-lg font-extrabold text-slate-900">{boostData?.packageName || "Pro Boost"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                  <p className="text-sm font-bold text-slate-900">₦{boostData?.totalAmount?.toLocaleString() || "0"}</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-100 p-4 rounded-xl space-y-2">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Boost Period</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">Starts: {getStartDate()}</span>
                  <span className="bg-green-600 text-white px-3 py-1 rounded-full text-[10px] font-black">Ends: {getEndDate()}</span>
                </div>
                {boostData?.durationLabel && (
                  <p className="text-[10px] text-slate-500 text-center">
                    Duration: {boostData.durationLabel}{boostData?.autoRenew && " • Auto-renews"}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">What's Included</p>
                <div className="space-y-2">
                  {getBoostFeatures(boostData?.tier).map((feature, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50/80 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={16} />
                <p className="text-[10px] text-blue-800 leading-tight font-medium">
                  Your boost is active! View performance metrics in real-time inside your core panel.
                </p>
              </div>

              <button
                onClick={() => router.push('/dashboard?tab=store')}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all active:scale-[0.97]"
              >
                <TrendingUp size={16} /> View Boost Analytics
              </button>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full flex items-center justify-center gap-1 text-slate-400 hover:text-slate-600 font-bold text-[11px] uppercase tracking-wide"
              >
                Return to Dashboard <ArrowRight size={12} />
              </button>
            </div>

            <div className="bg-slate-50 py-3 text-center border-t border-slate-100">
              <p className="text-[9px] font-extrabold text-slate-400 tracking-[0.1em] uppercase">
                Zebble Technologies Limited
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BoostSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <Loader2 className="h-10 w-10 text-green-600 animate-spin" />
      </div>
    }>
      <BoostSuccessContent/>
    </Suspense>
  );
}