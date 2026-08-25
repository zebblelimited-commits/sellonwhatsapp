"use client";
import React, { useState, useEffect } from "react";
import {
  Plus, Minus, ShieldCheck, Truck, ChevronLeft, ChevronRight,
  CreditCard, X, Box, Loader2, Calendar, MessageCircle, CheckCircle2
} from "lucide-react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext"; // ✅ Import useCart
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

interface ShippingCourier {
  courierId: string | number;
  courierName: string;
  courierImage: string | null;
  serviceCode: string | null;
  serviceType: string | null;
  total: number;
  deliveryEta: string;
  pickupEta: string | null;
  trackingLabel: string | null;
  dropoffStation: {
    name?: string;
    address?: string;
    phone?: string;
  } | null;
}

export default function ProductPageClient({ product, store }: { product: any; store: any }) {
  const { addToCart } = useCart(); // ✅ Initialize cart context
  
  const [isMounted, setIsMounted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [currentImg, setCurrentImg] = useState(0);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const [shippingCouriers, setShippingCouriers] = useState<ShippingCourier[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<ShippingCourier | null>(null);
  const [shippingRequestToken, setShippingRequestToken] = useState<string | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

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
  const stockCount = Number(product?.stockCount ?? product?.stock ?? 0);
  const isOutOfStock = isServiceOrUtility
    ? product?.availability === "out_of_stock"
    : !Number.isFinite(stockCount) || stockCount <= 0 || product?.availability === "out_of_stock";
  const images = product?.images || [product?.image || "/placeholder.png"];
  const activeQuantity = hideQuantity ? 1 : quantity;

  // Safe numeric conversion for calculations
  const productPrice = Number(product?.price || 0);
  const productTotal = productPrice * activeQuantity;
  const finalTotal = productTotal + deliveryFee;

  const handleCalculateShipping = async () => {
    const productId = product?.id || product?.uid;
    const storeId = store?.id || store?.uid;

    if (!productId || !storeId) {
      setError("Product or store information is missing.");
      return;
    }

    if (
      !recipientName.trim() ||
      !customerEmail.trim() ||
      !recipientPhone.trim() ||
      !deliveryAddress.trim()
    ) {
      setError(
        "Please enter your name, email, phone number, and complete delivery address."
      );
      return;
    }

    setIsCalculatingShipping(true);
    setError(null);

    // Clear any old quote when requesting a new one
    setShippingCouriers([]);
    setSelectedCourier(null);
    setShippingRequestToken(null);
    setDeliveryFee(0);

    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          recipientName: recipientName.trim(),
          recipientEmail: customerEmail.trim(),
          recipientPhone: recipientPhone.trim(),
          deliveryState: selectedState,
          recipientAddress: deliveryAddress.trim(),
          productId,
          quantity: activeQuantity,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Unable to calculate delivery options."
        );
      }

      setShippingCouriers(data.couriers || []);
      setShippingRequestToken(data.requestToken || null);

      // Automatically select the first/cheapest returned option.
      if (data.couriers?.length) {
        const cheapest = [...data.couriers].sort(
          (a: ShippingCourier, b: ShippingCourier) =>
            Number(a.total) - Number(b.total)
        )[0];

        setSelectedCourier(cheapest);
        setDeliveryFee(Number(cheapest.total));
      }
    } catch (err: any) {
      setError(
        err.message || "Unable to calculate delivery."
      );
    } finally {
      setIsCalculatingShipping(false);
    }
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

    if (!isBooking && !isServiceOrUtility) {
      if (!selectedState) {
        setError("Please select your delivery state.");
        return;
      }

      if (!deliveryAddress.trim()) {
        setError("Please enter your full delivery address.");
        return;
      }

      if (!recipientName.trim()) {
        setError("Please enter the recipient's full name.");
        return;
      }

      if (!recipientPhone.trim()) {
        setError("Please enter the recipient's phone number.");
        return;
      }

      if (!selectedCourier || !shippingRequestToken) {
        setError("Please calculate and select a delivery option first.");
        return;
      }
    }

    if (!customerEmail) {
      setError("Please provide a valid contact email address.");
      return;
    }

    const productId = product?.id || product?.uid;
    const storeId = store?.id || store?.uid;
    if (!productId) {
      setError("This product is unavailable. Please refresh and try again.");
      return;
    }
    if (!storeId) {
      setError("This store is unavailable for checkout. Please return to the store and try again.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          productName: product.name,
          price: productPrice,
          quantity: activeQuantity,

          deliveryFee: (isBooking || isServiceOrUtility) ? 0 : deliveryFee,

          storeId,
          storeUsername: store.username,
          storeName: store.storeName,

          vendorNombaAccountId: store.nombaAccountId,

          paymentMethod: method,

          deliveryState: (isBooking || isServiceOrUtility) ? "Digital Service" : selectedState,

          bookingDate: selectedDate,
          bookingSlot: selectedSlot,

          isBooking,

          customerEmail,
          buyerId: buyer.uid,

          // SHIPBUBBLE SHIPPING DATA
          shippingRequestToken: shippingRequestToken,
          shippingCourierId: selectedCourier?.courierId || null,
          shippingServiceCode: selectedCourier?.serviceCode || null,
          shippingCourierName: selectedCourier?.courierName || null,
          shippingServiceType: selectedCourier?.serviceType || null,
          recipientName: recipientName || null,
          recipientPhone: recipientPhone || null,
          deliveryAddress: deliveryAddress || null,
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

  const handleTrackClick = () => {
    const storeId = store?.id || store?.uid;
    if (storeId) void trackMetric(storeId, "click", { productId: product?.id || product?.uid });
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
          {/* LEFT COLUMN: Media Showcase Frame */}
          <div className="space-y-4 w-full">
            <div className="bg-gray-50/50 rounded-2xl overflow-hidden flex items-center justify-center h-80 md:h-[450px] border border-gray-100 p-4 relative group">
              <img
                src={images[currentImg]}
                alt={product?.name}
                className={`max-h-full max-w-full object-contain group-hover:scale-102 transition-transform duration-300 ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
              />
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
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {images.map((img: string, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImg(idx)}
                    className={`relative w-14 h-14 rounded-xl overflow-hidden border bg-white shrink-0 p-1 transition-all ${currentImg === idx ? "border-[#00a63e] ring-2 ring-[#00a63e]/10 scale-95" : "border-gray-100 hover:border-gray-300"
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
                <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold uppercase tracking-tight ${isOutOfStock ? "bg-red-50 border-red-100 text-red-600" :
                  isBooking ? "bg-purple-50 border-purple-100 text-purple-600" :
                    isServiceOrUtility ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                      "bg-orange-50 border-orange-100 text-orange-600"
                  }`}>
                  <Box size={10} />
                  <span>
                    {isOutOfStock
                      ? (isBooking ? "No Slots" : isServiceOrUtility ? "Fully Committed" : "Sold Out")
                      : isBooking
                        ? `${stockCount || 0} Slots`
                        : isServiceOrUtility
                          ? "Available"
                          : `${stockCount || 0} In Stock`}
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

            <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-medium whitespace-pre-line">
                {product?.description || "High quality product available for purchase."}
              </p>
            </div>

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
                        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${selectedDate === date
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
                          className={`py-2 rounded-xl text-[11px] font-extrabold border transition-all ${selectedSlot === slot
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

            {/* ✅ UPDATED: Dual Button Layout with Real Cart Integration */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-3">
                <button
                  disabled={isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))}
                  onClick={(e) => {
                    e.preventDefault();
                    const storeId = store?.id || store?.uid;
                    const productId = product?.id || product?.uid;
                    if (!isOutOfStock && storeId && productId) {
                      // 1. Track the analytics event
                      void trackAddToCartClick(storeId, productId);
                      
                      // 2. Add to cart using context (auto-opens the off-canvas drawer)
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
                  className={`flex-1 w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm border ${
                    isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))
                      ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400 border-gray-100"
                      : "bg-white text-gray-900 border-gray-200 hover:border-[#00a63e] hover:bg-gray-50 hover:text-[#00a63e]"
                  }`}
                >
                  Add to Cart
                </button>

                <button
                  disabled={isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))}
                  onClick={() => {
                    const storeId = store?.id || store?.uid;
                    const productId = product?.id || product?.uid;
                    if (storeId && productId) {
                      void trackMetric(storeId, "buy_now_click", { productId });
                    }
                    setCheckoutModalOpen(true);
                  }}
                  className={`flex-1 w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm ${
                    isOutOfStock || (isBooking && (!selectedDate || !selectedSlot))
                      ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                      : "bg-black text-white hover:bg-[#00a63e]"
                  }`}
                >
                  {isOutOfStock
                    ? "Unavailable"
                    : isBooking
                      ? "Confirm Booking"
                      : isServiceOrUtility
                        ? "Hire Now"
                        : "Buy It Now"}
                </button>
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleTrackWhatsApp}
                className="w-full bg-[#00a63e] text-white py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#008c34] transition-all active:scale-98 shadow-sm"
              >
                <MessageCircle size={14} /> Chat on WhatsApp
              </a>
            </div>

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
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isLoading && setCheckoutModalOpen(false)}
          />

          {/* HORIZONTAL CHECKOUT MODAL CONTAINER */}
          <div className="relative bg-white rounded-3xl w-full max-w-lg md:max-w-4xl p-6 md:p-8 shadow-2xl border border-gray-100 overflow-y-auto max-h-[90vh] md:max-h-[85vh]">
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              disabled={isLoading}
              className="absolute top-4 right-4 z-10 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors active:scale-90"
            >
              <X size={18} />
            </button>

            <div className="mb-6 border-b border-gray-100 pb-4">
              <p className="text-[10px] font-black uppercase text-[#00a63e] tracking-widest mb-1">
                Secure Gateway
              </p>
              <h2 className="text-xl md:text-2xl font-extrabold text-gray-900">
                {isBooking ? "Complete Booking" : isServiceOrUtility ? "Complete Hire" : "Checkout Order"}
              </h2>
            </div>

            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-bold">
                {error}
              </div>
            )}

            {/* TWO-SECTION HORIZONTAL GRID LAYOUT ON DESKTOP */}
            <div className={`grid grid-cols-1 ${(!isBooking && !isServiceOrUtility) ? 'md:grid-cols-2 gap-8' : ''} items-start`}>

              {/* SECTION 1: LEFT COLUMN - DELIVERY DETAILS */}
              {!isBooking && !isServiceOrUtility && (
                <div className="space-y-4 md:border-r md:border-gray-100 md:pr-8">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                    <Truck size={14} className="text-[#00a63e]" /> 1. Delivery Details
                  </h3>

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                      Recipient Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter recipient's full name"
                      value={recipientName}
                      onChange={(e) => {
                        setRecipientName(e.target.value);
                        setSelectedCourier(null);
                        setShippingRequestToken(null);
                        setDeliveryFee(0);
                      }}
                      disabled={isLoading || isCalculatingShipping}
                      className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                      Recipient Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="08012345678"
                      value={recipientPhone}
                      onChange={(e) => {
                        setRecipientPhone(e.target.value);
                        setSelectedCourier(null);
                        setShippingRequestToken(null);
                        setDeliveryFee(0);
                      }}
                      disabled={isLoading || isCalculatingShipping}
                      className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                      Delivery State
                    </label>
                    <select
                      className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all cursor-pointer"
                      value={selectedState}
                      onChange={(e) => {
                        setSelectedState(e.target.value);
                        setShippingCouriers([]);
                        setSelectedCourier(null);
                        setShippingRequestToken(null);
                        setDeliveryFee(0);
                      }}
                      disabled={isLoading || isCalculatingShipping}
                    >
                      <option value="">Select your State</option>
                      {NIGERIA_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                      Full Delivery Address
                    </label>
                    <textarea
                      placeholder="e.g. Plot 6992 Opposite Mining Gate Rantiya Abuja FCT Nigeria"
                      value={deliveryAddress}
                      onChange={(e) => {
                        setDeliveryAddress(e.target.value);
                        setShippingCouriers([]);
                        setSelectedCourier(null);
                        setShippingRequestToken(null);
                        setDeliveryFee(0);
                      }}
                      disabled={isLoading || isCalculatingShipping}
                      rows={3}
                      className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 resize-none transition-all"
                    />
                  </div>

                  {/* CALCULATE DELIVERY BUTTON */}
                  <button
                    type="button"
                    onClick={handleCalculateShipping}
                    disabled={
                      isLoading ||
                      isCalculatingShipping ||
                      !selectedState ||
                      !recipientName.trim() ||
                      !recipientPhone.trim() ||
                      !deliveryAddress.trim()
                    }
                    className="w-full py-3.5 rounded-xl bg-[#00a63e] text-white font-extrabold text-xs uppercase tracking-wider disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                  >
                    {isCalculatingShipping ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Calculating Delivery...
                      </>
                    ) : (
                      "Calculate Delivery"
                    )}
                  </button>

                  {/* AVAILABLE COURIERS LIST */}
                  {shippingCouriers.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                        Select Delivery Option
                      </p>

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {shippingCouriers.map((courier) => {
                          const isSelected =
                            selectedCourier?.courierId === courier.courierId &&
                            selectedCourier?.serviceCode === courier.serviceCode;

                          return (
                            <button
                              key={`${courier.courierId}-${courier.serviceCode}`}
                              type="button"
                              onClick={() => {
                                setSelectedCourier(courier);
                                setDeliveryFee(Number(courier.total));
                              }}
                              disabled={isLoading}
                              className={`w-full text-left p-3.5 rounded-xl border transition-all ${isSelected
                                ? "border-[#00a63e] bg-[#f0fff4] ring-1 ring-[#00a63e]/20"
                                : "border-gray-100 bg-white hover:border-gray-300"
                                }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  {courier.courierImage ? (
                                    <img
                                      src={courier.courierImage}
                                      alt={courier.courierName}
                                      className="w-8 h-8 rounded-lg object-contain border border-gray-100 bg-white"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                      <Truck size={14} className="text-gray-500" />
                                    </div>
                                  )}

                                  <div className="min-w-0">
                                    <p className="font-extrabold text-xs text-gray-900 truncate">
                                      {courier.courierName}
                                    </p>
                                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                      {courier.deliveryEta}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <p className="font-black text-xs text-[#00a63e]">
                                    ₦{Number(courier.total).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: RIGHT COLUMN - CONTACT, QUANTITY, ORDER SUMMARY & PAY BUTTON */}
              <div className={`space-y-5 ${(!isBooking && !isServiceOrUtility) ? 'mt-6 md:mt-0' : ''}`}>
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2">
                  <CreditCard size={14} className="text-[#00a63e]" />
                  {(!isBooking && !isServiceOrUtility) ? "2. Contact & Payment" : "Contact & Payment"}
                </h3>

                {/* Email Address */}
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                    Your Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full p-3.5 bg-gray-50/80 border border-gray-100 rounded-xl font-bold text-xs outline-none focus:border-[#00a63e] focus:bg-white text-gray-900 transition-all"
                  />
                </div>

                {/* Modal Quantity Adjuster */}
                {!hideQuantity && (
                  <div className="flex items-center justify-between p-3.5 bg-gray-50/80 rounded-xl border border-gray-100">
                    <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                      Quantity
                    </span>
                    <div className="flex items-center border border-gray-200 bg-white rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setQuantity(Math.max(1, quantity - 1));
                          setSelectedCourier(null);
                          setShippingRequestToken(null);
                          setDeliveryFee(0);
                        }}
                        disabled={isLoading || isCalculatingShipping}
                        className="p-2 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="px-3 font-bold text-xs text-gray-800">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setQuantity(quantity + 1);
                          setSelectedCourier(null);
                          setShippingRequestToken(null);
                          setDeliveryFee(0);
                        }}
                        disabled={isLoading || isCalculatingShipping}
                        className="p-2 hover:bg-gray-50 text-gray-500 active:scale-95 transition-all"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Itemized Price Summary */}
                <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100 space-y-2">
                  <div className="flex justify-between text-xs text-gray-600 font-medium">
                    <span>Item Price ({activeQuantity}x)</span>
                    <span className="font-bold text-gray-900">₦{productTotal.toLocaleString()}</span>
                  </div>

                  {!isBooking && !isServiceOrUtility && (
                    <div className="flex justify-between text-xs text-gray-600 font-medium">
                      <span>Delivery Fee</span>
                      <span className="font-bold text-gray-900">
                        {deliveryFee > 0 ? `₦${deliveryFee.toLocaleString()}` : "Calculated at quote"}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gray-200/60 pt-2 flex justify-between items-center text-sm font-extrabold text-gray-900">
                    <span>Total Amount</span>
                    <span className="text-base text-[#00a63e] font-black">₦{finalTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* PAYMENT BUTTONS */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePayment("nomba")}
                    disabled={
                      isLoading ||
                      (!isBooking && !isServiceOrUtility && (!selectedCourier || !shippingRequestToken))
                    }
                    className="w-full py-4 rounded-xl bg-black hover:bg-gray-900 text-white font-extrabold text-xs uppercase tracking-wider disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={16} /> Processing Order...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} /> Pay ₦{finalTotal.toLocaleString()} Now
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-center text-gray-400 font-semibold">
                    🔒 Secured by Nomba Escrow Payment Gateway
                  </p>
                </div>
              </div>

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