"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin, Truck, CreditCard, ShieldCheck,
  Edit3, Package, Clock, Smartphone, Building2,
  Store, X, Save, Loader2, Plus, ChevronDown
} from "lucide-react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useCart } from "@/contexts/CartContext";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

// --- Mock Shipping Options (Per Seller) ---
const SHIPPING_OPTIONS = [
  { id: "gig", name: "GIG Logistics", price: 2450, eta: "1-2 days" },
  { id: "sendbox", name: "Sendbox", price: 2150, eta: "2-3 days" },
  { id: "dhl", name: "DHL Express", price: 3200, eta: "1 day" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { items: cartItems, clearCart } = useCart();

  const [loading, setLoading] = useState(true);
  const [buyerData, setBuyerData] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ address: "", city: "", state: "", postalCode: "", phone: "" });
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // ✅ Per-Seller Shipping Selection
  const [sellerShipping, setSellerShipping] = useState<Record<string, string>>({});

  // 1. Fetch Buyer Profile
  useEffect(() => {
    async function fetchBuyerData() {
      const user = auth.currentUser;
      if (!user) { router.push("/login"); return; }

      try {
        const { getDoc } = await import("firebase/firestore");
        const buyerDoc = await getDoc(doc(db, "buyers", user.uid));
        if (buyerDoc.exists()) {
          const data = buyerDoc.data();
          setBuyerData(data);
          const fullAddress = [data.address, data.city, data.state, data.postalCode, data.country].filter(Boolean).join(", ");
          const defaultAddress = {
            id: "default_addr", label: "Default Address",
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || "Buyer",
            phone: data.phone || "", address: fullAddress, state: data.state || "Lagos", isDefault: true,
          };
          setAddresses([defaultAddress]);
          setSelectedAddressId("default_addr");
          setEditForm({ address: data.address || "", city: data.city || "", state: data.state || "", postalCode: data.postalCode || "", phone: data.phone || "" });
        } else { router.push("/buyer/profile"); }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    }
    fetchBuyerData();
  }, [router]);

  // 2. Group Cart Items by Seller
  const groupedCartItems = cartItems.reduce((acc, item) => {
    const storeId = item.storeId || 'unknown';
    if (!acc[storeId]) {
      acc[storeId] = { storeName: item.storeName || 'Unknown Store', items: [], subtotal: 0 };
    }
    acc[storeId].items.push(item);
    acc[storeId].subtotal += item.price * item.quantity;
    return acc;
  }, {} as Record<string, { storeName: string; items: typeof cartItems; subtotal: number }>);

  // 3. Initialize Shipping for each seller (Default to GIG)
  useEffect(() => {
    const initialShipping: Record<string, string> = {};
    Object.keys(groupedCartItems).forEach(storeId => {
      initialShipping[storeId] = "gig";
    });
    setSellerShipping(initialShipping);
  }, [cartItems]);

  // ✅ UPDATED: Calculations (Must match backend logic exactly to pass security check)
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let calculatedFrontendTotal = 0;
  let totalShipping = 0;
  let totalPlatformFee = 0;
  let totalHandlingFee = 0;

  Object.entries(groupedCartItems).forEach(([storeId, group]) => {
    const shippingCost = SHIPPING_OPTIONS.find(o => o.id === sellerShipping[storeId])?.price || 0;
    const handlingFee = (sellerShipping[storeId] !== "self_arranged" && shippingCost > 0) ? 200 : 0;

    // Backend charges 1.5% on (Product Subtotal + Shipping Cost)
    const buyerPlatformFee = Math.round((group.subtotal + shippingCost) * 0.015);

    totalShipping += shippingCost;
    totalPlatformFee += buyerPlatformFee;
    totalHandlingFee += handlingFee;

    calculatedFrontendTotal += group.subtotal + shippingCost + buyerPlatformFee + handlingFee;
  });

  const grandTotal = calculatedFrontendTotal;

  const selectedBuyerAddress = addresses.find(a => a.id === selectedAddressId);

  const handleSaveAddress = async () => {
    if (!auth.currentUser) return;
    setIsSavingAddress(true);
    try {
      await updateDoc(doc(db, "buyers", auth.currentUser.uid), { ...editForm, updatedAt: new Date() });
      const updatedAddress = { ...selectedBuyerAddress, address: [editForm.address, editForm.city, editForm.state, editForm.postalCode].filter(Boolean).join(", "), phone: editForm.phone };
      setAddresses([updatedAddress]);
      setIsEditModalOpen(false);
    } catch (error) { alert("Failed to save address."); } finally { setIsSavingAddress(false); }
  };

  const handleCheckout = async () => {
    if (!selectedBuyerAddress || Object.keys(sellerShipping).length === 0) {
      alert("Please select a delivery address and shipping method for all items.");
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Build the multi-seller payload
      // ✅ DEBUG: Check if email exists before sending
      console.log("📧 Frontend Auth Email:", auth.currentUser?.email);

      const payload = {
        buyerId: auth.currentUser?.uid,
        customerEmail: auth.currentUser?.email || "",
        address: {
          name: selectedBuyerAddress.name,
          phone: selectedBuyerAddress.phone,
          address: selectedBuyerAddress.address,
          city: selectedBuyerAddress.city || "",
          state: selectedBuyerAddress.state || "",
          postalCode: selectedBuyerAddress.postalCode || "",
        },
        sellerOrders: Object.entries(groupedCartItems).map(([storeId, group]) => ({
          storeId,
          storeName: group.storeName,
          items: group.items,
          shippingMethod: sellerShipping[storeId],
          shippingCost: SHIPPING_OPTIONS.find(o => o.id === sellerShipping[storeId])?.price || 0,
          subtotal: group.subtotal
        })),
        paymentMethod,
        total: grandTotal
      };

      // 2. Call the new unified checkout API
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // 3. Redirect to Nomba if successful
      if (data.success && data.checkoutLink) {
        window.location.href = data.checkoutLink;
      } else {
        throw new Error("No checkout link received from payment gateway");
      }
    } catch (error: any) {
      console.error("Checkout failed:", error);
      alert(error.message || "Payment initialization failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#00a63e]" size={40} /></div>;
  if (cartItems.length === 0) return null;

  return (
    <div className={`${font.className} min-h-screen flex flex-col bg-[#FAFAFA]`}>
      <Header />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Checkout</h1>
            <p className="text-gray-500 text-sm mt-1">Complete your order securely.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* LEFT COLUMN: Addresses, Shipping & Escrow */}
            <div className="lg:col-span-2 space-y-6">

              {/* 1. Delivery & Pickup Locations */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin size={20} className="text-[#00a63e]" /> Delivery & Pickup Locations
                  </h2>
                  <button onClick={() => setIsEditModalOpen(true)} className="text-xs font-bold text-[#00a63e] hover:text-[#008c34] flex items-center gap-1">
                    <Edit3 size={12} /> Edit Delivery Address
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {addresses.map((addr: any) => (
                    <div key={addr.id} onClick={() => setSelectedAddressId(addr.id)} className={`relative rounded-2xl border-2 p-4 transition-all h-full flex flex-col ${selectedAddressId === addr.id ? "border-[#00a63e] bg-green-50/30" : "border-gray-100 hover:border-gray-200 cursor-pointer"}`}>
                      <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#00a63e]/10 text-[#00a63e]">Delivery</span>
                      <div className="flex items-start gap-3 mt-1">
                        <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedAddressId === addr.id ? "border-[#00a63e]" : "border-gray-300"}`}>
                          {selectedAddressId === addr.id && <div className="w-2 h-2 rounded-full bg-[#00a63e]" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{addr.label} • {addr.name}</p>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed break-words">{addr.address}</p>
                          <p className="text-xs text-gray-400 mt-1">{addr.phone}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Available Shipping Options (Updated Layout) */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Truck size={20} className="text-[#00a63e]" /> Available Shipping Options
                </h2>
                <div className="space-y-4">
                  {Object.entries(groupedCartItems).map(([storeId, group]) => {
                    const selectedOpt = SHIPPING_OPTIONS.find(o => o.id === (sellerShipping[storeId] || 'gig'));

                    return (
                      <div key={storeId} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        {/* Store Name & Circular Product Images (Now side-by-side) */}
                        <div className="flex items-center gap-3 mb-3">
                          <Store size={16} className="text-gray-500 shrink-0" />
                          <h3 className="font-bold text-sm text-gray-900">{group.storeName}</h3>

                          {/* Overlapping Circular Product Images right next to store name */}
                          <div className="flex items-center">
                            {group.items.slice(0, 3).map((item, idx) => (
                              <div
                                key={item.id}
                                className={`relative w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-100 ${idx > 0 ? '-ml-2' : ''}`}
                              >
                                {item.image ? (
                                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <Package size={10} />
                                  </div>
                                )}
                              </div>
                            ))}
                            {group.items.length > 3 && (
                              <div className="relative w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center -ml-2">
                                <span className="text-[8px] font-bold text-gray-600">+{group.items.length - 3}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Shipping Dropdown with Dynamic Courier Logo */}
                        <div className="relative">
                          {/* Circular Courier Logo (Left side of input) */}
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
                            {selectedOpt?.name.includes("GIG") ? (
                              <span className="text-[9px] font-black text-blue-600">GIG</span>
                            ) : selectedOpt?.name.includes("Sendbox") ? (
                              <span className="text-[9px] font-black text-orange-600">SBX</span>
                            ) : selectedOpt?.name.includes("DHL") ? (
                              <span className="text-[9px] font-black text-red-600">DHL</span>
                            ) : (
                              <Truck size={14} className="text-gray-500" />
                            )}
                          </div>

                          <select
                            className="w-full text-sm border border-gray-200 rounded-lg p-3 pl-14 bg-white appearance-none focus:border-[#00a63e] focus:ring-1 focus:ring-[#00a63e] outline-none font-medium cursor-pointer"
                            value={sellerShipping[storeId] || 'gig'}
                            onChange={(e) => setSellerShipping(prev => ({ ...prev, [storeId]: e.target.value }))}
                          >
                            {SHIPPING_OPTIONS.map(opt => (
                              <option key={opt.id} value={opt.id}>
                                {opt.name} - ₦{opt.price.toLocaleString()} ({opt.eta})
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 3. Secured By Escrow Protection */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <ShieldCheck size={20} className="text-[#00a63e]" /> Secured By Escrow Protection
                </h2>
                <div className="bg-[#00a63e]/5 border border-[#00a63e]/20 rounded-2xl p-4 flex gap-4 items-start">
                  <div className="bg-[#00a63e]/10 p-2.5 rounded-full shrink-0">
                    <ShieldCheck size={24} className="text-[#00a63e]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Your funds are held securely in our escrow account. <span className="font-semibold text-gray-900">Do not release funds</span> until you have received and inspected your items. Funds are only released to the seller when you confirm delivery.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Order Summary & Payment */}
            <div className="lg:col-span-1">
              <div className="sticky top-6 bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-6">

                {/* Order Summary */}
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>
                  <div className="space-y-6 mb-6 border-b border-gray-100 pb-6 max-h-[400px] overflow-y-auto">
                    {Object.entries(groupedCartItems).map(([storeId, group]) => (
                      <div key={storeId} className="space-y-3">
                        {/* Seller Header */}
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-green-50 rounded-lg"><Store size={14} className="text-[#00a63e]" /></div>
                          <h3 className="font-bold text-sm text-gray-900">{group.storeName}</h3>
                        </div>

                        {/* Items */}
                        <div className="space-y-3 pl-1">
                          {group.items.map((item) => (
                            <div key={item.id} className="flex gap-3">
                              <div className="relative w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                                {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={16} /></div>}
                              </div>
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-sm font-bold text-gray-900 leading-snug break-words">
                                  {item.name}
                                </p>
                                <div className="flex items-center justify-between mt-1.5">
                                  <span className="text-[10px] text-gray-400">Qty: {item.quantity}</span>
                                  <span className="text-sm font-bold text-gray-900 shrink-0">
                                    ₦{(item.price * item.quantity).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Seller Subtotal (Items Only) */}
                        <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                          <span className="text-xs font-medium text-gray-500">Seller Subtotal</span>
                          <span className="text-sm font-bold text-gray-900">₦{group.subtotal.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ✅ UPDATED: Global Totals showing Handling Fee */}
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Cart Subtotal</span>
                      <span className="font-bold text-gray-900">₦{cartSubtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Shipping</span>
                      <span className="font-bold text-gray-900">₦{totalShipping.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Platform Fee (1.5%)</span>
                      <span className="font-bold text-gray-900">₦{totalPlatformFee.toLocaleString()}</span>
                    </div>
                    {totalHandlingFee > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Logistics Handling Fee</span>
                        <span className="font-bold text-gray-900">₦{totalHandlingFee.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="border-t border-gray-100 my-4" />

                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-gray-900">Grand Total</span>
                      <span className="text-xl font-black text-[#00a63e]">₦{grandTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                    <CreditCard size={20} className="text-[#00a63e]" /> Payment Method
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {["card", "transfer", "ussd"].map(method => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all ${paymentMethod === method ? "border-[#00a63e] bg-green-50/30" : "border-gray-100 hover:border-gray-200"
                          }`}
                      >
                        {method === "card" ? <CreditCard size={20} /> : method === "transfer" ? <Building2 size={20} /> : <Smartphone size={20} />}
                        <span className="text-[10px] font-bold text-gray-700 capitalize">{method}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pay Button */}
                <button
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className="w-full bg-[#00a63e] hover:bg-[#008c34] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-green-100"
                >
                  {isProcessing ? (
                    <><Loader2 className="animate-spin" size={18} /> Processing...</>
                  ) : (
                    <><ShieldCheck size={18} /> Pay Securely ₦{grandTotal.toLocaleString()}</>
                  )}
                </button>

                <p className="text-[10px] text-center text-gray-400 flex items-center justify-center gap-1">
                  <ShieldCheck size={10} /> Secured by Nomba Escrow
                </p>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Edit Address Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSavingAddress && setIsEditModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[24px] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Edit Delivery Address</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="Street Address" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="City" />
                <input type="text" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="State" />
              </div>
              <button onClick={handleSaveAddress} disabled={isSavingAddress} className="w-full bg-[#00a63e] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
                {isSavingAddress ? <><Loader2 className="animate-spin" size={18} /> Saving...</> : <><Save size={18} /> Save Address</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}