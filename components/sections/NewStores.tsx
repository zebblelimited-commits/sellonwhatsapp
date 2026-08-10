"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { collection, onSnapshot } from "firebase/firestore";
import { ShieldCheck, Store as StoreIcon } from "lucide-react";
import { db } from "@/lib/firebase";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
  status?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: unknown;
};

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime() || 0;
  return 0;
}

function isPublicVerifiedStore(store: Store) {
  return store.isVerified === true && store.isDeleted !== true && store.isActive !== false && !["inactive", "banned", "suspended", "deleted"].includes(String(store.status || "").toLowerCase());
}

function MiniStoreCard({ store }: { store: Store }) {
  const storeName = store.storeName || store.name || "Unnamed Store";
  const username = store.username || store.id;
  const banner = store.bannerUrl || store.coverImage || "/images/placeholder-cover.svg";
  const logo = store.logoUrl || store.logo || banner;
  const category = store.category || store.subCategory || store.mainCategory || "Verified Store";

  return (
    <article className="group min-w-[280px] overflow-hidden rounded-[24px] border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md md:min-w-0">
      <Link href={`/${username}`} className="relative block h-24 w-full overflow-hidden rounded-xl">
        <Image src={banner} alt={storeName} fill sizes="(max-width: 768px) 280px, 20vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
      </Link>

      <div className="relative z-10 -mt-5 flex items-start gap-3 px-1">
        <Link href={`/${username}`} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-sm">
          <Image src={logo} alt={`${storeName} logo`} fill sizes="48px" className="object-cover" />
        </Link>

        <div className="min-w-0 pt-6">
          <div className="flex items-center gap-1">
            <h3 className="truncate text-sm font-bold leading-tight text-gray-900">{storeName}</h3>
            <ShieldCheck size={14} className="shrink-0 text-green-600" aria-label="Verified store" />
          </div>
          <p className="truncate text-[10px] font-medium text-gray-400">@{username}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-50 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-wider text-green-600">{category}</p>
          <p className="mt-1 text-[10px] font-medium text-gray-400">{Number(store.productCount || 0).toLocaleString()} products · {Number(store.followerCount || 0).toLocaleString()} followers</p>
        </div>
        <Link href={`/${username}`} className="shrink-0 rounded-lg bg-green-50 px-3 py-1.5 text-[11px] font-bold text-[#00a63e] transition-colors hover:bg-green-100">View Store</Link>
      </div>
    </article>
  );
}

function StorePlaceholder() {
  return (
    <div className="flex min-w-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-green-200 bg-green-50/50 p-8 text-center md:min-w-0">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-green-500 shadow-sm"><StoreIcon size={22} /></div>
      <p className="mt-4 text-sm font-bold text-gray-800">New verified stores appear here</p>
      <p className="mt-1 max-w-[220px] text-xs font-medium leading-5 text-gray-500">Check back soon as more verified vendors join the marketplace.</p>
    </div>
  );
}

export default function NewStores({ fullPage = false }: { fullPage?: boolean }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(db, "stores"),
      (snapshot) => {
        const newestStores = snapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() as Omit<Store, "id">) }))
          .filter(isPublicVerifiedStore)
          .sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt));
        setStores(newestStores.slice(0, fullPage ? 80 : 10));
        setLoading(false);
      },
      (error) => {
        console.error("New verified stores could not be loaded:", error);
        setStores([]);
        setLoading(false);
      },
    );
  }, [fullPage]);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-6 py-10`} id="new-stores">
      <div className="mb-6 flex items-center justify-between">
        <div>
          {fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}
          <h2 className="text-xl font-bold text-gray-900">Verified Stores</h2>
          {fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Discover the newest verified vendors on the marketplace.</p>}
        </div>
        <div className="flex items-center gap-3">
          {!fullPage && <Link href="/verified-stores" className="text-xs font-semibold text-[#00d95f] transition-colors hover:text-[#00a63e] sm:text-sm">View all <span className="text-sm">›</span></Link>}
        </div>
      </div>

      <div className={fullPage ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "no-scrollbar flex gap-5 overflow-x-auto pb-4 scroll-smooth md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"}>
        {loading ? [1, 2, 3, 4, 5].map((item) => <div key={item} className="h-52 min-w-[280px] animate-pulse rounded-[24px] bg-gray-100 md:min-w-0" />) : stores.length > 0 ? stores.map((store) => <MiniStoreCard key={store.id} store={store} />) : <StorePlaceholder />}
      </div>

      <style jsx global>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </section>
  );
}
