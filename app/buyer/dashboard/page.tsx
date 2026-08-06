"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, getDocs, updateDoc
} from "firebase/firestore";
import {
  LogOut, LayoutDashboard, Search, ShoppingBag,
  Settings, Loader2, User, CreditCard,
  ShieldCheck, Bell, ClipboardList, SlidersHorizontal,
  ShieldAlert, ArrowRight, Clock, Truck,
  CheckCircle2, AlertTriangle, TrendingUp, Star, MessageCircle, Store as StoreIcon, IdCard
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

// --- BUYER TABS ---
import { BuyerPurchases as PurchasesTab } from "@/components/buyer/BuyerPurchases";
import { BuyerOrders as OrdersTab } from "@/components/buyer/BuyerOrders";
import { BuyerAccount as AccountTab } from "@/components/buyer/BuyerAccount";
import { BuyerSettings as SettingsTab } from "@/components/buyer/BuyerSettings";
import { ExploreTab } from "@/components/buyer/ExploreTab";
import { BuyerDisputesTab } from "@/components/buyer/BuyerDisputesTab";
import { BuyerNotification } from "@/components/buyer/BuyerNotification";
// ⚠️ We will create this file in the next step once you supply your profile code!
import { BuyerProfile as ProfileTab } from "@/components/buyer/BuyerProfile";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function BuyerDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("home");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyerNotifications, setBuyerNotifications] = useState<any[]>([]);
  const [notificationStats, setNotificationStats] = useState({ unread: 0, total: 0 });
  const [buyerDisputes, setBuyerDisputes] = useState<any[]>([]);
  const [buyerDisputeStats, setBuyerDisputeStats] = useState({ open: 0, total: 0 });
  const [dashboardStats, setDashboardStats] = useState({
    totalOrders: 0,
    pendingDeliveries: 0,
    totalSpent: 0,
    favoriteStores: 0
  });

  useEffect(() => {
    let unsubscribeDisputes = () => { };
    let unsubscribeOrders = () => { };
    let unsubscribeNotifications = () => { };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "buyers", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }

          unsubscribeDisputes = onSnapshot(
            query(
              collection(db, "disputes"),
              where("buyerId", "==", user.uid),
              orderBy("createdAt", "desc"),
              limit(50)
            ),
            (snapshot) => {
              const disputes = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || new Date()
              }));

              setBuyerDisputes(disputes);
              setBuyerDisputeStats({
                open: disputes.filter(d => ["open", "under_review"].includes(d.status)).length,
                total: disputes.length
              });
            }
          );

          unsubscribeOrders = onSnapshot(
            query(
              collection(db, "orders"),
              where("buyerId", "==", user.uid),
              orderBy("createdAt", "desc"),
              limit(100)
            ),
            (snapshot) => {
              const orders = snapshot.docs.map(doc => doc.data());

              const totalOrders = orders.length;
              const pendingDeliveries = orders.filter(o =>
                ["PAID_HELD", "SHIPPED"].includes(o.status)
              ).length;
              const totalSpent = orders
                .filter(o => o.status === "COMPLETED")
                .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

              setDashboardStats({
                totalOrders,
                pendingDeliveries,
                totalSpent,
                favoriteStores: userData?.favoriteStores?.length || 0
              });
            }
          );

          unsubscribeNotifications = onSnapshot(
            query(
              collection(db, "notifications"),
              where("buyerId", "==", user.uid),
              where("read", "==", false),
              limit(100)
            ),
            (snapshot) => {
              const notifs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              setNotificationStats({
                unread: notifs.length,
                total: notifs.length
              });
            }
          );

        } catch (err) {
          console.error("Buyer fetch error:", err);
        } finally {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeDisputes();
      unsubscribeOrders();
      unsubscribeNotifications();
    };
  }, [router, userData]);

  const handleBuyerDisputeAction = async (action: string, dispute: any) => {
    if (!auth.currentUser) return;

    try {
      if (action === "view_order") {
        router.push(`/buyer/orders/${dispute.orderId}`);
      }

      if (action === "mark_read") {
        await updateDoc(doc(db, "disputes", dispute.id), { read: true });
      }

      if (action === "add_evidence") {
        console.log("Add evidence for dispute:", dispute.id);
      }

    } catch (error) {
      console.error("Dispute action error:", error);
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  );

  return (
    <div className={`${font.className} flex h-screen overflow-hidden bg-gray-50/50 text-gray-900`}>
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 hidden md:flex flex-col p-6 h-full">
        <div className="flex items-center px-2 py-2 mb-6">
          <img src="/icons/sowa.png" alt="Sowa Logo" className="h-11 w-auto object-contain" />
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto no-scrollbar">
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
          <NavItem icon={<Search size={18} />} label="Explore" active={activeTab === "explore"} onClick={() => setActiveTab("explore")} />
          <NavItem icon={<ShoppingBag size={18} />} label="My Purchases" active={activeTab === "purchases"} onClick={() => setActiveTab("purchases")} />
          <NavItem icon={<ClipboardList size={18} />} label="Orders" active={activeTab === "orders"} onClick={() => setActiveTab("orders")} />
          <NavItem
            icon={<ShieldAlert size={18} />}
            label="Disputes"
            active={activeTab === "disputes"}
            onClick={() => setActiveTab("disputes")}
            badge={buyerDisputeStats.open > 0 ? buyerDisputeStats.open : null}
          />

          <NavItem
            icon={<Bell size={18} />}
            label="Notifications"
            active={activeTab === "notifications"}
            onClick={() => setActiveTab("notifications")}
            badge={notificationStats.unread > 0 ? notificationStats.unread : null}
          />

          {/* ✅ NEW: Profile Tab added under Notifications */}
          <NavItem
            icon={<IdCard size={18} />}
            label="Profile"
            active={activeTab === "profile"}
            onClick={() => setActiveTab("profile")}
          />
        </nav>

        <div className="pt-6 border-t border-gray-100">
          {/* ❌ REMOVED: Edit Profile Link */}
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          <NavItem icon={<User size={18} />} label="Account" active={activeTab === "account"} onClick={() => setActiveTab("account")} />
          <button onClick={() => signOut(auth)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 mt-1 transition-colors">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-10 no-scrollbar">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div>
              <h1 className="text-2xl font-extrabold capitalize tracking-tight">
                {activeTab === "explore" ? "Discover Stores" :
                  activeTab === "disputes" ? "Dispute Center" :
                    activeTab.replace("-", " ")}
              </h1>
              <p className="text-gray-400 text-sm font-bold">
                {activeTab === "disputes"
                  ? "Track and manage your order disputes"
                  : `Welcome back, ${userData?.displayName || userData?.firstName || "Buyer"}`
                }
              </p>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === "explore" && (
                <button
                  onClick={() => setIsFilterOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-2xl hover:border-green-600 transition-all shadow-sm text-xs font-bold"
                >
                  <SlidersHorizontal size={16} /> Filters
                </button>
              )}

              <div className="p-2.5 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:text-green-600 transition-all shadow-sm cursor-pointer">
                <Bell size={18} />
              </div>

              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-green-100">
                <ShieldCheck size={14} /> Escrow Active
              </div>
            </div>
          </header>

          <div className="animate-in fade-in duration-500 pb-10">
            {activeTab === "home" && (
              <BuyerHome
                userData={userData}
                stats={dashboardStats}
                buyerDisputeStats={buyerDisputeStats}
                onExploreClick={() => setActiveTab("explore")}
                onViewOrders={() => setActiveTab("orders")}
                onViewDisputes={() => setActiveTab("disputes")}
              />
            )}
            {activeTab === "explore" && <ExploreTab isFilterOpen={isFilterOpen} setIsFilterOpen={setIsFilterOpen} />}
            {activeTab === "purchases" && <PurchasesTab />}
            {activeTab === "orders" && (
              <OrdersTab
                disputes={buyerDisputes}
                onDisputeAction={handleBuyerDisputeAction}
              />
            )}
            {/* ✅ Pass the tab switcher to Account so the Edit Profile button works */}
            {activeTab === "account" && <AccountTab onEditProfile={() => setActiveTab("profile")} />}
            {activeTab === "settings" && <SettingsTab />}
            {activeTab === "disputes" && (
              <BuyerDisputesTab
                disputes={buyerDisputes}
                buyerId={auth.currentUser?.uid}
                onAction={handleBuyerDisputeAction}
              />
            )}
            {activeTab === "notifications" && <BuyerNotification />}

            {/* ✅ Render Profile Tab */}
            {activeTab === "profile" && <ProfileTab />}

          </div>

          <footer className="py-8 text-center border-t border-gray-100 mt-auto">
            <p className="text-[9px] uppercase tracking-[0.3em] font-black text-gray-600">
              Powered by Zebble Quantum Technologies LTD
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

// --- HELPER COMPONENTS ---

function NavItem({ icon, label, active, onClick, badge = null, href }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: number | null;
  href?: string;
}) {
  const classes = `w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${active
    ? "bg-green-600 text-white shadow-lg shadow-green-100"
    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
    }`;

  const innerContent = (
    <>
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>
      {badge !== null && badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {innerContent}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={classes}>
      {innerContent}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 🏠 PROFESSIONAL BUYER HOME DASHBOARD (WITH LIVE RECOMMENDATIONS)
// ═══════════════════════════════════════════════════════════
function BuyerHome({ userData, stats, buyerDisputeStats, onExploreClick, onViewOrders, onViewDisputes }: {
  userData: any;
  stats: { totalOrders: number; pendingDeliveries: number; totalSpent: number; favoriteStores: number };
  buyerDisputeStats: { open: number; total: number };
  onExploreClick: () => void;
  onViewOrders: () => void;
  onViewDisputes: () => void;
}) {
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [recommendedStores, setRecommendedStores] = useState<any[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [hasFetchedRecs, setHasFetchedRecs] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoadingOrders(false);
      return;
    }

    const unsub = onSnapshot(
      query(collection(db, "orders"), where("buyerId", "==", user.uid), orderBy("createdAt", "desc"), limit(5)),
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        setRecentOrders(orders);
        setLoadingOrders(false);
      },
      (error) => {
        console.error("Orders listener error:", error);
        setLoadingOrders(false);
      }
    );
    return () => unsub();
  }, []);

  const fetchRecommendedStores = useCallback(async () => {
    if (hasFetchedRecs && recommendedStores.length > 0) return;

    try {
      if (!hasFetchedRecs) setLoadingStores(true);

      const userCategoryPrefs: Set<string> = new Set();
      if (recentOrders.length > 0) {
        recentOrders.forEach(o => { if (o.category) userCategoryPrefs.add(o.category); });
      }

      const storesQuery = query(collection(db, "stores"), limit(20));
      const snapshot = await getDocs(storesQuery);

      let stores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      stores = stores.filter(s =>
        s.isActive !== false &&
        s.isDeleted !== true &&
        s.id !== userData?.storeId
      );

      stores = stores
        .map(s => ({
          ...s,
          score: (userCategoryPrefs.has(s.category) ? 1000 : 0) +
            (s.followerCount || 0) * 0.5 +
            ((s.createdAt?.seconds || Date.now() / 1000) * 0.01)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      if (JSON.stringify(stores.map(s => s.id)) !== JSON.stringify(recommendedStores.map(s => s.id))) {
        setRecommendedStores(stores);
        setHasFetchedRecs(true);
      }

    } catch (error) {
      console.error("❌ Recommendation fetch failed:", error);
      if (!hasFetchedRecs) {
        setRecommendedStores([]);
        setHasFetchedRecs(true);
      }
    } finally {
      if (!hasFetchedRecs) setLoadingStores(false);
    }
  }, [recentOrders, userData, recommendedStores, hasFetchedRecs]);

  useEffect(() => {
    if (!hasFetchedRecs) {
      fetchRecommendedStores();
    }
  }, [fetchRecommendedStores, hasFetchedRecs]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount || 0);

  const formatDate = (date: Date) => date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });

  const getStatusConfig = (status: string) => {
    const configs: any = {
      PAID_HELD: { label: "Secured", icon: Clock, color: "bg-orange-100 text-orange-700" },
      SHIPPED: { label: "Shipped", icon: Truck, color: "bg-blue-100 text-blue-700" },
      COMPLETED: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
      DISPUTED: { label: "Disputed", icon: AlertTriangle, color: "bg-red-100 text-red-700" }
    };
    return configs[status] || configs.PAID_HELD;
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 md:p-8 rounded-[32px] text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black mb-2">
              Welcome back, {userData?.displayName?.split(' ')[0] || userData?.firstName || "Buyer"}! 👋
            </h2>
            <p className="text-green-50 font-medium opacity-90 max-w-lg">
              Your payments are protected with escrow. Shop with confidence on Sowa.
            </p>
          </div>
          <button onClick={onExploreClick} className="flex items-center gap-2 px-5 py-3 bg-white text-green-700 rounded-2xl font-bold text-sm hover:scale-105 transition-transform whitespace-nowrap">
            Start Shopping <ArrowRight size={16} />
          </button>
        </div>
        <ShieldCheck className="absolute right-[-30px] bottom-[-30px] text-white/10 w-48 h-48 -rotate-12" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<ShoppingBag size={20} />} label="Total Orders" value={stats.totalOrders.toLocaleString()} trend={stats.totalOrders > 0 ? "+ Active" : "Get started"} color="green" />
        <StatCard icon={<Truck size={20} />} label="In Transit" value={stats.pendingDeliveries.toLocaleString()} trend={stats.pendingDeliveries > 0 ? "Track now" : "No pending"} color="blue" onClick={stats.pendingDeliveries > 0 ? onViewOrders : undefined} />
        <StatCard icon={<CreditCard size={20} />} label="Total Spent" value={formatCurrency(stats.totalSpent)} trend="All time" color="purple" />
        <StatCard icon={<Star size={20} />} label="Favorite Stores" value={stats.favoriteStores.toLocaleString()} trend="Saved" color="orange" />
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><Clock size={18} className="text-gray-400" /> Recent Orders</h3>
          <button onClick={onViewOrders} className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1">View All <ArrowRight size={12} /></button>
        </div>

        {loadingOrders ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl animate-pulse"><div className="w-16 h-16 bg-gray-200 rounded-xl" /><div className="flex-1 space-y-2"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div></div>)}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingBag className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-sm text-gray-500 font-medium">No orders yet</p>
            <button onClick={onExploreClick} className="mt-3 text-xs font-bold text-green-600 hover:underline">Start shopping →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => {
              const { label, icon: StatusIcon, color } = getStatusConfig(order.status);
              return (
                <Link key={order.id} href={`/${order.storeUsername || order.storeId}`} className="flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors group">
                  <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-gray-100">
                    {order.productImage ? (
                      <Image
                        src={order.productImage}
                        alt={order.productName}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                        priority={recentOrders.indexOf(order) < 2}
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.opacity = '1';
                          target.style.transition = 'opacity 0.2s ease-in';
                        }}
                        style={{ opacity: 0 }}
                      />
                    ) : (
                      <ShoppingBag size={24} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{order.productName}</p>
                    <p className="text-[11px] text-gray-400">{order.storeName}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-sm text-gray-900">{formatCurrency(order.totalAmount)}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold uppercase mt-1 ${color}`}>
                      <StatusIcon size={8} /> {label}
                    </span>
                  </div>
                  <ArrowRight size={16} className="text-gray-300 group-hover:text-green-600 transition-colors" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction icon={<Search size={20} />} label="Explore Stores" onClick={onExploreClick} color="green" />
            <QuickAction icon={<ClipboardList size={20} />} label="Track Order" onClick={onViewOrders} color="blue" />
            <QuickAction icon={<ShieldAlert size={20} />} label="Disputes" badge={buyerDisputeStats.open > 0 ? buyerDisputeStats.open : undefined} onClick={onViewDisputes} color="red" />
            <QuickAction icon={<MessageCircle size={20} />} label="Support" href="mailto:support@sowa.com" color="purple" />
          </div>
        </div>

        {buyerDisputeStats.open > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-[32px] p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-red-900 text-sm">Active Disputes</h4>
                <p className="text-[11px] text-red-700 mt-1">You have {buyerDisputeStats.open} dispute{buyerDisputeStats.open > 1 ? 's' : ''} requiring attention.</p>
              </div>
            </div>
            <button onClick={onViewDisputes} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors">View Disputes →</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp size={18} className="text-gray-400" /> Recommended For You</h3>
          <button onClick={onExploreClick} className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1">Browse All <ArrowRight size={12} /></button>
        </div>

        {loadingStores && !hasFetchedRecs ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-50 rounded-2xl p-4 animate-pulse">
                <div className="w-full aspect-square bg-gray-200 rounded-xl mb-3" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : recommendedStores.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl">
            <StoreIcon className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-sm text-gray-500 font-medium">No stores available yet</p>
            <button onClick={onExploreClick} className="mt-3 text-xs font-bold text-green-600 hover:underline">Discover new arrivals →</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recommendedStores.map((store, index) => (
              <Link
                key={store.id}
                href={`/${store.username || store.id}`}
                className="bg-gray-50 rounded-2xl p-4 hover:bg-gray-100 transition-colors cursor-pointer group"
              >
                <div className="w-full aspect-square bg-white rounded-xl mb-3 overflow-hidden border border-gray-100 relative">
                  {store.bannerUrl || store.logoUrl ? (
                    <Image
                      src={store.bannerUrl || store.logoUrl}
                      alt={store.storeName}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      priority={index < 2}
                      onLoad={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.opacity = '1';
                        target.style.transition = 'opacity 0.2s ease-in';
                      }}
                      style={{ opacity: 0 }}
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
                      <StoreIcon size={32} className="text-green-400" />
                    </div>
                  )}
                  {store.followerCount && (
                    <span className="absolute top-2 right-2 px-2 py-1 bg-white/90 backdrop-blur rounded-full text-[9px] font-bold text-gray-700 shadow-sm">
                      {(store.followerCount / 1000).toFixed(1)}k followers
                    </span>
                  )}
                </div>
                <p className="font-bold text-sm text-gray-900 truncate">{store.storeName}</p>
                <p className="text-[10px] text-gray-500 mt-1 line-clamp-1">{store.category || "Verified Store"}</p>
                {store.rating && (
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={10} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-[10px] font-bold text-gray-700">{store.rating.toFixed(1)}</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  color: "green" | "blue" | "purple" | "orange" | "red";
  onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600"
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-2xl border border-gray-100 hover:shadow-md transition-all text-left ${onClick ? 'hover:scale-[1.02] cursor-pointer' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
      <p className={`text-[10px] font-medium mt-1 ${trend.includes('+') || trend === 'Track now' ? 'text-green-600' : 'text-gray-400'}`}>
        {trend}
      </p>
    </button>
  );
}

function QuickAction({ icon, label, badge, onClick, href, color }: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick?: () => void;
  href?: string;
  color: "green" | "blue" | "purple" | "red";
}) {
  const colors: Record<string, string> = {
    green: "bg-green-600 hover:bg-green-700",
    blue: "bg-blue-600 hover:bg-blue-700",
    purple: "bg-purple-600 hover:bg-purple-700",
    red: "bg-red-600 hover:bg-red-700"
  };

  const content = (
    <div className={`p-4 rounded-2xl text-white ${colors[color]} transition-all hover:scale-[1.02] relative`}>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-red-600 text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-lg">{icon}</div>
        <span className="font-bold text-sm">{label}</span>
      </div>
    </div>
  );

  if (href) return <a href={href} className="block">{content}</a>;
  return <button onClick={onClick} className="w-full text-left">{content}</button>;
}