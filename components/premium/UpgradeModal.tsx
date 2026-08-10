// @/components/premium/UpgradeModal.tsx
"use client";
import { useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { showToast } from "@/lib/toast";

interface UpgradeModalProps {
  onClose: () => void;
  preselectedPlan?: string;
}

export function UpgradeModal({ onClose, preselectedPlan }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState(preselectedPlan || "pro_monthly");
  const [loading, setLoading] = useState(false);

  const plans = [
    {
      id: "free",
      name: "Free",
      price: 0,
      interval: "forever",
      features: ["Basic store listing", "Up to 50 products", "Standard support"],
      cta: "Current Plan",
      disabled: true
    },
    {
      id: "pro_monthly",
      name: "Pro",
      price: 4999,
      interval: "month",
      features: [
        "✅ Real-time chat support",
        "✅ Verified badge",
        "✅ Advanced analytics",
        "✅ Priority support",
        "✅ Up to 500 products"
      ],
      cta: "Upgrade - ₦4,999/mo",
      popular: true
    },
    {
      id: "pro_yearly",
      name: "Pro (Yearly)",
      price: 49990,
      interval: "year",
      features: [
        "Everything in Pro Monthly",
        "✅ 2 months free",
        "✅ Dedicated account manager",
        "✅ Early feature access"
      ],
      cta: "Upgrade - ₦49,990/yr",
      savings: "Save 17%"
    }
  ];

  const handleUpgrade = async () => {
    if (selectedPlan === "free") return;
    setLoading(true);
    
    try {
      // 1. Initialize Nomba checkout
      const response = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan,
          userId: auth.currentUser?.uid,
          returnUrl: window.location.href
        })
      });
      
      const { checkoutUrl } = await response.json();
      
      // 2. Redirect to Nomba payment page
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error("Checkout failed:", error);
      showToast("error", "Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="my-2 flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[32px]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 p-4 sm:p-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Upgrade Your Plan</h3>
            <p className="text-sm text-gray-500">Unlock premium features to grow your business</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upgrade dialog" className="shrink-0 rounded-full p-2 hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Plans Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => !plan.disabled && setSelectedPlan(plan.id)}
              disabled={plan.disabled}
              className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                selectedPlan === plan.id 
                  ? "border-[#00a63e] bg-[#00a63e]/5" 
                  : plan.disabled 
                    ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                    : "border-gray-100 hover:border-[#00a63e]/50 hover:bg-gray-50"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-2 -right-2 px-2 py-1 bg-[#00a63e] text-white text-[9px] font-bold rounded-full">
                  Most Popular
                </span>
              )}
              
              <h4 className="font-bold text-sm text-gray-900">{plan.name}</h4>
              <div className="mt-2 mb-3">
                <span className="text-2xl font-black text-gray-900">₦{plan.price.toLocaleString()}</span>
                <span className="text-[10px] text-gray-400">/{plan.interval}</span>
              </div>
              
              {plan.savings && (
                <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded-full mb-3">
                  {plan.savings}
                </span>
              )}
              
              <ul className="space-y-1.5 mb-4">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-[10px] text-gray-600">
                    <Check size={12} className="text-[#00a63e] mt-0.5 shrink-0" />
                    <span>{feature.replace("✅ ", "")}</span>
                  </li>
                ))}
              </ul>
              
              <span className={`block w-full py-2 rounded-xl text-[10px] font-bold text-center transition-colors ${
                selectedPlan === plan.id 
                  ? "bg-[#00a63e] text-white" 
                  : plan.disabled
                    ? "bg-gray-200 text-gray-400"
                    : "bg-gray-100 text-gray-600"
              }`}>
                {plan.cta}
              </span>
            </button>
          ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col items-stretch gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="max-w-full text-[10px] text-gray-400 sm:max-w-[55%]">
            Secure payment via Nomba • Cancel anytime • 7-day money-back guarantee
          </p>
          <button 
            type="button"
            onClick={handleUpgrade}
            disabled={loading || selectedPlan === "free"}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00a63e] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#008c34] disabled:bg-gray-300 active:scale-[0.98] sm:w-auto"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : "Continue to Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
