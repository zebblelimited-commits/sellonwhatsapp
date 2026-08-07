// components/store/StoreCard.tsx
"use client";

import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ShieldCheck, Crown } from "lucide-react";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// ✅ TypeScript interface for your Firestore store document
interface StoreData {
  id: string;
  name: string;
  username: string;
  category: string;
  price: string;
  logo: string;
  coverImage: string;

  // ✅ Verification (Verified Business badge) - Manual admin approval
  isVerified?: boolean;
  verifiedAt?: any; // Firestore timestamp
  verificationTier?: "business" | null; // "business" for manual verification

  // ✅ Subscription (Pro Seller badge) - Active Pro subscription
  subscription?: {
    planId?: "pro_lite" | "pro_max";
    status?: "active" | "canceled" | "expired";
    currentPeriodEnd?: any; // Firestore timestamp
  };

  rating?: number;
  totalOrders?: number;
  [key: string]: any; // Allow extra fields
}

interface StoreCardProps {
  store: StoreData;
  onClick?: () => void;
}

export default function StoreCard({ store, onClick }: StoreCardProps) {
  if (!store) return null;

  // ✅ Badge display logic
  const showVerifiedBusinessBadge = store.isVerified && store.verificationTier === "business";
  const showProSellerBadge = store.subscription?.status === "active";

  return (
    <div
      onClick={onClick}
      className={`${jakarta.className} bg-white border border-gray-100 rounded-[32px] shadow-sm overflow-hidden relative w-full max-w-[450px] p-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.99]`}
    >

      {/* 1. COVER IMAGE AREA */}
      <div className="relative h-36 w-full rounded-2xl overflow-hidden">
        <Image
          src={store.coverImage || "/images/placeholder-cover.svg"}
          alt={store.name}
          fill
          className="object-cover brightness-95"
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 100vw"
        />

        {/* ✅ Badges Container - Top Right */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {/* Verified Business Badge (Green) */}
          {showVerifiedBusinessBadge && (
            <div
              className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-green-100"
              title="Verified Business • Identity & documents confirmed by Zebble"
            >
              <ShieldCheck size={12} className="text-[#00a63e]" />
              <span className="text-[10px] font-bold text-gray-800 tracking-tight">Verified</span>
            </div>
          )}

          {/* Pro Seller Badge (Amber) */}
          {showProSellerBadge && (
            <div
              className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-amber-100"
              title="Pro Seller • Premium subscription • Advanced features"
            >
              <Crown size={12} className="text-[#f59e0b] fill-[#f59e0b]/10" />
              <span className="text-[10px] font-bold text-gray-800 tracking-tight">Pro</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. HEADER SECTION (Logo + Text side-by-side) */}
      <div className="flex items-start gap-4 px-2 -mt-6 relative z-10">
        <div className="relative shrink-0">
          <div className="p-0.5 bg-white rounded-full shadow-sm">
            <div className="relative w-16 h-16 rounded-full overflow-hidden border-[1px] border-gray-100 bg-gray-50">
              <Image
              src={store.logo || "/images/placeholder-logo.svg"}
                alt={`${store.name} logo`}
                width={64}
                height={64}
                className="object-cover"
              />
            </div>
          </div>
        </div>

        {/* STORE INFO */}
        <div className="pt-8 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-bold text-lg text-gray-900 tracking-tight leading-none truncate">
              {store.name}
            </h3>

            {/* ✅ FIXED: Wrapped icons in <span> to support the 'title' tooltip */}
            {showVerifiedBusinessBadge && (
              <span title="Verified Business • Identity & documents confirmed by Zebble">
                <ShieldCheck
                  size={16}
                  className="text-[#00a63e] shrink-0"
                />
              </span>
            )}
            {showProSellerBadge && (
              <span title="Pro Seller • Premium subscription • Advanced features">
                <Crown
                  size={16}
                  className="text-[#f59e0b] fill-[#f59e0b]/10 shrink-0"
                />
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 font-medium">@{store.username}</p>
          <p className="text-[10px] text-[#00a63e] font-bold mt-0.5 uppercase tracking-wider">
            {store.category || "General Store"}
          </p>
        </div>
      </div>

      {/* 3. CONTENT & BUTTONS */}
      <div className="px-2 mt-3">
        <hr className="mb-3 border-gray-100" />

        <div className="mb-3 flex items-baseline gap-2">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Starting from</p>
          <span className="text-xl font-bold text-gray-900 leading-none">{store.price || "₦0"}</span>
        </div>

        <div className="flex gap-3 mb-2">
          <button className="flex-1 bg-[#00a63e] hover:opacity-90 text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all">
            <Image src="/icons/whatsapplogo.svg" width={16} height={16} alt="wa" className="brightness-0 invert" />
            WhatsApp
          </button>
          <button className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all">
            <Image src="/icons/store.svg" width={16} height={16} alt="store" />
            Visit Store
          </button>
        </div>

        {/* 4. TRUST SIGNALS */}
        <div className="flex items-center gap-3 mt-3 border-t border-gray-50 pt-3">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <img
                key={i}
                src={`https://i.pravatar.cc/40?img=${i + 10}`}
                className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                alt="customer"
              />
            ))}
          </div>
          <p className="text-[11px] text-gray-500 leading-tight">
            <span className="font-bold text-gray-800">{store.totalOrders?.toLocaleString() || "1,245"}+</span> customers trusted this store
          </p>

          {/* ✅ Badges in Footer - Order: Verified Business first, then Pro Seller */}
          <div className="ml-auto flex items-center gap-2">
            {showVerifiedBusinessBadge && (
              <div className="flex items-center gap-1 text-[10px] text-[#00a63e] font-bold">
                <ShieldCheck size={12} /> Verified
              </div>
            )}
            {showProSellerBadge && (
              <div className="flex items-center gap-1 text-[10px] text-[#f59e0b] font-bold">
                <Crown size={12} className="fill-[#f59e0b]/10" /> Pro
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
