"use client";
import React, { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import {
  Crown, CheckCircle2, TrendingUp, Loader2, Sparkles,
  Calendar, Wallet, Percent, ArrowRight, AlertCircle,
  MessageSquare, Eye
} from "lucide-react";
import { showToast } from "@/lib/toast";

export default function PartnerTab({ storeId }: { storeId: string }) {
  const [storeData, setStoreData] = useState<any>(null);
  const [monthlySales, setMonthlySales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  // Fetch Store Data & Monthly Sales
  useEffect(() => {
    const unsubStore = onSnapshot(doc(db, "stores", storeId), (snap) => {
      if (snap.exists()) setStoreData(snap.data());
      setLoading(false);
    });

    // Calculate total sales for the current month
    const fetchMonthlySales = async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const q = query(
        collection(db, "orders"),
        where("storeId", "==", storeId),
        where("status", "in", ["COMPLETED", "SHIPPED", "PAID_HELD"]), // Added PAID_HELD to show pending escrow sales
        where("createdAt", ">=", startOfMonth)
      );
      const snap = await getDocs(q);
      const total = snap.docs.reduce((acc, doc) => {
        const data = doc.data();
        // ✅ FIX: Fallback to 'total' for new multi-seller orders
        return acc + (data.totalAmount ?? data.total ?? 0);
      }, 0);
      setMonthlySales(total);
    };
    fetchMonthlySales();

    return () => unsubStore();
  }, [storeId]);

  // ✅ FIX: Robust Partner Check matching the Checkout API logic
  const isPartner =
    storeData?.isPartner === true ||
    storeData?.subscriptionPlan === "pro_max" ||
    String(storeData?.subscriptionPlan || "").toLowerCase().includes("max");

  // Fallback to subscriptionExpiry if partnerExpiry isn't set yet
  const partnerExpiry = storeData?.partnerExpiry ? new Date(storeData.partnerExpiry) : (storeData?.subscriptionExpiry ? new Date(storeData.subscriptionExpiry) : null);

  // Calculate Savings
  const standardFees = monthlySales * 0.03; // 3% total (1.5% platform + 1.5% seller)
  const partnerFees = monthlySales * 0.015; // 1.5% platform only
  const monthlySavings = standardFees - partnerFees;

  // Handle Subscription
  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const idToken = await user.getIdToken();

      const res = await fetch("/api/partner/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize payment");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("Checkout URL not received from server");
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      showToast("error", `Error: ${err.message}. Please try again.`);
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#00a63e]" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Partner Program</h2>
        <p className="text-sm text-gray-500 mt-1">Sell more. Save more. Grow more.</p>
      </div>

      {/* Partner Status Banner */}
      {isPartner ? (
        <div className="bg-gradient-to-r from-[#00a63e] to-green-700 rounded-[24px] p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Crown size={32} className="text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">You are a Partner!</h3>
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </span>
                </div>
                <p className="text-green-50 text-sm mt-1">
                  Thank you for being a valued Partner. You're enjoying 0% seller commission and premium benefits.
                </p>
                {partnerExpiry && (
                  <p className="text-green-50 text-xs mt-2 flex items-center gap-1">
                    <Calendar size={12} />
                    Valid until {partnerExpiry.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="px-6 py-2.5 bg-white text-[#00a63e] font-bold rounded-xl text-sm hover:bg-green-50 transition-colors shadow-sm disabled:opacity-50"
            >
              {subscribing ? <Loader2 className="animate-spin" size={16} /> : "Manage Subscription"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-[24px] p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Crown size={32} className="text-amber-100" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Become a Marketplace Partner</h3>
                <p className="text-amber-50 text-sm mt-1">
                  Save 1.5% on every transaction. Perfect for growing businesses.
                </p>
              </div>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="px-6 py-2.5 bg-white text-orange-600 font-bold rounded-xl text-sm hover:bg-amber-50 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {subscribing ? <Loader2 className="animate-spin" size={16} /> : (
                <>
                  Get Started <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Benefits Grid */}
      <div>
        <h3 className="font-bold text-gray-900 mb-4">Your Partner Benefits</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-3">
              <Percent size={24} className="text-[#00a63e]" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">0% Seller Fees</h4>
            <p className="text-xs text-gray-500">Pay only the 1.5% platform fee instead of 3% total</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
              <Crown size={24} className="text-amber-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">Partner Badge</h4>
            <p className="text-xs text-gray-500">Get a verified Partner badge on your storefront</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
              <TrendingUp size={24} className="text-blue-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">Higher Visibility</h4>
            <p className="text-xs text-gray-500">Rank higher in search results and category listings</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-3">
              <MessageSquare size={24} className="text-purple-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">Priority Support</h4>
            <p className="text-xs text-gray-500">Get faster support whenever you need it</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-3">
              <Eye size={24} className="text-red-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">Advanced Analytics</h4>
            <p className="text-xs text-gray-500">Detailed insights to grow your store</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-3">
              <Sparkles size={24} className="text-orange-600" />
            </div>
            <h4 className="font-bold text-gray-900 text-sm mb-1">Boost Discounts</h4>
            <p className="text-xs text-gray-500">Enjoy discounts on Store Boost packages</p>
          </div>
        </div>
      </div>

      {/* Compare Your Savings Section */}
      <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-2">Compare Your Savings</h3>
        <p className="text-xs text-gray-500 mb-6">Estimate your monthly savings as a Partner</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Sales Input */}
          <div className="space-y-3 lg:col-span-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monthly Sales (₦)</label>
            <input
              type="number"
              value={monthlySales || ""}
              onChange={(e) => setMonthlySales(Number(e.target.value))}
              placeholder="Enter your monthly sales"
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#00a63e] transition-all"
            />
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setMonthlySales(100000)} className="flex-1 py-2.5 bg-[#00a63e] hover:bg-green-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md">100K</button>
              <button onClick={() => setMonthlySales(1000000)} className="flex-1 py-2.5 bg-[#00a63e] hover:bg-green-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md">₦1M</button>
              <button onClick={() => setMonthlySales(5000000)} className="flex-1 py-2.5 bg-[#00a63e] hover:bg-green-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md">₦5M</button>
              <button onClick={() => setMonthlySales(10000000)} className="flex-1 py-2.5 bg-[#00a63e] hover:bg-green-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md">10M+</button>
            </div>
          </div>

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:col-span-2">
            {/* Standard Seller Card */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 hover:bg-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-default">
              <h4 className="font-bold text-gray-900 text-xs mb-3">Standard Seller</h4>
              <p className="text-[10px] text-gray-500 mb-3">3% Total Fees</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Platform Fee (1.5%)</span>
                  <span className="font-bold">₦{(monthlySales * 0.015).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Seller Commission (1.5%)</span>
                  <span className="font-bold">₦{(monthlySales * 0.015).toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex justify-between">
                    <span className="font-bold text-red-600">Total Fees</span>
                    <span className="font-bold text-red-600">₦{standardFees.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner Seller Card */}
            <div className={`rounded-2xl p-4 border hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-default ${isPartner ? 'bg-green-50 border-green-200 hover:bg-green-100' : 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
              }`}>
              <h4 className={`font-bold text-xs mb-3 ${isPartner ? 'text-green-900' : 'text-amber-900'}`}>
                Partner Seller {isPartner && <CheckCircle2 size={12} className="inline ml-1 text-green-600" />}
              </h4>
              <p className="text-[10px] text-gray-500 mb-3">1.5% Total Fees</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Platform Fee (1.5%)</span>
                  {/* ✅ FIX: Added missing ₦ symbol */}
                  <span className="font-bold">₦{(monthlySales * 0.015).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Seller Commission</span>
                  <span className={`font-bold ${isPartner ? 'text-green-600' : 'text-amber-600'}`}>
                    {isPartner ? '₦0 (Waived)' : `₦{(monthlySales * 0.015).toLocaleString()}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-200/50">
                  <div className="flex justify-between">
                    <span className={`font-bold ${isPartner ? 'text-green-700' : 'text-amber-700'}`}>Total Fees</span>
                    <span className={`font-bold ${isPartner ? 'text-green-700' : 'text-amber-700'}`}>
                      ₦{partnerFees.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Savings Highlight */}
        {monthlySales > 0 && (
          <div className={`mt-6 p-5 rounded-2xl border flex items-center justify-between ${isPartner ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isPartner ? 'bg-green-100' : 'bg-amber-100'}`}>
                <Wallet size={20} className={isPartner ? 'text-green-600' : 'text-amber-600'} />
              </div>
              <div>
                <p className={`font-bold ${isPartner ? 'text-green-900' : 'text-amber-900'}`}>
                  You Save
                </p>
                <p className={`text-xs ${isPartner ? 'text-green-700' : 'text-amber-700'}`}>
                  {isPartner ? 'every month as a Partner' : 'every month as a Partner'}
                </p>
              </div>
            </div>
            <p className={`text-2xl font-black ${isPartner ? 'text-green-600' : 'text-amber-600'}`}>
              ₦{monthlySavings.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-6">How Partner Program Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#00a63e] text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Subscribe</h4>
              <p className="text-xs text-gray-500 mt-1">Choose a Partner plan that suits you.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#00a63e] text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Save on Fees</h4>
              <p className="text-xs text-gray-500 mt-1">Get 1.5% off on every transaction.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#00a63e] text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">3</div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Grow Your Store</h4>
              <p className="text-xs text-gray-500 mt-1">Enjoy premium benefits and grow faster.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#00a63e] text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">4</div>
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Earn More</h4>
              <p className="text-xs text-gray-500 mt-1">Keep more of what you earn.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Info */}
      {!isPartner && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-[24px] border border-amber-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-xl">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">Simple Pricing</h4>
                <p className="text-xs text-gray-600 mt-1">
                  ₦10,000/month • Cancel anytime • No hidden fees
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Break even with just ₦667,000 in monthly sales. Above that, it's pure profit!
                </p>
              </div>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50 transition-all"
            >
              {subscribing ? <Loader2 className="animate-spin" size={16} /> : "Become a Partner"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}