"use client";

import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from "firebase/firestore";
import {
  Search, Package, Truck, CheckCircle2, Clock, AlertTriangle,
  MessageCircle, Star, RotateCcw, Flag, ChevronRight, ExternalLink,
  Loader2, X, Send
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { showToast } from "@/lib/toast";

export function BuyerPurchases() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

  // ✅ Review form state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // ✅ Report form state
  const [reportReason, setReportReason] = useState("item_not_received");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "orders"),
      where("buyerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      setPurchases(orders);
      setLoading(false);
    }, (error) => {
      console.error("Purchases fetch error:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredPurchases = purchases.filter(p => {
    const matchesFilter =
      filter === "all" ? true :
        filter === "completed" ? p.status === "COMPLETED" :
          filter === "pending" ? ["PAID_HELD", "SHIPPED"].includes(p.status) :
            filter === "disputed" ? p.status === "DISPUTED" : true;

    // ✅ FIX: Search now checks the new 'items' array as well as legacy 'productName'
    const matchesSearch = !searchQuery ||
      p.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.items?.some((item: any) => item.name?.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // ✅ Safer currency formatter to prevent NaN errors
  const formatCurrency = (amount: number | undefined | null) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(amount) || 0);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });

  const getStatusConfig = (status: string) => {
    const configs: any = {
      PAID_HELD: { label: "Secured", icon: Clock, color: "bg-orange-100 text-orange-700" },
      SHIPPED: { label: "Shipped", icon: Truck, color: "bg-blue-100 text-blue-700" },
      COMPLETED: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
      DISPUTED: { label: "Disputed", icon: AlertTriangle, color: "bg-red-100 text-red-700" },
      CANCELLED: { label: "Cancelled", icon: RotateCcw, color: "bg-gray-100 text-gray-700" }
    };
    return configs[status] || configs.PAID_HELD;
  };

  const openReviewModal = (purchase: any) => {
    setSelectedPurchase(purchase);
    setReviewRating(5);
    setReviewText("");
    setShowReviewModal(true);
  };

  const submitReview = async () => {
    if (!selectedPurchase || !auth.currentUser) return;
    if (!reviewText.trim()) {
      showToast("error", "Please write a review");
      return;
    }
    setReviewSubmitting(true);
    try {
      await addDoc(collection(db, "reviews"), {
        orderId: selectedPurchase.id,
        // ✅ FIX: Handle both legacy productId and new multi-item array
        productId: selectedPurchase.productId || selectedPurchase.items?.[0]?.productId,
        storeId: selectedPurchase.storeId,
        buyerId: auth.currentUser.uid,
        rating: reviewRating,
        comment: reviewText,
        createdAt: serverTimestamp(),
        verified: true
      });
      showToast("success", "Thank you for your review!");
      setShowReviewModal(false);
      setReviewText("");
    } catch (error) {
      console.error("Review submission error:", error);
      showToast("error", "Failed to submit review. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const openReportModal = (purchase: any) => {
    setSelectedPurchase(purchase);
    setReportReason("item_not_received");
    setReportDescription("");
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!selectedPurchase || !auth.currentUser) return;
    if (!reportDescription.trim()) {
      showToast("error", "Please describe the issue");
      return;
    }
    setReportSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderId: selectedPurchase.id, reason: reportReason, description: reportDescription, evidence: [] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create dispute");
      showToast("success", "Issue reported. Our team will review shortly.");
      setShowReportModal(false);
      setReportDescription("");
    } catch (error: any) {
      console.error("Report submission error:", error);
      showToast("error", `Failed to report: ${error.message || "Please try again."}`);
    } finally {
      setReportSubmitting(false);
    }
  };

  const getWhatsAppLink = (purchase: any) => {
    const phone = purchase.vendorPhone?.replace(/\D/g, '');
    // ✅ FIX: Fallback to "my order" if productName is missing (multi-item order)
    const itemName = purchase.productName || purchase.items?.[0]?.name || "my order";
    const message = `Hello ${purchase.storeName}, I have a question about my order #${purchase.id?.slice(-6)} for ${itemName}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const getProductLink = (purchase: any) => {
    const cleanUsername = purchase.storeUsername
      ? purchase.storeUsername.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
      : null;
    const usernameSlug = cleanUsername || purchase.storeId;
    // ✅ FIX: Fallback to store page if productId is missing (multi-item order)
    const productId = purchase.productId || purchase.items?.[0]?.productId;
    return productId ? `/${usernameSlug}/${productId}` : `/${usernameSlug}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white p-5 rounded-[32px] border border-gray-100 animate-pulse">
            <div className="flex gap-4">
              <div className="w-20 h-20 bg-gray-200 rounded-2xl" />
              <div className="flex-1 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-8 bg-gray-100 rounded w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header + Search + Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search your purchases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-[24px] text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { id: "all", label: "All" },
            { id: "pending", label: "Active" },
            { id: "completed", label: "Completed" },
            { id: "disputed", label: "Disputed" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${filter === tab.id
                ? "bg-green-600 text-white shadow-md"
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Purchases List */}
      <div className="space-y-4">
        {filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-[32px] p-8 border border-dashed border-gray-200 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package size={32} className="text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">
              {searchQuery ? "No matching purchases" : "No purchases yet"}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchQuery
                ? "Try a different search term."
                : "Items you buy will appear here with order tracking."
              }
            </p>
            {!searchQuery && (
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-2xl text-xs font-bold hover:bg-green-700 transition-all"
              >
                Start Shopping <ExternalLink size={14} />
              </Link>
            )}
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const { label, icon: StatusIcon, color } = getStatusConfig(purchase.status);
            const isCompleted = purchase.status === "COMPLETED";
            const isDisputed = purchase.status === "DISPUTED";

            // ✅ FIX: Normalize data for both legacy and new multi-seller schemas
            const displayProductName = purchase.productName || purchase.items?.[0]?.name || "Order Items";
            const displayProductImage = purchase.productImage || purchase.items?.[0]?.image;
            const displayTotal = Number(purchase.totalAmount ?? purchase.total ?? 0);
            const itemCount = purchase.items?.length || 1;

            return (
              <div
                key={purchase.id}
                className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Product Image */}
                  <div className="w-full sm:w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 relative">
                    {displayProductImage ? (
                      <Image
                        src={displayProductImage}
                        alt={displayProductName}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={32} className="text-gray-300" />
                    )}
                    {itemCount > 1 && (
                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        +{itemCount - 1}
                      </span>
                    )}
                  </div>

                  {/* Order Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm line-clamp-1">
                          {displayProductName}
                        </h4>
                        <p className="text-[11px] text-gray-400">
                          <Link
                            href={`/${(purchase.storeUsername || purchase.storeId)?.toLowerCase().trim().replace(/[^a-z0-9]/g, '') || purchase.storeId}`}
                            className="hover:text-green-600"
                          >
                            {purchase.storeName}
                          </Link>
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${color}`}>
                        <StatusIcon size={10} /> {label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 mb-3">
                      <span>Ordered: {formatDate(purchase.createdAt)}</span>
                      {purchase.trackingId && (
                        <span className="flex items-center gap-1">
                          <Truck size={10} /> ID: {purchase.trackingId}
                        </span>
                      )}
                      {isDisputed && (
                        <span className="text-red-600 font-bold flex items-center gap-1">
                          <AlertTriangle size={10} /> Under Review
                        </span>
                      )}
                    </div>
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/buyer/orders/${purchase.id}`}
                        className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl flex items-center gap-1"
                      >
                        View Details <ChevronRight size={12} />
                      </Link>
                      {purchase.status === "SHIPPED" && purchase.trackingUrl && (
                        <a
                          href={purchase.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl flex items-center gap-1"
                        >
                          <Truck size={12} /> Track Order
                        </a>
                      )}
                      {isCompleted && (
                        <button
                          onClick={() => openReviewModal(purchase)}
                          className="px-3 py-1.5 text-xs font-bold text-green-600 hover:bg-green-50 rounded-xl flex items-center gap-1"
                        >
                          <Star size={12} /> Leave Review
                        </button>
                      )}
                      {isCompleted && (
                        <Link
                          href={getProductLink(purchase)}
                          className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Reorder
                        </Link>
                      )}
                      {!isDisputed && purchase.status !== "CANCELLED" && (
                        <button
                          onClick={() => openReportModal(purchase)}
                          className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1"
                        >
                          <Flag size={12} /> Report Issue
                        </button>
                      )}
                      <a
                        href={getWhatsAppLink(purchase)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-bold text-[#25D366] hover:bg-[#25D366]/10 rounded-xl flex items-center gap-1"
                      >
                        <MessageCircle size={12} /> Chat
                      </a>
                    </div>
                  </div>

                  {/* Price + Buy Again CTA */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">Total Paid</p>
                      {/* ✅ FIX: Uses normalized displayTotal safely */}
                      <p className="text-lg font-black text-gray-900">{formatCurrency(displayTotal)}</p>
                    </div>
                    {isCompleted && (
                      <Link
                        href={getProductLink(purchase)}
                        className="px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-bold hover:bg-green-700 transition-colors whitespace-nowrap"
                      >
                        Buy Again
                      </Link>
                    )}
                  </div>
                </div>

                {/* Dispute Banner */}
                {isDisputed && purchase.disputeReason && (
                  <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-red-800">Dispute: {purchase.disputeReason}</p>
                        <p className="text-[10px] text-red-700 mt-1">{purchase.disputeDescription}</p>
                        {purchase.disputeVendorResponded && (
                          <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                            <CheckCircle2 size={10} /> Vendor Responded
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {filteredPurchases.length >= 50 && (
        <div className="text-center pt-4">
          <button className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 mx-auto">
            <RotateCcw size={12} /> Load older purchases
          </button>
        </div>
      )}

      {/* ✅ REVIEW MODAL */}
      {showReviewModal && selectedPurchase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Star size={20} className="text-yellow-500 fill-yellow-500" /> Leave a Review
              </h3>
              <button onClick={() => setShowReviewModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Share your experience with <strong>{selectedPurchase.productName || selectedPurchase.items?.[0]?.name || "your order"}</strong> from {selectedPurchase.storeName}.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-2 block">Your Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setReviewRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        size={24}
                        className={`${star <= reviewRating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1 block">Your Review</label>
                <textarea
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none min-h-[100px]"
                  placeholder="What did you like or dislike? Would you buy again?"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
              </div>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting || !reviewText.trim()}
                className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              >
                {reviewSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> Submitting...</>
                ) : (
                  <><Send size={18} /> Submit Review</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ REPORT ISSUE MODAL */}
      {showReportModal && selectedPurchase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Flag size={20} className="text-red-600" /> Report an Issue
              </h3>
              <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Describe the problem with your order. Our team will review and help resolve it.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1 block">Reason</label>
                <select
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 outline-none"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  <option value="item_not_received">Item Not Received</option>
                  <option value="damaged">Item Damaged</option>
                  <option value="wrong_item">Wrong Item Sent</option>
                  <option value="not_as_described">Not As Described</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-1 block">Description</label>
                <textarea
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 outline-none min-h-[100px]"
                  placeholder="Describe the issue in detail..."
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                />
              </div>
              <button
                onClick={submitReport}
                disabled={reportSubmitting || !reportDescription.trim()}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              >
                {reportSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> Submitting...</>
                ) : (
                  <><Flag size={18} /> Submit Report</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}