"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ExternalLink, Store as StoreIcon } from "lucide-react";
import { db } from "@/lib/firebase";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type SponsoredStore = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  bgImageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const fallbackImage = "/images/placeholder-cover.svg";

function normalizeCard(id: string, data: Record<string, unknown>): SponsoredStore {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "Sponsored Store",
    description: typeof data.description === "string" ? data.description : "Discover products from this featured store.",
    ctaText: typeof data.ctaText === "string" ? data.ctaText : "View Store",
    ctaUrl: typeof data.ctaUrl === "string" && data.ctaUrl.trim() ? data.ctaUrl : "/explore",
    bgImageUrl: typeof data.bgImageUrl === "string" && data.bgImageUrl.trim() ? data.bgImageUrl : fallbackImage,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    isActive: data.isActive !== false,
  };
}

function SponsoredCard({ card }: { card: SponsoredStore }) {
  return (
    <article className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl p-6 shadow-sm sm:min-h-[240px]">
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${JSON.stringify(card.bgImageUrl)})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" aria-hidden="true" />

      <div className="relative z-10">
        <span className="inline-block rounded-full bg-black/40 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md">
          Sponsored
        </span>
      </div>

      <div className="relative z-10">
        <h3 className="text-xl font-extrabold text-white sm:text-2xl">{card.title}</h3>
        <p className="mt-1 max-w-[250px] text-xs font-medium text-white/80 sm:text-sm">{card.description}</p>
        <Link
          href={card.ctaUrl}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-gray-900 shadow-md transition-all hover:bg-gray-100 hover:shadow-lg active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm"
        >
          {card.ctaText}
          <ExternalLink size={14} />
        </Link>
      </div>
    </article>
  );
}

function SponsoredPlaceholder() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-green-200 bg-green-50/50 p-6 text-center sm:min-h-[240px]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-green-600 shadow-sm"><StoreIcon size={22} /></div>
      <p className="mt-4 text-sm font-bold text-gray-800">Sponsored stores will appear here</p>
      <p className="mt-1 max-w-[230px] text-xs font-medium leading-5 text-gray-500">An admin can publish featured store cards from Settings.</p>
    </div>
  );
}

export default function SponsoredStores({ fullPage = false }: { fullPage?: boolean }) {
  const [cards, setCards] = useState<SponsoredStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cardsQuery = query(collection(db, "sponsored_stores"), orderBy("sortOrder", "asc"));
    return onSnapshot(
      cardsQuery,
      (snapshot) => {
        const activeCards = snapshot.docs
          .map((item) => normalizeCard(item.id, item.data()))
          .filter((card) => card.isActive)
          .sort((left, right) => left.sortOrder - right.sortOrder);
        setCards(activeCards.slice(0, fullPage ? 80 : 4));
        setLoading(false);
      },
      (error) => {
        console.error("Sponsored stores could not be loaded:", error);
        setCards([]);
        setLoading(false);
      },
    );
  }, [fullPage]);

  const visibleCards = loading
    ? null
    : cards.length > 0
      ? cards.map((card) => <SponsoredCard key={card.id} card={card} />)
      : <SponsoredPlaceholder />;

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`} id="sponsored-stores">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Sponsored Stores</h2>
          {fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Explore stores currently featured by the marketplace.</p>}
        </div>
        {!fullPage && <Link href="/sponsored-stores" className="shrink-0 text-xs font-semibold text-[#00a63e] transition-colors hover:text-green-700 sm:text-sm">View all <span className="text-sm">›</span></Link>}
      </div>

      <div className={fullPage ? "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" : "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"}>
        {loading
          ? [1, 2, 3, 4].map((item) => <div key={item} className="h-[240px] animate-pulse rounded-2xl bg-gray-100" />)
          : visibleCards}
      </div>
    </section>
  );
}
