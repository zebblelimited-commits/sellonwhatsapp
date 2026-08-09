"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Calendar, CheckCircle2, Package, Search } from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trackMetric } from "@/lib/analytics";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  productType?: string;
  stockCount?: number;
  stock?: number;
  availability?: string;
  status?: string;
  isDeleted?: boolean;
  category?: string;
  storeId?: string;
  vendorId?: string;
  ownerId?: string;
  vendorName?: string;
  username?: string;
  popularityScore?: number;
  salesCount?: number;
  orderCount?: number;
  views?: number;
  clicks?: number;
  createdAt?: unknown;
};

type PopularProps = {
  fullPage?: boolean;
};

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function productIsVisible(product: Product) {
  return !["inactive", "banned", "deleted"].includes(String(product.status || "").toLowerCase()) && product.isDeleted !== true;
}

function productAction(product: Product) {
  const isBooking = product.productType === "booking";
  const isService = product.productType === "service" || product.productType === "utility";
  return {
    isBooking,
    isService,
    label: isBooking ? "Book Now" : isService ? "Hire Service" : "Buy Now",
  };
}

function productIsUnavailable(product: Product) {
  const stock = Number(product.stockCount ?? product.stock ?? 0);
  return stock <= 0 || product.availability === "out_of_stock";
}

function productImage(product: Product) {
  return product.images?.[0] || product.imageUrl || product.image || "/images/placeholder-cover.svg";
}

export default function Popular({ fullPage = false }: PopularProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError("");

      try {
        const productSnapshot = await getDocs(query(collection(db, "products"), limit(60)));
        const rawProducts = productSnapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() as Omit<Product, "id">) }))
          .filter(productIsVisible);

        const storeIds = [...new Set(rawProducts.map((product) => product.storeId || product.vendorId || product.ownerId).filter(Boolean))] as string[];
        const storeEntries = await Promise.all(storeIds.map(async (storeId) => {
          const storeSnapshot = await getDoc(doc(db, "stores", storeId));
          return [storeId, storeSnapshot.exists() ? storeSnapshot.data() : null] as const;
        }));
        const stores = new Map(storeEntries);

        const enrichedProducts = rawProducts
          .map((product) => {
            const storeId = product.storeId || product.vendorId || product.ownerId;
            const store = storeId ? stores.get(storeId) : null;
            return {
              ...product,
              storeId,
              vendorName: product.vendorName || store?.storeName || store?.name || "Marketplace seller",
              username: product.username || store?.username || "",
              popularityScore: Number(product.popularityScore ?? product.salesCount ?? product.orderCount ?? product.views ?? product.clicks ?? 0),
            };
          })
          .sort((left, right) => right.popularityScore! - left.popularityScore! || timestampValue(right.createdAt) - timestampValue(left.createdAt));

        if (!cancelled) setProducts(enrichedProducts.slice(0, fullPage ? 60 : 5));
      } catch (loadError) {
        console.error("Popular products could not be loaded:", loadError);
        if (!cancelled) setError("Products could not be loaded right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProducts();
    return () => { cancelled = true; };
  }, [fullPage]);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          {fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Popular Products</h2>
          {fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Discover products and services from marketplace sellers.</p>}
        </div>
        {!fullPage && <Link href="/products" className="flex items-center gap-1 text-xs font-semibold text-[#00d95f] transition-colors hover:text-[#00a63e] sm:text-sm">View all <span className="text-sm">›</span></Link>}
      </div>

      {error ? (
        <div className="rounded-2xl bg-red-50 p-6 text-center text-sm font-medium text-red-700">{error}</div>
      ) : loading ? (
        <div className={fullPage ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" : "flex gap-4 overflow-hidden"}>
          {[1, 2, 3, 4, 5].map((item) => <div key={item} className={`${fullPage ? "min-h-72" : "min-w-[220px]"} animate-pulse rounded-2xl bg-gray-100`} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Search className="mx-auto text-gray-300" size={28} />
          <p className="mt-3 text-sm font-bold text-gray-700">No products are available yet.</p>
        </div>
      ) : (
        <div className={fullPage ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" : "flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth md:grid md:grid-cols-6 md:overflow-visible"}>
          {products.map((product) => {
            const action = productAction(product);
            const unavailable = productIsUnavailable(product);
            const productPath = product.username ? `/${product.username}/${product.id}` : `/products/${product.id}`;
            const stock = Number(product.stockCount ?? product.stock ?? 0);

            return (
              <article key={product.id} className={`${fullPage ? "min-w-0" : "min-w-[220px] flex-1 md:min-w-0"} group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}>
                <Link href={productPath} onClick={() => product.storeId && void trackMetric(product.storeId, "click", { productId: product.id })} className="relative aspect-[4/3] w-full overflow-hidden bg-[#f6f5f3]">
                  <Image src={productImage(product)} alt={product.name || "Product"} fill sizes={fullPage ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" : "(max-width: 768px) 220px, 20vw"} className="object-cover object-center transition-transform duration-300 group-hover:scale-105" />
                </Link>

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <h3 className="line-clamp-1 text-sm font-bold text-gray-900 transition-colors group-hover:text-[#00a63e]">{product.name}</h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-gray-400">{product.vendorName}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-extrabold text-gray-900">₦{Number(product.price || 0).toLocaleString()}</span>
                      <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight ${unavailable ? "bg-red-50 text-red-500" : action.isBooking ? "bg-purple-50 text-purple-600" : action.isService ? "bg-emerald-50 text-emerald-600" : "text-gray-500"}`}>
                        {action.isBooking ? <Calendar size={10} /> : action.isService ? <CheckCircle2 size={10} /> : <Package size={10} />}
                        {unavailable ? "Unavailable" : action.isBooking ? `${stock} Slots` : action.isService ? "Available" : `${stock} left`}
                      </span>
                    </div>
                  </div>

                  <Link href={productPath} onClick={() => !unavailable && product.storeId && void trackMetric(product.storeId, "buy_now_click", { productId: product.id })} className={`mt-4 flex min-h-10 w-full items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold transition-all active:scale-95 ${unavailable ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400" : "bg-black text-white hover:bg-gray-800"}`} aria-disabled={unavailable}>
                    {unavailable ? "Unavailable" : action.label}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx global>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </section>
  );
}
