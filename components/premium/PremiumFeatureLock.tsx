// components/premium/PremiumFeatureLock.tsx
"use client";

import { Lock, ArrowRight, Crown } from "lucide-react"; // ✅ Added Crown icon
import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";

interface PremiumFeatureLockProps {
  featureName: string;
  featureDescription: string;
  planRequired: string;
  badgeType?: "pro"; // ✅ NEW: Specify badge type for upgrade modal
  children?: React.ReactNode;
}

export function PremiumFeatureLock({ 
  featureName, 
  featureDescription, 
  planRequired, 
  badgeType = "pro", // Default to Pro badge
  children 
}: PremiumFeatureLockProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <>
      <div className="relative group">
        {/* Blurred Content (if provided) */}
        {children && (
          <div className="filter blur-sm select-none pointer-events-none opacity-50">
            {children}
          </div>
        )}
        
        {/* Lock Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px] rounded-2xl border border-dashed border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
            <Lock size={20} className="text-gray-400" />
          </div>
          <h4 className="font-bold text-sm text-gray-900 mb-1">{featureName}</h4>
          <p className="text-[10px] text-gray-500 mb-4 max-w-[200px]">{featureDescription}</p>
          
          <button 
            onClick={() => setShowUpgradeModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00a63e] hover:bg-[#008c34] text-white rounded-xl text-[10px] font-bold transition-all active:scale-[0.98]"
          >
            <Crown size={12} className="fill-white" /> Upgrade to {planRequired}
          </button>
          
          <p className="text-[9px] text-gray-400 mt-3">Cancel anytime • No hidden fees</p>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal 
          onClose={() => setShowUpgradeModal(false)} 
          preselectedPlan={planRequired.toLowerCase().replace(" ", "_")}
        />
      )}
    </>
  );
}
