"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Check, X, ArrowRight, ShieldCheck, Zap, 
  Crown, ChevronDown, Loader2,
  BarChart, MessageSquare, TrendingUp, Users, Star
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

interface BoostDuration {
  days: number;
  label: string;
  discount: number;
  popular?: boolean;
  description: string;
}

interface BoostPackage {
  id: string;
  name: string;
  basePrice: number;
  interval: "day" | "week";
  description: string;
  features: string[];
  cta: string;
  variant: "outline" | "primary" | "dark";
  popular: boolean;
}

const BOOST_DURATIONS: BoostDuration[] = [
  { days: 1, label: "1 Day", discount: 0, description: "Quick visibility boost" },
  { days: 3, label: "3 Days", discount: 0.10, description: "Short campaign" },
  { days: 7, label: "7 Days", discount: 0.17, popular: true, description: "Most popular • Best value" },
  { days: 14, label: "14 Days", discount: 0.25, description: "Extended campaign" }
];

const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: "micro",
    name: "Micro Boost",
    basePrice: 999,
    interval: "day",
    description: "Perfect for testing the waters",
    features: [
      "Featured in Trending Stores carousel",
      "+15% search ranking boost",
      "Basic analytics (views, WhatsApp clicks)",
      "Cancel anytime"
    ],
    cta: "Boost Now",
    variant: "outline",
    popular: false
  },
  {
    id: "pro",
    name: "Pro Boost",
    basePrice: 4999,
    interval: "day",
    description: "For growing businesses",
    features: [
      "Everything in Micro Boost",
      "Push notification to nearby buyers (5km)",
      "WhatsApp broadcast to opted-in buyers",
      "Priority placement in category listings",
      "Advanced analytics with conversion tracking"
    ],
    cta: "Boost Now",
    variant: "primary",
    popular: true
  },
  {
    id: "max",
    name: "Max Boost",
    basePrice: 14999,
    interval: "day",
    description: "Scale without limits",
    features: [
      "Everything in Pro Boost",
      "Homepage hero banner slot (rotating)",
      "Featured in Editor's Picks newsletter",
      "Dedicated social media shoutout",
      "A/B testing for boost copy/images",
      "Dedicated success manager chat"
    ],
    cta: "Boost Now",
    variant: "dark",
    popular: false
  }
];

const calculateBoostPrice = (basePrice: number, days: number, discount: number): number => {
  const total = basePrice * (days || 1);
  return Math.round(total * (1 - (discount || 0)));
};

interface NotificationState {
  show: boolean;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

interface ActiveBoost {
  id: string;
  status?: string;
  startDate?: string;
  expiryDate?: string;
  expiresAt?: string;
  packageName?: string;
}

interface BoostMetricPoint {
  date: string;
  label: string;
  views: number;
  clicks: number;
  inquiries: number;
}

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayDay(date: Date) {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export default function BoostPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBoost, setLoadingBoost] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [activeBoost, setActiveBoost] = useState<ActiveBoost | null>(null);
  const [boostMetrics, setBoostMetrics] = useState<BoostMetricPoint[]>([]);
  const [boostMetricsLoading, setBoostMetricsLoading] = useState(false);
  const [boostMetricsError, setBoostMetricsError] = useState("");
  
  const [selectedDurations, setSelectedDurations] = useState<Record<string, BoostDuration>>({
    micro: BOOST_DURATIONS[2],
    pro: BOOST_DURATIONS[2],
    max: BOOST_DURATIONS[2]
  });
  
  const [autoRenew, setAutoRenew] = useState<Record<string, boolean>>({
    micro: true,
    pro: true,
    max: true
  });
  
  const [storeData, setStoreData] = useState<any>(null);

  useEffect(() => {
    // 1️⃣ Safety containment guard against uninitialized Firebase imports
    if (!auth) {
      console.error("🚨 Firebase Auth object configuration missing.");
      setLoading(false);
      return;
    }

    // 2️⃣ Master listener with isolated error try/catch pipelines
    const unsub = onAuthStateChanged(
      auth, 
      async (user) => {
        try {
          if (user) {
            setCurrentUser(user);
            if (db) {
              const storeSnap = await getDoc(doc(db, "stores", user.uid));
              if (storeSnap.exists()) {
                setStoreData(storeSnap.data());
              }
            }
          }
        } catch (e) {
          console.error("Failed to load store data over tunnel channel:", e);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error("Auth state observer threw exception:", error);
        setLoading(false);
      }
    );

    // 3️⃣ Safeguard: Break open freeze states after 3.5s if ngrok blocks long-polling streams
    const fallbackTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn("⚠️ Firebase connection delayed by proxy tunnel. Forcing UI thread activation.");
          return false;
        }
        return prev;
      });
    }, 3500);

    // 4️⃣ Safely read URL parameters without crashing initial hydration
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const status = params.get("status");
        
        if (status === "success" || params.get("confirmed") === "true") {
          showNotification(
            "success", 
            "Boost Activated Successfully!", 
            "Your store visibility index has been upgraded. Metrics will update shortly."
          );
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === "failed" || status === "cancelled") {
          showNotification(
            "error", 
            "Payment Unsuccessful", 
            "The transaction was rejected or cancelled. Please try again."
          );
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        console.error("Error evaluating search parameters:", err);
      }
    }

    return () => {
      unsub();
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const showNotification = (type: "success" | "error" | "info", title: string, message: string): void => {
    setNotification({ show: true, type, title, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load the vendor's current boost so the metrics section only exposes
  // performance data while a paid boost is active.
  useEffect(() => {
    if (!currentUser) {
      setActiveBoost(null);
      return;
    }

    const boostsQuery = query(collection(db, "boosts"), where("storeId", "==", currentUser.uid));
    return onSnapshot(
      boostsQuery,
      (snapshot) => {
        const now = Date.now();
        const active = snapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() as Omit<ActiveBoost, "id">) }))
          .filter((boost) => {
            const status = String(boost.status || "").toLowerCase();
            const expiry = dateValue(boost.expiryDate || boost.expiresAt);
            return status === "active" && (!expiry || expiry.getTime() > now);
          })
          .sort((left, right) => (dateValue(right.startDate)?.getTime() || 0) - (dateValue(left.startDate)?.getTime() || 0));

        setActiveBoost(active[0] || null);
      },
      (error) => {
        console.error("Active boost listener error:", error);
        setActiveBoost(null);
        setBoostMetricsError("Boost performance data could not be loaded.");
      },
    );
  }, [currentUser]);

  // Aggregate the store's immutable analytics events into daily chart points
  // for the currently active boost period.
  useEffect(() => {
    if (!currentUser || !activeBoost) {
      setBoostMetrics([]);
      setBoostMetricsLoading(false);
      return;
    }

    setBoostMetricsLoading(true);
    setBoostMetricsError("");
    const start = dateValue(activeBoost.startDate) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const configuredEnd = dateValue(activeBoost.expiryDate || activeBoost.expiresAt);
    const end = configuredEnd && configuredEnd.getTime() < Date.now() ? configuredEnd : new Date();
    const chartStart = new Date(start);
    chartStart.setUTCHours(0, 0, 0, 0);
    const chartEnd = new Date(Math.max(chartStart.getTime(), end.getTime()));
    chartEnd.setUTCHours(0, 0, 0, 0);

    const points = new Map<string, BoostMetricPoint>();
    for (let cursor = new Date(chartStart); cursor <= chartEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = new Date(cursor);
      points.set(dayKey(date), { date: dayKey(date), label: displayDay(date), views: 0, clicks: 0, inquiries: 0 });
    }

    const analyticsQuery = query(collection(db, "analytics"), where("storeId", "==", currentUser.uid));
    return onSnapshot(
      analyticsQuery,
      (snapshot) => {
        snapshot.docs.forEach((item) => {
          const data = item.data();
          const timestamp = dateValue(data.timestamp);
          if (!timestamp || timestamp < start || timestamp > end) return;
          const point = points.get(dayKey(timestamp));
          if (!point) return;

          if (data.eventType === "view") point.views += 1;
          if (data.eventType === "click" || data.eventType === "buy_now_click") point.clicks += 1;
          if (data.eventType === "whatsapp_click") point.inquiries += 1;
        });

        setBoostMetrics(Array.from(points.values()));
        setBoostMetricsLoading(false);
      },
      (error) => {
        console.error("Boost analytics listener error:", error);
        setBoostMetrics([]);
        setBoostMetricsLoading(false);
        setBoostMetricsError("Boost performance data could not be loaded.");
      },
    );
  }, [currentUser, activeBoost]);

  const handleDurationSelect = (packageId: string, duration: BoostDuration) => {
    setSelectedDurations(prev => ({ ...prev, [packageId]: duration }));
  };

  const handleBoostCheckout = async (pkg: BoostPackage) => {
    if (!currentUser) {
      const duration = selectedDurations[pkg.id] || BOOST_DURATIONS[0];
      router.push(`/login?redirect=/boost-store&package=${pkg.id}&duration=${duration.days}`);
      return;
    }
    
    const duration = selectedDurations[pkg.id] || BOOST_DURATIONS[0];
    const renew = autoRenew[pkg.id] ?? true;
    
    setLoadingBoost(pkg.id);
    
    try {
      const idToken = await currentUser.getIdToken();
      
      const monthlyBasePrice = pkg.basePrice;
      const totalBasePrice = monthlyBasePrice * duration.days;
      const finalPrice = calculateBoostPrice(monthlyBasePrice, duration.days, duration.discount);
      const savingsAmount = totalBasePrice - finalPrice;
      
      console.log('🚀 Boost checkout details:', {
        packageId: pkg.id,
        packageName: pkg.name,
        dailyBasePrice: monthlyBasePrice,
        durationDays: duration.days,
        durationLabel: duration.label,
        totalBasePrice,
        discount: duration.discount,
        discountPercentage: Math.round(duration.discount * 100),
        finalPrice,
        savingsAmount,
        autoRenew: renew
      });

      const response = await fetch("/api/premium/boost-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          planId: pkg.id,
          planName: pkg.name,
          durationDays: duration.days,
          durationLabel: duration.label,
          dailyBasePrice: monthlyBasePrice,
          basePrice: totalBasePrice,
          finalPrice: finalPrice, 
          discount: duration.discount,
          discountPercentage: Math.round(duration.discount * 100),
          savingsAmount: savingsAmount,
          autoRenew: renew,
          userId: currentUser.uid,
          userEmail: currentUser.email,
          storeName: storeData?.storeName || 'Unknown Store',
          returnUrl: `${window.location.origin}/payment/boost-success`,
          
          amount: finalPrice,
          email: currentUser.email,
          customerEmail: currentUser.email,
          callbackUrl: `${window.location.origin}/payment/boost-success`,
          redirectUrl: `${window.location.origin}/payment/boost-success`,
          
          metadata: {
            isBoost: true,
            boostType: pkg.id,
            boostName: pkg.name,
            durationDays: duration.days,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            storeName: storeData?.storeName || 'Unknown Store'
          }
        })
      });
      
      const data = await response.json();
      const checkoutUrl = data.checkoutUrl || data.checkoutLink || data.data?.checkoutUrl;
      
      if (!response.ok || !checkoutUrl) {
        throw new Error(data.error || data.description || data.message || "Failed to create checkout session");
      }
      
      showNotification(
        "info", 
        "Redirecting to Payment", 
        `Complete your payment of ₦${finalPrice.toLocaleString()} for ${pkg.name} (${duration.label})`
      );
      
      window.location.assign(checkoutUrl);
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      console.error("Boost checkout failed:", error);
      showNotification("error", "Payment Initialization Failed", message);
    } finally {
      setLoadingBoost(null);
    }
  };

  if (loading) {
    return (
      <div className={`${font.className} min-h-screen flex items-center justify-center bg-white`}>
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  return (
    <div className={`${font.className} min-h-screen flex flex-col bg-white`}>
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white pt-20 pb-16 px-4 text-center">
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            <div className="absolute top-10 left-10 w-72 h-72 bg-green-200 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-200 rounded-full blur-3xl" />
          </div>
          
          <div className="relative z-10 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
              <Zap size={12} /> Get More Visibility
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-4 leading-tight">
              Boost Your Store <span className="text-green-600">Today</span>
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Reach more buyers, get more WhatsApp inquiries, and grow your sales with targeted promotions.
            </p>
          </div>
        </section>

        {/* Boost Packages */}
        <section className="max-w-7xl mx-auto px-4 pb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-gray-900 mb-3">Choose Your Boost</h2>
            <p className="text-gray-500">Select a package and duration to get started</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {BOOST_PACKAGES.map((pkg) => (
              <div 
                key={pkg.id}
                className={`relative p-8 rounded-[32px] border-2 transition-all hover:shadow-xl ${
                  pkg.variant === "primary" ? "border-green-600 bg-green-50/30 md:scale-[1.03] md:z-10" :
                  pkg.variant === "dark" ? "border-gray-900 bg-gray-900 text-white" :
                  "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                {pkg.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg">
                    Most Popular
                  </span>
                )}
                
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-xl font-black ${pkg.variant === "dark" ? "text-white" : "text-gray-900"}`}>{pkg.name}</h3>
                    {pkg.id === "max" && <Crown size={16} className="text-yellow-400 fill-yellow-400" />}
                  </div>
                  <p className={`text-sm ${pkg.variant === "dark" ? "text-gray-300" : "text-gray-500"}`}>{pkg.description}</p>
                </div>

                <DurationSelector
                  basePrice={pkg.basePrice}
                  selectedDuration={selectedDurations[pkg.id] || BOOST_DURATIONS[0]}
                  onSelect={(duration) => handleDurationSelect(pkg.id, duration)}
                  isDark={pkg.variant === "dark"}
                />

                <AutoRenewToggle
                  enabled={autoRenew[pkg.id] ?? true}
                  onToggle={() => setAutoRenew(prev => ({ 
                    ...prev, 
                    [pkg.id]: !(prev[pkg.id] ?? true) 
                  }))}
                  duration={selectedDurations[pkg.id] || BOOST_DURATIONS[0]}
                  isDark={pkg.variant === "dark"}
                />

                <div className="mb-8">
                  <span className={`text-4xl font-black ${pkg.variant === "dark" ? "text-white" : "text-gray-900"}`}>
                    ₦{calculateBoostPrice(
                      pkg.basePrice, 
                      (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days,
                      (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).discount
                    ).toLocaleString()}
                  </span>
                  <span className={`text-sm ml-1 ${pkg.variant === "dark" ? "text-gray-200" : "text-gray-500"}`}>
                    total
                  </span>
                  <p className={`text-[10px] ${pkg.variant === "dark" ? "text-gray-300" : "text-gray-400"} mt-1`}>
                    ≈ ₦{Math.round(
                      calculateBoostPrice(
                        pkg.basePrice,
                        (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days,
                        (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).discount
                      ) / ((selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days || 1)
                    ).toLocaleString()}/day
                  </p>
                </div>

                <ul className="space-y-3 mb-8">
                  {pkg.features.map((feat: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check size={16} className="text-green-600 mt-0.5 shrink-0" />
                      <span className={pkg.variant === "dark" ? "text-gray-100" : "text-gray-700"}>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleBoostCheckout(pkg)}
                  disabled={loadingBoost === pkg.id}
                  className={`w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${
                    pkg.variant === "primary" ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200" :
                    pkg.variant === "dark" ? "bg-white hover:bg-gray-100 text-gray-900" :
                    "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {loadingBoost === pkg.id ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing...</>
                  ) : (
                    <>
                      {pkg.cta}
                      { (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days > 1 && (
                        <span className="text-[10px] opacity-80">
                          {(selectedDurations[pkg.id] || BOOST_DURATIONS[0]).label}
                        </span>
                      )}
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
                
                {((selectedDurations[pkg.id] || BOOST_DURATIONS[0]).discount || 0) > 0 && (
                  <p className={`text-[10px] font-bold text-center mt-3 ${
                    pkg.variant === "dark" ? "text-green-300" : "text-green-600"
                  }`}>
                    Save ₦{(
                      pkg.basePrice * (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days - 
                      calculateBoostPrice(
                        pkg.basePrice,
                        (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).days,
                        (selectedDurations[pkg.id] || BOOST_DURATIONS[0]).discount
                      )
                    ).toLocaleString()} with {(selectedDurations[pkg.id] || BOOST_DURATIONS[0]).label}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Value Props */}
        <section className="max-w-5xl mx-auto px-4 pb-20">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { icon: TrendingUp, title: "More Visibility", desc: "Appear in trending stores & category top lists" },
              { icon: Users, title: "More Buyers", desc: "Reach nearby customers via push notifications" },
              { icon: Star, title: "More Trust", desc: "Featured stores get 3.2x more inquiries" }
            ].map((prop, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                  <prop.icon size={20} />
                </div>
                <h3 className="mb-2 font-bold text-gray-900">{prop.title}</h3>
                <p className="text-sm text-gray-500">{prop.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Live Analytics */}
        <section className="bg-gray-50 px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-black text-gray-900">Track Your Results</h2>
              <p className="text-gray-500">Monitor your boost performance in real-time</p>
            </div>

            <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              {!currentUser ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                  <ShieldCheck className="mx-auto text-gray-300" size={30} />
                  <p className="mt-3 text-sm font-bold text-gray-700">Sign in to view boost performance</p>
                  <p className="mt-1 text-xs text-gray-500">Your live views, clicks, and inquiries appear here after activation.</p>
                </div>
              ) : !activeBoost ? (
                <div className="rounded-2xl border border-dashed border-green-200 bg-green-50/50 p-10 text-center">
                  <Zap className="mx-auto text-green-500" size={30} />
                  <p className="mt-3 text-sm font-bold text-gray-800">Activate a boost plan to unlock live metrics</p>
                  <p className="mt-1 text-xs text-gray-500">Once payment is confirmed, your boost performance chart will appear here.</p>
                </div>
              ) : boostMetricsLoading ? (
                <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-green-600" size={30} /></div>
              ) : (
                <>
                  <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-widest text-green-600">{activeBoost.packageName || "Active boost"}</p><p className="mt-1 text-xs text-gray-500">Live data since {dateValue(activeBoost.startDate)?.toLocaleDateString("en-NG") || "activation"}</p></div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-[10px] font-black uppercase text-green-700"><span className="h-2 w-2 animate-pulse rounded-full bg-green-600" /> Active</span>
                  </div>

                  {boostMetricsError && <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs font-medium text-amber-700">{boostMetricsError}</div>}

                  <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {[{ label: "Views", value: boostMetrics.reduce((total, point) => total + point.views, 0), icon: BarChart }, { label: "Clicks", value: boostMetrics.reduce((total, point) => total + point.clicks, 0), icon: ArrowRight }, { label: "Inquiries", value: boostMetrics.reduce((total, point) => total + point.inquiries, 0), icon: MessageSquare }].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-gray-50 p-4 text-center"><stat.icon size={20} className="mx-auto mb-2 text-gray-400" /><p className="text-2xl font-black text-gray-900">{stat.value.toLocaleString()}</p><p className="text-sm text-gray-500">{stat.label}</p></div>
                    ))}
                  </div>

                  {boostMetrics.length === 0 ? (
                    <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-center"><p className="text-sm text-gray-400">No performance events have been recorded yet.</p></div>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={boostMetrics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                          <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #e5e7eb", fontSize: "11px" }} />
                          <Line type="monotone" dataKey="views" name="Views" stroke="#22c55e" strokeWidth={3} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="inquiries" name="Inquiries" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black text-gray-900 mb-3">Frequently Asked Questions</h2>
              <p className="text-gray-500">Everything you need to know about boosting</p>
            </div>
            <div className="space-y-4">
              {[
                { q: "How long does it take for my boost to start?", a: "Your boost activates immediately after payment confirmation. You'll see increased visibility within 5-10 minutes." },
                { q: "Can I cancel my boost early?", a: "Yes! You can cancel anytime. If you cancel before the boost period ends, you'll receive a prorated refund." },
                { q: "What if I don't see results?", a: "We offer a satisfaction guarantee. If your boost doesn't generate at least 500 views, we'll re-boost for free." },
                { q: "Can I boost multiple stores?", a: "Yes! Each store needs its own boost subscription. Manage all your boosts from the dashboard." }
              ].map((faq, i) => (
                <FAQItem key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-16">
          <div className="max-w-4xl mx-auto bg-gradient-to-r from-green-600 to-green-700 rounded-[32px] p-10 text-white shadow-2xl text-center">
            <Zap size={48} className="mx-auto mb-4 opacity-80" />
            <h2 className="text-2xl md:text-3xl font-black mb-4">Ready to Grow Your Store?</h2>
            <p className="text-green-100 mb-8 max-w-lg mx-auto">
              Join thousands of vendors who've increased their sales with targeted boosts.
            </p>
            <button 
              onClick={() => {
                if (!currentUser) {
                  router.push("/login?redirect=/boost-store");
                } else {
                  document.querySelector('section:nth-child(3)')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="px-8 py-4 bg-white text-green-700 rounded-2xl font-bold text-sm hover:scale-105 transition-transform flex items-center gap-2 mx-auto"
            >
              {currentUser ? "Select Your Boost" : "Sign In to Boost"} <ArrowRight size={16} />
            </button>
            <p className="text-[10px] text-green-200 mt-6 flex items-center justify-center gap-1">
              <ShieldCheck size={12} /> Secure payment via Nomba • Cancel anytime
            </p>
          </div>
        </section>
      </main>

      <Footer />

      {notification && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`flex items-start gap-3 p-4 rounded-2xl shadow-lg border max-w-sm ${
            notification.type === "success" ? "bg-green-50 border-green-100 text-green-800" :
            notification.type === "error" ? "bg-red-50 border-red-100 text-red-800" :
            "bg-blue-50 border-blue-100 text-blue-800"
          }`}>
            <div className={`p-1.5 rounded-lg ${
              notification.type === "success" ? "bg-green-100" :
              notification.type === "error" ? "bg-red-100" :
              "bg-blue-100"
            }`}>
              {notification.type === "success" ? <Check size={14} /> :
               notification.type === "error" ? <X size={14} /> :
               <ShieldCheck size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{notification.title}</p>
              <p className="text-xs mt-0.5 opacity-90">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DurationSelector({ 
  basePrice, 
  selectedDuration, 
  onSelect,
  isDark = false
}: { 
  basePrice: number; 
  selectedDuration: BoostDuration; 
  onSelect: (d: BoostDuration) => void;
  isDark?: boolean;
}) {
  return (
    <div className="mb-6">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-gray-300" : "text-gray-400"}`}>Boost Duration</p>
      <div className="grid grid-cols-2 gap-2">
        {BOOST_DURATIONS.map((option) => {
          const finalPrice = calculateBoostPrice(basePrice, option.days, option.discount);
          const dailyEquivalent = Math.round(finalPrice / (option.days || 1));
          const isSelected = selectedDuration?.days === option.days;
          
          return (
            <button
              key={option.days}
              type="button"
              onClick={() => onSelect(option)}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? isDark 
                    ? "border-blue-400 bg-blue-900/60 shadow-lg shadow-blue-500/20"
                    : "border-green-600 bg-green-50"
                  : `border-gray-100 hover:border-green-300 ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`
              } ${option.popular ? "ring-2 ring-green-200" : ""} ${!isSelected && isDark ? "bg-gray-800/50" : ""}`}
            >
              {option.popular && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-600 text-white text-[8px] font-bold rounded-full">
                  Best Value
                </span>
              )}
              
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${
                  isSelected && isDark ? "text-white" : isDark ? "text-white" : "text-gray-900"
                }`}>{option.label}</span>
                {option.discount > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isSelected && isDark
                      ? "text-blue-200 bg-blue-800/60"
                      : isDark ? "text-green-300 bg-green-900/50" : "text-green-600 bg-green-100"
                  }`}>
                    -{Math.round(option.discount * 100)}%
                  </span>
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className={`text-lg font-black ${
                  isSelected && isDark ? "text-white" : isDark ? "text-white" : "text-gray-900"
                }`}>₦{finalPrice.toLocaleString()}</span>
                <span className={`text-[10px] ${
                  isSelected && isDark ? "text-blue-200" : isDark ? "text-gray-300" : "text-gray-400"
                }`}>total</span>
              </div>
              
              <p className={`text-[9px] mt-0.5 ${
                isSelected && isDark ? "text-blue-200" : isDark ? "text-gray-300" : "text-gray-400"
              }`}>
                ≈ ₦{dailyEquivalent.toLocaleString()}/day
              </p>
              
              {option.discount > 0 && (
                <p className={`text-[9px] font-bold mt-1 ${
                  isSelected && isDark ? "text-blue-200" : isDark ? "text-green-300" : "text-green-600"
                }`}>
                  Save ₦{(basePrice * option.days - finalPrice).toLocaleString()}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AutoRenewToggle({ 
  enabled, 
  onToggle,
  duration,
  isDark = false
}: { 
  enabled: boolean; 
  onToggle: () => void;
  duration: BoostDuration;
  isDark?: boolean;
}) {
  return (
    <div className={`mb-6 p-4 rounded-2xl border ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Auto-renew boost</p>
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-300" : "text-gray-500"}`}>
            {enabled 
              ? `Renews every ${duration?.days || 1} ${(duration?.days || 1) === 1 ? 'day' : 'days'} • Cancel anytime` 
              : "Manual renewal • You'll be notified before expiry"
            }
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-green-600" : isDark ? "bg-gray-600" : "bg-gray-300"
          }`}
          aria-label={enabled ? "Disable auto-renew" : "Enable auto-renew"}
        >
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
            enabled ? "left-6" : "left-1"
          }`} />
        </button>
      </div>
      
      {enabled && (
        <div className={`mt-3 flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg ${
          isDark ? "text-green-300 bg-green-900/30" : "text-green-600 bg-green-50"
        }`}>
          <ShieldCheck size={12} />
          <span>Never lose visibility • 7-day grace period before expiry</span>
        </div>
      )}
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }): JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left font-bold text-gray-900 hover:bg-gray-50 transition-colors"
        aria-expanded={isOpen}
      >
        <span>{question}</span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
          {answer}
        </div>
      </div>
    </div>
  );
}
