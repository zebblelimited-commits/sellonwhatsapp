"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Shirt,
  Smartphone,
  Sparkles,
  Home,
  Utensils,
  Box,
  Briefcase,
  Grid
} from "lucide-react";
import {
  countHomeCategoryStores,
  HOME_CATEGORY_DEFINITIONS,
  type StoreCategoryRecord,
} from "@/lib/categoryCatalog";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const categoryVisuals = {
  fashion: { icon: <Shirt className="h-5 w-5 text-emerald-600" />, bgColor: "bg-emerald-50 shadow-emerald-100" },
  tech: { icon: <Smartphone className="h-5 w-5 text-indigo-600" />, bgColor: "bg-indigo-50 shadow-indigo-100" },
  beauty: { icon: <Sparkles className="h-5 w-5 text-pink-500" />, bgColor: "bg-pink-50 shadow-pink-100" },
  "home-decor": { icon: <Home className="h-5 w-5 text-amber-500" />, bgColor: "bg-amber-50 shadow-amber-100" },
  "food-drinks": { icon: <Utensils className="h-5 w-5 text-red-500" />, bgColor: "bg-red-50 shadow-red-100" },
  "digital-products": { icon: <Box className="h-5 w-5 text-blue-500" />, bgColor: "bg-blue-50 shadow-blue-100" },
  services: { icon: <Briefcase className="h-5 w-5 text-green-500" />, bgColor: "bg-green-50 shadow-green-100" },
} as const;

const categoryList = HOME_CATEGORY_DEFINITIONS.map((category) => ({
  ...category,
  ...categoryVisuals[category.id],
}));

const moreCategory = {
  id: "more",
  name: "More",
  subtitle: "Categories",
  icon: <Grid className="h-5 w-5 text-gray-700" />,
  bgColor: "bg-gray-100 shadow-gray-200",
};

export default function Categories() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stores, setStores] = useState<StoreCategoryRecord[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);

  useEffect(() => {
    return onSnapshot(
      collection(db, "stores"),
      (snapshot) => {
        setStores(snapshot.docs.map((item) => item.data() as StoreCategoryRecord));
        setStoresLoaded(true);
      },
      (error) => {
        console.error("Category store counts could not be loaded:", error);
        setStoresLoaded(true);
      },
    );
  }, []);

  const formatStoreCount = (categoryId: string) => {
    if (!storesLoaded) return "Loading...";
    const count = countHomeCategoryStores(stores, categoryId);
    return `${count.toLocaleString()} ${count === 1 ? "store" : "stores"}`;
  };

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`} id="categories">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 sm:text-xl">
          Shop by Categories
        </h2>
        <Link
          href="/categories"
          className="flex items-center gap-1 text-xs font-semibold text-[#00d95f] hover:text-[#00a63e] transition-colors sm:text-sm"
        >
          View all <span className="text-sm">›</span>
        </Link>
      </div>

      {/* Horizontal Scroll / Grid List */}
      <div
        ref={scrollRef}
        className="flex gap-3.5 overflow-x-auto pb-4 pt-1 no-scrollbar scroll-smooth"
      >
        {[...categoryList, moreCategory].map((cat) => (
          <Link
            key={cat.id}
            href={cat.id === "more" ? "/categories" : `/categories?category=${cat.id}`}
            className="group flex min-w-[125px] flex-1 flex-col items-center justify-center rounded-2xl border border-gray-100/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-gray-200 hover:shadow-md"
          >
            {/* Circular Icon Wrapper with soft shadow */}
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${cat.bgColor} shadow-inner transition-transform group-hover:scale-105`}>
              {cat.icon}
            </div>

            {/* Category Name */}
            <span className="text-xs font-bold text-gray-900 line-clamp-1">
              {cat.name}
            </span>

            {/* Store Count / Subtitle */}
            <span className="mt-1 text-[11px] font-medium text-gray-400">
              {cat.id === "more" ? cat.subtitle : formatStoreCount(cat.id)}
            </span>
          </Link>
        ))}
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
