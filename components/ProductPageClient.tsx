"use client";

import React, { useState, useEffect } from "react";
import {
  Plus, Minus, ShieldCheck, Truck, ChevronLeft, ChevronRight,
  Box, Loader2, Calendar, MessageCircle, CheckCircle2, CreditCard, X
} from "lucide-react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useRouter } from "next/navigation";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

export default function ProductPageClient({ product, store }: { product: any; store: any }) {
  const { addToCart } = useCart();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [currentImg, setCurrentImg] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Modal Checkout State (Only for Non-Shipping items)
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    // Pre-fill email if user is logged in
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCustomerEmail(user.email);
        if (user.displayName) setCustomerName(user.displayName);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const storeId = store?.id || store?.uid;
    const productId = product?.id || product?.uid;
    if (storeId && productId) void trackMetric(storeId, "view", { productId });
  }, [product?.id, product?.uid, store?.id, store?.uid]);

  // PRODUCT TYPE LOGIC
  const isBooking = product?.productType === 'booking';
  const isServiceOrUtility = product?.productType === 'service' || product?.productType === 'utility';
  const requiresShipping = !isBooking && !isServiceOrUtility; // ✅ Dual experience trigger

  const hideQuantity = isBooking || isServiceOrUtility;
  const stockCount = Number(product?.stockCount ?? product?.stock ?? 0);
  const isOutOfStock = isServiceOrUtility
    ? product?.availability === "out_of_stock"
    : !Number.isFinite(stockCount) || stockCount <= 0 || product?.availability === "out_of_stock";

  const images = product?.images || [product?.image || "/placeholder.png"];
  const activeQuantity = hideQuantity ? 1 : quantity;
  const productPrice = Number(product?.price || 0);
  const finalTotal = productPrice * activeQuantity;

  // ✅ DUAL CHECKOUT ROUTER LOGIC
  const handleBuyNow = () => {
    const storeId = store?.id || store?.uid;
    const productId = product?.id || product?.uid;

    if (storeId && productId) {
      void trackMetric(storeId, "buy_now_click", { productId });
    }

    if (requiresShipping) {
      // EXPERIENCE 1: Physical Product -> Redirect to Checkout Page
      const orderDetails = {
        productId,
        productName: product?.name,
        price: productPrice,
        quantity: activeQuantity,
        storeId,
        storeName: store?.storeName,
        storeUsername: store?.username,
        vendorNombaAccountId: store?.nombaAccountId,
        image: images[0],
      };
      sessionStorage.setItem("checkout_order", JSON.stringify(orderDetails));
      router.push("/checkout");
    } else {
      // EXPERIENCE 2: Digital/Service/Booking -> Open Seamless Modal
      setCheckoutModalOpen(true);
    }
  };

  // ✅ MODAL PAYMENT HANDLER (For Non-Shipping Items)
  const handleModalPayment = async () => {
    if (!customerEmail.trim()) {
      setModalError("Please provide a valid contact email address.");
      return;
    }
    if (isBooking && (!selectedDate || !selectedSlot)) {
      setModalError("Please select a booking date and time.");
      return;
    }

    const buyer = auth.currentUser;
    if (!buyer) {
      setModalError("Please log in to complete this purchase.");
      return;
    }

    const productId = product?.id || product?.uid;
    const storeId = store?.id || store?.uid;

    setIsModalLoading(true);
    setModalError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          productName: product.name,
          price: productPrice,
          quantity: activeQuantity,
          deliveryFee: 0, // No shipping for these types
          storeId,
          storeUsername: store.username,
          storeName: store.storeName,
          vendorNombaAccountId: store.nombaAccountId,
          paymentMethod: "nomba", // Or your default gateway
          deliveryState: isBooking ? "Booking" : "Digital Service",
          bookingDate: selectedDate,
          bookingSlot: selectedSlot,
          isBooking,
          customerEmail: customerEmail.trim(),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          buyerId: buyer.uid,
        }),
      });

      const data = await response.json();
      if (data.checkoutLink) {
        window.location.href = data.checkoutLink; // Redirect to payment gateway
      } else {
        throw new Error(data.error || "Failed to initiate payment");
      }
    } catch (err: any) {
      setModalError(err.message || "An error occurred while initiating payment.");
      setIsModalLoading(false);
    }
  };

  const handleTrackWhatsApp = () => {
    const storeId = store?.id || store?.uid;
    if (storeId) void trackMetric(storeId, "whatsapp_click", { productId: product?.id || product?.uid });
  };

  const whatsappUrl = `https://wa.me/${store?.phone?.replace(/\s/g, "")}?text=${encodeURIComponent(`Hello ${store?.storeName}, I want to ${isBooking ? 'book' : 'order'} ${product?.name}${isBooking ? ` for ${selectedDate || ''} at ${selectedSlot || ''}` : ''}`)}`;

  if (!isMounted) {
    return (
      <div className={`${font.className} min-h-screen bg-[#fafafa] flex flex-col text-gray-900`}>
        <Header isStorePage={true} storeName={store?.storeName} />
        <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full flex items-center justify-center min-h-[400px]">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`${font.className} min-h-screen bg-[#fafafa] flex flex-col text-gray-900`}>
      <Header isStorePage={true} storeName={store?.storeName} />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 bg-white rounded-[24px] p-6 md:p-8 shadow-xl border border-gray-100 items-start">

          {/* LEFT COLUMN: Media Showcase */}
          <div className="space-y-4 w-full">
            <div className="bg-gray-50/50 rounded-2xl overflow-hidden flex items-center justify-center h-80 md:h-[450px] border border-gray-100 p-4 relative group">
              <img
                src={images[currentImg]}
                alt={product?.name}
                className={`max-h-full max-w-full object-contain group-hover:scale-102 transition-transform duration-300 ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
              />
              {images.length > 1 && (
                <>
                  <button onClick={() => setCurrentImg(prev => (prev === 0 ? images.length - 1 : prev - 1))} className="absolute left-4 p-2 bg-white/90 backdrop-blur rounded-full shadow-md text-gray-700 hover:bg-white active:scale-90 transition-all opacity-0 group-hover:opacity-100">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => setCurrentImg(prev => (prev === images.length - 1 ? 0 : prev + 1))} className="absolute right-4 p-2 bg-white/90 backdrop-blur rounded-full shadow-md text-gray-700 hover:bg-white active:scale-90 transition-all opacity-0 group-hover:opacity-100">
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img: string, idx: number) => (
                  <button key={idx} onClick={() => setCurrentImg(idx)} className={`relative w-14 h-14 rounded-xl overflow-hidden border bg-white shrink-0 p-1 transition-all ${currentImg === idx ? "border-[#00a63e] ring-2 ring-[#00a63e]/10 scale-95" : "border-gray-100 hover:border-gray-300"}`}>
                    <img src={img} className="w-full h-full object-contain rounded-lg" alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Transaction Matrix */}
          <div className="flex flex-col space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <p className="text-[11px] font-black text-[#00a63e] uppercase tracking-widest">{store?.storeName} Official Store</p>
                <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold uppercase tracking-tight ${isOutOfStock ? "bg-red-50 border-red-100 text-red-600" : isBooking ? "bg-purple-50 border-purple-100 text-purple-600" : isServiceOrUtility ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-orange-50 border-orange-100 text-orange-600"}`}>
                  <Box size={10} />
                  <span>{isOutOfStock ? (isBooking ? "No Slots" : isServiceOrUtility ? "Fully Committed" : "Sold Out") : isBooking ? `${stockCount || 0} Slots` : isServiceOrUtility ? "Available" : `${stockCount || 0} In Stock`}</span>
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 mb-3 capitalize">{product?.name}</h1>
              <p className="text-2xl font-black text-[#00a63e]">₦{productPrice.toLocaleString()}</p>
            </div>

            <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-medium whitespace-pre-line">{product?.description || "High quality product available for purchase."}</p>
            </div>

            {isBooking && !isOutOfStock && (
              <div className="space-y-4 bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Select Date</label>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {["2026-05-15", "2026-05-16", "2026-05-17"].map((date) => (
                      <button key={date} onClick={() => setSelectedDate(date)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${selectedDate === date ? "bg-black text-white border-black shadow-sm scale-98" : "bg-white text-gray-600 border-gray-100 hover:border-gray-200"}`}>
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedDate && (
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Select Time Slot</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["09:00", "11:00", "13:00", "15:00", "17:00"].map((slot) => (
                        <button key={slot} onClick={() => setSelectedSlot(slot)} className={`py-2 rounded-xl text-[11px] font-extrabold border transition-all ${selectedSlot === slot ? "bg-[#00a63e] text-white border-[#00a63e] shadow-sm scale-95" : "bg-white text-gray-600 border-gray-100 hover:bg-gray-50"}`}>
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!hideQuantity && !isOutOfStock && (
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quantity:</span>
                <div className="flex items-center border border-gray-100 bg-white rounded-xl overflow-hidden shadow-sm">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-3 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"><Minus size={14} /></button>
                  <span className="px-5 font-bold text-sm text-gray-800 w-12 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="p-3 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"><Plus size={14} /></button>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-3">
                <button
                  disabled={isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))}
                  onClick={(e) => {
                    e.preventDefault();
                    const storeId = store?.id || store?.uid;
                    const productId = product?.id || product?.uid;
                    if (!isOutOfStock && storeId && productId) {
                      void trackAddToCartClick(storeId, productId);
                      addToCart({
                        id: `${storeId}-${productId}`,
                        productId,
                        name: product?.name || "Product",
                        price: productPrice,
                        image: product?.images?.[0] || product?.image || "/placeholder.png",
                        storeId,
                        storeName: store?.storeName || "Store",
                        username: store?.username,
                      });
                    }
                  }}
                  className={`flex-1 w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm border ${isOutOfStock || (isBooking && (!selectedDate || !selectedSlot)) ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400 border-gray-100" : "bg-white text-gray-900 border-gray-200 hover:border-[#00a63e] hover:bg-gray-50 hover:text-[#00a63e]"}`}
                >
                  Add to Cart
                </button>

                <button
                  disabled={isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))}
                  onClick={handleBuyNow}
                  className={`flex-1 w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm ${isOutOfStock || (isBooking && (!selectedDate || !selectedSlot)) ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400" : "bg-black text-white hover:bg-[#00a63e]"}`}
                >
                  {isOutOfStock ? "Unavailable" : isBooking ? "Confirm Booking" : isServiceOrUtility ? "Hire Now" : "Buy It Now"}
                </button>
              </div>

              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleTrackWhatsApp} className="w-full bg-[#00a63e] text-white py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#008c34] transition-all active:scale-98 shadow-sm">
                <MessageCircle size={14} /> Chat on WhatsApp
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-100">
              <TrustCard Icon={ShieldCheck} title="Secure Gateway" desc="Verified Nomba Escrow Merchant" />
              <TrustCard Icon={isBooking ? Calendar : isServiceOrUtility ? CheckCircle2 : Truck} title={isBooking ? "Confirmed" : isServiceOrUtility ? "Reliable" : "Nationwide Delivery"} desc={isBooking ? "Instant Appointment Slot" : isServiceOrUtility ? "Service Guarantee Layer" : "Fast Tracking Shipments"} />
            </div>
          </div>
        </div>
      </main>

      {/* ✅ SEAMLESS MODAL CHECKOUT (Only for Non-Shipping: Bookings, Services, Utilities) */}
      {!requiresShipping && checkoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isModalLoading && setCheckoutModalOpen(false)} />

          <div className="relative bg-white rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl border border-gray-100 overflow-y-auto max-h-[90vh]">
            <button type="button" onClick={() => setCheckoutModalOpen(false)} disabled={isModalLoading} className="absolute top-4 right-4 z-10 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors active:scale-90">
              <X size={18} />
            </button>

            <div className="mb-6 border-b border-gray-100 pb-4">
              <p className="text-[10px] font-black uppercase text-[#00a63e] tracking-widest mb-1">Secure Checkout</p>
              <h2 className="text-xl font-extrabold text-gray-900">{isBooking ? "Complete Booking" : "Complete Purchase"}</h2>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold flex items-start gap-2">
                <span className="mt-0.5">⚠️</span> {modalError}
              </div>
            )}

            <div className="space-y-4">
              {/* Contact Details */}
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

              {/* Booking Details Summary (If applicable) */}
              {isBooking && selectedDate && selectedSlot && (
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 flex items-center gap-3">
                  <Calendar size={16} className="text-purple-600 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Scheduled For</p>
                    <p className="text-xs font-bold text-gray-900">{new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at {selectedSlot}</p>
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between text-xs text-gray-600 font-medium">
                  <span>{product?.name} (x{activeQuantity})</span>
                  <span className="font-bold text-gray-900">₦{finalTotal.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200/60 pt-2 flex justify-between items-center text-sm font-extrabold text-gray-900">
                  <span>Total Amount</span>
                  <span className="text-base text-[#00a63e] font-black">₦{finalTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Pay Button */}
              <button
                type="button"
                onClick={handleModalPayment}
                disabled={isModalLoading}
                className="w-full py-4 rounded-xl bg-black hover:bg-gray-900 text-white font-extrabold text-xs uppercase tracking-wider disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
              >
                {isModalLoading ? (
                  <><Loader2 className="animate-spin" size={16} /> Processing...</>
                ) : (
                  <><CreditCard size={16} /> Pay ₦{finalTotal.toLocaleString()} Now</>
                )}
              </button>

              <p className="text-[10px] text-center text-gray-400 font-semibold flex items-center justify-center gap-1">
                <ShieldCheck size={10} /> Secured by Nomba Escrow Payment Gateway
              </p>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

function TrustCard({ Icon, title, desc }: { Icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-xl border border-gray-100/80">
      <div className="p-2 bg-white rounded-lg text-[#00a63e] shadow-xs">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-800">{title}</p>
        <p className="text-[10px] text-gray-400 font-medium">{desc}</p>
      </div>
    </div>
  );
}