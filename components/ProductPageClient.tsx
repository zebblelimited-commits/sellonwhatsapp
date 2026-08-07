"use client";
import React, { useState, useEffect } from "react";
import {
  Plus, Minus, ShieldCheck, Truck, ChevronLeft, ChevronRight,
  CreditCard, Banknote, X, Box, Loader2, Smartphone, QrCode,
  Calendar, CheckCircle2, MessageCircle
} from "lucide-react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { trackMetric } from "@/lib/analytics";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

// Load the exact same font as your store page design
const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

const NIGERIA_STATES = [
  "Lagos", "Abuja", "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna",
  "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

export default function ProductPageClient({ product, store }: { product: any; store: any }) {
  const [isMounted, setIsMounted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [currentImg, setCurrentImg] = useState(0);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");

  // Sync logged-in user email with checkout form automatically
  useEffect(() => {
    setIsMounted(true);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCustomerEmail(user.email);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const storeId = store?.id || store?.uid;
    const productId = product?.id || product?.uid;
    if (storeId && productId) void trackMetric(storeId, "view", { productId });
  }, [product?.id, product?.uid, store?.id, store?.uid]);

  // HYBRID PRODUCT / SERVICE / BOOKING LOGIC HELPERS
  const isBooking = product?.productType === 'booking';
  const isServiceOrUtility = product?.productType === 'service' || product?.productType === 'utility';
  const hideQuantity = isBooking || isServiceOrUtility;
  const isOutOfStock = (product?.stockCount || 0) <= 0 || product?.availability === "out_of_stock";
  const images = product?.images || [product?.image || "/placeholder.png"];
  const activeQuantity = hideQuantity ? 1 : quantity;

  // Safe numeric conversion for calculations
  const productPrice = Number(product?.price || 0);
  const productTotal = productPrice * activeQuantity;
  const finalTotal = productTotal + deliveryFee;

  const handleStateChange = (state: string) => {
    setSelectedState(state);
    const isLocal = state.toLowerCase() === (store?.state || "lagos").toLowerCase();
    setDeliveryFee(isLocal ? 2500 : 5000);
  };

  const handlePayment = async (method: string) => {
    const buyer = auth.currentUser;
    if (!buyer) {
      setError("Please log in to complete this purchase.");
      return;
    }
    if (isBooking && (!selectedDate || !selectedSlot)) {
      setError("Please select a booking date and time.");
      return;
    }
    if (!isBooking && !isServiceOrUtility && !selectedState) {
      setError("Please select a delivery location first.");
      return;
    }
    if (!customerEmail) {
      setError("Please provide a valid contact email address.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id || product.uid,
          productName: product.name,
          price: productPrice,
          quantity: activeQuantity,
          deliveryFee: (isBooking || isServiceOrUtility) ? 0 : deliveryFee,
          storeId: store.id || store.uid,
          storeUsername: store.username,
          storeName: store.storeName,
          vendorNombaAccountId: store.nombaAccountId,
          paymentMethod: method,
          deliveryState: (isBooking || isServiceOrUtility) ? "Digital Service" : selectedState,
          bookingDate: selectedDate,
          bookingSlot: selectedSlot,
          isBooking: isBooking,
          customerEmail: customerEmail,
          buyerId: buyer.uid
        }),
      });

      const data = await response.json();
      if (data.checkoutLink) {
        window.location.href = data.checkoutLink;
      } else {
        throw new Error(data.error || "Failed to initiate payment");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  // 🌟 FIX: Unified to singular 'click' to match the new analytics.ts standard
  const handleTrackClick = () => {
    const storeId = store?.id || store?.uid;
    if (storeId) void trackMetric(storeId, "click", { productId: product?.id || product?.uid });
  };

  // 🌟 NEW: Dedicated handler for WhatsApp premium analytics
  const handleTrackWhatsApp = () => {
    const storeId = store?.id || store?.uid;
    if (storeId) void trackMetric(storeId, "whatsapp_click", { productId: product?.id || product?.uid });
  };

  const whatsappUrl = `https://wa.me/${store?.phone?.replace(/\s/g, "")}?text=${encodeURIComponent(
    `Hello ${store?.storeName}, I want to ${isBooking ? 'book' : 'order'} ${product?.name}${isBooking ? ` for ${selectedDate || ''} at ${selectedSlot || ''}` : ''}`
  )}`;

  // Structural hydration safe shell matching design wrappers exactly
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
      {/* Include Header with proper store layout flag */}
      <Header isStorePage={true} storeName={store?.storeName} />

      {/* Main Content Wrapper */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">
        {/* Responsive Grid Card Layout Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 bg-white rounded-[24px] p-6 md:p-8 shadow-xl border border-gray-100 items-start">
          {/* LEFT COLUMN: Media Showcase Frame */}
          <div className="space-y-4 w-full">
            <div className="bg-gray-50/50 rounded-2xl overflow-hidden flex items-center justify-center h-80 md:h-[450px] border border-gray-100 p-4 relative group">
              
              {/* TODO: [FUTURE FEATURE] Implement Likes / Wishlist feature (Heart icon toggle + Firestore arrayUnion for user saves) */}
              
              <img
                src={images[currentImg]}
                alt={product?.name}
                className={`max-h-full max-w-full object-contain group-hover:scale-102 transition-transform duration-300 ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
              />
              {/* Image Carousel Control Toggles */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentImg(prev => (prev === 0 ? images.length - 1 : prev - 1))}
                    className="absolute left-4 p-2 bg-white/90 backdrop-blur rounded-full shadow-md text-gray-700 hover:bg-white active:scale-90 transition-all opacity-0 group-hover:opacity-100 touch-none"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentImg(prev => (prev === images.length - 1 ? 0 : prev + 1))}
                    className="absolute right-4 p-2 bg-white/90 backdrop-blur rounded-full shadow-md text-gray-700 hover:bg-white active:scale-90 transition-all opacity-0 group-hover:opacity-100 touch-none"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            {/* Thumbnail Navigation Rack */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img: string, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImg(idx)}
                    className={`relative w-14 h-14 rounded-xl overflow-hidden border bg-white shrink-0 p-1 transition-all ${
                      currentImg === idx ? "border-[#00a63e] ring-2 ring-[#00a63e]/10 scale-95" : "border-gray-100 hover:border-gray-300"
                    }`}
                  >
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
                <p className="text-[11px] font-black text-[#00a63e] uppercase tracking-widest">
                  {store?.storeName} Official Store
                </p>
                
                {/* TODO: [FUTURE FEATURE] Implement Product Share functionality (Web Share API / Copy Link modal) */}
                {/* TODO: [FUTURE FEATURE] Implement Reviews and Ratings system (Star rating component + Firestore subcollection) */}

                {/* Dynamic Status Badging Block */}
                <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold uppercase tracking-tight ${
                  isOutOfStock ? "bg-red-50 border-red-100 text-red-600" :
                  isBooking ? "bg-purple-50 border-purple-100 text-purple-600" :
                  isServiceOrUtility ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                  "bg-orange-50 border-orange-100 text-orange-600"
                }`}>
                  <Box size={10} />
                  <span>
                    {isOutOfStock
                      ? (isBooking ? "No Slots" : isServiceOrUtility ? "Fully Committed" : "Sold Out")
                      : isBooking
                        ? `${product?.stockCount || 0} Slots`
                        : isServiceOrUtility
                          ? "Available"
                          : `${product?.stockCount || 0} In Stock`}
                  </span>
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 mb-3 capitalize">
                {product?.name}
              </h1>
              <p className="text-2xl font-black text-[#00a63e]">
                ₦{productPrice.toLocaleString()}
              </p>
            </div>

            {/* Content Description Frame */}
            <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-medium whitespace-pre-line">
                {product?.description || "High quality product available for purchase."}
              </p>
            </div>

            {/* BOOKING INTERFACE: Calendar Selector */}
            {isBooking && !isOutOfStock && (
              <div className="space-y-4 bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">
                    Select Date
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {["2026-05-15", "2026-05-16", "2026-05-17"].map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                          selectedDate === date
                            ? "bg-black text-white border-black shadow-sm scale-98"
                            : "bg-white text-gray-600 border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedDate && (
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                      Select Time Slot
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {["09:00", "11:00", "13:00", "15:00", "17:00"].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                            selectedSlot === slot
                              ? "bg-[#00a63e] text-white border-[#00a63e] shadow-sm scale-95"
                              : "bg-white text-gray-600 border-gray-100 hover:bg-gray-50"
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quantity Selector Interface Block */}
            {!hideQuantity && !isOutOfStock && (
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quantity:</span>
                <div className="flex items-center border border-gray-100 bg-white rounded-xl overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-3 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="px-5 font-bold text-sm text-gray-800 w-12 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-3 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Responsive Checkout CTA Processing Controls */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                disabled={isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))}
                onClick={() => {
                  // 🌟 FIX: Track the specific click event that OverviewTab.tsx is looking for
                  const storeId = store?.id || store?.uid;
                  if (storeId) {
                    void trackMetric(storeId, "buy_now_click", { productId: product?.id || product?.uid });
                  }
                  
                  // Continue with your existing checkout drawer state opening mechanism
                  setCheckoutModalOpen(true);
                }}
                className="flex-1 w-full bg-black text-white py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider hover:bg-gray-900 active:scale-98 transition-all disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed shadow-sm"
              >
                {isOutOfStock
                  ? "Unavailable"
                  : isBooking
                  ? "Confirm Booking"
                  : isServiceOrUtility
                  ? "Hire Now"
                  : "Buy It Now"}
              </button>
              
              {/* 🌟 UPDATED: Now uses the dedicated premium WhatsApp tracking handler */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleTrackWhatsApp}
                className="flex-1 w-full bg-[#00a63e] text-white py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#008c34] transition-all active:scale-98 shadow-sm"
              >
                <MessageCircle size={14} /> Chat on WhatsApp
              </a>
            </div>

            {/* Merchant Assurances / Trust Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-100">
              <TrustCard Icon={ShieldCheck} title="Secure Gateway" desc="Verified Nomba Escrow Merchant" />
              <TrustCard
                Icon={isBooking ? Calendar : isServiceOrUtility ? CheckCircle2 : Truck}
                title={isBooking ? "Confirmed" : isServiceOrUtility ? "Reliable" : "Nationwide Delivery"}
                desc={isBooking ? "Instant Appointment Slot" : isServiceOrUtility ? "Service Guarantee Layer" : "Fast Tracking Shipments"}
              />
            </div>
          </div>
        </div>
      </main>

      {/* CHECKOUT POPUP DIALOG PANEL */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isLoading && setCheckoutModalOpen(false)} />
          <div className="relative bg-white rounded-[24px] w-full max-w-md p-6 shadow-2xl border border-gray-50 overflow-y-auto max-h-[92vh]">
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              disabled={isLoading}
              className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors active:scale-90"
            >
              <X size={16} />
            </button>
            <p className="text-[10px] font-black uppercase text-[#00a63e] tracking-widest mb-1">Secure Gateway</p>
            <h2 className="text-xl font-extrabold text-gray-900 mb-5">
              {isBooking ? "Complete Booking" : isServiceOrUtility ? "Complete Hire" : "Checkout Order"}
            </h2>

            {/* Shipping State Picker */}
            {!isBooking && !isServiceOrUtility && (
              <div className="mb-4 space-y-1.5">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Ship Destination State:</label>
                <select
                  className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all cursor-pointer"
                  value={selectedState}
                  onChange={(e) => handleStateChange(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">Select your State</option>
                  {NIGERIA_STATES.map(state => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>
            )}

            {/* Input Contact Target Field */}
            <div className="mb-5 space-y-1.5">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Contact Email Address:</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Accounting Subtotal Card Box */}
            <div className="p-4 border border-gray-100 bg-gray-50/60 rounded-2xl mb-5 space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-500">
                <span>{isBooking ? 'Appointment Base' : isServiceOrUtility ? 'Service Fee' : `${quantity}x Item Units`}</span>
                <span className="text-gray-900 font-extrabold">₦{productTotal.toLocaleString()}</span>
              </div>
              {!isBooking && !isServiceOrUtility && (
                <div className="flex justify-between text-xs font-bold text-gray-500">
                  <span>Shipping ({selectedState || "Unselected"})</span>
                  <span className="text-gray-900 font-extrabold">{deliveryFee > 0 ? `₦${deliveryFee.toLocaleString()}` : "—"}</span>
                </div>
              )}
              {isBooking && (
                <div className="flex justify-between text-xs font-bold text-[#00a63e] bg-[#f0fff4] px-2.5 py-1.5 rounded-lg border border-green-50/50">
                  <span>Slot Assignment</span>
                  <span className="font-extrabold">{selectedDate} @ {selectedSlot}</span>
                </div>
              )}
              <div className="pt-2.5 mt-1 border-t border-gray-100 flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-tight text-gray-900">Total Due</span>
                <span className="text-xl font-black text-gray-950">₦{finalTotal.toLocaleString()}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 flex items-center gap-2">
                <X size={14} className="shrink-0" /> {error}
              </div>
            )}

            {/* Encrypted Processing Triggers */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-1">Select Payment Protocol</h4>
              <CompactPaymentButton onClick={() => handlePayment("Card")} isLoading={isLoading} icon={<CreditCard size={15} />} label="Pay via Card" variant="dark" />
              <CompactPaymentButton onClick={() => handlePayment("Transfer")} isLoading={isLoading} icon={<Banknote size={15} />} label="Bank Instant Transfer" variant="light" />
              <div className="grid grid-cols-2 gap-2">
                <CompactPaymentButton onClick={() => handlePayment("USSD")} isLoading={isLoading} icon={<Smartphone size={15} />} label="USSD Code" variant="blue" />
                <CompactPaymentButton onClick={() => handlePayment("Nomba QR")} isLoading={isLoading} icon={<QrCode size={15} />} label="Scan QR" variant="purple" />
              </div>
            </div>

            <p className="text-center text-[9px] text-gray-400 mt-6 font-extrabold uppercase tracking-widest">Powered by Nomba Commerce Gateway</p>
          </div>
        </div>
      )}

      {/* Include Footer */}
      <Footer />
    </div>
  );
}

function CompactPaymentButton({ onClick, isLoading, icon, label, variant }: { onClick: () => void; isLoading: boolean; icon: React.ReactNode; label: string; variant: "dark" | "light" | "blue" | "purple" }) {
  const styles = {
    dark: "bg-black text-white hover:bg-gray-900 border border-transparent",
    light: "bg-white border border-gray-100 text-gray-900 hover:border-gray-200 hover:bg-gray-50",
    blue: "bg-blue-50/70 text-blue-800 border border-blue-100 hover:bg-blue-50",
    purple: "bg-purple-50/70 text-purple-800 border border-purple-100 hover:bg-purple-50"
  };

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={onClick}
      className={`flex items-center justify-between w-full p-3.5 rounded-xl disabled:opacity-50 ${styles[variant]} transition-all active:scale-98 shadow-sm`}
    >
      <div className="flex items-center gap-3">
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : icon}
        <span className="font-extrabold text-xs tracking-tight">{isLoading ? "Processing..." : label}</span>
      </div>
      {!isLoading && <ChevronRight size={14} className="opacity-40" />}
    </button>
  );
}

function TrustCard({ Icon, title, desc }: { Icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3.5 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm w-full">
      <div className="p-2.5 bg-[#f0fff4] rounded-xl text-[#00a63e] shrink-0">
        <Icon size={18} />
      </div>
      <div className="space-y-0.5 overflow-hidden">
        <p className="text-xs font-black text-gray-900 leading-none tracking-tight truncate">{title}</p>
        <p className="text-[11px] text-gray-500 font-medium leading-tight line-clamp-2">{desc}</p>
      </div>
    </div>
  );
}
