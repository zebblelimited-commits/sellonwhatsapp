"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin, Truck, CreditCard, ShieldCheck,
  Edit3, Package, Smartphone, Building2,
  Store, X, Save, Loader2
} from "lucide-react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useCart } from "@/contexts/CartContext";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import ShippingSelector, { ShippingOption } from "@/components/checkout/ShippingSelector";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

export default function CheckoutPage() {
  const router = useRouter();
  const { items: cartItems, clearCart } = useCart();

  const [loading, setLoading] = useState(true);
  const [buyerData, setBuyerData] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);

  // Direct checkout order from sessionStorage (fallback)
  const [sessionOrderItems, setSessionOrderItems] = useState<any[]>([]);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ address: "", city: "", state: "", postalCode: "", phone: "" });
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // ✅ Real-time Per-Seller Shipping Selection (Stores ShippingOption objects)
  const [sellerShipping, setSellerShipping] = useState<Record<string, ShippingOption | null>>({});

  // 1. Fetch Direct Session Order Data or standard Cart Data
  useEffect(() => {
    if (cartItems && cartItems.length > 0) {
      setSessionOrderItems(cartItems);
    } else {
      const savedOrder = sessionStorage.getItem("checkout_order");
      if (savedOrder) {
        try {
          const parsed = JSON.parse(savedOrder);
          const normalizedItems = Array.isArray(parsed) ? parsed : [parsed];
          setSessionOrderItems(normalizedItems);
        } catch (err) {
          console.error("Failed to parse checkout_order session data:", err);
        }
      }
    }
  }, [cartItems]);

  // 2. Fetch Buyer Profile & Delivery Address Data
  useEffect(() => {
    async function fetchBuyerData() {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const { getDoc } = await import("firebase/firestore");
        const buyerDoc = await getDoc(doc(db, "buyers", user.uid));
        if (buyerDoc.exists()) {
          const data = buyerDoc.data();
          setBuyerData(data);
          const fullAddress = [data.address, data.city, data.state, data.postalCode, data.country].filter(Boolean).join(", ");
          const defaultAddress = {
            id: "default_addr",
            label: "Default Address",
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || "Buyer",
            phone: data.phone || "",
            address: fullAddress,
            city: data.city || "",
            state: data.state || "Lagos",
            postalCode: data.postalCode || "",
            isDefault: true,
          };
          setAddresses([defaultAddress]);
          setSelectedAddressId("default_addr");
          setEditForm({
            address: data.address || "",
            city: data.city || "",
            state: data.state || "Lagos",
            postalCode: data.postalCode || "",
            phone: data.phone || ""
          });
        } else {
          router.push("/buyer/profile");
        }
      } catch (error) {
        console.error("Error fetching buyer data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchBuyerData();
  }, [router]);

  // Active items being checked out
  const activeCheckoutItems = sessionOrderItems;

  // 3. Group Cart Items by Seller & Calculate Total Store Weight (kg)
  const groupedCartItems = activeCheckoutItems.reduce((acc: Record<string, { storeName: string; items: any[]; subtotal: number; totalWeightKg: number }>, item: any) => {
    const storeId = item.storeId || item.vendorId || 'unknown';
    if (!acc[storeId]) {
      acc[storeId] = { storeName: item.storeName || item.vendorName || 'Unknown Store', items: [], subtotal: 0, totalWeightKg: 0 };
    }
    acc[storeId].items.push(item);
    acc[storeId].subtotal += item.price * item.quantity;

    // Fallback to 1kg per item quantity if item weight is missing
    const itemWeight = Number(item.weightKg) || 1;
    acc[storeId].totalWeightKg += itemWeight * item.quantity;

    return acc;
  }, {});

  // Active Buyer Delivery Address & State
  const selectedBuyerAddress = addresses.find((a: any) => a.id === selectedAddressId);
  const selectedState = selectedBuyerAddress?.state || "Lagos";

  // 4. Complete Checkout Totals Calculation Matrix
  const cartSubtotal = activeCheckoutItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);

  let calculatedFrontendTotal = 0;
  let totalShipping = 0;
  let totalPlatformFee = 0;
  let totalHandlingFee = 0;

  Object.entries(groupedCartItems).forEach(([storeId, group]: [string, any]) => {
    const selectedCourier = sellerShipping[storeId];
    const shippingCost = selectedCourier?.shippingFee || 0;
    const handlingFee = shippingCost > 0 ? 200 : 0;

    // Platform Fee: 1.5% on (Product Subtotal + Shipping Cost)
    const buyerPlatformFee = Math.round((group.subtotal + shippingCost) * 0.015);

    totalShipping += shippingCost;
    totalPlatformFee += buyerPlatformFee;
    totalHandlingFee += handlingFee;

    calculatedFrontendTotal += group.subtotal + shippingCost + buyerPlatformFee + handlingFee;
  });

  const grandTotal = calculatedFrontendTotal;

  // Update Address & Trigger State Change for Re-calculating Shipping
  const handleSaveAddress = async () => {
    if (!auth.currentUser) return;
    setIsSavingAddress(true);
    try {
      await updateDoc(doc(db, "buyers", auth.currentUser.uid), { ...editForm, updatedAt: new Date() });
      const updatedAddress = {
        ...selectedBuyerAddress,
        address: [editForm.address, editForm.city, editForm.state, editForm.postalCode].filter(Boolean).join(", "),
        city: editForm.city,
        state: editForm.state,
        postalCode: editForm.postalCode,
        phone: editForm.phone
      };
      setAddresses([updatedAddress]);
      setIsEditModalOpen(false);
    } catch (error) {
      alert("Failed to save address.");
    } finally {
      setIsSavingAddress(false);
    }
  };

  // 5. Submit Order Payload with Complete Checkout Information
  const handleCheckout = async () => {
    if (!selectedBuyerAddress) {
      alert("Please select a valid delivery address.");
      return;
    }

    const missingShipping = Object.keys(groupedCartItems).some(
      (storeId) => !sellerShipping[storeId]
    );

    if (missingShipping) {
      alert("Please select a valid shipping courier for all sellers before proceeding.");
      return;
    }

    setIsProcessing(true);
    try {
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
        sellerOrders: Object.entries(groupedCartItems).map(([storeId, group]: [string, any]) => {
          const courier = sellerShipping[storeId];
          return {
            storeId,
            storeName: group.storeName,
            items: group.items,
            courierId: courier?.id,
            shippingMethod: courier?.name,
            shippingCost: courier?.shippingFee || 0,
            estimatedDays: courier?.estimatedDays,
            totalWeightKg: group.totalWeightKg,
            subtotal: group.subtotal
          };
        }),
        paymentMethod,
        total: grandTotal
      };

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.success && data.checkoutLink) {
        clearCart();
        sessionStorage.removeItem("checkout_order");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#00a63e]" size={40} />
      </div>
    );
  }

  if (activeCheckoutItems.length === 0) {
    return (
      <div className={`${font.className} min-h-screen flex flex-col bg-[#FAFAFA]`}>
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <Package size={48} className="text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-800">Your checkout details are empty</h2>
          <p className="text-gray-500 text-sm mt-1 mb-6">Please add items to your cart or select a product to purchase.</p>
          <button
            onClick={() => router.push("/explore")}
            className="px-6 py-3 bg-[#00a63e] text-white font-bold rounded-xl text-sm"
          >
            Explore Products
          </button>
        </main>
        <Footer />
      </div>
    );
  }

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

            {/* LEFT COLUMN: Addresses, Dynamic Shipping & Escrow */}
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

              {/* 2. Available Shipping Options */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Truck size={20} className="text-[#00a63e]" /> Available Shipping Options
                </h2>
                <div className="space-y-6">
                  {Object.entries(groupedCartItems).map(([storeId, group]: [string, any]) => (
                    <div key={storeId} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4">
                      {/* Store Details & Item Thumbnails */}
                      <div className="flex items-center gap-3">
                        <Store size={16} className="text-gray-500 shrink-0" />
                        <div>
                          <h3 className="font-bold text-sm text-gray-900">{group.storeName}</h3>
                          <p className="text-[10px] text-gray-400 font-medium">Est. Package Weight: {group.totalWeightKg}kg</p>
                        </div>

                        <div className="flex items-center ml-auto">
                          {group.items.slice(0, 3).map((item: any, idx: number) => (
                            <div
                              key={item.id || idx}
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

                      {/* Dynamic Shipping Selector per Vendor */}
                      <ShippingSelector
                        selectedState={selectedState}
                        totalWeightKg={group.totalWeightKg}
                        selectedOptionId={sellerShipping[storeId]?.id}
                        onSelectOption={(option) =>
                          setSellerShipping((prev) => ({ ...prev, [storeId]: option }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. Escrow Protection Banner */}
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
                    {Object.entries(groupedCartItems).map(([storeId, group]: [string, any]) => (
                      <div key={storeId} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-green-50 rounded-lg"><Store size={14} className="text-[#00a63e]" /></div>
                          <h3 className="font-bold text-sm text-gray-900">{group.storeName}</h3>
                        </div>

                        <div className="space-y-3 pl-1">
                          {group.items.map((item: any, idx: number) => (
                            <div key={item.id || idx} className="flex gap-3">
                              <div className="relative w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                                {item.image ? <img src={item.image} alt={item.name || item.productName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={16} /></div>}
                              </div>
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-sm font-bold text-gray-900 leading-snug break-words">
                                  {item.name || item.productName}
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

                        <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                          <span className="text-xs font-medium text-gray-500">Seller Subtotal</span>
                          <span className="text-sm font-bold text-gray-900">₦{group.subtotal.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals Breakdown */}
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
                    {["card", "transfer", "ussd"].map((method: string) => (
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
              <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="Phone Number" />
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