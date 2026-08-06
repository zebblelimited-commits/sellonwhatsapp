// app/dashboard/page.tsx
"use client";
import React, { useState, useEffect, Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import {
  LogOut, LayoutDashboard, Store, Package,
  TrendingUp, Settings, Share2,
  Loader2, ExternalLink,
  Wallet,
  Bell,
  ShoppingCart,
  RotateCw,
  CheckCircle2,
  X,
  ShieldAlert,
  Crown, 
  MessageSquare,
  CreditCard
} from "lucide-react";
import {
  doc, getDoc, getDocs, collection, query, where, onSnapshot,
  updateDoc, limit, getCountFromServer // 🌟 Added for analytics counting
} from "firebase/firestore";

// --- CUSTOM IMPORTS ---
import OverviewTab from "./tabs/OverviewTab";
import ProductsTab from "./tabs/ProductsTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import MyStoreTab from "./tabs/MyStoreTab";
import SettingsTab from "./tabs/settings/SettingsTab";
import NotificationsTab from "./tabs/NotificationsTab";
import WithdrawTab from "./tabs/WithdrawTab";
import OrdersTab from "./tabs/OrdersTab";
import DisputesTab from "./tabs/DisputesTab";
import VendorChatTab from "./tabs/VendorChatTab";
import PartnerTab from "./tabs/PartnerTab";
import PayoutsTab from "./tabs/PayoutsTab";
import AddProductModal from "./modals/AddProductModal";
import SocialShareModal from "./modals/SocialShareModal";
import { ZebbleNotificationCenter } from "./ZebbleNotificationCenter";
import PremiumFeatureModal from "./modals/PremiumFeatureModal";
import DisputeResponseModal from "@/components/disputes/DisputeResponseModal";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type ProFeature = "chat" | "analytics" | "advanced_withdraw" | "priority_support";

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    }>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 🌟 FIX: Use local state for activeTab to guarantee instant UI updates without waiting for URL parsing
  const [activeTab, setActiveTabState] = useState(searchParams.get("tab") || "overview");

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [searchParams, activeTab]);

  // 🌟 FIX: Use router.replace to avoid polluting browser history with every tab click
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [storeData, setStoreData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [shareConfig, setShareConfig] = useState({ title: "My Store", url: "" });
  const [orders, setOrders] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<"free" | "pro_lite" | "pro_max" | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState<{ show: boolean; feature: ProFeature | null }>({
    show: false,
    feature: null
  });
  
  const [stats, setStats] = useState({
    productCount: 0,
    views: 0,
    clicks: 0,
    buyNowClicks: 0, // 🌟 Added for Buy Now tracking
    followers: 0,
    totalSales: 0,
    escrowBalance: 0,
    availableBalance: 0
  });

  const [disputes, setDisputes] = useState<any[]>([]);
  const [disputeStats, setDisputeStats] = useState({ open: 0, total: 0 });
  const [notificationStats, setNotificationStats] = useState({ unread: 0 });
  const [chatStats, setChatStats] = useState({ unread: 0 }); // Fixed typo from original
  const [disputedOrderIds, setDisputedOrderIds] = useState<Set<string>>(new Set());
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [disputeResponseModal, setDisputeResponseModal] = useState<{ dispute: any } | null>(null);
  const [disputeResponse, setDisputeResponse] = useState("");
  const [disputeResponseLoading, setDisputeResponseLoading] = useState(false);
  const [disputeResponseError, setDisputeResponseError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    
    const activeDisputedOrderIds = new Set(
      disputes
        .filter(d => ["open", "under_review"].includes(d.status))
        .map(d => d.orderId)
    );
    setDisputedOrderIds(activeDisputedOrderIds);

    // The store ledger is canonical. Order-derived totals can drift when an order
    // is updated by a client, while these fields are changed only by server transactions.
    const availableTotal = Number(storeData?.availableBalance ?? 0);
    const escrowTotal = Number(storeData?.escrowBalance ?? 0);
    const totalSalesTotal = Number(storeData?.totalSales ?? 0);

    setStats(prev => ({
      ...prev,
      totalSales: Number.isFinite(totalSalesTotal) ? Math.max(0, totalSalesTotal) : 0,
      escrowBalance: Number.isFinite(escrowTotal) ? Math.max(0, escrowTotal) : 0,
      availableBalance: Number.isFinite(availableTotal) ? Math.max(0, availableTotal) : 0
    }));
  }, [orders, disputes, currentUser, storeData]);

  useEffect(() => {
    let activeListeners: (() => void)[] = [];
    const clearActiveListeners = () => {
      activeListeners.forEach(unsub => unsub());
      activeListeners = [];
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      clearActiveListeners();
      
      if (user) {
        const [adminSnap, storeSnap, vendorSnap, buyerSnap, userSnap] = await Promise.all([
          getDoc(doc(db, "admins", user.uid)).catch(() => null),
          getDoc(doc(db, "stores", user.uid)).catch(() => null),
          getDoc(doc(db, "vendors", user.uid)).catch(() => null),
          getDoc(doc(db, "buyers", user.uid)).catch(() => null),
          getDoc(doc(db, "users", user.uid)).catch(() => null),
        ]);

        if (!storeSnap?.exists() && !vendorSnap?.exists()) {
          setLoading(false);
          if (adminSnap?.exists() && adminSnap.data()?.isActive === true) {
            router.replace("/admin");
          } else if (buyerSnap?.exists() || userSnap?.exists()) {
            router.replace("/buyer/dashboard");
          } else {
            router.replace("/register/onboarding/role");
          }
          return;
        }

        setCurrentUser(user);
        
        const subQuery = query(
          collection(db, "subscriptions"),
          where("userId", "==", user.uid)
        );
        
        const unsubSubscription = onSnapshot(subQuery, (snapshot) => {
          if (!snapshot.empty) {
            const subSnap = snapshot.docs[0];
            const subData = subSnap.data();
            
            const isActive = subData.status === "active";
            let isNotExpired = true;
            const expiryData = subData.expiryDate || subData.currentPeriodEnd;
            
            if (expiryData) {
              const expiryDate = typeof expiryData.toDate === 'function'
                ? expiryData.toDate()
                : new Date(expiryData);
              isNotExpired = expiryDate > new Date();
            }

            if (isActive && isNotExpired) {
              const rawPlan = subData.planId;
              if (rawPlan === "pro_business_lite" || rawPlan === "pro_lite") {
                setUserPlan("pro_lite");
              } else if (rawPlan === "pro_business_max" || rawPlan === "pro_max") {
                setUserPlan("pro_max");
              } else {
                setUserPlan("free");
              }
            } else {
              setUserPlan("free");
            }
          } else {
            setUserPlan("free");
          }
        }, (err) => {
          console.error("❌ Subscription listener error:", err);
          setUserPlan("free");
        });
        
        activeListeners.push(unsubSubscription);

        try {
          const docRef = doc(db, "stores", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setStoreData(data);
            setStats(prev => ({
              ...prev,
              followers: data.followerCount || 0,
            }));
          }
        } catch (e) {
          console.error("Failed to load store profile metrics:", e);
        }

        // 🌟 FETCH REAL ANALYTICS COUNTS FROM THE 'analytics' COLLECTION
        try {
          const storeId = user.uid;
          const viewsQuery = query(collection(db, "analytics"), where("storeId", "==", storeId), where("eventType", "==", "view"));
          const clicksQuery = query(collection(db, "analytics"), where("storeId", "==", storeId), where("eventType", "==", "click"));
          const buyNowQuery = query(collection(db, "analytics"), where("storeId", "==", storeId), where("eventType", "==", "buy_now_click"));

          const [viewsSnap, clicksSnap, buyNowSnap] = await Promise.all([
            getCountFromServer(viewsQuery),
            getCountFromServer(clicksQuery),
            getCountFromServer(buyNowQuery)
          ]);

          setStats(prev => ({
            ...prev,
            views: viewsSnap.data().count,
            clicks: clicksSnap.data().count,
            buyNowClicks: buyNowSnap.data().count,
          }));
        } catch (analyticsError) {
          console.error("Failed to fetch analytics counts:", analyticsError);
        }

        const pQuery = query(collection(db, "products"), where("storeId", "==", user.uid));
        const unsubProducts = onSnapshot(pQuery, (snapshot) => {
          setStats(prev => ({ ...prev, productCount: snapshot.size }));
        }, (err) => console.error("Handled Products permission exclusion:", err));
        activeListeners.push(unsubProducts);

        const sQuery = query(
          collection(db, "orders"),
          where("vendorId", "==", user.uid),
          where("status", "in", ["PAID_HELD", "SHIPPED", "COMPLETED", "DISPUTED"])
        );
        const unsubSales = onSnapshot(sQuery, (snapshot) => {
          const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setOrders(ordersData);
        }, (err) => console.error("Handled Orders stream exclusion:", err));
        activeListeners.push(unsubSales);

        const unsubPayouts = onSnapshot(
          query(collection(db, "payouts"), where("vendorId", "==", user.uid)),
          (snapshot) => {
            const payouts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
            payouts.sort((a, b) => {
                const dateA = a.requestedAt?.toDate?.() || new Date(0);
                const dateB = b.requestedAt?.toDate?.() || new Date(0);
                return dateB.getTime() - dateA.getTime();
              });
            setPayoutHistory(payouts);
          }, (err) => console.error("Handled Payout tracking exclusion:", err)
        );
        activeListeners.push(unsubPayouts);

        const unsubDisputes = onSnapshot(
          query(
            collection(db, "disputes"),
            where("vendorId", "==", user.uid),
            limit(50)
          ),
          (snapshot) => {
            const disputeList: any[] = snapshot.docs
              .map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || new Date()
              }))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setDisputes(disputeList);
            const openCount = disputeList.filter(d => 
              ["open", "under_review"].includes(d.status) && !d.read 
            ).length;
            setDisputeStats({ open: openCount, total: disputeList.length });
          }, (err) => {
            console.error("Disputes listener error:", err);
            setDisputes([]);
            setDisputeStats({ open: 0, total: 0 });
          }
        );
        activeListeners.push(unsubDisputes);

        const unsubNotifBadge = onSnapshot(
          query(
            collection(db, "notifications"),
            where("vendorId", "==", user.uid),
            limit(100)
          ),
          (snapshot) => {
            let unreadCount = 0;
            snapshot.forEach(doc => {
              if (doc.data().read === false) unreadCount++;
            });
            setNotificationStats({ unread: unreadCount });
          },
          (err) => console.error("Handled Notifications badge exclusion:", err)
        );
        activeListeners.push(unsubNotifBadge);

        const unsubChatBadge = onSnapshot(
          query(
            collection(db, "chats"),
            where("vendorId", "==", user.uid),
            limit(100)
          ),
          (snapshot) => {
            let unreadCount = 0;
            snapshot.forEach(doc => {
              const data = doc.data();
              if (data.unreadByVendor === true || data.vendorRead === false) {
                unreadCount += (data.unreadMessages || 1);
              }
            });
            setChatStats({ unread: unreadCount });
          },
          (err) => console.error("Handled Chat badge exclusion:", err)
        );
        activeListeners.push(unsubChatBadge);

        setLoading(false);
      } else {
        setLoading(false);
        router.push("/login");
      }
    });

    return () => {
      unsubAuth();
      clearActiveListeners();
    };
  }, []);

  const hasProAccess = (feature: ProFeature): boolean => {
    return userPlan === "pro_lite" || userPlan === "pro_max";
  };

  const handleProTabClick = (tab: string, feature: ProFeature) => {
    if (hasProAccess(feature)) {
      setActiveTab(tab);
    } else {
      setShowPremiumModal({ show: true, feature });
    }
  };

  const openDisputeResponseModal = (dispute: any) => {
    setDisputeResponseModal({ dispute });
    setDisputeResponse("");
    setDisputeResponseError("");
  };

  const closeDisputeResponseModal = () => {
    setDisputeResponseModal(null);
    setDisputeResponse("");
    setDisputeResponseError("");
  };

  const submitDisputeResponse = async () => {
    if (!currentUser || !disputeResponseModal || !disputeResponse.trim()) return;

    setDisputeResponseLoading(true);
    setDisputeResponseError("");

    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`/api/disputes/${encodeURIComponent(disputeResponseModal.dispute.id)}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "respond", content: disputeResponse.trim() }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Failed to submit response");

      closeDisputeResponseModal();
      setNotification({
        type: "success",
        message: "✅ Your response has been submitted. Admin will review shortly."
      });
    } catch (error: any) {
      console.error("Dispute response submission failure:", error);
      setDisputeResponseError(error.message || "Failed to submit response. Please try again.");
    } finally {
      setDisputeResponseLoading(false);
    }
  };

  const handleDisputeAction = async (action: string, dispute: any) => {
    if (!currentUser) return;
    try {
      if (action === "respond") {
        openDisputeResponseModal(dispute);
        return;
      }

      const idToken = await currentUser.getIdToken();
      const response = await fetch(`/api/disputes/${encodeURIComponent(dispute.id)}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to process dispute action");
      }

    } catch (error) {
      console.error("Dispute action update failure:", error);
      setNotification({
        type: "error",
        message: "❌ Failed to process dispute action. Please try again."
      });
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const syncProductCount = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    try {
      const actualCount = stats.productCount; 
      const storeRef = doc(db, "stores", currentUser.uid);
      await updateDoc(storeRef, { productCount: actualCount });
      setShowSyncSuccess(true);
    } catch (error) {
      console.error("Sync routine failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const username = storeData?.username || "yourstore";
  const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000' : 'https://sellonwhatsapp.com';
  const storeUrl = `${baseUrl}/${username}`;

  const openShare = (title: string, url: string) => {
    setShareConfig({ title, url });
    setIsShareModalOpen(true);
  };

  // ✅ FIX: Calculate real-time total sales by summing up items from your active orders array
  const realTimeTotalSales = orders
    .filter(order => ["PAID_HELD", "SHIPPED", "COMPLETED"].includes(order.status?.toUpperCase()))
    .reduce((sum, order) => sum + Number(order.totalAmount || order.amount || 0), 0);

  // ✅ FIX: Extract follower metrics from your store snapshot document structure
  const totalFollowersCount = 
    storeData?.followerCount || 
    storeData?.followersCount || 
    (Array.isArray(storeData?.followers) ? storeData.followers.length : Number(storeData?.followers || 0));

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
      router.replace('/login');
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-white">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  );

  return (
    <div className={`${font.className} flex min-h-screen bg-gray-50/50 text-gray-900`}>
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-lg flex items-center gap-3 text-sm font-medium animate-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-80 transition-opacity">
            <X size={16} />
          </button>
        </div>
      )}

      <DisputeResponseModal
        open={Boolean(disputeResponseModal)}
        orderId={disputeResponseModal?.dispute?.orderId}
        title="Respond to buyer dispute"
        value={disputeResponse}
        loading={disputeResponseLoading}
        error={disputeResponseError}
        onChange={setDisputeResponse}
        onClose={closeDisputeResponseModal}
        onSubmit={submitDisputeResponse}
      />

      <aside className="w-64 bg-white border-r border-gray-100 hidden md:flex flex-col p-6 sticky top-0 h-screen">
        <div className="flex items-center px-2 py-2 mb-6">
          <img src="/icons/sowa.png" alt="Sowa Logo" className="h-11 w-auto object-contain" />
        </div>
        <nav className="space-y-1 flex-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
          <NavItem icon={<ShoppingCart size={18} />} label="Orders" active={activeTab === "orders"} onClick={() => setActiveTab("orders")} />
          <NavItem icon={<Store size={18} />} label="My Store" active={activeTab === "store"} onClick={() => setActiveTab("store")} />
          <NavItem icon={<Wallet size={18} />} label="Withdraw" active={activeTab === "withdraw"} onClick={() => setActiveTab("withdraw")} />
          <NavItem icon={<CreditCard size={18} />} label="Payouts" active={activeTab === "payouts"} onClick={() => setActiveTab("payouts")} />
          <NavItem
            icon={<ShieldAlert size={18} />}
            label="Disputes"
            active={activeTab === "disputes"}
            onClick={() => setActiveTab("disputes")}
            badge={disputeStats.open > 0 ? disputeStats.open : null}
          />
          <NavItem icon={<Package size={18} />} label="Products" active={activeTab === "products"} onClick={() => setActiveTab("products")} />
          <NavItem
            icon={<TrendingUp size={18} />}
            label="Analytics"
            active={activeTab === "analytics"}
            onClick={() => handleProTabClick("analytics", "analytics")}
            isPro={!hasProAccess("analytics")}
          />
          <NavItem
            icon={<MessageSquare size={18} />}
            label="Chat"
            active={activeTab === "chat"}
            onClick={() => handleProTabClick("chat", "chat")}
            isPro={!hasProAccess("chat")}
            badge={chatStats.unread > 0 ? chatStats.unread : null}
          />
          <NavItem 
            icon={<Bell size={18} />} 
            label="Notifications" 
            active={activeTab === "notifications"} 
            onClick={() => setActiveTab("notifications")} 
            badge={notificationStats.unread > 0 ? notificationStats.unread : null}
          />
          <NavItem icon={<Crown size={18} />} label="Partner" active={activeTab === "partner"} onClick={() => setActiveTab("partner")} />
        </nav>
        <div className="pt-6 border-t border-gray-100">
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 mt-1">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-screen">
        <div className="p-4 md:p-10 flex-1">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div>
              <h1 className="text-2xl font-extrabold capitalize tracking-tight">{activeTab.replace("-", " ")}</h1>
              <p className="text-gray-400 text-sm font-bold">Managing @{username} storefront</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="mr-1">
                <ZebbleNotificationCenter/>
              </div>
              <button
                onClick={syncProductCount}
                disabled={isSyncing}
                className="p-2.5 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:text-green-600 transition-all shadow-sm disabled:opacity-50"
                title="Sync Product Count"
              >
                <RotateCw size={18} className={isSyncing ? "animate-spin" : ""} />
              </button>
              <button onClick={() => openShare(storeData?.storeName || "My Store", storeUrl)} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-2xl text-xs font-bold hover:bg-gray-50 transition-all shadow-sm">
                <Share2 size={16} /> Share Link
              </button>
              <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-2xl text-xs font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100">
                <ExternalLink size={16} /> Visit Store
              </a>
            </div>
          </header>

          {/* 🌟 UPDATED OVERVIEW TAB RENDERING WITH LIVE ANALYTICS */}
          {activeTab === "overview" && (
            <OverviewTab 
              username={username} 
              storeUrl={storeUrl} 
              storeId={currentUser?.uid || ""}
              disputeStats={disputeStats}
              totalSales={realTimeTotalSales} 
              followers={totalFollowersCount} 
              productCount={stats.productCount || storeData?.productCount || 0}
              hasProAccess={hasProAccess("analytics")} // 🌟 ADD THIS LINE
              views={stats.views}                     // 🌟 Pass live views
              clicks={stats.clicks}                   // 🌟 Pass live clicks
              buyNowClicks={stats.buyNowClicks}       // 🌟 Pass live buy now clicks
            />
          )}

          {activeTab === "orders" && <OrdersTab orders={orders} disputes={disputes} onDisputeAction={handleDisputeAction} />}
          {activeTab === "store" && <MyStoreTab initialData={storeData} />}
          {activeTab === "products" && (
            <ProductsTab
              onOpenModal={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
              storeSlug={username}
              onEditProduct={(p) => { setEditingProduct(p); setIsProductModalOpen(true); }}
              onShareProduct={(p) => openShare(p.name, `${storeUrl}/${p.id}`)}
            />
          )}
          {activeTab === "withdraw" && (
            <WithdrawTab
              stats={stats}
              bankDetails={storeData?.payoutSettings || storeData?.bankAccount} // 🌟 ADD THIS LINE
              payoutHistory={payoutHistory}
            />
          )}
          {activeTab === "disputes" && (
            <DisputesTab
              disputes={disputes}
              vendorId={currentUser?.uid}
              onAction={handleDisputeAction}
            />
          )}
          {activeTab === "notifications" && (
            <NotificationsTab
              vendorId={currentUser?.uid}
              disputes={disputes}
              onNotificationAction={(action, data) => {
                if (action === "view_dispute" && data?.id) {
                  setActiveTab("disputes");
                }
              }}
            />
          )}
          {activeTab === "analytics" && (
            hasProAccess("analytics")
              ? <AnalyticsTab orders={orders} stats={stats} disputes={disputes} />
              : <ProFeaturePlaceholder feature="analytics" onUpgrade={() => setShowPremiumModal({ show: true, feature: "analytics" })} />
          )}
          {activeTab === "chat" && (
            hasProAccess("chat")
              ? <VendorChatTab vendorId={currentUser?.uid || ""} storeName={storeData?.storeName || "My Store"} />
              : <ProFeaturePlaceholder feature="chat" onUpgrade={() => setShowPremiumModal({ show: true, feature: "chat" })} />
          )}
          {activeTab === "partner" && currentUser && (
            <PartnerTab storeId={currentUser.uid} />
          )}
          {activeTab === "payouts" && currentUser && (<PayoutsTab payoutHistory={payoutHistory} />)}
          {activeTab === "settings" && currentUser && <SettingsTab storeId={currentUser.uid} />}
        </div>
        <footer className="p-8 text-center border-t border-gray-100 mt-auto">
          <p className="text-[9px] uppercase tracking-[0.3em] font-black text-gray-600 bold">
            Powered by Zebble Quantum Technologies LTD
          </p>
        </footer>
      </main>

      {showSyncSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-gray-100 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">Sync Successful!</h3>
            <p className="text-gray-500 font-bold text-sm mb-8">
              Your storefront has been updated to reflect <span className="text-green-600">{stats.productCount} items</span> accurately.
            </p>
            <button
              onClick={() => setShowSyncSuccess(false)}
              className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all"
            >
              Close Window
            </button>
          </div>
        </div>
      )}

      <PremiumFeatureModal
        isOpen={showPremiumModal.show}
        onClose={() => setShowPremiumModal({ show: false, feature: null })}
        feature={showPremiumModal.feature || "chat"}
        onUpgrade={() => {
          setShowPremiumModal({ show: false, feature: null });
          router.push("/pricing");
        }}
      />
      <AddProductModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} initialData={editingProduct} />
      <SocialShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title={shareConfig.title} url={shareConfig.url} />
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge = null, isPro = false }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number | null;
  isPro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all relative ${active ? "bg-green-50 text-green-700" : "text-gray-400 hover:bg-gray-50 hover:text-gray-900"} ${isPro ? "opacity-70 hover:opacity-100" : ""}`}
    >
      <div className="flex items-center gap-3">
        {icon} {label}
        {isPro && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">
            <Crown size={10} className="fill-amber-400" /> Pro
          </span>
        )}
      </div>
      {badge !== null && badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function ProFeaturePlaceholder({ feature, onUpgrade }: { feature: ProFeature; onUpgrade: () => void }) {
  const featureConfig: Record<ProFeature, { title: string; description: string; benefits: string[] }> = {
    chat: {
      title: "Real-Time Chat Support",
      description: "Message buyers directly, resolve issues faster, and boost customer satisfaction.",
      benefits: ["Instant buyer communication", "Read receipts & typing indicators", "File/image sharing", "Chat history & search"]
    },
    analytics: {
      title: "Advanced Analytics",
      description: "Track sales trends, customer behavior, and growth metrics to scale your business.",
      benefits: ["Revenue & conversion charts", "Customer demographics", "Product performance insights", "Export reports to CSV"]
    },
    advanced_withdraw: {
      title: "Instant Withdrawals",
      description: "Get your funds faster with priority processing and lower fees.",
      benefits: ["Same-day bank transfers", "Reduced withdrawal fees", "Higher withdrawal limits", "Priority support"]
    },
    priority_support: {
      title: "Priority Support",
      description: "Get help faster with dedicated support and faster response times.",
      benefits: ["24/7 priority chat support", "Dedicated account manager", "Faster dispute resolution", "Early feature access"]
    }
  };

  const config = featureConfig[feature];

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm text-center max-w-2xl mx-auto animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Crown size={28} className="fill-amber-400" />
      </div>
      <h3 className="text-xl font-black text-gray-900 mb-2">{config.title}</h3>
      <p className="text-gray-500 text-sm mb-6">{config.description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-left">
        {config.benefits.map((benefit, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
            <span className="text-gray-700">{benefit}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onUpgrade}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 mx-auto transition-all active:scale-[0.98]"
      >
        <Crown size={16} className="fill-white" /> Upgrade to Pro
      </button>
      <p className="text-[10px] text-gray-400 mt-4">
        Cancel anytime • 7-day money-back guarantee
      </p>
    </div>
  );
}
