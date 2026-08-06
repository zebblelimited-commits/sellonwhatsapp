"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase"; // Adjust this path if your firebase config is elsewhere
import { collection, getDocs, query, where } from "firebase/firestore";
import ProductCard from "@/components/sections/ProductCard";
import StoreCard from "@/components/sections/StoreCard";

// 1. The actual component logic
function SearchResultsContent() {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const categoryParam = searchParams.get("category") || "";
  const minPrice = searchParams.get("minPrice") || "";
  const maxPrice = searchParams.get("maxPrice") || "";

  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function performGlobalSearch() {
      if (!queryParam && !categoryParam) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Search products
        let productQuery: any = collection(db, "products");

        if (queryParam) {
          productQuery = query(
            productQuery,
            where("name", ">=", queryParam),
            where("name", "<=", queryParam + "\uf8ff"),
            where("status", "==", "active")
          );
        } else if (categoryParam) {
          productQuery = query(
            productQuery,
            where("category", "==", categoryParam),
            where("status", "==", "active")
          );
        }

        const productSnap = await getDocs(productQuery);
        // Cast doc.data() as any to prevent "Spread types may only be created from object types" TS error
        let productResults = productSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

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

        // Search stores
        let storeQuery: any = collection(db, "stores");

        if (queryParam) {
          storeQuery = query(
            storeQuery,
            where("name", ">=", queryParam), // ✅ CHANGED from "storeName" to "name" to match your StoreCard
            where("name", "<=", queryParam + "\uf8ff")
          );
        }

        const storeSnap = await getDocs(storeQuery);
        const storeResults = storeSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {queryParam ? `Search Results for "${queryParam}"` : "Browse Products"}
          </h1>
          {categoryParam && (
            <p className="text-gray-600 mt-2">Category: {categoryParam}</p>
          )}
          <p className="text-gray-500 text-sm mt-2">
            {products.length} products • {stores.length} stores found
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* No Results */}
        {!loading && !error && products.length === 0 && stores.length === 0 && (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900">No results found</h2>
            <p className="text-gray-600 mt-2">
              Try adjusting your search terms or filters
            </p>
          </div>
        )}

        {/* Stores Section */}
        {!loading && stores.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Stores</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {stores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        )}

        {/* Products Section */}
        {!loading && products.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>
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