"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Crown, LayoutGrid, MapPin, MessageCircle, ShieldCheck, Users } from "lucide-react";
import FollowButton from "@/components/store/FollowButton";
import { trackMetric } from "@/lib/analytics";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

interface StoreCardExploreProps {
  store: any;
}

export default function StoreCardExplore({ store }: StoreCardExploreProps) {
  const [localFollowerCount, setLocalFollowerCount] = useState(store?.followerCount || 0);

  if (!store) return null;

  const storeName = store.storeName || store.name || "Unnamed Store";
  const username = store.username || store.id;
  const coverImage = store.bannerUrl || store.coverImage || "/images/placeholder-cover.svg";
  const logoImage = store.logoUrl || store.logo;
  const showVerified = Boolean(store.isVerified && store.verificationTier === "business");
  const showPro = store.subscription?.status === "active";
  const directWhatsAppLink = store.whatsappUrl || store.whatsappLink;
  const rawPhone = store.whatsappNumber || store.whatsappPhone || store.phone || store.phoneNumber || "";
  const phoneDigits = String(rawPhone).replace(/\D/g, "");
  const whatsappPhone = phoneDigits.startsWith("0") ? `234${phoneDigits.slice(1)}` : phoneDigits;
  const whatsappUrl = directWhatsAppLink || (whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hello ${storeName}, I found your store on Sowa.`)}`
    : `/${username}`);
  const initials = storeName.slice(0, 2).toUpperCase();
  const trackStoreClick = () => { void trackMetric(store.id, "click"); };
  const trackWhatsAppClick = () => { void trackMetric(store.id, "whatsapp_click"); };

  return (
    <article className={`${jakarta.className} w-full rounded-[24px] border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md group`}>
      {/* Compact NewStores-style banner */}
      <Link href={`/${username}`} onClick={trackStoreClick} className="relative block h-24 w-full overflow-hidden rounded-xl">
        <Image
          src={coverImage}
          alt={storeName}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(min-width: 1536px) 18vw, (min-width: 640px) 45vw, 100vw"
        />
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {showVerified && (
            <span className="rounded-full bg-white/90 p-1.5 text-green-700 shadow-sm" title="Verified Business">
              <ShieldCheck size={12} />
            </span>
          )}
          {showPro && (
            <span className="rounded-full bg-white/90 p-1.5 text-amber-500 shadow-sm" title="Pro Seller">
              <Crown size={12} />
            </span>
          )}
        </div>
      </Link>

      {/* Overlapping logo and store identity */}
      <div className="relative z-10 -mt-5 flex items-start gap-2 px-1">
        <Link href={`/${username}`} onClick={trackStoreClick} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-green-100 shadow-sm">
          {logoImage ? (
            <Image src={logoImage} alt={`${storeName} logo`} fill className="object-cover" sizes="48px" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-black text-green-700">{initials}</span>
          )}
        </Link>
        <div className="min-w-0 flex-1 pt-6">
          <div className="flex items-center gap-1">
            <Link href={`/${username}`} onClick={trackStoreClick} className="min-w-0">
              <h3 className="truncate text-sm font-bold leading-tight text-gray-900 hover:text-green-600">{storeName}</h3>
            </Link>
            {showVerified && <ShieldCheck size={13} className="shrink-0 text-green-600" aria-label="Verified Business" />}
            {showPro && <Crown size={13} className="shrink-0 fill-amber-100 text-amber-500" aria-label="Pro Seller" />}
          </div>
          <p className="truncate text-[10px] font-medium text-gray-400">@{username}</p>
          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-green-600">{store.category || "General Store"}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {/* Existing StoreCard trust and store metadata */}
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div className="rounded-lg bg-gray-50 px-1 py-1.5">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-green-600"><Users size={10} /> {localFollowerCount}</p>
            <p className="text-[7px] font-bold uppercase tracking-tight text-gray-400">Followers</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-1 py-1.5">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-gray-700"><LayoutGrid size={10} /> {store.productCount || 0}</p>
            <p className="text-[7px] font-bold uppercase tracking-tight text-gray-400">Items</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-1 py-1.5">
            <p className="flex items-center justify-center gap-0.5 truncate text-[9px] font-bold text-gray-700"><MapPin size={10} /> {store.state || "N/A"}</p>
            <p className="text-[7px] font-bold uppercase tracking-tight text-gray-400">Location</p>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5">
          <a href={whatsappUrl} target={directWhatsAppLink || whatsappPhone ? "_blank" : undefined} rel={directWhatsAppLink || whatsappPhone ? "noopener noreferrer" : undefined} onClick={trackWhatsAppClick} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 py-2 text-[9px] font-bold text-white transition hover:bg-green-700">
            <MessageCircle size={12} /> WhatsApp
          </a>
          <Link href={`/${username}`} onClick={trackStoreClick} className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 py-2 text-[9px] font-bold text-gray-700 transition hover:bg-gray-50">
            Visit Store
          </Link>
        </div>

        <div className="mt-1.5">
          <FollowButton
            vendorId={store.id}
            currentCount={localFollowerCount}
            onFollowChange={(nextCount) => setLocalFollowerCount(nextCount)}
          />
        </div>
      </div>
    </article>
  );
}
