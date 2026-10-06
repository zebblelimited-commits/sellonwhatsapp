"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import Image from "next/image";
import { CheckCircle2, Clock, Eye, Loader2, ShieldCheck, Sparkles, Store as StoreIcon, Trash2, XCircle, RotateCcw } from "lucide-react";
import { db } from "@/lib/firebase";
import { ActionConfirmModal } from "@/components/admin/ActionConfirmModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { adminMutation } from "@/components/admin/adminApi";

type AdminStore = {
  id: string;
  storeName?: string;
  username?: string;
  vendorId?: string;
  ownerId?: string;
  uid?: string;
  status?: string;
  isVerified?: boolean;
  isApproved?: boolean;
  isSponsored?: boolean;
  adminSponsored?: boolean;
  boostSponsored?: boolean;
  logoUrl?: string;
  category?: string;
  location?: string;
  address?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  escrowBalance?: number;
  totalSales?: number;
  add_to_cart_clicks?: number;
  rejectionReason?: string;
  suspensionReason?: string;
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

function StoreDetail({ store, onClose, onReset }: { store: AdminStore; onClose: () => void; onReset: (action: string) => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
              {store.logoUrl ? <Image src={store.logoUrl} alt="" fill className="object-cover" sizes="56px" /> : <StoreIcon className="text-gray-300" />}
            </div>
            <div><h3 className="text-lg font-black">{store.storeName || "Unnamed Store"}</h3><p className="text-xs text-gray-500">@{store.username || "—"}</p></div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100" aria-label="Close"><span className="text-xl">×</span></button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[["Store ID", store.id], ["Owner", store.vendorId || store.ownerId || store.uid || "—"], ["Status", store.status || "pending"], ["Sponsored", store.isSponsored ? "Yes" : "No"], ["Verified", store.isVerified ? "Yes" : "No"], ["Category", store.category || "—"], ["Created", displayDate(store.createdAt)], ["Updated", displayDate(store.updatedAt)], ["Location", store.location || store.address || "—"]].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-gray-50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1 break-words text-sm font-bold text-gray-800">{String(value)}</p></div>
          ))}
        </div>
        {(store.rejectionReason || store.suspensionReason) && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700"><b>Admin note:</b> {store.rejectionReason || store.suspensionReason}</div>}
        <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 shrink-0 text-amber-700" size={17} />
            <div>
              <p className="text-sm font-black text-amber-900">Administrative reset controls</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">These actions reset counters to zero. They do not delete orders or products and require a reason.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => onReset("reset_escrow_balance")} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-left text-[11px] font-bold text-red-700 hover:bg-red-50">
              Reset escrow<br /><span className="font-black">₦{Number(store.escrowBalance || 0).toLocaleString("en-NG")}</span>
            </button>
            <button type="button" onClick={() => onReset("reset_total_sales")} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-[11px] font-bold text-amber-700 hover:bg-amber-50">
              Reset total sales<br /><span className="font-black">₦{Number(store.totalSales || 0).toLocaleString("en-NG")}</span>
            </button>
            <button type="button" onClick={() => onReset("reset_add_to_cart_clicks")} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-left text-[11px] font-bold text-blue-700 hover:bg-blue-50">
              Reset add-to-cart<br /><span className="font-black">{Number(store.add_to_cart_clicks || 0).toLocaleString("en-NG")} clicks</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminStoresManagement() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedStore, setSelectedStore] = useState<AdminStore | null>(null);
  const [actionModal, setActionModal] = useState<{ type: string; store: AdminStore } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sponsoringId, setSponsoringId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "stores"), limit(1000)), (snapshot) => {
      const normalized = snapshot.docs.map((item): AdminStore => ({ id: item.id, ...(item.data() as Record<string, unknown>) }));
      setStores(normalized.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)));
      setListenerError("");
      setLoading(false);
    }, (error) => {
      console.error("Admin stores listener error:", error);
      setListenerError("Stores could not be loaded. Check admin permissions and try again.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAction = async (reason: string) => {
    if (!actionModal) return;
    setActionLoading(true); setActionError("");
    try {
      const result = await adminMutation<{ field?: string; value?: number }>(`/api/admin/stores/${actionModal.store.id}`, { action: actionModal.type, reason });
      if (result.field) {
        setStores((current) => current.map((item) => item.id === actionModal.store.id ? { ...item, [result.field as string]: result.value ?? 0 } : item));
        setSelectedStore((current) => current && current.id === actionModal.store.id ? { ...current, [result.field as string]: result.value ?? 0 } : current);
      }
      setActionModal(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Store action failed");
    } finally { setActionLoading(false); }
  };

  const toggleSponsored = async (store: AdminStore) => {
    setSponsoringId(store.id); setActionError("");
    try {
      const result = await adminMutation<{ isSponsored?: boolean }>(`/api/admin/stores/${store.id}`, { action: "sponsorship", isSponsored: store.adminSponsored !== true });
      setStores((current) => current.map((item) => item.id === store.id ? { ...item, isSponsored: result.isSponsored === true, adminSponsored: store.adminSponsored !== true } : item));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Store sponsorship could not be updated");
    } finally { setSponsoringId(null); }
  };

  const openResetAction = (action: string) => {
    if (!selectedStore) return;
    setActionModal({ type: action, store: selectedStore });
  };

  const orderedStores = useMemo(() => stores, [stores]);
  if (loading) return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={32} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {(listenerError || actionError) && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{listenerError || actionError}</div>}
      <div><h2 className="text-xl font-bold">Store Management</h2><p className="text-sm text-gray-500">Approve, reject, verify, suspend, restore, delete, or sponsor marketplace stores.</p></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderedStores.map((store) => {
          const status = store.status || (store.isVerified ? "verified" : "pending");
          const manualSponsored = store.adminSponsored === true;
          return (
            <div key={store.id} className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4"><div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">{store.logoUrl ? <Image src={store.logoUrl} alt="" fill className="object-cover" sizes="64px" /> : <StoreIcon className="text-gray-300" size={28} />}</div><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold">{store.storeName || "Unnamed Store"}</h4><p className="truncate text-[10px] text-gray-400">@{store.username || "—"}</p><div className="mt-2"><StatusBadge status={status} /></div></div></div>
              <p className="mt-4 text-[11px] text-gray-400">Created {displayDate(store.createdAt)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setSelectedStore(store)} className="rounded-xl bg-gray-50 p-2 text-gray-500 hover:bg-gray-100" title="View details"><Eye size={15} /></button>
                <button type="button" disabled={sponsoringId === store.id} onClick={() => void toggleSponsored(store)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${manualSponsored ? "bg-green-600" : "bg-gray-300"} disabled:cursor-wait disabled:opacity-60`} role="switch" aria-checked={manualSponsored} aria-label={`${manualSponsored ? "Remove" : "Add"} ${store.storeName || "store"} ${manualSponsored ? "from" : "to"} sponsored stores`}>{sponsoringId === store.id ? <Loader2 className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 animate-spin text-white" /> : <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${manualSponsored ? "translate-x-6" : "translate-x-1"}`} />}</button>
                {store.isSponsored && <Sparkles className="text-green-600" size={15} aria-label="Sponsored store" />}
                {store.boostSponsored && <span className="rounded-full bg-purple-50 px-2 py-1 text-[9px] font-bold text-purple-700">Boost</span>}
                {status === "pending" && <><button onClick={() => setActionModal({ type: "approve", store })} className="rounded-xl bg-green-600 p-2 text-white hover:bg-green-700" title="Approve"><CheckCircle2 size={15} /></button><button onClick={() => setActionModal({ type: "reject", store })} className="rounded-xl bg-red-50 p-2 text-red-600 hover:bg-red-100" title="Reject"><XCircle size={15} /></button></>}
                {status !== "banned" && status !== "suspended" && <button onClick={() => setActionModal({ type: "suspend", store })} className="rounded-xl bg-amber-50 p-2 text-amber-700 hover:bg-amber-100" title="Suspend"><Clock size={15} /></button>}
                {!store.isVerified && <button onClick={() => setActionModal({ type: "verify", store })} className="rounded-xl bg-blue-50 p-2 text-blue-600 hover:bg-blue-100" title="Verify"><ShieldCheck size={15} /></button>}
                {(status === "suspended" || status === "rejected" || status === "banned") && <button onClick={() => setActionModal({ type: "restore", store })} className="rounded-xl bg-green-50 p-2 text-green-700 hover:bg-green-100" title="Restore"><CheckCircle2 size={15} /></button>}
                <button onClick={() => setActionModal({ type: "delete", store })} className="rounded-xl bg-red-50 p-2 text-red-700 hover:bg-red-100" title="Permanently delete store and products"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {orderedStores.length === 0 && <div className="rounded-2xl bg-white p-10 text-center text-sm text-gray-400">No stores found.</div>}
      {selectedStore && <StoreDetail store={selectedStore} onClose={() => setSelectedStore(null)} onReset={openResetAction} />}
      {actionModal && <ActionConfirmModal action={actionModal.type} target={actionModal.store.storeName || actionModal.store.id} onConfirm={handleAction} onCancel={() => setActionModal(null)} loading={actionLoading} />}
    </div>
  );
}
