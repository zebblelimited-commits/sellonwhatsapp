"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Package, X, Loader2, CreditCard, ShieldCheck, Info } from "lucide-react";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

type ProductCardProps = {
  product: any;
  compact?: boolean;
};

export default function ProductCard({ product, compact = false }: ProductCardProps) {
  const { addToCart } = useCart();
  const router = useRouter();

  const storeId = product.storeId || product.vendorId || product.ownerId;
  const productId = product.id;
  const productPath = product.username ? `/${product.username}/${productId}` : `/products/${productId}`;

  const isBooking = product.productType === "booking";
  const isService = product.productType === "service" || product.productType === "utility";
  const requiresShipping = !isBooking && !isService;

  const stock = Number(product.stockCount ?? product.stock ?? 0);
  const isOutOfStock = isService ? product.availability === "out_of_stock" : stock <= 0 || product.availability === "out_of_stock";

  const image = product.images?.[0] || product.imageUrl || product.image || "/images/placeholder-cover.svg";
  const actionLabel = isBooking ? "Book Now" : isService ? "Hire Service" : "Buy Now";

  // Modal State for Non-Shipping Items
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCustomerEmail(user.email);
        if (user.displayName) setCustomerName(user.displayName);
      }
    });
    return () => unsubscribe();
  }, []);

  const productPrice = Number(product.price || 0);
  const subtotal = productPrice * 1;
  const platformFee = Math.round(subtotal * 0.015);
  const grandTotal = subtotal + platformFee;

  // Direct Checkout Router Logic
  const handleBuyNow = () => {
    if (!storeId || isOutOfStock) return;

    void trackMetric(storeId, "buy_now_click", { productId });

    if (requiresShipping) {
      // Physical Product -> Direct to Checkout Page
      const orderDetails = {
        productId,
        productName: product.name,
        price: productPrice,
        quantity: 1,
        storeId,
        storeName: product.vendorName || "Marketplace seller",
        storeUsername: product.username,
        vendorNombaAccountId: product.nombaAccountId,
        image,
      };
      sessionStorage.setItem("checkout_order", JSON.stringify(orderDetails));
      router.push("/checkout");
    } else {
      // Digital / Service / Booking -> Open Modal
      setModalError(null);
      setCheckoutModalOpen(true);
    }
  };

  // Direct Payment API Handler
  const handleModalPayment = async () => {
    if (!customerEmail.trim()) {
      setModalError("Please provide a valid contact email address.");
      return;
    }

    const buyer = auth.currentUser;
    if (!buyer) {
      setModalError("Please log in to complete this purchase.");
      return;
    }

    if (!storeId) {
      setModalError("Store information is missing.");
      return;
    }

    setIsModalLoading(true);
    setModalError(null);

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
            street: isBooking ? "Direct Booking" : "Digital Delivery / Service",
            city: "N/A",
            state: isBooking ? "Booking" : "Digital Service",
            country: "NG",
          },
          sellerOrders: [
            {
              storeId: storeId,
              storeName: product.vendorName || "Store",
              shippingMethod: "self_arranged",
              shippingCost: 0,
              subtotal: subtotal,
              items: [
                {
                  productId,
                  name: product.name || "Service Item",
                  price: productPrice,
                  quantity: 1,
                  image: image,
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

  return (
    <>
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
                ₦{productPrice.toLocaleString()}
              </span>
              <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight ${isOutOfStock ? "bg-red-50 text-red-500" :
                  isBooking ? "bg-purple-50 text-purple-600" :
                    isService ? "bg-emerald-50 text-emerald-600" : "text-gray-500"
                }`}>
                {isBooking ? <Calendar size={10} /> : isService ? <CheckCircle2 size={10} /> : <Package size={10} />}
                {isOutOfStock ? "Unavailable" : isBooking ? `${stock} Slots` : isService ? "Available" : `${stock} left`}
              </span>
            </div>
          </div>

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
                    price: productPrice,
                    image: image,
                    storeId,
                    storeName: product.vendorName || "Marketplace seller",
                    username: product.username,
                  });
                }
              }}
              className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${isOutOfStock
                  ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                  : "border border-gray-200 bg-white text-gray-900 hover:border-[#00a63e] hover:bg-gray-50 hover:text-[#00a63e]"
                }`}
            >
              Add to Cart
            </button>

            <button
              type="button"
              disabled={isOutOfStock}
              onClick={(e) => {
                e.preventDefault();
                handleBuyNow();
              }}
              className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 ${isOutOfStock
                  ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                  : "bg-black text-white hover:bg-[#00a63e]"
                }`}
            >
              {isOutOfStock ? "Unavailable" : actionLabel}
            </button>
          </div>
        </div>
      </article>

      {/* DIRECT CHECKOUT MODAL FOR SERVICES/BOOKINGS */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isModalLoading && setCheckoutModalOpen(false)} />

          <div className="relative bg-white rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl border border-gray-100 overflow-y-auto max-h-[90vh]">
            <button type="button" onClick={() => setCheckoutModalOpen(false)} disabled={isModalLoading} className="absolute top-4 right-4 z-10 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors active:scale-90">
              <X size={18} />
            </button>

            <div className="mb-6 border-b border-gray-100 pb-4">
              <p className="text-[10px] font-black uppercase text-[#00a63e] tracking-widest mb-1">Direct Checkout</p>
              <h2 className="text-xl font-extrabold text-gray-900">{isBooking ? "Complete Booking" : "Complete Purchase"}</h2>
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

              {/* Order Summary */}
              <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span className="truncate pr-2">{product.name} (x1)</span>
                  <span className="font-bold text-gray-900">₦{subtotal.toLocaleString()}</span>
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
                  <span className="font-bold text-gray-900">₦{platformFee.toLocaleString()}</span>
                </div>

                <div className="border-t border-gray-200/60 pt-2 flex justify-between items-center text-sm font-extrabold text-gray-900">
                  <span>Total Amount</span>
                  <span className="text-base text-[#00a63e] font-black">₦{grandTotal.toLocaleString()}</span>
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
                  <><CreditCard size={16} /> Pay ₦{grandTotal.toLocaleString()} Now</>
                )}
              </button>

              <p className="text-[10px] text-center text-gray-400 font-semibold flex items-center justify-center gap-1">
                <ShieldCheck size={10} /> Secured by Nomba Escrow Payment Gateway
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}