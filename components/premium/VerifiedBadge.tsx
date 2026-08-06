// components/premium/VerifiedBadge.tsx
"use client";

import { ShieldCheck, Crown } from "lucide-react";

interface VerifiedBadgeProps {
  type?: "business" | "pro"; // ✅ NEW: Support both badge types
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

export function VerifiedBadge({ 
  type = "business", // Default to business verification
  size = "md", 
  showTooltip = true, 
  className = "" 
}: VerifiedBadgeProps) {
  
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5", 
    lg: "w-6 h-6"
  };

  // ✅ Badge configuration based on type
  const config = {
    business: {
      icon: ShieldCheck,
      color: "text-[#00a63e]", // Brand green for verified business
      fillColor: "fill-[#00a63e]/10",
      label: "Verified Business",
      tooltip: "Identity & business documents confirmed by Zebble"
    },
    pro: {
      icon: Crown,
      color: "text-[#f59e0b]", // Amber for Pro seller
      fillColor: "fill-[#f59e0b]/10",
      label: "Pro Seller",
      tooltip: "Premium subscription • Advanced features unlocked"
    }
  };

  const { icon: Icon, color, fillColor, label, tooltip } = config[type];

  return (
    <div 
      className={`relative inline-flex group ${className}`} 
      title={showTooltip ? `${label} • ${tooltip}` : undefined}
    >
      <Icon className={`${sizeClasses[size]} ${color} ${fillColor}`} />
      
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-[200px]">
          <span className="font-bold">{label}</span>
          <div className="text-[9px] text-gray-300 mt-0.5">{tooltip}</div>
          <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}