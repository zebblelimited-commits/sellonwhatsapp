"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Search, Store as StoreIcon } from "lucide-react";
import { Plus_Jakarta_Sans } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  countCategoryStores,
  countSubcategoryStores,
  STORE_CATEGORIES,
  type StoreCategoryRecord,
} from "@/lib/categoryCatalog";
import { db } from "@/lib/firebase";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

function storeLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "store" : "stores"}`;
}

export default function CategoriesPage() {
  const [stores, setStores] = useState<StoreCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    return onSnapshot(
      collection(db, "stores"),
      (snapshot) => {
        setStores(snapshot.docs.map((item) => item.data() as StoreCategoryRecord));
        setLoading(false);
        setError("");
      },
      (listenerError) => {
        console.error("Categories could not be loaded:", listenerError);
        setError("Categories could not be loaded right now.");
        setLoading(false);
      },
    );
  }, []);

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return STORE_CATEGORIES;

    return STORE_CATEGORIES.map((category) => ({
      ...category,
      subcategories: category.subcategories.filter((subcategory) =>
        `${category.name} ${subcategory}`.toLowerCase().includes(term),
      ),
    })).filter((category) => category.subcategories.length > 0 || category.name.toLowerCase().includes(term));
  }, [search]);

  return (
    <main className={`${jakarta.className} min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900`}>
      <Header />

      <div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-gray-500 transition hover:text-green-600">
              <ArrowLeft size={15} /> Back to home
            </Link>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-green-600">Explore the marketplace</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">All categories</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-500">Find stores and products across every category available on SellOn WhatsApp.</p>
          </div>

          <label className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100">
            <Search size={17} className="shrink-0 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories" className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-gray-400" />
          </label>
        </div>

        {error && <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-[28px] bg-gray-100" />)}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-gray-200 bg-white p-12 text-center">
            <Search className="mx-auto text-gray-300" size={28} />
            <p className="mt-3 text-sm font-bold text-gray-700">No categories match your search.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {filteredCategories.map((category) => {
              const categoryCount = countCategoryStores(stores, category.id);

              return (
                <section key={category.id} id={category.id} className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <h2 className="text-lg font-extrabold text-gray-900">{category.name}</h2>
                      <p className="mt-1 text-xs font-medium text-gray-500">{storeLabel(categoryCount)} across this category</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                      <StoreIcon size={20} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {category.subcategories.map((subcategory) => {
                      const subcategoryCount = countSubcategoryStores(stores, subcategory);
                      return (
                        <Link key={subcategory} href={`/search?category=${encodeURIComponent(subcategory)}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3 transition hover:border-green-200 hover:bg-green-50/60">
                          <span className="min-w-0 truncate text-xs font-bold text-gray-700">{subcategory}</span>
                          <span className="shrink-0 text-[10px] font-bold text-gray-400">{storeLabel(subcategoryCount)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
