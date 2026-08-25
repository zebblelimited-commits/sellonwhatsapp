"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { Calendar, CheckCircle2, Package, Search } from "lucide-react";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext"; // ✅ Import useCart

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type SponsoredProduct = {
  id: string;
  name: string;
  price: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  productType?: string;
  stockCount?: number;
  stock?: number;
  availability?: string;
  status?: string;
  isDeleted?: boolean;
  storeId?: string;
  vendorId?: string;
  ownerId?: string;
  vendorName?: string;
  username?: string;
  sponsoredAt?: unknown;
};

type SponsoredProductsProps = {
  fullPage?: boolean;
};

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function productIsVisible(product: SponsoredProduct) {
  return product.isDeleted !== true && !["inactive", "banned", "deleted"].includes(String(product.status || "").toLowerCase());
}

function productImage(product: SponsoredProduct) {
  return product.images?.[0] || product.imageUrl || product.image || "/images/placeholder-cover.svg";
}

function productAction(product: SponsoredProduct) {
  const isBooking = product.productType === "booking";
  const isService = product.productType === "service" || product.productType === "utility";
  return {
    label: isBooking ? "Book Now" : isService ? "Hire Service" : "Buy Now",
    icon: isBooking ? <Calendar size={11} /> : isService ? <CheckCircle2 size={11} /> : <Package size={11} />,
    isBooking,
    isService,
  };
}

function productIsUnavailable(product: SponsoredProduct) {
  const isService = product.productType === "service" || product.productType === "utility";
  const isBooking = product.productType === "booking";
  if (isService) return false;
  if (isBooking) return Number(product.stockCount ?? product.stock ?? 0) <= 0;
  return Number(product.stockCount ?? product.stock ?? 0) <= 0 || product.availability === "out_of_stock";
}

function SponsoredCard({ product }: { product: SponsoredProduct }) {
  const { addToCart } = useCart(); // ✅ Initialize cart context
  
  const action = productAction(product);
  const unavailable = productIsUnavailable(product);
  const storeId = product.storeId || product.vendorId || product.ownerId;
  const productPath = product.username ? `/${product.username}/${product.id}` : `/products/${product.id}`;
  const stock = Number(product.stockCount ?? product.stock ?? 0);

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
      <Link href={productPath} onClick={() => storeId && void trackMetric(storeId, "click", { productId: product.id })} className="relative aspect-[4/3] w-full overflow-hidden bg-[#f6f5f3]">
        <span className="absolute left-2 top-2 z-10 rounded-md bg-black/55 px-2 py-1 text-[9px] font-bold text-white backdrop-blur-md">Sponsored</span>
        <Image src={productImage(product)} alt={product.name || "Sponsored product"} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw" className="object-cover object-center transition-transform duration-300 group-hover:scale-105" />
      </Link>

      <div className="flex flex-1 flex-col justify-between p-3">
        <div>
          <h3 className="line-clamp-1 text-xs font-bold text-gray-900 transition-colors group-hover:text-[#00a63e] sm:text-sm">{product.name || "Untitled product"}</h3>
          <p className="mt-0.5 truncate text-[10px] font-medium text-gray-400">{product.vendorName || "Marketplace seller"}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-gray-900 sm:text-base">₦{Number(product.price || 0).toLocaleString()}</span>
            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight ${unavailable ? "bg-red-50 text-red-500" : action.isBooking ? "bg-purple-50 text-purple-600" : action.isService ? "bg-emerald-50 text-emerald-600" : "text-gray-500"}`}>
              {action.icon}
              {unavailable ? "Unavailable" : action.isBooking ? `${stock} slots` : action.isService ? "Available" : `${stock} left`}
            </span>
          </div>
        </div>

        {/* ✅ UPDATED: Dual Button Layout with Real Cart Integration */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={unavailable}
            onClick={(e) => {
              e.preventDefault();
              if (!unavailable && storeId) {
                // 1. Track the analytics event
                trackAddToCartClick(storeId, product.id);
                
                // 2. Add to cart using context (auto-opens the off-canvas drawer)
                addToCart({
                  id: `${storeId}-${product.id}`,
                  productId: product.id,
                  name: product.name || "Product",
                  price: Number(product.price || 0),
                  image: productImage(product),
                  storeId: storeId,
                  storeName: product.vendorName || "Marketplace seller",
                  username: product.username,
                });
              }
            }}
            className={`flex flex-1 items-center justify-center rounded-xl px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${
              unavailable
                ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                : "border border-gray-200 bg-white text-gray-900 hover:border-[#00d95f] hover:bg-gray-50 hover:text-[#00d95f]"
            }`}
          >
            Add to Cart
          </button>

          <Link 
            href={productPath} 
            onClick={() => !unavailable && storeId && void trackMetric(storeId, "buy_now_click", { productId: product.id })} 
            className={`flex flex-1 items-center justify-center rounded-xl px-2 py-2 text-[10px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${
              unavailable 
                ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400" 
                : "bg-black text-white hover:bg-[#00d95f]"
            }`}
            aria-disabled={unavailable}
          >
            {unavailable ? "Unavailable" : action.label}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function SponsoredProducts({ fullPage = false }: SponsoredProductsProps) {
  const [products, setProducts] = useState<SponsoredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const sponsoredQuery = query(collection(db, "products"), where("isSponsored", "==", true), limit(fullPage ? 60 : 6));

    return onSnapshot(
      sponsoredQuery,
      (snapshot) => {
        const rawProducts = snapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() as Omit<SponsoredProduct, "id">) }))
          .filter(productIsVisible)
          .sort((left, right) => timestampValue(right.sponsoredAt) - timestampValue(left.sponsoredAt));

        const storeIds = [...new Set(rawProducts.map((product) => product.storeId || product.vendorId || product.ownerId).filter(Boolean))] as string[];
        void Promise.all(storeIds.map(async (storeId) => {
          const storeSnapshot = await getDoc(doc(db, "stores", storeId));
          return [storeId, storeSnapshot.exists() ? storeSnapshot.data() : null] as const;
        })).then((storeEntries) => {
          if (cancelled) return;
          const stores = new Map(storeEntries);
          setProducts(rawProducts.map((product) => {
            const storeId = product.storeId || product.vendorId || product.ownerId;
            const store = storeId ? stores.get(storeId) : null;
            return {
              ...product,
              storeId,
              vendorName: product.vendorName || store?.storeName || store?.name || "Marketplace seller",
              username: product.username || store?.username || "",
            };
          }));
          setLoading(false);
          setError("");
        }).catch((loadError) => {
          console.error("Sponsored product store details could not be loaded:", loadError);
          if (!cancelled) {
            setProducts(rawProducts);
            setLoading(false);
          }
        });
      },
      (listenerError) => {
        console.error("Sponsored products listener error:", listenerError);
        if (!cancelled) {
          setProducts([]);
          setLoading(false);
          setError("Sponsored products could not be loaded right now.");
        }
      },
    );
  }, [fullPage]);

  return (
    <section className={`${font.className} mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {fullPage && <Link href="/" className="mb-2 inline-flex text-xs font-bold text-gray-500 hover:text-green-600">← Back to home</Link>}
          <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Sponsored Products</h2>
          {fullPage && <p className="mt-1 text-sm font-medium text-gray-500">Explore products selected by the marketplace team.</p>}
        </div>
        {!fullPage && <Link href="/sponsored-products" className="shrink-0 text-xs font-semibold text-[#00a63e] transition-colors hover:text-green-700 sm:text-sm">View all <span className="text-sm">›</span></Link>}
      </div>

      {error ? (
        <div className="rounded-2xl bg-red-50 p-6 text-center text-sm font-medium text-red-700">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="min-h-64 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
          <Search className="mx-auto text-gray-300" size={28} />
          <p className="mt-3 text-sm font-bold text-gray-700">No sponsored products have been published yet.</p>
          <p className="mt-1 text-xs font-medium text-gray-500">Admins can activate products from the Products tab.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.map((product) => <SponsoredCard key={product.id} product={product} />)}
        </div>
      )}
    </section>
  );
}