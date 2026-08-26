"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import {
  Calendar, CheckCircle2, Package, Search, X, Loader2, CreditCard, ShieldCheck, Info
} from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext";

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
  nombaAccountId?: string;
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
  const isBooking = product.productType === "booking";
  const isService = product.productType === "service" || product.productType === "utility";
  const stock = Number(product.stockCount ?? product.stock ?? 0);

  if (isService) {
    return product.availability === "out_of_stock";
  }
  return stock <= 0 || product.availability === "out_of_stock";
}

function productImage(product: Product) {
  return product.images?.[0] || product.imageUrl || product.image || "/images/placeholder-cover.svg";
}

export default function Popular({ fullPage = false }: PopularProps) {
  const { addToCart } = useCart();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Direct Checkout Modal State for Non-Shipping Items
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
              nombaAccountId: store?.nombaAccountId || "",
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

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCustomerEmail(user.email);
        if (user.displayName) setCustomerName(user.displayName);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fullPage]);

  // Handler for Direct Buy Action
  const handleBuyNow = (product: Product) => {
    if (!product.storeId) return;

    void trackMetric(product.storeId, "buy_now_click", { productId: product.id });

    const isBooking = product.productType === "booking";
    const isService = product.productType === "service" || product.productType === "utility";
    const requiresShipping = !isBooking && !isService;

    const productPrice = Number(product.price || 0);

    if (requiresShipping) {
      // Physical Item -> Redirect directly to Checkout page
      const orderDetails = {
        productId: product.id,
        productName: product.name,
        price: productPrice,
        quantity: 1,
        storeId: product.storeId,
        storeName: product.vendorName,
        storeUsername: product.username,
        vendorNombaAccountId: product.nombaAccountId,
        image: productImage(product),
      };
      sessionStorage.setItem("checkout_order", JSON.stringify(orderDetails));
      router.push("/checkout");
    } else {
      // Digital/Service/Booking -> Open Modal directly
      setSelectedProduct(product);
      setModalError(null);
      setCheckoutModalOpen(true);
    }
  };

  // Handler for Modal Payment Submissions
  const handleModalPayment = async () => {
    if (!selectedProduct || !selectedProduct.storeId) return;

    if (!customerEmail.trim()) {
      setModalError("Please provide a valid contact email address.");
      return;
    }

    const buyer = auth.currentUser;
    if (!buyer) {
      setModalError("Please log in to complete this purchase.");
      return;
    }

    setIsModalLoading(true);
    setModalError(null);

    const price = Number(selectedProduct.price || 0);
    const subtotal = price * 1;
    const platformFee = Math.round(subtotal * 0.015);
    const grandTotal = subtotal + platformFee;

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId: buyer.uid,
          customerEmail: customerEmail.trim(),
          paymentMethod: "Card",
          total: grandTotal,
          address: {
            fullName: customerName.trim() || buyer.displayName || "Customer",
            email: customerEmail.trim(),
            phone: customerPhone.trim() || "N/A",
            street: selectedProduct.productType === "booking" ? "Direct Booking" : "Digital Delivery / Service",
            city: "N/A",
            state: selectedProduct.productType === "booking" ? "Booking" : "Digital Service",
            country: "NG",
          },
          sellerOrders: [
            {
              storeId: selectedProduct.storeId,
              storeName: selectedProduct.vendorName || "Store",
              shippingMethod: "self_arranged",
              shippingCost: 0,
              subtotal: subtotal,
              items: [
                {
                  productId: selectedProduct.id,
                  name: selectedProduct.name || "Service Item",
                  price: price,
                  quantity: 1,
                  image: productImage(selectedProduct),
                  bookingDate: null,
                  bookingSlot: null,
                },
              ],
            },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate payment");
      }

      if (data.checkoutLink) {
        window.location.href = data.checkoutLink;
      } else {
        throw new Error("Payment gateway checkout link not returned.");
      }
    } catch (err: any) {
      setModalError(err.message || "An error occurred while initiating payment.");
      setIsModalLoading(false);
    }
  };

  const selectedPrice = Number(selectedProduct?.price || 0);
  const modalSubtotal = selectedPrice * 1;
  const modalPlatformFee = Math.round(modalSubtotal * 0.015);
  const modalGrandTotal = modalSubtotal + modalPlatformFee;

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

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!unavailable && product.storeId) {
                          trackAddToCartClick(product.storeId, product.id);
                          addToCart({
                            id: `${product.storeId}-${product.id}`,
                            productId: product.id,
                            name: product.name,
                            price: Number(product.price || 0),
                            image: productImage(product),
                            storeId: product.storeId,
                            storeName: product.vendorName || "Marketplace seller",
                            username: product.username,
                          });
                        }
                      }}
                      className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${unavailable
                          ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                          : "border border-gray-200 bg-white text-gray-900 hover:border-[#00d95f] hover:bg-gray-50 hover:text-[#00d95f]"
                        }`}
                    >
                      Add to Cart
                    </button>

                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!unavailable) handleBuyNow(product);
                      }}
                      className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${unavailable
                          ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                          : "bg-black text-white hover:bg-[#00d95f]"
                        }`}
                    >
                      {unavailable ? "Unavailable" : action.label}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* DIRECT CHECKOUT MODAL FOR SERVICES/BOOKINGS/DIGITAL */}
      {checkoutModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isModalLoading && setCheckoutModalOpen(false)} />

          <div className="relative bg-white rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl border border-gray-100 overflow-y-auto max-h-[90vh]">
            <button type="button" onClick={() => setCheckoutModalOpen(false)} disabled={isModalLoading} className="absolute top-4 right-4 z-10 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors active:scale-90">
              <X size={18} />
            </button>

            <div className="mb-6 border-b border-gray-100 pb-4">
              <p className="text-[10px] font-black uppercase text-[#00a63e] tracking-widest mb-1">Direct Checkout</p>
              <h2 className="text-xl font-extrabold text-gray-900">{selectedProduct.productType === "booking" ? "Complete Booking" : "Complete Purchase"}</h2>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold flex items-start gap-2">
                <span className="mt-0.5">⚠️</span> {modalError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">Full Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={isModalLoading} className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all" placeholder="John Doe" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">Email Address <span className="text-red-500">*</span></label>
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} disabled={isModalLoading} className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all" placeholder="name@example.com" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">Phone Number</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={isModalLoading} className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all" placeholder="08012345678" />
              </div>

              {/* Order Breakdown Summary */}
              <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span className="truncate pr-2">{selectedProduct.name} (x1)</span>
                  <span className="font-bold text-gray-900">₦{modalSubtotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span className="flex items-center gap-1">
                    Platform Fee (1.5%)
                    <span className="group relative cursor-pointer text-gray-400 hover:text-gray-600">
                      <Info size={12} />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-36 p-1.5 bg-black text-white text-[9px] rounded text-center z-20">
                        Standard 1.5% checkout processing fee
                      </span>
                    </span>
                  </span>
                  <span className="font-bold text-gray-900">₦{modalPlatformFee.toLocaleString()}</span>
                </div>

                <div className="border-t border-gray-200/60 pt-2 flex justify-between items-center text-sm font-extrabold text-gray-900">
                  <span>Total Amount</span>
                  <span className="text-base text-[#00a63e] font-black">₦{modalGrandTotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleModalPayment}
                disabled={isModalLoading}
                className="w-full py-4 rounded-xl bg-black hover:bg-gray-900 text-white font-extrabold text-xs uppercase tracking-wider disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
              >
                {isModalLoading ? (
                  <><Loader2 className="animate-spin" size={16} /> Processing...</>
                ) : (
                  <><CreditCard size={16} /> Pay ₦{modalGrandTotal.toLocaleString()} Now</>
                )}
              </button>

              <p className="text-[10px] text-center text-gray-400 font-semibold flex items-center justify-center gap-1">
                <ShieldCheck size={10} /> Secured by Nomba Escrow Payment Gateway
              </p>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </section>
  );
}