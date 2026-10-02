"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { ExternalLink, Loader2, Store as StoreIcon } from "lucide-react";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

type SponsoredStore = {
  id: string;
  storeId?: string;
  storeName?: string;
  name?: string;
  username?: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  category?: string;
  isVerified?: boolean;
  isSponsored?: boolean;
  productCount?: number;
};

function storeName(store: SponsoredStore) {
  return store.storeName || store.name || "Sponsored Store";
}

function storeHref(store: SponsoredStore) {
  return store.username ? `/${encodeURIComponent(store.username)}` : `/stores/${encodeURIComponent(store.storeId || store.id)}`;
}

function StoreCard({ store }: { store: SponsoredStore }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="relative h-32">
        <Link href={storeHref(store)} className="relative block h-32 overflow-hidden bg-gray-100">
          {store.bannerUrl || store.logoUrl ? <Image src={store.bannerUrl || store.logoUrl || "/images/placeholder-cover.svg"} alt="" fill sizes="(max-width: 640px) 100vw, 25vw" className="object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-gray-300"><StoreIcon size={34} /></div>}
          <span className="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-[10px] font-bold text-white backdrop-blur">Sponsored</span>
        </Link>
        <Link href={storeHref(store)} aria-label={`Open ${storeName(store)}`} className="absolute -bottom-5 left-4 z-20 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-gray-100 shadow">
          {store.logoUrl ? <Image src={store.logoUrl} alt="" fill sizes="48px" className="object-cover" /> : <StoreIcon size={20} className="text-gray-300" />}
        </Link>
      </div>
      <div className="relative z-10 p-4 pt-7">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-extrabold text-gray-900">{storeName(store)}</h3><p className="truncate text-[10px] font-medium text-gray-400">{store.username ? `@${store.username}` : store.category || "Marketplace store"}</p></div>{store.isVerified && <span className="shrink-0 text-[10px] font-bold text-green-600">Verified</span>}</div>
        <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-gray-500">{store.description || "Explore products from this featured store."}</p>
        <Link href={storeHref(store)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-600">View store <ExternalLink size={13} /></Link>
      </div>
    </article>
  );
}

export default function SponsoredStores({ fullPage = false }: { fullPage?: boolean }) {
  const [stores, setStores] = useState<SponsoredStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const limit = fullPage ? 80 : 4;
        const response = await fetch(`/api/stores?sponsored=true&page=1&limit=${limit}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Sponsored stores could not be loaded");
        setStores(Array.isArray(payload.sponsoredStores) ? payload.sponsoredStores : Array.isArray(payload.stores) ? payload.stores : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Sponsored stores could not be loaded:", error);
          setStores([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [fullPage]);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`} id="sponsored-stores">
      <div className="mb-5 flex items-start justify-between gap-4"><div>{fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}<h2 className="text-lg font-bold text-gray-900 sm:text-xl">Sponsored Stores</h2>{fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Stores featured through administration or an active Store Boost.</p>}</div>{!fullPage && <Link href="/sponsored-stores" className="shrink-0 text-xs font-semibold text-[#00a63e] hover:text-green-700 sm:text-sm">View all <span className="text-sm">›</span></Link>}</div>
      {loading ? <div className="flex min-h-40 items-center justify-center rounded-2xl bg-gray-50"><Loader2 className="animate-spin text-green-600" size={24} /></div> : stores.length === 0 ? <div className="rounded-2xl border border-dashed border-green-200 bg-green-50/50 p-10 text-center"><StoreIcon className="mx-auto text-green-600" size={28} /><p className="mt-3 text-sm font-bold text-gray-800">No sponsored stores are live right now.</p></div> : <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{stores.map((store) => <StoreCard key={store.id} store={store} />)}</div>}
    </section>
  );
}
