"use client";

import Image from "next/image";
import Link from "next/link";
import { Calendar, CheckCircle2, Package } from "lucide-react";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext";

type ProductCardProps = {
  product: any;
  compact?: boolean;
};

export default function ProductCard({ product, compact = false }: ProductCardProps) {
  const { addToCart } = useCart();
  
  const storeId = product.storeId || product.vendorId || product.ownerId;
  const productId = product.id;
  const productPath = product.username ? `/${product.username}/${productId}` : `/products/${productId}`;
  
  const isBooking = product.productType === "booking";
  const isService = product.productType === "service" || product.productType === "utility";
  const stock = Number(product.stockCount ?? product.stock ?? 0);
  
  const isOutOfStock = stock <= 0 || product.availability === "out_of_stock";
  
  const image = product.images?.[0] || product.imageUrl || product.image || "/images/placeholder-cover.svg";
  const actionLabel = isBooking ? "Book Now" : isService ? "Hire Service" : "Buy Now";

  return (
    <article className={`group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${compact ? "h-full" : ""}`}>
      <Link 
        href={productPath} 
        onClick={() => storeId && void trackMetric(storeId, "click", { productId })} 
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#f6f5f3]"
      >
        <Image 
          src={image} 
          alt={product.name || "Product"} 
          fill 
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" 
          className="object-cover object-center transition-transform duration-300 group-hover:scale-105" 
        />
      </Link>

      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <h3 className="line-clamp-1 text-sm font-bold text-gray-900 transition-colors group-hover:text-[#00a63e]">
            {product.name}
          </h3>
          <p className="mt-0.5 truncate text-xs font-medium text-gray-400">
            {product.vendorName || "Marketplace seller"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-base font-extrabold text-gray-900">
              ₦{Number(product.price || 0).toLocaleString()}
            </span>
            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight ${
              isOutOfStock ? "bg-red-50 text-red-500" : 
              isBooking ? "bg-purple-50 text-purple-600" : 
              isService ? "bg-emerald-50 text-emerald-600" : "text-gray-500"
            }`}>
              {isBooking ? <Calendar size={10} /> : isService ? <CheckCircle2 size={10} /> : <Package size={10} />}
              {isOutOfStock ? "Unavailable" : isBooking ? `${stock} Slots` : isService ? "Available" : `${stock} left`}
            </span>
          </div>
        </div>

        {/* Vertically stacked on mobile (<640px), side-by-side on desktop */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={(e) => {
              e.preventDefault();
              if (!isOutOfStock && storeId) {
                trackAddToCartClick(storeId, productId);
                
                addToCart({
                  id: `${storeId}-${productId}`,
                  productId,
                  name: product.name,
                  price: Number(product.price || 0),
                  image: image,
                  storeId,
                  storeName: product.vendorName || "Marketplace seller",
                  username: product.username,
                });
              }
            }}
            className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${
              isOutOfStock
                ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                : "border border-gray-200 bg-white text-gray-900 hover:border-[#00a63e] hover:bg-gray-50 hover:text-[#00a63e]"
            }`}
          >
            Add to Cart
          </button>

          <Link 
            href={productPath} 
            onClick={() => !isOutOfStock && storeId && void trackMetric(storeId, "buy_now_click", { productId })} 
            className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${
              isOutOfStock 
                ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400" 
                : "bg-black text-white hover:bg-[#00a63e]"
            }`}
          >
            {isOutOfStock ? "Unavailable" : actionLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}