// @/components/premium/UpgradeModal.tsx
"use client";
import { useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";

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
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Upgrade Your Plan</h3>
            <p className="text-sm text-gray-500">Unlock premium features to grow your business</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Plans Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            Secure payment via Nomba • Cancel anytime • 7-day money-back guarantee
          </p>
          <button 
            onClick={handleUpgrade}
            disabled={loading || selectedPlan === "free"}
            className="px-6 py-3 bg-[#00a63e] hover:bg-[#008c34] disabled:bg-gray-300 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-[0.98]"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : "Continue to Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}