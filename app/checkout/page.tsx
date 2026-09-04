"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin, Truck, CreditCard, ShieldCheck,
  Edit3, Package, Smartphone, Building2,
  Store, X, Save, Loader2, ChevronDown, PlusCircle
} from "lucide-react";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useCart } from "@/contexts/CartContext";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import ShippingSelector, { ShippingOption } from "@/components/checkout/ShippingSelector";
import { hasSavedCoordinates } from "@/components/location/CoordinatesRequiredModal";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

// Nigerian States List for Instant Dynamic Shipping Calculation
const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT - Abuja"
];

type CheckoutAddress = {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  lga: string;
  postalCode: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
};

type SellerLocation = {
  id: string;
  storeName: string;
  address: string;
  city: string;
  state: string;
  lga: string;
  phone: string;
  latitude?: number;
  longitude?: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { items: cartItems, clearCart } = useCart();

  const [loading, setLoading] = useState(true);
  const [buyerData, setBuyerData] = useState<any>(null);
  const [addresses, setAddresses] = useState<CheckoutAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("default_addr");
  const [selectedState, setSelectedState] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);

  // Direct checkout order from sessionStorage (fallback)
  const [sessionOrderItems, setSessionOrderItems] = useState<any[]>([]);

  // Modals State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCustomAddressModalOpen, setIsCustomAddressModalOpen] = useState(false);

  // Forms pre-filled with buyer details
  const [editForm, setEditForm] = useState({
    address: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
    latitude: "",
    longitude: ""
  });

  const [customAddressForm, setCustomAddressForm] = useState({
    name: "",
    phone: "",
    address: "",
    state: "",
    lga: "",
    latitude: "",
    longitude: ""
  });

  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // Real-time Per-Seller Shipping Selection
  const [sellerShipping, setSellerShipping] = useState<Record<string, ShippingOption | null>>({});
  const [sellerLocations, setSellerLocations] = useState<SellerLocation[]>([]);

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

  // 2. Fetch the authenticated buyer profile. Do not substitute a demo
  // address when the profile is missing or incomplete.
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (active) {
          setBuyerData(null);
          setAddresses([]);
          setSelectedAddressId("");
          setSelectedState("");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const [buyerDoc, userDoc] = await Promise.all([
          getDoc(doc(db, "buyers", user.uid)),
          getDoc(doc(db, "users", user.uid)),
        ]);
        // Email buyers historically live in `buyers`, while newer accounts
        // keep their editable profile in `users`. Prefer the newer profile
        // when both exist so checkout reflects the latest saved address.
        const data = {
          ...(buyerDoc.exists() ? buyerDoc.data() : {}),
          ...(userDoc.exists() ? userDoc.data() : {}),
        };
        if (!active) return;

        setBuyerData({ ...data, email: data.email || user.email || "" });

        const shippingAddress = data.shippingAddress && typeof data.shippingAddress === "object" ? data.shippingAddress : {};
        const savedLocation = data.location && typeof data.location === "object" ? data.location : {};
        const profileAddress = typeof data.address === "string"
          ? data.address
          : typeof data.shippingAddress === "string"
            ? data.shippingAddress
            : shippingAddress.address || savedLocation.address || "";
        const currentCity = data.city || shippingAddress.city || savedLocation.city || "";
        const currentState = typeof data.state === "string" ? data.state : shippingAddress.state || savedLocation.state || "";
        const profileLatitude = data.latitude ?? data.location?.latitude ?? data.location?.lat ?? shippingAddress.latitude ?? shippingAddress.lat;
        const profileLongitude = data.longitude ?? data.location?.longitude ?? data.location?.lng ?? shippingAddress.longitude ?? shippingAddress.lng;
        const hasAddress = Boolean(profileAddress || currentCity || currentState);
        const defaultAddress: CheckoutAddress = {
          id: "default_addr",
          label: "Default Address",
          name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.displayName || user.displayName || "",
          phone: data.phone || shippingAddress.phone || savedLocation.phone || "",
          address: [profileAddress, currentCity, currentState, data.postalCode || shippingAddress.postalCode || savedLocation.postalCode, data.country].filter(Boolean).join(", "),
          city: currentCity,
          state: currentState,
          lga: data.lga || shippingAddress.lga || savedLocation.lga || "",
          postalCode: data.postalCode || shippingAddress.postalCode || savedLocation.postalCode || "",
          isDefault: true,
          latitude: Number(profileLatitude) || undefined,
          longitude: Number(profileLongitude) || undefined,
        };

        setAddresses(hasAddress ? [defaultAddress] : []);
        setSelectedAddressId(hasAddress ? "default_addr" : "");
        setSelectedState(currentState);
        setEditForm({
          address: profileAddress,
          city: currentCity,
          state: currentState,
          postalCode: data.postalCode || "",
          phone: data.phone || "",
          latitude: profileLatitude === undefined || profileLatitude === null ? "" : String(profileLatitude),
          longitude: profileLongitude === undefined || profileLongitude === null ? "" : String(profileLongitude),
        });
      } catch (error) {
        console.error("Error fetching buyer data:", error);
        if (active) {
          setBuyerData(null);
          setAddresses([]);
          setSelectedAddressId("");
          setSelectedState("");
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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

    const itemWeight = Number(item.weightKg) || 1;
    acc[storeId].totalWeightKg += itemWeight * item.quantity;

    return acc;
  }, {});

  const sellerIds = Object.keys(groupedCartItems).filter((storeId) => storeId !== "unknown");
  const sellerIdsKey = sellerIds.join("|");

  // Store profiles are public because they are used by the storefront. Read
  // each seller's pickup location from Firestore instead of reusing the buyer
  // address card.
  useEffect(() => {
    let active = true;
    if (sellerIds.length === 0) {
      setSellerLocations([]);
      return () => { active = false; };
    }

    Promise.all(sellerIds.map(async (storeId): Promise<SellerLocation> => {
      const storeDoc = await getDoc(doc(db, "stores", storeId));
      const data = storeDoc.exists() ? storeDoc.data() : {};
      const location = data.location && typeof data.location === "object" ? data.location : {};
      return {
        id: storeId,
        storeName: data.storeName || groupedCartItems[storeId]?.storeName || "Seller",
        address: typeof data.address === "string" ? data.address : data.businessAddress || location.address || location.formattedAddress || "",
        city: data.city || location.city || "",
        state: data.state || location.state || "",
        lga: data.lga || location.lga || "",
        phone: data.phone || "",
        latitude: Number(data.latitude ?? data.lat ?? location.latitude ?? location.lat) || undefined,
        longitude: Number(data.longitude ?? data.lng ?? location.longitude ?? location.lng) || undefined,
      };
    })).then((locations) => {
      if (active) setSellerLocations(locations);
    }).catch((error) => {
      console.error("Error fetching seller pickup locations:", error);
      if (active) setSellerLocations([]);
    });

    return () => { active = false; };
  }, [sellerIdsKey]);

  const selectedBuyerAddress = addresses.find((a: any) => a.id === selectedAddressId);

  // Sync selected address state to global selected state whenever choice toggles
  useEffect(() => {
    if (selectedBuyerAddress?.state) {
      setSelectedState(selectedBuyerAddress.state);
    }
  }, [selectedAddressId, selectedBuyerAddress]);

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

    const buyerPlatformFee = Math.round((group.subtotal + shippingCost) * 0.015);

    totalShipping += shippingCost;
    totalPlatformFee += buyerPlatformFee;
    totalHandlingFee += handlingFee;

    calculatedFrontendTotal += group.subtotal + shippingCost + buyerPlatformFee + handlingFee;
  });

  const grandTotal = calculatedFrontendTotal;

  // Save changes to Default Profile Address
  const handleSaveDefaultAddress = async () => {
    setIsSavingAddress(true);
    try {
      const latitude = Number(editForm.latitude);
      const longitude = Number(editForm.longitude);
      if (!hasSavedCoordinates({ latitude: editForm.latitude, longitude: editForm.longitude })) {
        alert("Please enter both valid latitude and longitude coordinates. Coordinates are required for delivery.");
        return;
      }

      if (auth.currentUser) {
        await setDoc(doc(db, "users", auth.currentUser.uid), {
          ...editForm,
          latitude,
          longitude,
          updatedAt: new Date()
        }, { merge: true });
      }
      const updatedAddress: CheckoutAddress = {
        ...addresses.find(a => a.id === "default_addr"),
        id: "default_addr",
        label: "Default Address",
        name: addresses.find(a => a.id === "default_addr")?.name || buyerData?.displayName || auth.currentUser?.displayName || "Buyer",
        address: [editForm.address, editForm.city, editForm.state, editForm.postalCode].filter(Boolean).join(", "),
        city: editForm.city,
        state: editForm.state,
        lga: addresses.find(a => a.id === "default_addr")?.lga || "",
        postalCode: editForm.postalCode,
        phone: editForm.phone,
        isDefault: true,
        latitude,
        longitude,
      };
      setAddresses(prev => prev.some(a => a.id === "default_addr")
        ? prev.map(a => a.id === "default_addr" ? updatedAddress : a)
        : [updatedAddress, ...prev]);
      setSelectedAddressId("default_addr");
      setSelectedState(editForm.state);
      setIsEditModalOpen(false);
    } catch (error) {
      alert("Failed to save address.");
    } finally {
      setIsSavingAddress(false);
    }
  };

  // Add Custom "Ship to another location" Address
  const handleAddCustomAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAddressForm.name || !customAddressForm.phone || !customAddressForm.address || !customAddressForm.state || !customAddressForm.lga) {
      alert("Please complete all required fields for the new shipping address.");
      return;
    }

    const latitude = Number(customAddressForm.latitude);
    const longitude = Number(customAddressForm.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      alert("Please enter valid latitude and longitude coordinates for this delivery address.");
      return;
    }

    const newAddressObj: CheckoutAddress = {
      id: `custom_addr_${Date.now()}`,
      label: "Custom Shipping Address",
      name: customAddressForm.name,
      phone: customAddressForm.phone,
      address: customAddressForm.address,
      city: "",
      state: customAddressForm.state,
      lga: customAddressForm.lga,
      postalCode: "",
      isDefault: false,
      latitude,
      longitude,
    };

    setAddresses(prev => [...prev.filter(a => a.id !== "custom_shipping_addr"), { ...newAddressObj, id: "custom_shipping_addr" }]);
    setSelectedAddressId("custom_shipping_addr");
    setSelectedState(customAddressForm.state);
    setIsCustomAddressModalOpen(false);

    // Reset Form
    setCustomAddressForm({ name: "", phone: "", address: "", state: "", lga: "", latitude: "", longitude: "" });
  };

  // 5. Submit Order Payload
  const handleCheckout = async () => {
    if (!selectedBuyerAddress) {
      alert("Please select a valid delivery address.");
      return;
    }
    if (!hasSavedCoordinates(selectedBuyerAddress)) {
      alert("Please save your delivery latitude and longitude before checking out.");
      return;
    }
    const sellerWithoutCoordinates = sellerIds.some((storeId) => {
      const location = sellerLocations.find((sellerLocation) => sellerLocation.id === storeId);
      return !hasSavedCoordinates(location);
    });
    if (sellerWithoutCoordinates) {
      alert("This seller has not saved store coordinates yet. Please ask the seller to update their store location before checking out.");
      return;
    }
    const user = auth.currentUser;
    const customerEmail = user?.email || buyerData?.email || "";
    if (!user || !customerEmail) {
      alert("Please sign in with a valid buyer account before checking out.");
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
        buyerId: user.uid,
        customerEmail,
        address: {
          name: selectedBuyerAddress.name,
          phone: selectedBuyerAddress.phone,
          address: selectedBuyerAddress.address,
          city: selectedBuyerAddress.city || "Jos",
          state: selectedBuyerAddress.state || selectedState,
          lga: selectedBuyerAddress.lga || "",
          postalCode: selectedBuyerAddress.postalCode || "100232",
          latitude: selectedBuyerAddress.latitude,
          longitude: selectedBuyerAddress.longitude,
        },
        sellerOrders: Object.entries(groupedCartItems).map(([storeId, group]: [string, any]) => {
          const courier = sellerShipping[storeId];
          return {
            storeId,
            storeName: group.storeName,
            items: group.items,
            courierId: courier?.id,
            // Persist the stable courier ID. The aggregation layer uses this
            // value to route the shipment; the display name is resolved from
            // courierName on the order/shipment record.
            shippingMethod: courier?.id,
            courierName: courier?.name,
            shippingCost: courier?.shippingFee || 0,
            estimatedDays: courier?.estimatedDays,
            totalWeightKg: group.totalWeightKg,
            providerQuoteId: courier?.providerQuoteId,
            providerQuote: courier?.providerQuote,
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

            {/* LEFT COLUMN */}
            <div className="lg:col-span-2 space-y-6">

              {/* 1. Delivery & Pickup Locations */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <MapPin size={20} className="text-[#00a63e]" /> Delivery & Pickup Locations
                  </h2>
                  <button
                    onClick={() => setIsCustomAddressModalOpen(true)}
                    className="text-xs font-bold bg-green-50 text-[#00a63e] hover:bg-green-100 px-3 py-2 rounded-xl border border-green-200 transition-all flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <PlusCircle size={14} /> Ship to another location
                  </button>
                </div>

                {/* State Quick Toggle */}
                <div className="mb-6 p-4 bg-green-50/50 border border-green-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-green-800">
                      Destination State Calculation
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">Rates dynamically re-calculate for target destination state.</p>
                  </div>
                  <div className="relative min-w-[200px]">
                    <select
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 appearance-none focus:outline-none focus:border-[#00a63e] cursor-pointer shadow-sm pr-8"
                    >
                      <option value="">Select state</option>
                      {NIGERIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Pickup is rendered first; delivery remains the buyer's
                    selected address. They must never share the same card data. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Store size={17} className="text-blue-600" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-blue-900">Pickup from seller</h3>
                    </div>
                    <div className="space-y-3">
                      {sellerLocations.length > 0 ? sellerLocations.map((location) => (
                        <div key={location.id} className="rounded-xl border border-blue-100 bg-white p-4">
                          <p className="font-bold text-sm text-gray-900">{location.storeName}</p>
                          <p className="mt-2 text-xs leading-relaxed text-gray-600">
                            <span className="font-medium text-gray-800">Address:</span>{" "}
                            {[location.address, location.city, location.lga, location.state].filter(Boolean).join(", ") || "Seller pickup address not provided"}
                          </p>
                          {location.phone && <p className="mt-1 text-xs text-gray-600"><span className="font-medium text-gray-800">Phone:</span> {location.phone}</p>}
                          {(location.latitude !== undefined && location.longitude !== undefined) && (
                            <p className="mt-1 text-[10px] text-gray-400">
                              Coordinates: {location.latitude}, {location.longitude}
                            </p>
                          )}
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-blue-200 bg-white p-4 text-xs text-blue-800">
                          Seller pickup address is not available for this item.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin size={17} className="text-[#00a63e]" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">Deliver to buyer</h3>
                      </div>
                      <button
                        onClick={() => addresses.length > 0 ? setIsEditModalOpen(true) : setIsCustomAddressModalOpen(true)}
                        className="text-[11px] font-bold text-[#00a63e] hover:underline flex items-center gap-0.5"
                      >
                        <Edit3 size={11} /> {addresses.length > 0 ? "Edit" : "Add address"}
                      </button>
                    </div>

                    {addresses.length > 0 ? addresses.map((addr) => (
                      <div
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`relative rounded-2xl border-2 p-5 transition-all flex flex-col cursor-pointer ${selectedAddressId === addr.id
                          ? "border-[#00a63e] bg-green-50/30"
                          : "border-gray-100 hover:border-gray-200 bg-white"
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedAddressId === addr.id ? "border-[#00a63e]" : "border-gray-300"
                            }`}>
                            {selectedAddressId === addr.id && <div className="w-2 h-2 rounded-full bg-[#00a63e]" />}
                          </div>
                          <div className="min-w-0 text-xs text-gray-600 space-y-1">
                            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#00a63e]/10 text-[#00a63e]">
                              {addr.label}
                            </span>
                            <p className="font-bold text-sm text-gray-900">{addr.name || "Buyer"}</p>
                            <p className="text-gray-500 leading-relaxed"><span className="font-medium text-gray-700">Address:</span> {addr.address || "Not provided"}</p>
                            {addr.state && <p className="text-gray-500"><span className="font-medium text-gray-700">State:</span> {addr.state}</p>}
                            {addr.lga && <p className="text-gray-500"><span className="font-medium text-gray-700">LGA:</span> {addr.lga}</p>}
                            {addr.phone && <p className="text-gray-500"><span className="font-medium text-gray-700">Phone:</span> {addr.phone}</p>}
                            {(addr.latitude !== undefined && addr.longitude !== undefined) && (
                              <p className="text-[10px] text-gray-400">Coordinates: {addr.latitude}, {addr.longitude}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-xs leading-relaxed text-gray-500">
                        No delivery address is saved to this buyer account. Add one before continuing.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 2. Available Shipping Options */}
              <section className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Truck size={20} className="text-[#00a63e]" /> Available Shipping Options ({selectedState})
                </h2>
                <div className="space-y-6">
                  {Object.entries(groupedCartItems).map(([storeId, group]: [string, any]) => (
                    <div key={storeId} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4">
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

                      <ShippingSelector
                        selectedState={selectedState}
                        totalWeightKg={group.totalWeightKg}
                        pickupAddress={sellerLocations.find((location) => location.id === storeId)}
                        destinationAddress={selectedBuyerAddress}
                        estimatedOrderAmount={group.subtotal}
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
                      Your funds are held securely in our escrow account. <span className="font-semibold text-gray-900">Do not release funds</span> until you have received and inspected your items.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-1">
              <div className="sticky top-6 bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-6">

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

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Cart Subtotal</span>
                      <span className="font-bold text-gray-900">₦{cartSubtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Shipping ({selectedState})</span>
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

      {/* 1. Edit Default Profile Address Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isSavingAddress && setIsEditModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[24px] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Edit Default Address</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="Street Address" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="City" />
                <select
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                >
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]" placeholder="Phone Number" />
              <div>
                <p className="text-xs font-bold text-gray-700 mb-1">Map Coordinates <span className="font-normal text-gray-400">(required for delivery)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    required
                    value={editForm.latitude}
                    onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                    placeholder="Latitude e.g. 6.601838"
                  />
                  <input
                    type="number"
                    step="any"
                    required
                    value={editForm.longitude}
                    onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                    placeholder="Longitude e.g. 3.351486"
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Get these from Google Maps by right-clicking the exact pickup or delivery point.</p>
              </div>
              <button onClick={handleSaveDefaultAddress} disabled={isSavingAddress} className="w-full bg-[#00a63e] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
                {isSavingAddress ? <><Loader2 className="animate-spin" size={18} /> Saving...</> : <><Save size={18} /> Save Address</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Ship to Another Location Modal Form */}
      {isCustomAddressModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCustomAddressModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-[24px] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Ship to Another Location</h2>
              <button onClick={() => setIsCustomAddressModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCustomAddress} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={customAddressForm.name}
                  onChange={(e) => setCustomAddressForm({ ...customAddressForm, name: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                  placeholder="Full Name"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={customAddressForm.phone}
                  onChange={(e) => setCustomAddressForm({ ...customAddressForm, phone: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                  placeholder="+234..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Street Address *</label>
                <input
                  type="text"
                  required
                  value={customAddressForm.address}
                  onChange={(e) => setCustomAddressForm({ ...customAddressForm, address: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                  placeholder="House number, Street name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">State *</label>
                  <select
                    value={customAddressForm.state}
                    onChange={(e) => setCustomAddressForm({ ...customAddressForm, state: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                  >
                    <option value="">Select state</option>
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">LGA *</label>
                  <input
                    type="text"
                    required
                    value={customAddressForm.lga}
                    onChange={(e) => setCustomAddressForm({ ...customAddressForm, lga: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                    placeholder="e.g. Jos North"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Map Coordinates *</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    required
                    value={customAddressForm.latitude}
                    onChange={(e) => setCustomAddressForm({ ...customAddressForm, latitude: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                    placeholder="Latitude e.g. 6.579"
                  />
                  <input
                    type="number"
                    step="any"
                    required
                    value={customAddressForm.longitude}
                    onChange={(e) => setCustomAddressForm({ ...customAddressForm, longitude: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-[#00a63e]"
                    placeholder="Longitude e.g. 3.349"
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Use the exact point from Google Maps for accurate delivery pricing.</p>
              </div>

              <button
                type="submit"
                className="w-full bg-[#00a63e] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-2"
              >
                <Save size={18} /> Use This Shipping Address
              </button>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
