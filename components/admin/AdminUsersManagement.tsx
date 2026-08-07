"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Eye, Loader2, Search, ShieldCheck, User, XCircle, Clock, CheckCircle2 } from "lucide-react";
import { ActionConfirmModal } from "@/components/admin/ActionConfirmModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminMutation } from "@/components/admin/adminApi";

type AdminUser = {
  id: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  status?: string;
  isBanned?: boolean;
  isSuspended?: boolean;
  isVerified?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  phone?: string;
  phoneNumber?: string;
  banReason?: string;
  suspendReason?: string;
  [key: string]: unknown;
};

function dateValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return new Date(value as string | number).getTime() || 0;
}

function displayDate(value: unknown) {
  const timestamp = dateValue(value);
  return timestamp ? new Date(timestamp).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function userStatus(user: AdminUser) {
  if (user.isBanned || user.status === "banned") return "banned";
  if (user.isSuspended || user.status === "suspended") return "suspended";
  if (user.isVerified) return "verified";
  return "active";
}

function UserDetail({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100"><User className="text-gray-400" /></div>
            <div><h3 className="text-lg font-black">{user.displayName || "Unnamed User"}</h3><p className="text-xs text-gray-500">{user.email || "No email"}</p></div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100" aria-label="Close"><span className="text-xl">×</span></button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["User ID", user.id], ["Role", user.role || "—"], ["Status", userStatus(user)],
            ["Verified", user.isVerified ? "Yes" : "No"], ["Joined", displayDate(user.createdAt)],
            ["Updated", displayDate(user.updatedAt)], ["Phone", user.phoneNumber || user.phone || "—"],
            ["Name", [user.firstName, user.lastName].filter(Boolean).join(" ") || user.displayName || "—"],
          ].map(([label, value]) => <div key={label} className="rounded-2xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-gray-800">{String(value)}</p></div>)}
        </div>
        {(user.banReason || user.suspendReason) && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700"><b>Admin note:</b> {user.banReason || user.suspendReason}</div>}
      </div>
    </div>
  );
}

export default function AdminUsersManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");
  const [actionError, setActionError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionModal, setActionModal] = useState<{ type: string; user: AdminUser } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Do not order by createdAt here: legacy profiles may not have that field.
    const unsubscribe = onSnapshot(query(collection(db, "users"), limit(1000)), (snapshot) => {
      const normalized = snapshot.docs.map((item): AdminUser => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
      setUsers(normalized.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
      setListenerError("");
      setLoading(false);
    }, (error) => {
      console.error("Admin users listener error:", error);
      setListenerError("Users could not be loaded. Check admin permissions and try again.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const needle = searchQuery.toLowerCase();
    const matchesSearch = !needle || [user.email, user.displayName, user.firstName, user.lastName].some((value) => String(value || "").toLowerCase().includes(needle));
    const status = userStatus(user);
    return matchesSearch && (statusFilter === "all" || status === statusFilter);
  }), [users, searchQuery, statusFilter]);

  const handleAction = async (reason: string) => {
    if (!actionModal) return;
    setActionLoading(true);
    setActionError("");
    try {
      await adminMutation(`/api/admin/users/${actionModal.user.id}`, { action: actionModal.type, reason });
      setActionModal(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "User action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={32} /></div>;

  return <div className="space-y-6 animate-in fade-in duration-300">
    {(listenerError || actionError) && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{listenerError || actionError}</div>}
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold">User Management</h2><p className="text-sm text-gray-500">Standardized buyer and vendor account controls</p></div><div className="flex items-center gap-3"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search users..." className="w-64 rounded-xl border border-gray-100 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-green-500" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm font-bold"><option value="all">All Status</option><option value="active">Active</option><option value="verified">Verified</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></div></div>
    <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50"><tr>{["User", "Role", "Status", "Joined", "Actions"].map((heading) => <th key={heading} className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-50">{filteredUsers.map((user) => { const status = userStatus(user); return <tr key={user.id} className="hover:bg-gray-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100"><User size={17} className="text-gray-400" /></div><div><p className="text-sm font-bold">{user.displayName || "Unnamed User"}</p><p className="text-[10px] text-gray-400">{user.email || user.id}</p></div></div></td><td className="px-5 py-4 text-xs font-bold capitalize text-gray-500">{user.role || "unknown"}</td><td className="px-5 py-4"><StatusBadge status={status} /></td><td className="px-5 py-4 text-xs text-gray-500">{displayDate(user.createdAt)}</td><td className="px-5 py-4"><div className="flex items-center gap-1"><button onClick={() => setSelectedUser(user)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="View details"><Eye size={15} /></button>{status === "banned" || status === "suspended" ? <button onClick={() => setActionModal({ type: "restore", user })} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Restore"><CheckCircle2 size={15} /></button> : <><button onClick={() => setActionModal({ type: "suspend", user })} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50" title="Suspend"><Clock size={15} /></button><button onClick={() => setActionModal({ type: "ban", user })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Ban"><XCircle size={15} /></button></>}{!user.isVerified && <button onClick={() => setActionModal({ type: "verify", user })} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Verify"><ShieldCheck size={15} /></button>}</div></td></tr>; })}</tbody></table></div>{filteredUsers.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No users found matching your filters.</div>}</div>
    {selectedUser && <UserDetail user={selectedUser} onClose={() => setSelectedUser(null)} />}
    {actionModal && <ActionConfirmModal action={actionModal.type} target={actionModal.user.displayName || actionModal.user.email || actionModal.user.id} onConfirm={handleAction} onCancel={() => setActionModal(null)} loading={actionLoading} />}
  </div>;
}
