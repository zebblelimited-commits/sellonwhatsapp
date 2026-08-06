"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import ProductCard from "@/components/sections/ProductCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getAllSubcategories } from "@/app/dashboard/nigeriaData";
import Image from "next/image";

const CATEGORY_OPTIONS = getAllSubcategories();
const PRICE_SLIDER_MAX = 1000000;

// --- MINI STORE CARD COMPONENT (Matching NewStores design) ---
const MiniStoreCard = ({ store }: { store: any }) => {
  const filterBlue = "invert(42%) sepia(93%) saturate(1352%) hue-rotate(190deg) brightness(103%) contrast(105%)";

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden p-3 hover:shadow-md transition-all group cursor-pointer">
      {/* Banner */}
      <div className="relative h-24 w-full rounded-xl overflow-hidden">
        <Image
          src={store.bannerUrl || store.coverImage || "/images/placeholder-cover.jpg"}
          alt={store.storeName || store.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>

      {/* Header with Overlapping Logo */}
      <div className="flex items-start gap-3 px-1 -mt-5 relative z-10">
        <div className="p-0.5 bg-white rounded-full shadow-sm">
          <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-50 bg-gray-100">
            <Image
              src={store.logoUrl || store.logo || "/images/placeholder-logo.png"}
              className="w-full h-full object-cover"
              alt="logo"
              width={48}
              height={48}
            />
          </div>
        </div>

        <div className="pt-6 flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="font-bold text-sm text-gray-900 leading-tight truncate">
              {store.storeName || store.name}
            </h3>
            {(store.isVerified || store.verified) && (
              <Image src="/icons/badge.svg" width={12} height={12} alt="verified" style={{ filter: filterBlue }} />
            )}
          </div>
          <p className="text-[10px] text-gray-400 font-medium truncate">@{store.username}</p>
        </div>
      </div>

      {/* Price & Action */}
      <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
        <div>
          <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Starts from</p>
          <span className="text-sm font-bold text-gray-900">{store.price || store.startingPrice || "₦0"}</span>
        </div>
        <button className="text-[11px] font-bold text-[#00a63e] bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
          View Store
        </button>
      </div>
    </div>
  );
};

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
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
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

        const [productSnap, recommendedSnap] = await Promise.all([
          getDocs(productQuery),
          getDocs(query(collection(db, "products"), limit(6)))
        ]);
        let productResults = productSnap.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
          .filter((product: any) => !["inactive", "banned"].includes(product.status));

        const recommendedResults = recommendedSnap.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
          .filter((product: any) => !["inactive", "banned"].includes(product.status))
          .slice(0, 6);
        setRecommendedProducts(recommendedResults);

        if (minPrice || maxPrice) {
          productResults = productResults.filter((p: any) => {
            const price = p.price || 0;
            if (minPrice && price < Number(minPrice)) return false;
            if (maxPrice && price > Number(maxPrice)) return false;
            return true;
          });
        }
        setProducts(productResults.slice(0, 50));

        // Fetch stores
        const storeSnap = await getDocs(collection(db, "stores"));
        const storeResults = storeSnap.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
          .filter((store: any) => !["inactive", "banned"].includes(store.status))
          .filter((store: any) => {
            if (!queryParam) return true;
            const searchTerm = queryParam.toLowerCase();
            return [store.storeName, store.name, store.username]
              .some(value => value?.toLowerCase().includes(searchTerm));
          });
        setStores(storeResults.slice(0, 20));

      } catch (err: any) {
        console.error("Search error:", err);
        setError(err.message || "Failed to perform search");
      } finally {
        setLoading(false);
        setRecommendedLoading(false);
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
                    <input type="range" min="0" max={PRICE_SLIDER_MAX} step="1000" value={minSliderValue} onChange={(event) => handleMinSliderChange(event.target.value)} className="price-range-slider w-full" aria-label="Minimum price slider" />
                    <input type="range" min={minSliderValue} max={PRICE_SLIDER_MAX} step="1000" value={maxSliderValue} onChange={(event) => handleMaxSliderChange(event.target.value)} className="price-range-slider w-full" aria-label="Maximum price slider" />
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
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {stores.map((store) => (
                      <Link key={store.id} href={`/${store.username || store.id}`} className="block">
                        <MiniStoreCard store={store} />
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {!loading && products.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Products</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                    {products.map((product) => <ProductCard key={product.id} product={product} compact />)}
                  </div>
                </section>
              )}
            </section>

            <aside className="h-fit w-full shrink-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:w-72">
              <div className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-600">You may also like</p>
                <h2 className="mt-1 text-lg font-black text-gray-900">Recommended Products</h2>
              </div>
              <div className="space-y-3">
                {recommendedLoading ? (
                  [1, 2, 3, 4, 5].map((item) => <RecommendedProductSkeleton key={item} />)
                ) : recommendedProducts.length > 0 ? (
                  recommendedProducts.map((product) => <RecommendedProduct key={product.id} product={product} />)
                ) : (
                  <p className="py-6 text-center text-sm text-gray-400">No recommendations yet.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function RecommendedProduct({ product }: { product: any }) {
  const image = product.images?.[0] || product.imageUrl || product.image;

  return (
    <Link href={`/products/${product.id}`} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3 transition hover:border-green-200 hover:bg-green-50/50">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {image ? (
          <Image src={image} alt={product.name || "Product"} fill className="object-cover" sizes="56px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-gray-400">No image</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-gray-900">{product.name || "Unnamed product"}</p>
        <p className="mt-1 text-sm font-bold text-green-600">₦{Number(product.price || 0).toLocaleString()}</p>
        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">{product.category || "Product"}</p>
      </div>
    </Link>
  );
}

function RecommendedProductSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3 animate-pulse">
      <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-gray-100" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
        <div className="h-2 w-2/3 rounded bg-gray-100" />
      </div>
    </div>
  );
}

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
