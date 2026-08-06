// app/dashboard/modals/BoostCheckoutModal.tsx
"use client";

import React, { useState } from "react";
import { 
  X, Check, Zap, Crown, ShieldCheck, Loader2, 
  AlertTriangle, ExternalLink, Sparkles, ChevronDown, RotateCw 
} from "lucide-react";

// --- STATIC CONFIG DATA FROM BOOST LANDING PAGE ---
interface BoostDuration {
  days: number;
  label: string;
  discount: number;
  popular?: boolean;
  description: string;
}

interface BoostPackage {
  id: string;
  name: string;
  basePrice: number;
  interval: "day" | "week";
  description: string;
  features: string[];
  cta: string;
  variant: "outline" | "primary" | "dark";
  popular: boolean;
}

const BOOST_DURATIONS: BoostDuration[] = [
  { days: 1, label: "1 Day", discount: 0, description: "Quick visibility boost" },
  { days: 3, label: "3 Days", discount: 0.10, description: "Short campaign" },
  { days: 7, label: "7 Days", discount: 0.17, popular: true, description: "Most popular • Best value" },
  { days: 14, label: "14 Days", discount: 0.25, description: "Extended campaign" }
];

const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: "micro",
    name: "Micro Boost",
    basePrice: 999,
    interval: "day",
    description: "Perfect for testing the waters",
    features: [
      "Featured in Trending Stores carousel",
      "+15% search ranking boost",
      "Basic analytics (views, WhatsApp clicks)",
      "Cancel anytime"
    ],
    cta: "Boost Now",
    variant: "outline",
    popular: false
  },
  {
    id: "pro",
    name: "Pro Boost",
    basePrice: 4999,
    interval: "day",
    description: "For growing businesses",
    features: [
      "Everything in Micro Boost",
      "Push notification to nearby buyers (5km)",
      "WhatsApp broadcast to opted-in buyers",
      "Priority placement in category listings",
      "Advanced analytics with conversion tracking"
    ],
    cta: "Boost Now",
    variant: "primary",
    popular: true
  },
  {
    id: "max",
    name: "Max Boost",
    basePrice: 14999,
    interval: "day",
    description: "Scale without limits",
    features: [
      "Everything in Pro Boost",
      "Homepage hero banner slot (rotating)",
      "Featured in Editor's Picks newsletter",
      "Dedicated social media shoutout",
      "A/B testing for boost copy/images",
      "Dedicated success manager chat"
    ],
    cta: "Boost Now",
    variant: "dark",
    popular: false
  }
];

const calculateBoostPrice = (basePrice: number, days: number, discount: number): number => {
  const total = basePrice * days;
  return Math.round(total * (1 - discount));
};

interface BoostCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  storeData: any;
  showNotification: (type: "success" | "error" | "info", title: string, message: string) => void;
}

export default function BoostCheckoutModal({
  isOpen,
  onClose,
  currentUser,
  storeData,
  showNotification
}: BoostCheckoutModalProps) {
  // UI Flow Tracking States
  const [loadingBoost, setLoadingBoost] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [boostError, setBoostError] = useState<string | null>(null);
  const [lastSelectedPkg, setLastSelectedPkg] = useState<BoostPackage | null>(null);

  // Pricing Modifiers States (Matching Pricing Table logic exactly)
  const [selectedDurations, setSelectedDurations] = useState<Record<string, BoostDuration>>({
    micro: BOOST_DURATIONS[2],
    pro: BOOST_DURATIONS[2],
    max: BOOST_DURATIONS[2]
  });
  
  const [autoRenew, setAutoRenew] = useState<Record<string, boolean>>({
    micro: true,
    pro: true,
    max: true
  });

  if (!isOpen) return null;

  const handleDurationSelect = (packageId: string, duration: BoostDuration) => {
    setSelectedDurations(prev => ({ ...prev, [packageId]: duration }));
  };

  const toggleAutoRenew = (packageId: string) => {
    setAutoRenew(prev => ({ ...prev, [packageId]: !prev[packageId] }));
  };

  const triggerCheckoutFlow = async (pkg: BoostPackage) => {
    if (!currentUser) {
      showNotification("error", "Authentication Required", "Please sign in to upgrade your business tier.");
      return;
    }
    
    const duration = selectedDurations[pkg.id] || BOOST_DURATIONS[0];
    const renew = autoRenew[pkg.id] ?? true;
    
    setLoadingBoost(pkg.id);
    setBoostError(null);
    setLastSelectedPkg(pkg);
    
    try {
      const idToken = await currentUser.getIdToken();
      const monthlyBasePrice = pkg.basePrice;
      const totalBasePrice = monthlyBasePrice * duration.days;
      const finalPrice = calculateBoostPrice(monthlyBasePrice, duration.days, duration.discount);
      const savingsAmount = totalBasePrice - finalPrice;
      
      const response = await fetch("/api/premium/boost-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          planId: pkg.id,
          planName: pkg.name,
          durationDays: duration.days,
          durationLabel: duration.label,
          dailyBasePrice: monthlyBasePrice,
          basePrice: totalBasePrice,
          finalPrice: finalPrice, 
          discount: duration.discount,
          discountPercentage: Math.round(duration.discount * 100),
          savingsAmount: savingsAmount,
          autoRenew: renew,
          userId: currentUser.uid,
          userEmail: currentUser.email,
          storeName: storeData?.storeName || 'My Store',
          returnUrl: `${window.location.origin}/dashboard`,
          
          // Payment Gateway Fallbacks mapping
          amount: finalPrice,
          email: currentUser.email,
          customerEmail: currentUser.email,
          callbackUrl: `${window.location.origin}/dashboard`,
          redirectUrl: `${window.location.origin}/dashboard`,
          
          metadata: {
            isBoost: true,
            boostType: pkg.id,
            boostName: pkg.name,
            durationDays: duration.days,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            storeName: storeData?.storeName || 'My Store'
          }
        })
      });
      
      const data = await response.json();
      const derivedUrl = data.checkoutUrl || data.checkoutLink || data.data?.checkoutUrl;
      
      if (!response.ok || !derivedUrl) {
        throw new Error(data.error || data.description || "Failed to initialize standard escrow handshake terminal.");
      }
      
      // Inject url into the iframe stream container instead of pushing window redirections
      setCheckoutUrl(derivedUrl);
      
    } catch (error: any) {
      console.error("Escrow setup exception context:", error);
      setBoostError(error.message || "Connection to secure payment processing server timed out.");
    } finally {
      setLoadingBoost(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className={`w-full bg-white rounded-[32px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden transition-all duration-300 max-h-[92vh] ${
        checkoutUrl ? "max-w-2xl" : "max-w-6xl"
      }`}>
        
        {/* Header Bar */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              {checkoutUrl ? <ShieldCheck size={20} /> : <Zap size={20} className="fill-green-100" />}
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-base">
                {checkoutUrl ? "Secure Checkout Terminal" : "Select Your Store Boost Plan"}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                {checkoutUrl ? "Powered by Nomba Commerce Gateway" : "Amplify your visibility index and conversion velocity"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Stream Wrapper */}
        <div className="flex-1 overflow-y-auto bg-gray-50/30 p-6">
          
          {/* --- CASE 1: STREAM RUNNING CHECKOUT WINDOW --- */}
          {checkoutUrl && (
            <div className="w-full h-full flex flex-col min-h-[500px]">
              <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl flex items-center justify-between text-xs text-amber-800 font-semibold mb-4 px-4">
                <span className="flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-600 animate-pulse" />
                  Staging Mode: Complete or cancel your secure transaction below.
                </span>
                <a 
                  href={checkoutUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-green-700 underline flex items-center gap-1 hover:text-green-800 font-bold"
                >
                  Open external window <ExternalLink size={12} />
                </a>
              </div>
              <iframe 
                src={checkoutUrl} 
                className="w-full flex-1 min-h-[460px] border border-gray-100 rounded-2xl bg-white shadow-inner"
                title="Secure Checkout Stream Frame"
                sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
              />
            </div>
          )}

          {/* --- CASE 2: HANDSHAKE TIMEOUT / FAILS OVER --- */}
          {boostError && !checkoutUrl && (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-2xl border border-gray-100">
              <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                <AlertTriangle size={28} />
              </div>
              <h4 className="font-extrabold text-gray-900 text-lg">Transaction Handshake Stalled</h4>
              <p className="text-sm text-gray-500 mt-2 max-w-md">
                The secure authorization process was interrupted by upstream network connectivity conditions.
              </p>
              <div className="text-left font-mono text-xs bg-gray-50 text-gray-600 p-3 rounded-xl border border-gray-100 mt-4 max-w-lg w-full overflow-x-auto">
                {boostError}
              </div>
              <div className="flex items-center gap-3 mt-8">
                <button
                  onClick={() => setBoostError(null)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-50 transition-all"
                >
                  Back to Pricing Table
                </button>
                {lastSelectedPkg && (
                  <button
                    onClick={() => triggerCheckoutFlow(lastSelectedPkg)}
                    className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl text-xs hover:bg-green-700 shadow-sm transition-all flex items-center gap-2"
                  >
                    <RotateCw size={14} /> Retry Gateway Sync
                  </button>
                )}
              </div>
            </div>
          )}

          {/* --- CASE 3: NATIVE PRICING MATRIX TABLE SHOWROOM --- */}
          {!checkoutUrl && !boostError && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {BOOST_PACKAGES.map((pkg) => {
                const duration = selectedDurations[pkg.id] || BOOST_DURATIONS[2];
                const renew = autoRenew[pkg.id] ?? true;
                const finalPrice = calculateBoostPrice(pkg.basePrice, duration.days, duration.discount);
                const isCurrentLoading = loadingBoost === pkg.id;

                return (
                  <div 
                    key={pkg.id}
                    className={`relative bg-white rounded-3xl border p-6 flex flex-col h-full shadow-sm transition-all duration-200 ${
                      pkg.popular 
                        ? "border-green-500 ring-4 ring-green-500/5 shadow-md" 
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm">
                        Most Popular
                      </span>
                    )}

                    {/* Tier Title */}
                    <div className="mb-4">
                      <h4 className="font-black text-gray-900 text-lg flex items-center gap-2">
                        {pkg.id === "max" ? <Crown size={18} className="text-amber-500 fill-amber-100" /> : <Zap size={16} className="text-green-500" />}
                        {pkg.name}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium min-h-[32px]">{pkg.description}</p>
                    </div>

                    {/* Dynamic Cost Counter */}
                    <div className="bg-gray-50 rounded-2xl p-4 mb-5 border border-gray-100/50">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-gray-900">₦{finalPrice.toLocaleString()}</span>
                        <span className="text-xs text-gray-400 font-bold">/ total</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 font-medium flex justify-between items-center">
                        <span>Base: ₦{pkg.basePrice}/day</span>
                        {duration.discount > 0 && (
                          <span className="text-green-600 font-extrabold bg-green-50 px-1.5 py-0.5 rounded">
                            Save {Math.round(duration.discount * 100)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timeline Matrix Controls */}
                    <div className="mb-5 space-y-3">
                      <div>
                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-1.5">
                          Campaign Duration
                        </label>
                        <div className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-xl">
                          {BOOST_DURATIONS.map((d) => (
                            <button
                              key={d.days}
                              type="button"
                              onClick={() => handleDurationSelect(pkg.id, d)}
                              className={`py-1.5 text-[11px] font-black rounded-lg transition-all text-center ${
                                duration.days === d.days
                                  ? "bg-white text-gray-900 shadow-sm"
                                  : "text-gray-500 hover:text-gray-900"
                              }`}
                            >
                              {d.label.split(" ")[0]}d
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Auto-renew switch node block */}
                      <div className="flex items-center justify-between p-2.5 border border-gray-100 rounded-xl bg-gray-50/50">
                        <span className="text-xs text-gray-600 font-bold">Auto-renew Campaign</span>
                        <button
                          type="button"
                          onClick={() => toggleAutoRenew(pkg.id)}
                          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            renew ? "bg-green-600" : "bg-gray-200"
                          }`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            renew ? "translate-x-5" : "translate-x-0"
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* Features checklist block */}
                    <div className="flex-1 space-y-2.5 mb-6 pt-2 border-t border-gray-50">
                      {pkg.features.map((feat, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Check size={14} className="text-green-600 mt-0.5 shrink-0 font-bold" />
                          <span className="text-gray-600 font-medium leading-tight">{feat}</span>
                        </div>
                      ))}
                    </div>

                    {/* Trigger Call to Action Action Node */}
                    <button
                      type="button"
                      disabled={isCurrentLoading || !!loadingBoost}
                      onClick={() => triggerCheckoutFlow(pkg)}
                      className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm ${
                        pkg.variant === "dark"
                          ? "bg-gray-900 text-white hover:bg-gray-800"
                          : pkg.variant === "primary"
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      } disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {isCurrentLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Securing Ledger...
                        </>
                      ) : (
                        <>
                          {pkg.cta} <ChevronDown size={14} className="-rotate-90" />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}