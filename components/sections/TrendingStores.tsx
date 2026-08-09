"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { LayoutGrid, Search, Users, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import FollowButton from "@/components/store/FollowButton";
import { trackMetric } from "@/lib/analytics";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type Store = {
  id: string;
  storeName?: string;
  name?: string;
  username?: string;
  category?: string;
  subCategory?: string;
  mainCategory?: string;
  bannerUrl?: string;
  coverImage?: string;
  logoUrl?: string;
  logo?: string;
  followerCount?: number;
  productCount?: number;
  isVerified?: boolean;
  verificationTier?: string;
  status?: string;
  isActive?: boolean;
  isDeleted?: boolean;
};

type TrendingStoresProps = {
  fullPage?: boolean;
};

function isVisibleStore(store: Store) {
  return store.isDeleted !== true && store.isActive !== false && !["inactive", "banned", "suspended", "deleted"].includes(String(store.status || "").toLowerCase());
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function TrendingStoreCard({ store }: { store: Store }) {
  const [followerCount, setFollowerCount] = useState(Number(store.followerCount || 0));
  const storeName = store.storeName || store.name || "Unnamed Store";
  const username = store.username || store.id;
  const category = store.category || store.subCategory || store.mainCategory || "Marketplace Store";
  const coverImage = store.bannerUrl || store.coverImage || "/images/placeholder-cover.svg";
  const logoImage = store.logoUrl || store.logo;
  const isVerified = Boolean(store.isVerified && store.verificationTier === "business");
  const initials = storeName.slice(0, 2).toUpperCase();
  const trackStoreClick = () => { void trackMetric(store.id, "click"); };

  return (
    <article className="group flex min-w-[190px] flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md md:min-w-0">
      <Link href={`/${username}`} onClick={trackStoreClick} className="relative block h-24 w-full overflow-hidden rounded-xl bg-gray-100">
        <Image src={coverImage} alt={storeName} fill sizes="(max-width: 768px) 190px, 17vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        {isVerified && <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-green-600 shadow-sm" title="Verified Business"><ShieldCheck size={13} /></span>}
      </Link>

      <div className="relative z-10 -mt-5 flex items-start gap-2 px-1">
        <Link href={`/${username}`} onClick={trackStoreClick} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-green-50 shadow-sm">
          {logoImage ? <Image src={logoImage} alt={`${storeName} logo`} fill sizes="48px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-black text-green-700">{initials}</span>}
        </Link>
        <div className="min-w-0 flex-1 pt-6">
          <div className="flex items-center gap-1">
            <Link href={`/${username}`} onClick={trackStoreClick} className="min-w-0"><h3 className="truncate text-sm font-bold leading-tight text-gray-900 hover:text-green-600">{storeName}</h3></Link>
            {isVerified && <ShieldCheck size={13} className="shrink-0 text-green-600" aria-label="Verified Business" />}
          </div>
          <p className="truncate text-[10px] font-medium text-gray-400">@{username}</p>
          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-green-600">{category}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-gray-100 pt-3 text-center">
        <div className="rounded-lg bg-gray-50 px-1 py-1.5">
          <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-gray-700"><Users size={11} /> {formatCount(followerCount)}</p>
          <p className="text-[8px] font-bold uppercase tracking-tight text-gray-400">Followers</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-1 py-1.5">
          <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-gray-700"><LayoutGrid size={11} /> {formatCount(Number(store.productCount || 0))}</p>
          <p className="text-[8px] font-bold uppercase tracking-tight text-gray-400">Products</p>
        </div>
      </div>

      <div className="mt-3">
        <FollowButton vendorId={store.id} currentCount={followerCount} onFollowChange={setFollowerCount} />
      </div>
    </article>
  );
}

export default function TrendingStores({ fullPage = false }: TrendingStoresProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStores() {
      try {
        const [storeSnapshot, productSnapshot] = await Promise.all([
          getDocs(query(collection(db, "stores"), limit(80))),
          getDocs(collection(db, "products")),
        ]);

        const productCounts = new Map<string, number>();
        productSnapshot.docs.forEach((item) => {
          const product = item.data();
          if (["inactive", "banned", "deleted"].includes(String(product.status || "").toLowerCase()) || product.isDeleted === true) return;
          const storeId = String(product.storeId || product.vendorId || product.ownerId || "");
          if (storeId) productCounts.set(storeId, (productCounts.get(storeId) || 0) + 1);
        });

        const loadedStores = storeSnapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() as Omit<Store, "id">), productCount: productCounts.get(item.id) || Number(item.data().productCount || 0) }))
          .filter(isVisibleStore)
          .sort((left, right) => (Number(right.followerCount || 0) + Number(right.productCount || 0)) - (Number(left.followerCount || 0) + Number(left.productCount || 0)));

        if (!cancelled) setStores(loadedStores.slice(0, fullPage ? 80 : 6));
      } catch (loadError) {
        console.error("Trending stores could not be loaded:", loadError);
        if (!cancelled) setError("Stores could not be loaded right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStores();
    return () => { cancelled = true; };
  }, [fullPage]);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`} id="trending">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          {fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Trending Stores</h2>
          {fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Follow stores, explore their products, and keep up with new listings.</p>}
        </div>
        {!fullPage && <Link href="/stores" className="flex items-center gap-1 text-xs font-semibold text-[#00d95f] transition-colors hover:text-[#00a63e] sm:text-sm">View all <span className="text-sm">›</span></Link>}
      </div>

      {error ? <div className="rounded-2xl bg-red-50 p-6 text-center text-sm font-medium text-red-700">{error}</div> : loading ? (
        <div className={fullPage ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" : "flex gap-4 overflow-hidden"}>{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className={`${fullPage ? "min-h-72" : "min-w-[190px]"} animate-pulse rounded-2xl bg-gray-100`} />)}</div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center"><Search className="mx-auto text-gray-300" size={28} /><p className="mt-3 text-sm font-bold text-gray-700">No stores are available yet.</p></div>
      ) : (
        <div ref={scrollRef} className={fullPage ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" : "no-scrollbar flex gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth md:grid md:grid-cols-6 md:overflow-visible"}>{stores.map((store) => <TrendingStoreCard key={store.id} store={store} />)}</div>
      )}

      <style jsx global>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </section>
  );
}
