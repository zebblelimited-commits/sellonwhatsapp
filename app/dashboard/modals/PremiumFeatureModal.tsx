// app/dashboard/modals/PremiumFeatureModal.tsx
"use client";

import { X, Crown, CheckCircle2, ArrowRight } from "lucide-react";

type ProFeature = "chat" | "analytics" | "advanced_withdraw" | "priority_support";

interface PremiumFeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: ProFeature;
  onUpgrade: () => void;
}

export default function PremiumFeatureModal({ isOpen, onClose, feature, onUpgrade }: PremiumFeatureModalProps) {
  if (!isOpen) return null;

  const featureConfig: Record<ProFeature, { 
    title: string; 
    description: string; 
    benefits: string[];
    cta: string;
  }> = {
    chat: {
      title: "Unlock Real-Time Chat",
      description: "Message buyers directly to resolve issues faster and boost customer satisfaction.",
      benefits: [
        "Instant buyer communication",
        "Read receipts & typing indicators", 
        "File/image sharing",
        "Chat history & search",
        "Priority response badge"
      ],
      cta: "Upgrade to Pro Lite"
    },
    analytics: {
      title: "Unlock Advanced Analytics",
      description: "Track sales trends, customer behavior, and growth metrics to scale your business.",
      benefits: [
        "Revenue & conversion charts",
        "Customer demographics",
        "Product performance insights", 
        "Export reports to CSV",
        "Custom date ranges"
      ],
      cta: "Upgrade to Pro Lite"
    },
    advanced_withdraw: {
      title: "Unlock Instant Withdrawals",
      description: "Get your funds faster with priority processing and lower fees.",
      benefits: [
        "Same-day bank transfers",
        "Reduced withdrawal fees (1.5% vs 3%)",
        "Higher withdrawal limits",
        "Priority support",
        "Auto-schedule payouts"
      ],
      cta: "Upgrade to Pro Max"
    },
    priority_support: {
      title: "Unlock Priority Support",
      description: "Get help faster with dedicated support and faster response times.",
      benefits: [
        "24/7 priority chat support",
        "Dedicated account manager",
        "Faster dispute resolution (<4 hours)",
        "Early feature access",
        "Direct line to engineering"
      ],
      cta: "Upgrade to Pro Max"
    }
  };

  const config = featureConfig[feature];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Crown size={20} className="text-amber-600 fill-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Pro Feature</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xl font-black text-gray-900 mb-2">{config.title}</h4>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>

          <div className="space-y-3">
            {config.benefits.map((benefit, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Pricing Preview */}
          <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-900">Pro Lite</span>
              <span className="text-lg font-black text-green-600">₦4,999<span className="text-sm font-normal text-gray-500">/mo</span></span>
            </div>
            <p className="text-[10px] text-gray-500">Includes Chat + Analytics + Priority Support</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold text-sm transition-all"
          >
            Maybe Later
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {config.cta} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}