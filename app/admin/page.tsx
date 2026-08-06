// app/admin/page.tsx
"use client"; // ✅ MUST be first line

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  collection, query, where, getDocs, orderBy, limit, onSnapshot, 
  updateDoc, doc, addDoc, serverTimestamp, deleteDoc 
} from "firebase/firestore";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Plus_Jakarta_Sans } from "next/font/google";
import { 
  Users, Store, CreditCard, AlertTriangle, TrendingUp, Clock, 
  CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Loader2,
  Search, Bell, ShieldCheck, ChevronRight, Eye, Flag, MessageSquare,
  LayoutDashboard, Settings, LogOut, SlidersHorizontal,ClipboardList, Send, ArrowLeft, MoreVertical, User, Phone,FileText, X
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, PieChart, Pie, Cell, Legend, BarChart, Bar } from "recharts";
import DisputeThread from "@/components/disputes/DisputeThread";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// ═══════════════════════════════════════════════════════════
// 🧩 TAB COMPONENTS (All rendered in same page)
// ═══════════════════════════════════════════════════════════

// ── Dashboard Home Tab ──
function AdminHome({ stats, onNavigate }: { stats: any; onNavigate: (tab: string) => void }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={Users} label="Total Users" value={stats.totalUsers?.toLocaleString() || "0"} trend="+12% this week" trendColor="text-green-600" onClick={() => onNavigate("users")} />
        <KPICard icon={Store} label="Active Stores" value={stats.activeStores?.toLocaleString() || "0"} trend="+5% this week" trendColor="text-green-600" onClick={() => onNavigate("stores")} />
        <KPICard icon={CreditCard} label="Pending Payouts" value={stats.pendingPayouts?.toLocaleString() || "0"} trend="₦2.4M pending" trendColor="text-amber-600" onClick={() => onNavigate("payouts")} />
        <KPICard icon={AlertTriangle} label="Open Disputes" value={stats.openDisputes?.toLocaleString() || "0"} trend="-3% this week" trendColor="text-green-600" onClick={() => onNavigate("disputes")} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={Users} label="Manage Users" onClick={() => onNavigate("users")} color="blue" />
          <QuickAction icon={Store} label="Review Stores" onClick={() => onNavigate("stores")} color="green" />
          <QuickAction icon={CreditCard} label="Approve Payouts" onClick={() => onNavigate("payouts")} color="purple" />
          <QuickAction icon={AlertTriangle} label="Resolve Disputes" onClick={() => onNavigate("disputes")} color="red" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4">Recent Platform Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Users Management Tab ──
function AdminUsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionModal, setActionModal] = useState<{ type: string; user: any } | null>(null);
  const [modalReason, setModalReason] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date() }));
      setUsers(usersList);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => users.filter(u => {
    const matchesSearch = !searchQuery || u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || u.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" ? true :
      statusFilter === "active" ? u.isActive !== false :
      statusFilter === "banned" ? u.isBanned === true :
      statusFilter === "unverified" ? u.isVerified !== true : true;
    return matchesSearch && matchesStatus;
  }), [users, searchQuery, statusFilter]);

  const handleAction = async (action: string, user: any) => {
    try {
      const userRef = doc(db, "users", user.id);
      const updates: any = { updatedAt: serverTimestamp() };
      
      if (action === "ban") { updates.isBanned = true; updates.bannedAt = new Date(); updates.banReason = modalReason; }
      if (action === "unban") { updates.isBanned = false; updates.unbannedAt = new Date(); }
      if (action === "verify") { updates.isVerified = true; updates.verifiedAt = new Date(); }
      if (action === "suspend") { updates.isSuspended = true; updates.suspendedAt = new Date(); updates.suspendReason = modalReason; }
      
      await updateDoc(userRef, updates);
      await addDoc(collection(db, "admin_logs"), {
        adminId: auth.currentUser?.uid, action, targetType: "user", targetId: user.id, reason: modalReason, timestamp: serverTimestamp()
      });
      setActionModal(null);
      setModalReason("");
    } catch (e) { console.error("Action failed:", e); }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500">Manage buyer and vendor accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none w-64" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-white border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="verified">Verified</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">User</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Joined</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><User size={18} className="text-gray-400" /></div>
                      <div>
                        <p className="font-bold text-sm text-gray-900">{user.displayName || "Unnamed User"}</p>
                        <p className="text-[10px] text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={user.isBanned ? "banned" : user.isSuspended ? "suspended" : user.isVerified ? "verified" : "active"} />
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">{user.createdAt?.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      {user.isBanned ? (
                        <button onClick={() => setActionModal({ type: "unban", user })} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Unban"><CheckCircle2 size={14} /></button>
                      ) : (
                        <button onClick={() => setActionModal({ type: "ban", user })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Ban"><XCircle size={14} /></button>
                      )}
                      {!user.isVerified && <button onClick={() => setActionModal({ type: "verify", user })} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Verify"><ShieldCheck size={14} /></button>}
                      <button className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><SlidersHorizontal size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && <div className="p-10 text-center text-gray-400 text-sm">No users found matching your filters</div>}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2"><AlertTriangle size={20} /> {actionModal.type === "ban" ? "Ban User" : actionModal.type === "unban" ? "Unban User" : "Verify User"}</h3>
            <p className="text-sm text-gray-500 mb-4">{actionModal.type === "ban" ? "This will prevent the user from accessing their account." : actionModal.type === "unban" ? "This will restore the user's account access." : "Mark this user as verified."}</p>
            <p className="text-sm font-bold text-gray-900 mb-4">Target: {actionModal.user.displayName || actionModal.user.email}</p>
            {(actionModal.type === "ban" || actionModal.type === "suspend") && (
              <div className="mb-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Reason <span className="text-red-500">*</span></label>
                <textarea value={modalReason} onChange={(e) => setModalReason(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none min-h-[80px]" placeholder="Ex: Violated community guidelines..." />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setActionModal(null); setModalReason(""); }} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm">Cancel</button>
              <button onClick={() => handleAction(actionModal.type, actionModal.user)} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-sm">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stores Management Tab (Simplified) ──
function AdminStoresTab() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "stores"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Store Management</h2>
          <p className="text-sm text-gray-500">Review, approve, and manage vendor stores</p>
        </div>
        <button className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700">+ Add Store</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((store) => (
          <div key={store.id} className="bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden">
                {store.logoUrl ? <Image src={store.logoUrl} alt={store.storeName} width={64} height={64} className="object-cover" /> : <Store size={32} className="text-gray-300" />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-gray-900">{store.storeName}</h4>
                <p className="text-[10px] text-gray-400">@{store.username}</p>
                <StatusBadge status={store.status || "pending"} size="sm" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {store.status === "pending" && (
                <>
                  <button className="flex-1 py-2 bg-green-600 text-white rounded-xl text-[10px] font-bold hover:bg-green-700">Approve</button>
                  <button className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold hover:bg-red-100">Reject</button>
                </>
              )}
              <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"><SlidersHorizontal size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Orders Tab ──
function AdminOrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "orders"), limit(100)),
      (snap) => {
        const nextOrders = snap.docs
          .map((order) => ({ id: order.id, ...order.data() }))
          .sort((a, b) => (b.createdAt?.toDate?.()?.getTime?.() || 0) - (a.createdAt?.toDate?.()?.getTime?.() || 0));
        setOrders(nextOrders);
        setListenerError("");
        setLoading(false);
      },
      (error) => {
        console.error("Admin orders listener error:", error);
        setListenerError("Orders could not be loaded. Please refresh and try again.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Orders</h2>
        <p className="text-sm text-gray-500">Monitor marketplace orders and escrow states</p>
      </div>
      {listenerError && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{listenerError}</div>}
      <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Order</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Buyer / Seller</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-mono text-xs font-bold text-gray-800">#{order.id.slice(-8).toUpperCase()}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    <p>Buyer: {order.buyerId || "—"}</p>
                    <p>Seller: {order.vendorId || "—"}</p>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">₦{Number(order.totalAmount || 0).toLocaleString()}</td>
                  <td className="px-6 py-4"><StatusBadge status={order.status || "pending"} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No orders found</div>}
      </div>
    </div>
  );
}

// ── Payouts Tab (Simplified) ──
function AdminPayoutsTab() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "payouts"), limit(100)),
      (snap) => {
        const nextPayouts = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const dateA = a.requestedAt?.toDate?.()?.getTime?.() || 0;
            const dateB = b.requestedAt?.toDate?.()?.getTime?.() || 0;
            return dateB - dateA;
          });
        setPayouts(nextPayouts);
        setListenerError("");
        setLoading(false);
      },
      (error) => {
        console.error("Admin payout listener error:", error);
        setListenerError("Payouts could not be loaded. Please refresh and try again.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Payout Approvals</h2>
          <p className="text-sm text-gray-500">Monitor withdrawal reservations and gateway outcomes</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-bold">
          <Clock size={14} /> {payouts.length} pending
        </div>
      </div>
      {listenerError && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{listenerError}</div>}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Vendor</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Gross / Net</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Requested</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payouts.map((payout) => (
              <tr key={payout.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4">
                  <p className="font-bold text-sm text-gray-900">{payout.vendorName || payout.vendorId || "Unknown vendor"}</p>
                  <p className="text-[10px] text-gray-400">{payout.vendorEmail || payout.id}</p>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">
                  <p>₦{Number(payout.grossAmount ?? payout.amount ?? 0).toLocaleString()}</p>
                  <p className="text-[10px] font-medium text-gray-400">Net ₦{Number(payout.netAmount ?? 0).toLocaleString()}</p>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">{payout.requestedAt?.toDate?.()?.toLocaleDateString?.('en-NG') || "—"}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={payout.status || "pending"} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payouts.length === 0 && <div className="p-10 text-center text-gray-400 text-sm">No pending payouts</div>}
      </div>
    </div>
  );
}

// ── Disputes Tab ──
function AdminDisputesTab() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [listenerError, setListenerError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "disputes"), limit(100)),
      (snap) => {
        const nextDisputes = snap.docs
          .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date() }))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setDisputes(nextDisputes);
        setListenerError("");
        setLoading(false);
      },
      (error) => {
        console.error("Admin disputes listener error:", error);
        setListenerError("Disputes could not be loaded. Please refresh and try again.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const visibleDisputes = disputes.filter((dispute) => {
    if (statusFilter === "active") return ["open", "under_review"].includes(dispute.status);
    if (statusFilter === "resolved") return ["resolved_refund", "resolved_vendor", "closed"].includes(dispute.status);
    return true;
  });

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dispute Resolution</h2>
          <p className="text-sm text-gray-500">Review the conversation and update the final outcome</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 outline-none focus:border-green-600">
            <option value="active">Active disputes</option>
            <option value="all">All disputes</option>
            <option value="resolved">Resolved disputes</option>
          </select>
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-700">
            <AlertTriangle size={14} /> {disputes.filter((d) => ["open", "under_review"].includes(d.status)).length} open
          </div>
        </div>
      </div>
      {listenerError && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{listenerError}</div>}
      <div className="space-y-4">
        {visibleDisputes.map((dispute) => (
          <div key={dispute.id} className="bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <StatusBadge status={dispute.status} size="sm" />
                  <span className="text-[10px] text-gray-400">#{dispute.id?.slice(-8).toUpperCase()}</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">{dispute.reason?.replace('_', ' ')}</h4>
                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{dispute.description}</p>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
                  <span>Buyer: {dispute.buyerEmail?.split('@')[0]}</span>
                  <span>•</span>
                  <span>Vendor: {dispute.vendorName}</span>
                  <span>•</span>
                  <span>₦{dispute.amount?.toLocaleString()}</span>
                </div>
                </div>
            </div>
            <DisputeThread
              key={dispute.id}
              disputeId={dispute.id}
              currentRole="admin"
              currentStatus={dispute.status}
              currentResolution={dispute.resolution || ""}
            />
          </div>
        ))}
        {visibleDisputes.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No disputes in this view</div>}
      </div>
    </div>
  );
}

// ── Notifications Tab (Simplified) ──
function AdminNotificationsTab() {
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return alert("Please enter a message");
    setSending(true);
    try {
      await addDoc(collection(db, "notifications"), {
        message, target, sentBy: auth.currentUser?.uid, sentAt: serverTimestamp(), read: false
      });
      alert("✅ Notification sent!");
      setMessage("");
    } catch (e) { alert("Failed to send"); console.error(e); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Send Notifications</h2>
        <p className="text-sm text-gray-500">Broadcast announcements to users or vendors</p>
      </div>
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm space-y-4">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Target Audience</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none">
            <option value="all">All Users</option>
            <option value="buyers">Buyers Only</option>
            <option value="vendors">Vendors Only</option>
            <option value="admins">Admins Only</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none min-h-[120px]" placeholder="Enter your announcement..." />
        </div>
        <button onClick={handleSend} disabled={sending || !message.trim()} className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
          {sending ? <><Loader2 size={18} className="animate-spin" /> Sending...</> : <><Bell size={18} /> Send Notification</>}
        </button>
      </div>
    </div>
  );
}

// ── Admin Chat Tab ──
function AdminChatTab({ initialChats = [] }: { initialChats?: any[] }) {
  const adminId = auth.currentUser?.uid;
  const [chats, setChats] = useState(initialChats);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ✅ Load conversations (real-time)
  useEffect(() => {
    if (!adminId) return;
    const q = query(collection(db, "admin_chats"), orderBy("lastMessageAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [adminId]);

  // ✅ Load messages for selected chat (real-time)
  useEffect(() => {
    if (!selectedChat) return;
    const msgRef = collection(db, "admin_chats", selectedChat.id, "messages");
    const q = query(msgRef, orderBy("timestamp", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Mark as read if admin has unread
      if (selectedChat.unreadCount > 0) {
        updateDoc(doc(db, "admin_chats", selectedChat.id), { unreadCount: 0 });
      }
    });
    return () => unsub();
  }, [selectedChat?.id]);

  // ✅ Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Send message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat || !adminId) return;
    
    setSending(true);
    try {
      const chatRef = doc(db, "admin_chats", selectedChat.id);
      const messagesRef = collection(db, "admin_chats", selectedChat.id, "messages");
      
      // Optimistic update
      await Promise.all([
        addDoc(messagesRef, {
          senderId: adminId,
          senderRole: "admin",
          content: newMessage,
          timestamp: serverTimestamp(),
          read: false
        }),
        updateDoc(chatRef, {
          lastMessage: newMessage,
          lastMessageAt: serverTimestamp()
        })
      ]);
      
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  // ✅ Filter chats by search
  const filteredChats = useMemo(() => 
    chats.filter(c => 
      c.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.userEmail?.toLowerCase().includes(searchQuery.toLowerCase())
    ), [chats, searchQuery]);

  // ✅ Format timestamp
  const formatTime = (ts: any) => {
    if (!ts) return "";
    const date = ts.toDate?.() || new Date(ts);
    return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-[calc(100vh-140px)] bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex animate-in fade-in duration-300">
      
      {/* LEFT: Conversation List */}
      <div className={`${mobileShowChat ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-gray-100 flex-col`}>
        {/* Search Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search conversations..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => { setSelectedChat(chat); setMobileShowChat(true); }}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selectedChat?.id === chat.id ? "bg-green-50 border-l-4 border-l-green-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <User size={18} className="text-gray-400" />
                  </div>
                  {chat.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-gray-900 truncate">{chat.userName || "Unknown User"}</p>
                    <span className="text-[9px] text-gray-400 whitespace-nowrap">{formatTime(chat.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[10px] text-gray-500 truncate">{chat.lastMessage || "No messages yet"}</p>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                      chat.userRole === "vendor" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {chat.userRole}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {filteredChats.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No conversations found</div>
          )}
        </div>
      </div>

      {/* RIGHT: Chat Window */}
      <div className={`${!mobileShowChat ? "hidden md:flex" : "flex"} flex-1 flex-col`}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white">
              <button onClick={() => setMobileShowChat(false)} className="md:hidden p-2 hover:bg-gray-50 rounded-lg">
                <ArrowLeft size={18} />
              </button>
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <User size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-900">{selectedChat.userName}</p>
                <p className="text-[10px] text-gray-400">{selectedChat.userEmail} • {selectedChat.userRole}</p>
              </div>
              <button className="p-2 hover:bg-gray-50 rounded-lg"><Phone size={18} className="text-gray-400" /></button>
              <button className="p-2 hover:bg-gray-50 rounded-lg"><MoreVertical size={18} className="text-gray-400" /></button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.senderRole === "admin" 
                      ? "bg-green-600 text-white rounded-br-md" 
                      : "bg-white border border-gray-100 text-gray-700 rounded-bl-md"
                  }`}>
                    <p>{msg.content}</p>
                    <p className={`text-[9px] mt-1 text-right ${msg.senderRole === "admin" ? "text-green-100" : "text-gray-400"}`}>
                      {formatTime(msg.timestamp)} {msg.senderRole === "admin" && (msg.read ? "✓✓" : "✓")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 border-t border-gray-100 bg-white flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
                disabled={sending}
              />
              <button 
                type="submit" 
                disabled={sending || !newMessage.trim()}
                className="p-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl transition-all active:scale-[0.95]"
              >
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare size={48} className="mb-4 opacity-30" />
            <p className="font-bold text-sm">Select a conversation</p>
            <p className="text-xs mt-1">Choose a user or vendor to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Verifications Tab ──
function AdminVerificationsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  useEffect(() => {
    const q = query(
      collection(db, "store_verifications"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDecision = async (requestId: string, storeId: string, approved: boolean, notes: string) => {
    try {
      const reqRef = doc(db, "store_verifications", requestId);
      
      // 1. Update verification request
      await updateDoc(reqRef, {
        status: approved ? "approved" : "rejected",
        reviewNotes: notes,
        reviewedAt: new Date(),
        updatedAt: new Date()
      });

      // 2. If approved, update the store itself
      if (approved && storeId) {
        await updateDoc(doc(db, "stores", storeId), {
          isVerified: true,
          verifiedAt: new Date(),
          verificationTier: "premium",
          updatedAt: new Date()
        });
      }

      setSelectedRequest(null);
    } catch (error) {
      console.error("Verification update failed:", error);
      alert("Failed to update verification status");
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Verification Requests</h2>
        <p className="text-sm text-gray-500">Review and approve store verification applications</p>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <ShieldCheck size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm font-bold">No pending verification requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-bold text-sm text-gray-900">{req.storeName || "Unnamed Store"}</h4>
                    <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">Pending</span>
                  </div>
                  <p className="text-[10px] text-gray-500">Owner: {req.ownerName} • CAC: {req.cacNumber}</p>
                  <div className="flex items-center gap-2 mt-3">
                    {req.documents?.map((docItem: any, i: number) => (
                      <a 
                        key={i} 
                        href={docItem.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-green-600 hover:underline"
                      >
                        <FileText size={12} /> {docItem.type?.replace("_", " ")}
                      </a>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedRequest(req)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 flex items-center gap-1"
                >
                  <Eye size={12} /> Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4">Review: {selectedRequest.storeName}</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Business Details</p>
                <p className="text-sm"><strong>Owner:</strong> {selectedRequest.ownerName}</p>
                <p className="text-sm"><strong>CAC Number:</strong> {selectedRequest.cacNumber}</p>
              </div>
              
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Documents</p>
                <div className="space-y-2">
                  {selectedRequest.documents?.map((docItem: any, i: number) => (
                    <a key={i} href={docItem.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <FileText size={16} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-bold text-gray-900">{docItem.type?.replace("_", " ")}</p>
                        <p className="text-[10px] text-gray-400">Uploaded: {docItem.uploadedAt?.toDate?.().toLocaleDateString()}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
              
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Review Notes</p>
                <textarea 
                  id="reviewNotes"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none min-h-[80px]"
                  placeholder="Add notes for the store owner..."
                  defaultValue={selectedRequest.reviewNotes}
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  const notes = (document.getElementById("reviewNotes") as HTMLTextAreaElement)?.value || "Rejected";
                  handleDecision(selectedRequest.id, selectedRequest.storeId, false, notes);
                }}
                className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <X size={16} /> Reject
              </button>
              <button 
                onClick={() => {
                  const notes = (document.getElementById("reviewNotes") as HTMLTextAreaElement)?.value || "Approved";
                  handleDecision(selectedRequest.id, selectedRequest.storeId, true, notes);
                }}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck size={16} /> Approve & Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab (with Charts) ──
function AdminAnalyticsTab() {
  const [timeRange, setTimeRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    gmvData: [],
    userGrowth: [],
    orderStatus: [],
    topStores: [],
    disputeRate: [],
    revenueByCategory: []
  });

  // ✅ Load analytics data (mock data shown - replace with real queries)
  useEffect(() => {
    async function loadAnalytics() {
      try {
        // In production: query Firestore/BigQuery for real metrics
        // For demo: generate mock data
        const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
        const today = new Date();
        
        // GMV Data (line chart)
        const gmvData = Array.from({ length: days }, (_, i) => {
          const date = new Date(today);
          date.setDate(date.getDate() - (days - 1 - i));
          return {
            date: date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
            gmv: Math.floor(Math.random() * 500000) + 100000,
            orders: Math.floor(Math.random() * 50) + 10
          };
        });

        // User Growth (area chart)
        const userGrowth = Array.from({ length: days }, (_, i) => {
          const date = new Date(today);
          date.setDate(date.getDate() - (days - 1 - i));
          return {
            date: date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
            newUsers: Math.floor(Math.random() * 30) + 5,
            activeUsers: Math.floor(Math.random() * 200) + 50
          };
        });

        // Order Status Distribution (pie chart)
        const orderStatus = [
          { name: 'Completed', value: 65, color: '#22c55e' },
          { name: 'Shipped', value: 20, color: '#3b82f6' },
          { name: 'Pending', value: 10, color: '#f59e0b' },
          { name: 'Disputed', value: 5, color: '#ef4444' }
        ];

        // Top Stores (horizontal bar)
        const topStores = [
          { name: 'Max Jhon', sales: 245000, orders: 89 },
          { name: 'Lagos Fashion', sales: 198000, orders: 67 },
          { name: 'Tech Hub NG', sales: 156000, orders: 45 },
          { name: 'Home Essentials', sales: 134000, orders: 52 },
          { name: 'Beauty Corner', sales: 98000, orders: 38 }
        ];

        // Dispute Rate Trend (line)
        const disputeRate = Array.from({ length: days }, (_, i) => {
          const date = new Date(today);
          date.setDate(date.getDate() - (days - 1 - i));
          return {
            date: date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }),
            rate: (Math.random() * 3 + 0.5).toFixed(1)
          };
        });

        // Revenue by Category (bar)
        const revenueByCategory = [
          { category: 'Fashion', revenue: 450000 },
          { category: 'Electronics', revenue: 380000 },
          { category: 'Home & Garden', revenue: 290000 },
          { category: 'Beauty', revenue: 210000 },
          { category: 'Sports', revenue: 150000 }
        ];

        setAnalytics({ gmvData, userGrowth, orderStatus, topStores, disputeRate, revenueByCategory });
        setLoading(false);
      } catch (e) {
        console.error("Analytics load failed:", e);
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  // ✅ Recharts theme matching your design system
  const chartColors = {
    primary: '#22c55e',    // green-500
    secondary: '#3b82f6',  // blue-500
    warning: '#f59e0b',    // amber-500
    danger: '#ef4444',     // red-500
    gray: '#9ca3af',       // gray-400
    background: '#f9fafb'  // gray-50
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Platform Analytics</h2>
          <p className="text-sm text-gray-500">Track growth, revenue, and engagement metrics</p>
        </div>
        
        <div className="flex items-center gap-2">
          {["7d", "30d", "90d"].map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                timeRange === range 
                  ? "bg-green-600 text-white shadow-md" 
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {range === "7d" ? "Last 7 Days" : range === "30d" ? "Last 30 Days" : "Last 90 Days"}
            </button>
          ))}
          <button className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1">
            <ArrowDownRight size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPISummary label="Total GMV" value="₦12.4M" trend="+18.5%" trendIcon={ArrowUpRight} trendColor="text-green-600" />
        <KPISummary label="Total Orders" value="1,248" trend="+12.3%" trendIcon={ArrowUpRight} trendColor="text-green-600" />
        <KPISummary label="Active Users" value="3,892" trend="+8.1%" trendIcon={ArrowUpRight} trendColor="text-green-600" />
        <KPISummary label="Dispute Rate" value="2.1%" trend="-0.4%" trendIcon={ArrowDownRight} trendColor="text-green-600" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* GMV Trend (Line Chart) */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-gray-400" /> GMV Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.gmvData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }} 
                  interval={analytics.gmvData.length > 14 ? 2 : 0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(value) => `₦${(value / 100000).toFixed(1)}M`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    fontSize: '11px'
                  }}
                  formatter={(value: number) => [`₦${value.toLocaleString()}`, 'GMV']}
                />
                <Line 
                  type="monotone" 
                  dataKey="gmv" 
                  stroke={chartColors.primary} 
                  strokeWidth={2} 
                  dot={{ fill: chartColors.primary, strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, stroke: chartColors.primary, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth (Area Chart) */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Users size={18} className="text-gray-400" /> User Growth
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.userGrowth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  interval={analytics.userGrowth.length > 14 ? 2 : 0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="activeUsers" 
                  stroke={chartColors.secondary} 
                  fill={`${chartColors.secondary}20`} 
                  strokeWidth={2}
                  name="Active Users"
                />
                <Area 
                  type="monotone" 
                  dataKey="newUsers" 
                  stroke={chartColors.primary} 
                  fill={`${chartColors.primary}20`} 
                  strokeWidth={2}
                  name="New Signups"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status (Pie Chart) */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-400" /> Order Status
          </h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.orderStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {analytics.orderStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ fontSize: '10px', color: '#6b7280' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Stores (Horizontal Bar) */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Store size={18} className="text-gray-400" /> Top Performing Stores
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={analytics.topStores} 
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={true} vertical={false} />
                <XAxis 
                  type="number" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}k`}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#6b7280', width: 80 }}
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    fontSize: '11px'
                  }}
                  formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Sales']}
                />
                <Bar 
                  dataKey="sales" 
                  fill={chartColors.primary} 
                  radius={[0, 8, 8, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dispute Rate Trend */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-gray-400" /> Dispute Rate Trend
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.disputeRate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  interval={analytics.disputeRate.length > 14 ? 2 : 0}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 5]}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    fontSize: '11px'
                  }}
                  formatter={(value: string) => [`${value}%`, 'Dispute Rate']}
                />
                <Line 
                  type="monotone" 
                  dataKey="rate" 
                  stroke={chartColors.danger} 
                  strokeWidth={2} 
                  dot={{ fill: chartColors.danger, strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Revenue by Category */}
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <CreditCard size={18} className="text-gray-400" /> Revenue by Category
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.revenueByCategory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis 
                dataKey="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={(value) => `₦${(value / 100000).toFixed(1)}M`}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  fontSize: '11px'
                }}
                formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']}
              />
              <Bar 
                dataKey="revenue" 
                fill={chartColors.primary} 
                radius={[8, 8, 0, 0]}
                barSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ✅ Reusable KPI Summary Card for Analytics
function KPISummary({ label, value, trend, trendIcon: TrendIcon, trendColor }: {
  label: string; value: string; trend: string; trendIcon?: any; trendColor?: string;
}) {
  return (
    <div className="bg-white rounded-[32px] border border-gray-100 p-5 shadow-sm">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <p className="text-2xl font-black text-gray-900">{value}</p>
        {TrendIcon && (
          <span className={`text-[10px] font-bold flex items-center gap-1 ${trendColor || 'text-gray-400'}`}>
            <TrendIcon size={12} /> {trend}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab (Simplified) ──
function AdminSettingsTab() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Admin Settings</h2>
        <p className="text-sm text-gray-500">Manage your admin profile and preferences</p>
      </div>
      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-700 font-bold">A</div>
          <div>
            <p className="font-bold text-sm text-gray-900">{auth.currentUser?.email}</p>
            <p className="text-[10px] text-gray-400 uppercase">Super Admin</p>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Email</label>
          <input type="email" defaultValue={auth.currentUser?.email} disabled className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-400" />
        </div>
        <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-bold">Change Password</button>
        <hr className="border-gray-100" />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-gray-900">Two-Factor Authentication</p>
            <p className="text-[10px] text-gray-400">Add an extra layer of security</p>
          </div>
          <button className="px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-bold hover:bg-green-700">Enable 2FA</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🧩 REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════

function NavItem({ icon, label, active, onClick, badge = null }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number | string | null }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? "bg-green-600 text-white shadow-lg shadow-green-100" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}>
      <div className="flex items-center gap-3">{icon}{label}</div>
      {badge !== null && badge !== undefined && badge > 0 && <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

function KPICard({ icon: Icon, label, value, trend, trendColor, onClick }: { icon: any; label: string; value: string; trend: string; trendColor?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`p-4 rounded-2xl border border-gray-100 hover:shadow-md transition-all text-left ${onClick ? 'hover:scale-[1.02] cursor-pointer' : ''} bg-white`}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50"><Icon size={20} className="text-gray-400" /></div>
        <span className={`text-[10px] font-bold flex items-center gap-1 ${trendColor || 'text-gray-400'}`}>{trend}</span>
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
    </button>
  );
}

function QuickAction({ icon: Icon, label, onClick, color }: { icon: any; label: string; onClick: () => void; color: string }) {
  const colors: Record<string, string> = { blue: "bg-blue-600 hover:bg-blue-700", green: "bg-green-600 hover:bg-green-700", purple: "bg-purple-600 hover:bg-purple-700", red: "bg-red-600 hover:bg-red-700" };
  return (
    <button onClick={onClick} className={`p-4 rounded-2xl text-white ${colors[color]} transition-all hover:scale-[1.02] flex flex-col items-center gap-2 shadow-sm`}>
      <Icon size={24} /><span className="font-bold text-sm">{label}</span>
    </button>
  );
}

function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const config: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-700' }, verified: { label: 'Verified', color: 'bg-blue-100 text-blue-700' },
    banned: { label: 'Banned', color: 'bg-red-100 text-red-700' }, suspended: { label: 'Suspended', color: 'bg-amber-100 text-amber-700' },
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' }, open: { label: 'Open', color: 'bg-red-100 text-red-700' },
    under_review: { label: 'Review', color: 'bg-amber-100 text-amber-700' }, resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700' }
  };
  const { label, color } = config[status.toLowerCase()] || config.pending;
  return <span className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider ${color} ${size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs'}`}>{label}</span>;
}

// ═══════════════════════════════════════════════════════════
// 🎯 MAIN ADMIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════

export default function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // ✅ Tab state - syncs with URL query param for shareability
  const [activeTab, setActiveTab] = useState(() => searchParams?.get("tab") || "home");
  
  // ✅ Stats state
  const [stats, setStats] = useState({ totalUsers: 0, activeStores: 0, pendingPayouts: 0, openDisputes: 0, loading: true });

  // ✅ Add this with your other useState declarations in AdminDashboard
  const [chats, setChats] = useState<any[]>([]);

  const [pendingVerifications, setPendingVerifications] = useState(0);

  useEffect(() => {
  // Lightweight listener just for the badge count
  const q = query(collection(db, "store_verifications"), where("status", "==", "pending"));
  const unsub = onSnapshot(q, (snap) => setPendingVerifications(snap.size));
  return () => unsub();
  }, []);

  // ✅ Load stats on mount
  useEffect(() => {
    async function loadStats() {
      try {
        const [users, stores, payouts, disputes] = await Promise.all([
          getDocs(query(collection(db, "users"), limit(1000))),
          getDocs(query(collection(db, "stores"), where("status", "in", ["active", "verified"]), limit(1000))),
          getDocs(query(collection(db, "payouts"), where("status", "==", "pending"), limit(1000))),
          getDocs(query(collection(db, "disputes"), where("status", "in", ["open", "under_review"]), limit(1000)))
        ]);
        // ✅ Load chats for sidebar badge
      if (auth.currentUser) {
        const chatsRef = collection(db, "admin_chats");
        const q = query(chatsRef, orderBy("lastMessageAt", "desc"), limit(50));
        const unsub = onSnapshot(q, (snap) => {
          setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub(); // Cleanup listener
      }

        setStats({ totalUsers: users.size, activeStores: stores.size, pendingPayouts: payouts.size, openDisputes: disputes.size, loading: false });
      } catch (e) { console.error("Stats load failed:", e); setStats(s => ({ ...s, loading: false })); }
    }
    loadStats();
  }, []);

  // ✅ Sync tab with URL (for shareable links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab !== "home") params.set("tab", activeTab);
    else params.delete("tab");
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", newUrl);
  }, [activeTab]);

  // ✅ Tab navigation handler
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // ✅ Tab content mapping
  const renderTabContent = () => {
    switch (activeTab) {
      case "home": return <AdminHome stats={stats} onNavigate={handleTabChange} />;
      case "users": return <AdminUsersTab/>;
      case "stores": return <AdminStoresTab/>;
      case "orders": return <AdminOrdersTab/>;
      case "payouts": return <AdminPayoutsTab/>;
      case "disputes": return <AdminDisputesTab/>;
      case "notifications": return <AdminNotificationsTab/>;
      case "chat": return <AdminChatTab initialChats={chats} />;  
      case "analytics": return <AdminAnalyticsTab/>;
      case "verifications": return <AdminVerificationsTab/>;  
      case "settings": return <AdminSettingsTab/>;
      default: return <AdminHome stats={stats} onNavigate={handleTabChange} />;
    }
  };

  // ✅ Safe unread count calculator
  const totalUnreadChats = useMemo(() => 
    chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0), 
    [chats]
  );

  return (
    <div className={`${font.className} flex h-screen overflow-hidden bg-gray-50 text-gray-900`}>
      {/* Sidebar - Matches buyer dashboard */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 hidden md:flex flex-col p-6 h-full">
        <div className="flex items-center px-2 py-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded-xl flex items-center justify-center"><ShieldCheck size={16} className="text-white" /></div>
            <span className="font-black text-sm text-gray-900">Zebble Admin</span>
          </div>
        </div>
        
        <nav className="space-y-1 flex-1 overflow-y-auto no-scrollbar">
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === "home"} onClick={() => handleTabChange("home")} />
          <NavItem icon={<Users size={18} />} label="Users" active={activeTab === "users"} onClick={() => handleTabChange("users")} badge={stats.totalUsers > 1000 ? "1k+" : null} />
          <NavItem icon={<Store size={18} />} label="Stores" active={activeTab === "stores"} onClick={() => handleTabChange("stores")} badge={stats.activeStores > 100 ? "100+" : null} />
          <NavItem icon={<CreditCard size={18} />} label="Payouts" active={activeTab === "payouts"} onClick={() => handleTabChange("payouts")} badge={stats.pendingPayouts > 0 ? stats.pendingPayouts : null} />
          <NavItem icon={<AlertTriangle size={18} />} label="Disputes" active={activeTab === "disputes"} onClick={() => handleTabChange("disputes")} badge={stats.openDisputes > 0 ? stats.openDisputes : null} />
          <NavItem icon={<MessageSquare size={18} />} label="Chat" active={activeTab === "chat"} onClick={() => handleTabChange("chat")}badge={totalUnreadChats > 0 ? totalUnreadChats : null}/>
          <NavItem icon={<Bell size={18} />} label="Notifications" active={activeTab === "notifications"} onClick={() => handleTabChange("notifications")} />
          <NavItem icon={<TrendingUp size={18} />} label="Analytics" active={activeTab === "analytics"} onClick={() => handleTabChange("analytics")} />
          <NavItem icon={<ShieldCheck size={18} />} label="Verifications" active={activeTab === "verifications"} onClick={() => handleTabChange("verifications")}badge={pendingVerifications > 0 ? pendingVerifications : null}/>
        </nav>

        <div className="pt-6 border-t border-gray-100">
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === "settings"} onClick={() => handleTabChange("settings")} />
          <button onClick={async () => {
            try {
              await signOut(auth);
            } finally {
              await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
              router.replace('/admin/login');
            }
          }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 mt-1 transition-colors">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header - Matches buyer dashboard */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 px-6 pt-6">
          <div>
            <h1 className="text-2xl font-extrabold capitalize tracking-tight">{activeTab.replace("-", " ")}</h1>
            <p className="text-gray-400 text-sm font-bold">
              {activeTab === "home" ? "Real-time platform metrics and quick actions" :
               activeTab === "users" ? "Manage buyer and vendor accounts" :
               activeTab === "stores" ? "Review, approve, and manage vendor stores" :
               activeTab === "payouts" ? "Review and approve vendor payout requests" :
               activeTab === "disputes" ? "Review and resolve customer disputes" :
               activeTab === "chat" ? "Real-time support & user communication hub" :
               activeTab === "notifications" ? "Broadcast announcements to users or vendors" :
               activeTab === "analytics" ? "Track growth, revenue, and engagement metrics" :
               activeTab === "settings" ? "Manage your admin profile and preferences" :
               "Admin dashboard"} {/* ✅ Final fallback - removed the "..." */}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-2xl hover:border-green-600 transition-all shadow-sm text-xs font-bold w-64 focus:ring-2 focus:ring-green-500/20 outline-none" />
            </div>
            <div className="p-2.5 bg-white border border-gray-200 text-gray-500 rounded-2xl hover:text-green-600 transition-all shadow-sm cursor-pointer relative">
              <Bell size={18} /><span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-green-100">
              <ShieldCheck size={14} /> Admin Mode
            </div>
          </div>
        </header>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto px-6 pb-10 no-scrollbar">{renderTabContent()}</div>
      </main>
    </div>
  );
}
