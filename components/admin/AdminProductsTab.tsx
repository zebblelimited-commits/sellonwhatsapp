"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Package, Search, Sparkles } from "lucide-react";
import { auth } from "@/lib/firebase";
import { adminMutation } from "@/components/admin/adminApi";

type AdminProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  imageUrl: string;
  productType: string;
  mainCategory: string;
  subCategory: string;
  category: string;
  storeId: string;
  vendorName: string;
  username: string;
  stockCount: number;
  status: string;
  isDeleted: boolean;
  isSponsored: boolean;
};

function productImage(product: AdminProduct) {
  return product.images[0] || product.imageUrl || "/images/placeholder-cover.svg";
}

export default function AdminProductsTab() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error("Your admin session has expired.");
          const response = await fetch(`/api/admin/products?search=${encodeURIComponent(search)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Products could not be loaded");
          setProducts(payload.products || []);
        } catch (loadError) {
          if (loadError instanceof DOMException && loadError.name === "AbortError" && !timedOut) return;
          console.error("Admin products tab load error:", loadError);
          if (!disposed) setError(timedOut ? "Products took too long to load. Please try again." : loadError instanceof Error ? loadError.message : "Products could not be loaded");
        } finally {
          window.clearTimeout(timeout);
          if (!disposed) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timeout);
      disposed = true;
      controller.abort();
    };
  }, [search]);

  async function toggleSponsored(product: AdminProduct) {
    setUpdatingId(product.id);
    setError("");
    try {
      await adminMutation("/api/admin/products", { id: product.id, isSponsored: !product.isSponsored });
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, isSponsored: !item.isSponsored } : item));
    } catch (updateError) {
      console.error("Product sponsorship update error:", updateError);
      setError(updateError instanceof Error ? updateError.message : "Product sponsorship could not be updated");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden animate-in fade-in duration-300">
      <div className="flex min-w-0 flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Products</h2>
          <p className="mt-1 text-sm text-gray-500">Search marketplace products and choose which ones appear in Sponsored Products.</p>
        </div>
        <div className="max-w-full rounded-2xl bg-green-50 px-4 py-3 text-xs font-bold text-green-700">{products.filter((product) => product.isSponsored).length} sponsored in results</div>
      </div>

      <div className="relative w-full max-w-2xl min-w-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product, seller, category, or product ID" className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100" />
      </div>

      {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center rounded-3xl bg-white p-12 shadow-sm"><Loader2 className="animate-spin text-green-600" size={28} /></div>
      ) : products.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-12 text-center"><Package className="mx-auto text-gray-300" size={32} /><p className="mt-3 text-sm font-bold text-gray-700">No products matched your search.</p></div>
      ) : (
        <div className="grid w-full min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className={`flex min-w-0 max-w-full gap-3 overflow-hidden rounded-3xl border bg-white p-3 shadow-sm transition sm:gap-4 sm:p-4 ${product.isSponsored ? "border-green-200 ring-1 ring-green-100" : "border-gray-100"}`}>
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100 sm:h-24 sm:w-24"><Image src={productImage(product)} alt={product.name} fill sizes="(max-width: 640px) 80px, 96px" className="object-cover" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-gray-900">{product.name}</h3><p className="mt-1 truncate text-xs text-gray-500">{product.vendorName}</p></div>{product.isSponsored && <Sparkles className="shrink-0 text-green-600" size={16} aria-label="Sponsored" />}</div>
                <p className="mt-2 text-sm font-black text-gray-900">₦{Number(product.price || 0).toLocaleString()}</p>
                <div className="mt-3 flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-400">{product.productType}</span><button type="button" disabled={updatingId === product.id} onClick={() => void toggleSponsored(product)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${product.isSponsored ? "bg-green-600" : "bg-gray-300"} disabled:cursor-wait disabled:opacity-60`} role="switch" aria-checked={product.isSponsored} aria-label={`${product.isSponsored ? "Remove" : "Add"} ${product.name} ${product.isSponsored ? "from" : "to"} sponsored products`}>{updatingId === product.id ? <Loader2 className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 animate-spin text-white" /> : <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${product.isSponsored ? "translate-x-6" : "translate-x-1"}`} />}</button></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
