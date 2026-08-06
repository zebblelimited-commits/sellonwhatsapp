"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/firebase"; // Adjust this path if your firebase config is elsewhere
import { collection, getDocs, query, where } from "firebase/firestore";
import ProductCard from "@/components/sections/ProductCard";
import StoreCard from "@/components/sections/StoreCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getAllSubcategories } from "@/app/dashboard/nigeriaData";

const CATEGORY_OPTIONS = getAllSubcategories();
const PRICE_SLIDER_MAX = 1000000;

// 1. The actual component logic
function SearchResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const categoryParam = searchParams.get("category") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";

  const [searchInput, setSearchInput] = useState(queryParam);
  const [categoryInput, setCategoryInput] = useState(categoryParam);
  const [minPriceInput, setMinPriceInput] = useState(minPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(maxPrice);

  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(queryParam);
    setCategoryInput(categoryParam);
    setMinPriceInput(minPrice);
    setMaxPriceInput(maxPrice);
  }, [queryParam, categoryParam, minPrice, maxPrice]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    if (categoryInput) params.set("category", categoryInput);
    if (minPriceInput) params.set("minPrice", minPriceInput);
    if (maxPriceInput) params.set("maxPrice", maxPriceInput);

    router.push(params.toString() ? `/search?${params.toString()}` : "/search");
  };

  const clearFilters = () => {
    setSearchInput("");
    setCategoryInput("");
    setMinPriceInput("");
    setMaxPriceInput("");
    router.push("/search");
  };

  const minSliderValue = Number(minPriceInput) || 0;
  const maxSliderValue = Number(maxPriceInput) || PRICE_SLIDER_MAX;

  const handleMinSliderChange = (value: string) => {
    const nextValue = Math.min(Number(value), maxSliderValue);
    setMinPriceInput(nextValue > 0 ? String(nextValue) : "");
  };

  const handleMaxSliderChange = (value: string) => {
    const nextValue = Math.max(Number(value), minSliderValue);
    setMaxPriceInput(nextValue < PRICE_SLIDER_MAX ? String(nextValue) : "");
  };

  useEffect(() => {
    async function performGlobalSearch() {
      try {
        setLoading(true);
        setError(null);

        // Search products
        let productQuery: any = collection(db, "products");

        if (queryParam) {
          productQuery = query(
            productQuery,
            where("name", ">=", queryParam),
            where("name", "<=", queryParam + "\uf8ff")
          );
        } else if (categoryParam) {
          productQuery = query(
            productQuery,
            where("category", "==", categoryParam)
          );
        }

        const productSnap = await getDocs(productQuery);
        // Older products do not have a status field. Only hide records explicitly
        // deactivated or banned, so those legacy products remain discoverable.
        let productResults = productSnap.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
          .filter((product: any) => !["inactive", "banned"].includes(product.status));

        // Filter by price if specified
        if (minPrice || maxPrice) {
          productResults = productResults.filter((p: any) => {
            const price = p.price || 0;
            if (minPrice && price < Number(minPrice)) return false;
            if (maxPrice && price > Number(maxPrice)) return false;
            return true;
          });
        }
        setProducts(productResults.slice(0, 50)); // Limit results

        // Store records use both `name` and the older `storeName` field. Fetch
        // the public store list and normalize both shapes before filtering.
        const storeSnap = await getDocs(collection(db, "stores"));
        const storeResults = storeSnap.docs
          .map(doc => {
            const data = doc.data() as any;
            return { id: doc.id, ...data, name: data.name || data.storeName || "" };
          })
          .filter((store: any) => !["inactive", "banned"].includes(store.status))
          .filter((store: any) => {
            if (!queryParam) return true;
            const searchTerm = queryParam.toLowerCase();
            return [store.name, store.username]
              .some(value => value?.toLowerCase().includes(searchTerm));
          });
        setStores(storeResults.slice(0, 20));

      } catch (err: any) {
        console.error("Search error:", err);
        setError(err.message || "Failed to perform search");
      } finally {
        setLoading(false);
      }
    }

    performGlobalSearch();
  }, [queryParam, categoryParam, minPrice, maxPrice]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-1">
        <section className="bg-gradient-to-b from-green-50 to-gray-50 px-4 py-10 sm:px-6">
          <div className="w-full">
            <p className="text-sm font-bold uppercase tracking-widest text-green-600 mb-2">Marketplace</p>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900">
              {queryParam ? `Search Results for "${queryParam}"` : "Browse Products"}
            </h1>
            <p className="text-gray-500 mt-2">Find products and stores from verified WhatsApp sellers.</p>

          </div>
        </section>

        <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-72">
              <form onSubmit={handleSearchSubmit} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2 text-base font-black text-gray-900">
                    <SlidersHorizontal size={18} className="text-green-600" /> Search & Filters
                  </div>
                  {(searchInput || categoryInput || minPriceInput || maxPriceInput) && (
                    <button type="button" onClick={clearFilters} className="text-xs font-bold text-gray-400 hover:text-red-600">Clear all</button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search products or stores..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-green-600 focus:bg-white focus:ring-4 focus:ring-green-500/10"
                  />
                </div>

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">Categories</h2>
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    <button type="button" onClick={() => setCategoryInput("")} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${!categoryInput ? "bg-green-50 font-bold text-green-700" : "text-gray-600 hover:bg-gray-50"}`}>
                      All categories
                    </button>
                    {CATEGORY_OPTIONS.map((category) => (
                      <button type="button" key={category} onClick={() => setCategoryInput(category)} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${categoryInput === category ? "bg-green-50 font-bold text-green-700" : "text-gray-600 hover:bg-gray-50"}`}>
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">Price range</h2>
                    <span className="text-xs font-bold text-green-700">₦{minSliderValue.toLocaleString()} - ₦{maxSliderValue.toLocaleString()}</span>
                  </div>
                  <div className="space-y-2">
                    <input type="range" min="0" max={PRICE_SLIDER_MAX} step="1000" value={minSliderValue} onChange={(event) => handleMinSliderChange(event.target.value)} className="w-full accent-green-600" aria-label="Minimum price slider" />
                    <input type="range" min={minSliderValue} max={PRICE_SLIDER_MAX} step="1000" value={maxSliderValue} onChange={(event) => handleMaxSliderChange(event.target.value)} className="w-full accent-green-600" aria-label="Maximum price slider" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <input type="number" min="0" value={minPriceInput} onChange={(event) => setMinPriceInput(event.target.value)} placeholder="Min price" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs outline-none focus:border-green-600" aria-label="Minimum price" />
                    <input type="number" min="0" value={maxPriceInput} onChange={(event) => setMaxPriceInput(event.target.value)} placeholder="Max price" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs outline-none focus:border-green-600" aria-label="Maximum price" />
                  </div>
                </div>

                <button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-700">
                  <Search size={16} /> Apply filters
                </button>
              </form>
            </aside>

            <section className="min-w-0 flex-1">
          <div className="mb-8">
            {categoryParam && <p className="text-gray-600 mt-2">Category: {categoryParam}</p>}
            <p className="text-gray-500 text-sm mt-2">
              {products.length} products • {stores.length} stores found
            </p>
          </div>

          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {!loading && !error && products.length === 0 && stores.length === 0 && (
            <div className="text-center py-12">
              <h2 className="text-xl font-semibold text-gray-900">No results found</h2>
              <p className="text-gray-600 mt-2">Try adjusting your search terms or filters</p>
            </div>
          )}

          {!loading && stores.length > 0 && (
            <section className="mb-12">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Stores</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {stores.map((store) => <StoreCard key={store.id} store={store} />)}
              </div>
            </section>
          )}

          {!loading && products.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Products</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            </section>
          )}
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// 2. The Default Export wrapped in Suspense (Required by Next.js App Router)
export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    }>
      <SearchResultsContent />
    </Suspense>
  );
}
