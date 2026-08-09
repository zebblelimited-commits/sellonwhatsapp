"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { AlertCircle, Edit3, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { adminMutation, adminUpload } from "@/components/admin/adminApi";

type SponsoredStore = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  bgImageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type SponsoredStoreForm = Omit<SponsoredStore, "id">;

const emptyForm: SponsoredStoreForm = {
  title: "Featured Store",
  description: "Discover products from this featured store.",
  ctaText: "View Store",
  ctaUrl: "/explore",
  bgImageUrl: "/images/placeholder-cover.svg",
  sortOrder: 1,
  isActive: true,
};

function normalizeCard(id: string, data: Record<string, unknown>): SponsoredStore {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "Sponsored Store",
    description: typeof data.description === "string" ? data.description : "",
    ctaText: typeof data.ctaText === "string" ? data.ctaText : "View Store",
    ctaUrl: typeof data.ctaUrl === "string" ? data.ctaUrl : "/explore",
    bgImageUrl: typeof data.bgImageUrl === "string" ? data.bgImageUrl : "/images/placeholder-cover.svg",
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    isActive: data.isActive !== false,
  };
}

export default function AdminSponsoredStoresPanel() {
  const [cards, setCards] = useState<SponsoredStore[]>([]);
  const [form, setForm] = useState<SponsoredStoreForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cardsQuery = query(collection(db, "sponsored_stores"), orderBy("sortOrder", "asc"));
    return onSnapshot(
      cardsQuery,
      (snapshot) => {
        setCards(snapshot.docs.map((item) => normalizeCard(item.id, item.data())));
        setLoading(false);
        setError("");
      },
      (listenerError) => {
        console.error("Sponsored stores listener error:", listenerError);
        setError("Sponsored cards could not be loaded. Check the admin Firestore permission.");
        setLoading(false);
      },
    );
  }, []);

  const activeCount = useMemo(() => cards.filter((card) => card.isActive).length, [cards]);

  function updateField<K extends keyof SponsoredStoreForm>(field: K, value: SponsoredStoreForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setIsCreating(true);
    setForm({ ...emptyForm, sortOrder: cards.length + 1 });
    setError("");
    setMessage("");
  }

  function startEdit(card: SponsoredStore) {
    setEditingId(card.id);
    setIsCreating(false);
    setForm({
      title: card.title,
      description: card.description,
      ctaText: card.ctaText,
      ctaUrl: card.ctaUrl,
      bgImageUrl: card.bgImageUrl,
      sortOrder: card.sortOrder,
      isActive: card.isActive,
    });
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setIsCreating(false);
    setForm(emptyForm);
    setError("");
  }

  async function uploadImage(file: File) {
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const result = await adminUpload<{ url: string }>("/api/admin/sponsored-images", file);
      updateField("bgImageUrl", result.url);
      setMessage("Image uploaded. Save the card to publish it.");
    } catch (uploadError) {
      console.error("Sponsored image upload error:", uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "The sponsored image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function saveCard() {
    setError("");
    setMessage("");
    if (!form.title.trim() || !form.description.trim() || !form.bgImageUrl.trim()) {
      setError("Add a title, description, and background image before saving the card.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        ctaText: form.ctaText.trim() || "View Store",
        ctaUrl: form.ctaUrl.trim() || "/explore",
        bgImageUrl: form.bgImageUrl.trim(),
        sortOrder: Math.max(0, Number(form.sortOrder) || 0),
      };
      if (editingId) {
        await adminMutation("/api/admin/sponsored-stores", { action: "update", id: editingId, ...payload });
        setMessage("Sponsored card updated.");
      } else {
        await adminMutation("/api/admin/sponsored-stores", { action: "create", ...payload });
        setMessage("Sponsored card added.");
      }
      setEditingId(null);
      setIsCreating(false);
      setForm(emptyForm);
    } catch (saveError) {
      console.error("Sponsored card save error:", saveError);
      setError(saveError instanceof Error ? saveError.message : "The sponsored card could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCard(card: SponsoredStore) {
    if (!window.confirm(`Delete “${card.title}” from sponsored stores?`)) return;
    setError("");
    try {
      await adminMutation("/api/admin/sponsored-stores", { action: "delete", id: card.id });
      if (editingId === card.id) cancelEdit();
      setMessage("Sponsored card deleted.");
    } catch (deleteError) {
      console.error("Sponsored card delete error:", deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "The sponsored card could not be deleted.");
    }
  }

  async function toggleCard(card: SponsoredStore) {
    setError("");
    try {
      await adminMutation("/api/admin/sponsored-stores", { action: "toggle", id: card.id, isActive: !card.isActive });
    } catch (toggleError) {
      console.error("Sponsored card status error:", toggleError);
      setError(toggleError instanceof Error ? toggleError.message : "The sponsored card status could not be updated.");
    }
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900">Sponsored store cards</h3>
          <p className="mt-1 text-xs text-gray-500">Publish up to four featured cards on the homepage. {activeCount} active.</p>
        </div>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700">
          <Plus size={15} /> Add sponsored card
        </button>
      </div>

      {message && <div className="rounded-2xl bg-green-50 p-3 text-xs font-medium text-green-700">{message}</div>}
      {error && <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700"><AlertCircle size={15} />{error}</div>}

      {editingId !== null || isCreating || cards.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-green-100 bg-green-50/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-gray-900">{editingId ? "Edit sponsored card" : "New sponsored card"}</h4>
            {editingId && <button type="button" onClick={cancelEdit} className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-700"><X size={16} /></button>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[11px] font-bold text-gray-600">Card title<input value={form.title} onChange={(event) => updateField("title", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Button text<input value={form.ctaText} onChange={(event) => updateField("ctaText", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600 md:col-span-2">Description<textarea rows={2} value={form.description} onChange={(event) => updateField("description", event.target.value)} className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Store/page link<input value={form.ctaUrl} onChange={(event) => updateField("ctaUrl", event.target.value)} placeholder="/store-name or https://..." className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Display order<input type="number" min={0} value={form.sortOrder} onChange={(event) => updateField("sortOrder", Number(event.target.value))} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <div className="text-[11px] font-bold text-gray-600 md:col-span-2">
              <span className="inline-flex items-center gap-1"><ImageIcon size={13} />Background image URL</span>
              <input value={form.bgImageUrl} onChange={(event) => updateField("bgImageUrl", event.target.value)} placeholder="/images/sponsored/store.webp or https://..." className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" />
              <span className="mt-2 flex items-center gap-3">
                <input id="sponsored-image-picker" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadImage(file); }} />
                <label htmlFor="sponsored-image-picker" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-gray-700"><Upload size={13} />{uploading ? "Uploading..." : "Choose image"}</label>
                <span className="truncate text-[10px] font-medium text-gray-400">Saved to /images/sponsored/</span>
              </span>
            </div>
            <label className="flex items-center gap-2 self-end rounded-xl bg-white p-3 text-xs font-bold text-gray-700"><input type="checkbox" checked={form.isActive} onChange={(event) => updateField("isActive", event.target.checked)} className="h-4 w-4 accent-green-600" />Active on homepage</label>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || uploading} onClick={() => void saveCard()} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{saving ? "Saving..." : "Save card"}</button>{editingId && <button type="button" onClick={cancelEdit} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-gray-600">Cancel</button>}</div>
        </div>
      ) : null}

      {loading ? <div className="flex items-center justify-center rounded-2xl bg-gray-50 p-8"><Loader2 className="animate-spin text-green-600" size={22} /></div> : cards.length === 0 ? <p className="rounded-2xl bg-gray-50 p-5 text-center text-xs font-medium text-gray-500">Add your first sponsored card above to publish it.</p> : <div className="space-y-3">{cards.map((card) => <div key={card.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 p-4"><div className="h-12 w-16 shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(card.bgImageUrl)})` }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900">{card.title}</p><p className="mt-1 truncate text-xs text-gray-500">{card.description}</p></div><button type="button" onClick={() => void toggleCard(card)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${card.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{card.isActive ? "Active" : "Hidden"}</button><div className="flex items-center gap-1"><button type="button" title="Edit sponsored card" onClick={() => startEdit(card)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-900"><Edit3 size={15} /></button><button type="button" title="Delete sponsored card" onClick={() => void removeCard(card)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div></div>)}</div>}
    </section>
  );
}
