"use client";

import React, { useState, useEffect, use, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import {
  MapPin, Clock, Search, Share2, Package, Users, Phone, Calendar, CheckCircle2, ShieldCheck, X, Loader2, CreditCard, Info
} from "lucide-react";

// Firebase/Analytics
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { trackMetric, trackAddToCartClick } from "@/lib/analytics";
import { useCart } from "@/contexts/CartContext";

// Components
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SocialShareModal from "@/app/dashboard/modals/SocialShareModal";
import TrackedLink from "@/components/store/TrackedLink";
import FollowButton from "@/components/store/FollowButton";

import {
  InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, TwitterIcon
} from "@/components/icons/SocialIcons";

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

const toPlainObject = (obj: any) => {
  const newObj = { ...obj };
  for (const key in newObj) {
    if (newObj[key]?.constructor?.name === "Timestamp") {
      newObj[key] = newObj[key].toMillis();
    } else if (typeof newObj[key] === "object" && newObj[key] !== null) {
      newObj[key] = toPlainObject(newObj[key]);
    }
  }
  return newObj;
};

export default function PublicStorePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get("q") || "";

  const { addToCart } = useCart();

  const [followerCount, setFollowerCount] = useState(0);
  const [storeData, setStoreData] = useState<any>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState({ isOpen: false, url: "", title: "" });

  // Direct Checkout Modal State for Non-Shipping Items
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(urlQuery), 0);
    return () => window.clearTimeout(timer);
  }, [urlQuery]);

  useEffect(() => {
    async function fetchData() {
      if (!username) return;

      const { collection, query, where, getDocs, orderBy } = await import("firebase/firestore");

      try {
        const storesRef = collection(db, "stores");
        const qStore = query(storesRef, where("username", "==", username.toLowerCase()));
        const storeSnap = await getDocs(qStore);

        if (!storeSnap.empty) {
          const storeDoc = storeSnap.docs[0];
          const data = toPlainObject({ id: storeDoc.id, ...storeDoc.data() });
          setStoreData(data);
          setVendorId(storeDoc.id);
          setFollowerCount(data.followerCount || 0);
          void trackMetric(storeDoc.id, "view");

          const productsRef = collection(db, "products");
          const qProducts = query(productsRef, where("storeId", "==", storeDoc.id), orderBy("createdAt", "desc"));
          const productSnap = await getDocs(qProducts);
          setProducts(productSnap.docs.map(doc => toPlainObject({ id: doc.id, ...doc.data() })));
        }
      } catch (error) {
        console.error("Public store loading failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetchData();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email) {
        setCustomerEmail(user.email);
        if (user.displayName) setCustomerName(user.displayName);
      }
    });

    return () => unsubscribe();
  }, [username]);

  const filteredProducts = useMemo(() => {
    return products.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Handler for Direct Buy Action
  const handleBuyNow = (p: any) => {
    if (!vendorId) return;

    void trackMetric(vendorId, "buy_now_click", { productId: p.id });

    const isBooking = p.productType === "booking";
    const isService = p.productType === "service" || p.productType === "utility";
    const requiresShipping = !isBooking && !isService;

    const productPrice = Number(p.price || 0);

    if (requiresShipping) {
      // Physical Item -> Save & Redirect directly to Checkout page
      const orderDetails = {
        productId: p.id,
        productName: p.name,
        price: productPrice,
        quantity: 1,
        storeId: vendorId,
        storeName: storeData?.storeName || "Store",
        storeUsername: storeData?.username,
        vendorNombaAccountId: storeData?.nombaAccountId || "",
        image: p.images?.[0] || p.image || "/placeholder.png",
      };
      sessionStorage.setItem("checkout_order", JSON.stringify(orderDetails));
      router.push("/checkout");
    } else {
      // Digital/Service/Booking -> Open Modal directly
      setSelectedProduct(p);
      setModalError(null);
      setCheckoutModalOpen(true);
    }
  };

  // Handler for Modal Payment Submissions
  const handleModalPayment = async () => {
    if (!selectedProduct || !vendorId) return;

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
              storeId: vendorId,
              storeName: storeData?.storeName || "Store",
              shippingMethod: "self_arranged",
              shippingCost: 0,
              subtotal: subtotal,
              items: [
                {
                  productId: selectedProduct.id,
                  name: selectedProduct.name || "Service Item",
                  price: price,
                  quantity: 1,
                  image: selectedProduct.images?.[0] || selectedProduct.image || "/placeholder.png",
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

  if (loading) return null;
  if (!storeData) return <div className="h-screen flex items-center justify-center font-bold">Store not found</div>;

  const isVerifiedStore = Boolean(
    storeData.isVerified === true && (
      storeData.verificationTier === "business" ||
      storeData.verificationStatus === "approved" ||
      storeData.status === "verified"
    )
  );
  const normalizedPhone = String(storeData.phone || "").replace(/\D/g, "");
  const whatsappUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "#";
  const trackStoreClick = () => {
    if (vendorId) void trackMetric(vendorId, "click");
  };

  const selectedPrice = Number(selectedProduct?.price || 0);
  const modalSubtotal = selectedPrice * 1;
  const modalPlatformFee = Math.round(modalSubtotal * 0.015);
  const modalGrandTotal = modalSubtotal + modalPlatformFee;

  return (
    <div className={`${font.className} min-h-screen bg-[#fafafa] flex flex-col text-gray-900`}>
      <Header isStorePage={true} storeName={storeData?.storeName} />

      {/* 1. HERO BANNER */}
      <div className="relative h-48 md:h-56 w-full bg-gray-200">
        {storeData?.bannerUrl ? (
          <Image src={storeData.bannerUrl} alt="banner" fill className="object-cover" priority />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#00a63e] to-[#007a2e]" />
        )}
      </div>

      {/* 2. STORE INFO CARD */}
      <div className="max-w-5xl mx-auto px-4 w-full">
        <div className="relative bg-white rounded-[24px] -mt-12 p-6 md:p-8 shadow-xl border border-gray-100 z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">

            {/* LEFT COLUMN */}
            <div className="md:col-span-6 flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex flex-col md:flex-row gap-4 items-center md:items-start mb-6">
                <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-gray-50 -mt-16 md:-mt-20 shrink-0">
                  <img src={storeData?.logoUrl || `https://ui-avatars.com/api/?name=${storeData?.storeName}&background=00a63e&color=fff`} className="w-full h-full object-cover" alt="logo" />
                </div>
                <div className="flex flex-col md:mt-1">
                  <div className="flex items-center gap-1.5 justify-center md:justify-start">
                    <h1 className="text-xl font-extrabold tracking-tight text-gray-900">{storeData?.storeName}</h1>
                    {isVerifiedStore && <span title="Verified Business" className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-black text-green-700"><ShieldCheck size={13} /> Verified</span>}
                  </div>
                  <p className="text-[#00a63e] font-bold text-xs">@{storeData?.username}</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2.5 text-[11px] text-gray-500 font-bold tracking-tight">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  <p className="leading-tight text-left whitespace-pre-line">{storeData?.address?.replace(/,/g, '\n') || "Jos, Plateau\nNigeria"}</p>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-gray-500 font-bold tracking-tight">
                  <Clock size={14} className="shrink-0" />
                  <span>{storeData?.businessHours || "9:00 am - 6:00 pm"}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-gray-500 font-bold tracking-tight">
                  <Phone size={14} className="shrink-0" />
                  <span>{storeData?.phone}</span>
                </div>
              </div>

              <div className="flex gap-2.5 justify-center md:justify-start">
                {['instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'x'].map(s => storeData?.socials?.[s] && (
                  <SocialIcon
                    key={s}
                    href={storeData.socials[s]}
                    onClick={trackStoreClick}
                    Icon={
                      s === 'instagram' ? InstagramIcon :
                        (s === 'twitter' || s === 'x') ? TwitterIcon :
                          s === 'facebook' ? FacebookIcon :
                            s === 'tiktok' ? TikTokIcon :
                              s === 'youtube' ? YoutubeIcon :
                                null
                    }
                  />
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="md:col-span-6 flex flex-col items-center md:items-start lg:pl-10">
              <div className="flex flex-col items-start w-full">
                <div className="flex items-center gap-2 mb-3">
                  {vendorId && (
                    <FollowButton
                      vendorId={vendorId}
                      currentCount={followerCount}
                      onFollowChange={(nextCount) => {
                        setFollowerCount(nextCount);
                        trackStoreClick();
                      }}
                    />
                  )}
                  <TrackedLink
                    href={whatsappUrl}
                    storeId={vendorId!}
                    eventType="whatsapp_click"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#00a63e] px-4 py-2.5 text-[11px] font-extrabold text-white shadow-sm transition-all hover:bg-[#008c34] active:scale-95"
                  >
                    <Image src="/icons/whatsapplogo.svg" width={14} height={14} alt="wa" className="brightness-0 invert" />
                    WhatsApp
                  </TrackedLink>
                  <button
                    onClick={() => {
                      trackStoreClick();
                      setShareData({ isOpen: true, title: storeData.storeName, url: window.location.href });
                    }}
                    className="p-2 border border-gray-100 rounded-xl hover:bg-gray-50 text-gray-600"
                  >
                    <Share2 size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-black text-gray-700 uppercase tracking-widest px-1 mb-6">
                  <Users size={14} />
                  <span>{followerCount} followers</span>
                </div>

                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 w-full">
                  <p className="text-[12px] text-gray-600 font-medium leading-relaxed">{storeData?.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. PRODUCT CATALOG */}
      <section className="mx-auto w-full max-w-none flex-1 px-4 py-10 sm:px-6 lg:px-10 xl:px-14">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-lg font-extrabold tracking-tight">Store Catalog</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-xs focus:border-[#00a63e] outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredProducts.map((p) => {
              const productPath = `/${storeData.username}/${p.id}`;
              const productFullUrl = typeof window !== "undefined" ? `${window.location.origin}${productPath}` : "";

              const isBooking = p.productType === 'booking';
              const isService = p.productType === 'service' || p.productType === 'utility';
              const stockVal = p.stockCount ?? p.stock ?? 0;
              const isOutOfStock = isService ? p.availability === "out_of_stock" : stockVal <= 0 || p.availability === "out_of_stock";

              return (
                <div key={p.id} className="group flex flex-col h-full bg-white rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                  <button
                    onClick={() => {
                      if (vendorId) void trackMetric(vendorId, "click", { productId: p.id });
                      setShareData({ isOpen: true, title: p.name, url: productFullUrl });
                    }}
                    className="absolute top-3 right-3 z-20 p-2 bg-white/90 backdrop-blur rounded-full text-gray-500 hover:text-gray-900 shadow-sm transition-all active:scale-90"
                  >
                    <Share2 size={14} />
                  </button>

                  <Link href={productPath} onClick={() => vendorId && void trackMetric(vendorId, "click", { productId: p.id })} className="relative aspect-square overflow-hidden bg-gray-50">
                    <Image
                      src={p.images?.[0] || p.image || "/placeholder.png"}
                      alt={p.name}
                      fill
                      className={`object-cover group-hover:scale-105 transition-transform duration-500 ${isOutOfStock ? 'grayscale opacity-60' : ''}`}
                    />
                  </Link>

                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-gray-800 text-xs line-clamp-1 mb-1">{p.name}</h3>

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[#00a63e] font-extrabold text-sm">₦{Number(p.price || 0).toLocaleString()}</p>

                      <span className={`text-[9px] font-bold uppercase tracking-tight flex items-center gap-1 px-1.5 py-0.5 rounded ${isOutOfStock ? "bg-red-50 text-red-500" :
                          isBooking ? "bg-purple-50 text-purple-600" :
                            isService ? "bg-emerald-50 text-emerald-600" : "text-gray-500"
                        }`}>
                        {isBooking ? <Calendar size={10} /> : isService ? <CheckCircle2 size={10} /> : <Package size={10} />}
                        {isOutOfStock ? "Sold Out" : isBooking ? `${stockVal} Slots` : isService ? "Available" : `${stockVal} left`}
                      </span>
                    </div>

                    {/* Responsive Dual Button Layout */}
                    <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:gap-1.5">
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={(e) => {
                          e.preventDefault();
                          if (!isOutOfStock && vendorId) {
                            trackAddToCartClick(vendorId, p.id);

                            addToCart({
                              id: `${vendorId}-${p.id}`,
                              productId: p.id,
                              name: p.name,
                              price: Number(p.price || 0),
                              image: p.images?.[0] || p.image || "/placeholder.png",
                              storeId: vendorId,
                              storeName: storeData?.storeName || "Store",
                              username: storeData?.username,
                            });
                          }
                        }}
                        className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 sm:px-1.5 sm:py-2 sm:text-[9.5px] sm:tracking-tighter ${isOutOfStock
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
                          if (!isOutOfStock) handleBuyNow(p);
                        }}
                        className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-all active:scale-95 sm:px-1.5 sm:py-2 sm:text-[9.5px] sm:tracking-tighter ${isOutOfStock
                            ? "pointer-events-none cursor-not-allowed bg-gray-100 text-gray-400"
                            : "bg-black text-white hover:bg-[#00a63e]"
                          }`}
                      >
                        {isOutOfStock ? "Unavailable" : (isBooking ? "Book Now" : isService ? "Hire Service" : "Buy Now")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-20 text-center space-y-3">
            <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-gray-400">
              <Search size={20} />
            </div>
            <p className="text-sm font-bold text-gray-500">No items found matching "{searchQuery}"</p>
          </div>
        )}
      </section>

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

      <Footer />
      <SocialShareModal
        isOpen={shareData.isOpen}
        onClose={() => setShareData({ ...shareData, isOpen: false })}
        title={shareData.title}
        url={shareData.url}
      />
    </div>
  );
}

const SocialIcon = ({ href, Icon, onClick }: { href: string, Icon: any, onClick?: () => void }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className="w-8 h-8 flex items-center justify-center rounded-xl border border-green-50 bg-[#f0fff4] text-[#00a63e] hover:bg-[#00a63e] hover:text-white transition-all active:scale-90 shadow-sm">
    <Icon size={16} />
  </a>
);