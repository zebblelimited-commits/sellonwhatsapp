"use client";

import { useState } from "react"; // ✅ Added useState
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ShieldCheck, Crown, Users, LayoutGrid, MapPin, MessageCircle } from "lucide-react";
import FollowButton from "@/components/store/FollowButton";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
});

interface StoreExploreData {
    id: string;
    storeName: string;
    username: string;
    category?: string;
    bannerUrl?: string;
    coverImage?: string;
    logoUrl?: string;
    logo?: string;
    state?: string;
    productCount?: number;
    followerCount?: number;
    isVerified?: boolean;
    verificationTier?: "business" | null;
    subscription?: {
        status?: "active" | "canceled" | "expired";
    };
    [key: string]: any;
}

interface StoreCardExploreProps {
    store: StoreExploreData;
}

export default function StoreCardExplore({ store }: StoreCardExploreProps) {
    if (!store) return null;

    // ✅ FIX: Add local state to track follower count dynamically
    const [localFollowerCount, setLocalFollowerCount] = useState(store.followerCount || 0);

    const showVerifiedBusinessBadge = store.isVerified && store.verificationTier === "business";
    const showProSellerBadge = store.subscription?.status === "active";

    // Fallbacks for images
    const coverImg = store.bannerUrl || store.coverImage || "/images/placeholder-cover.jpg";
    const logoImg = store.logoUrl || store.logo || `https://ui-avatars.com/api/?name=${store.storeName}&background=00a63e&color=fff`;

    return (
        <div className={`${jakarta.className} bg-white border border-gray-100 rounded-[32px] shadow-sm overflow-hidden relative w-full p-4 cursor-pointer hover:shadow-lg hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.99] flex flex-col`}>

            {/* 1. COVER IMAGE AREA */}
            <Link href={`/${store.username}`} className="relative h-36 w-full rounded-2xl overflow-hidden block">
                <Image
                    src={coverImg}
                    alt={store.storeName}
                    fill
                    className="object-cover brightness-95"
                />

                {/* Badges Container - Top Right */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {showVerifiedBusinessBadge && (
                        <div className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-green-100" title="Verified Business">
                            <ShieldCheck size={12} className="text-[#00a63e]" />
                            <span className="text-[10px] font-bold text-gray-800 tracking-tight">Verified</span>
                        </div>
                    )}
                    {showProSellerBadge && (
                        <div className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-amber-100" title="Pro Seller">
                            <Crown size={12} className="text-[#f59e0b] fill-[#f59e0b]/10" />
                            <span className="text-[10px] font-bold text-gray-800 tracking-tight">Pro</span>
                        </div>
                    )}
                </div>
            </Link>

            {/* 2. HEADER SECTION (Logo + Text side-by-side) */}
            <div className="flex items-start gap-4 px-2 -mt-6 relative z-10">
                <Link href={`/${store.username}`} className="relative shrink-0">
                    <div className="p-0.5 bg-white rounded-full shadow-sm">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden border-[1px] border-gray-100 bg-gray-50">
                            <Image
                                src={logoImg}
                                alt={`${store.storeName} logo`}
                                width={64}
                                height={64}
                                className="object-cover"
                            />
                        </div>
                    </div>
                </Link>

                {/* STORE INFO */}
                <div className="pt-8 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Link href={`/${store.username}`}>
                            <h3 className="font-bold text-lg text-gray-900 tracking-tight leading-none truncate hover:text-[#00a63e] transition-colors">
                                {store.storeName}
                            </h3>
                        </Link>

                        {showVerifiedBusinessBadge && (
                            <span title="Verified Business">
                                <ShieldCheck size={16} className="text-[#00a63e] shrink-0" />
                            </span>
                        )}
                        {showProSellerBadge && (
                            <span title="Pro Seller">
                                <Crown size={16} className="text-[#f59e0b] fill-[#f59e0b]/10 shrink-0" />
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 font-medium">@{store.username}</p>
                    <p className="text-[10px] text-[#00a63e] font-bold mt-0.5 uppercase tracking-wider">
                        {store.category || "General Store"}
                    </p>
                </div>
            </div>

            {/* 3. STATS & ACTIONS (Explore Specific) */}
            <div className="px-2 mt-4 flex-1 flex flex-col">
                <hr className="mb-4 border-gray-100" />

                {/* Stats Grid */}
                <div className="grid grid-cols-3 w-full gap-2 mb-4">
                    <div className="flex flex-col items-center bg-gray-50 rounded-xl py-2.5">
                        <span className="flex items-center gap-1 text-[#00a63e] font-bold text-xs">
                            <Users size={12} /> {localFollowerCount} {/* ✅ Uses local state */}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-0.5">Followers</span>
                    </div>

                    <div className="flex flex-col items-center bg-gray-50 rounded-xl py-2.5">
                        <span className="flex items-center gap-1 text-gray-700 font-bold text-xs">
                            <LayoutGrid size={12} /> {store.productCount || 0}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-0.5">Items</span>
                    </div>

                    <div className="flex flex-col items-center bg-gray-50 rounded-xl py-2.5">
                        <span className="flex items-center gap-1 text-gray-700 font-bold text-xs truncate max-w-[70px]">
                            <MapPin size={12} /> {store.state || "N/A"}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter mt-0.5">Location</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 mt-auto">
                    <Link
                        href={`/${store.username}`}
                        className="w-full py-3 bg-[#00a63e] hover:bg-[#008c34] rounded-2xl text-[11px] font-extrabold text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                        <MessageCircle size={16} /> View WhatsApp Shop
                    </Link>

                    <div className="w-full follow-button-wrapper">
                        {/* ✅ FIX: Pass required props to FollowButton */}
                        <FollowButton
                            vendorId={store.id}
                            currentCount={localFollowerCount}
                            onFollowChange={(val: any) => {
                                // Safely handles both (newCount: number) and (isFollowing: boolean) signatures
                                if (typeof val === 'number') {
                                    setLocalFollowerCount(val);
                                } else if (typeof val === 'boolean') {
                                    setLocalFollowerCount(prev => val ? prev + 1 : prev - 1);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}