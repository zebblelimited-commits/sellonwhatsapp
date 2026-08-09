"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { AlertCircle, Edit3, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { adminMutation, adminUpload } from "@/components/admin/adminApi";

type HeroSlide = {
  id: string;
  eyebrow: string;
  titleBefore: string;
  highlight: string;
  titleAfter: string;
  description: string;
  backgroundImageUrl: string;
  imageUrl: string;
  eyebrowColor: string;
  titleColor: string;
  highlightColor: string;
  descriptionColor: string;
  primaryButtonTextColor: string;
  featureTextColor: string;
  primaryLabel: string;
  primaryUrl: string;
  secondaryLabel: string;
  secondaryUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type HeroSlideForm = Omit<HeroSlide, "id">;

const emptyForm: HeroSlideForm = {
  eyebrow: "Join 10,000+ vendors already selling",
  titleBefore: "Sell on",
  highlight: "WhatsApp",
  titleAfter: "like a real online store",
  description: "Create your mini storefront and sell products instantly without a website.",
  backgroundImageUrl: "/images/hero/sellon-hero-bg.webp",
  imageUrl: "",
  eyebrowColor: "#39e878",
  titleColor: "#ffffff",
  highlightColor: "#00d95f",
  descriptionColor: "#d7fbe4",
  primaryButtonTextColor: "#00a63e",
  featureTextColor: "#6b7280",
  primaryLabel: "Start Selling",
  primaryUrl: "/register",
  secondaryLabel: "See Demo",
  secondaryUrl: "/how-it-works",
  sortOrder: 1,
  isActive: true,
};

function colorField(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function toSlide(id: string, data: Record<string, unknown>): HeroSlide {
  return {
    id,
    eyebrow: typeof data.eyebrow === "string" ? data.eyebrow : emptyForm.eyebrow,
    titleBefore: typeof data.titleBefore === "string" ? data.titleBefore : "Sell on",
    highlight: typeof data.highlight === "string" ? data.highlight : "WhatsApp",
    titleAfter: typeof data.titleAfter === "string" ? data.titleAfter : "like a real online store",
    description: typeof data.description === "string" ? data.description : "",
    backgroundImageUrl: typeof data.backgroundImageUrl === "string" ? data.backgroundImageUrl : emptyForm.backgroundImageUrl,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    eyebrowColor: colorField(data.eyebrowColor, emptyForm.eyebrowColor),
    titleColor: colorField(data.titleColor, emptyForm.titleColor),
    highlightColor: colorField(data.highlightColor, emptyForm.highlightColor),
    descriptionColor: colorField(data.descriptionColor, emptyForm.descriptionColor),
    primaryButtonTextColor: colorField(data.primaryButtonTextColor, emptyForm.primaryButtonTextColor),
    featureTextColor: colorField(data.featureTextColor, emptyForm.featureTextColor),
    primaryLabel: typeof data.primaryLabel === "string" ? data.primaryLabel : "Start Selling",
    primaryUrl: typeof data.primaryUrl === "string" ? data.primaryUrl : "/register",
    secondaryLabel: typeof data.secondaryLabel === "string" ? data.secondaryLabel : "See Demo",
    secondaryUrl: typeof data.secondaryUrl === "string" ? data.secondaryUrl : "/how-it-works",
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    isActive: data.isActive !== false,
  };
}

export default function AdminHeroSlidesPanel() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [form, setForm] = useState<HeroSlideForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingField, setUploadingField] = useState<"backgroundImageUrl" | "imageUrl" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const slidesQuery = query(collection(db, "hero_slides"), orderBy("sortOrder", "asc"));
    return onSnapshot(
      slidesQuery,
      (snapshot) => {
        setSlides(snapshot.docs.map((item) => toSlide(item.id, item.data())));
        setLoading(false);
        setError("");
      },
      (listenerError) => {
        console.error("Hero slides listener error:", listenerError);
        setError("Hero slides could not be loaded. Check the admin Firestore permission.");
        setLoading(false);
      },
    );
  }, []);

  const activeCount = useMemo(() => slides.filter((slide) => slide.isActive).length, [slides]);

  function updateField<K extends keyof HeroSlideForm>(field: K, value: HeroSlideForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function uploadHeroImage(field: "backgroundImageUrl" | "imageUrl", file: File) {
    setError("");
    setMessage("");
    setUploadingField(field);
    try {
      const result = await adminUpload<{ url: string }>("/api/admin/hero-images", file);
      updateField(field, result.url);
      setMessage("Image uploaded. Save the slide to publish it.");
    } catch (uploadError) {
      console.error("Hero image upload error:", uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "The hero image could not be uploaded.");
    } finally {
      setUploadingField(null);
    }
  }

  function startCreate() {
    setEditingId(null);
    setIsCreating(true);
    setForm({ ...emptyForm, sortOrder: slides.length + 1 });
    setError("");
    setMessage("");
  }

  function startEdit(slide: HeroSlide) {
    setEditingId(slide.id);
    setIsCreating(false);
    setForm({
      eyebrow: slide.eyebrow,
      titleBefore: slide.titleBefore,
      highlight: slide.highlight,
      titleAfter: slide.titleAfter,
      description: slide.description,
      backgroundImageUrl: slide.backgroundImageUrl,
      imageUrl: slide.imageUrl,
      eyebrowColor: slide.eyebrowColor,
      titleColor: slide.titleColor,
      highlightColor: slide.highlightColor,
      descriptionColor: slide.descriptionColor,
      primaryButtonTextColor: slide.primaryButtonTextColor,
      featureTextColor: slide.featureTextColor,
      primaryLabel: slide.primaryLabel,
      primaryUrl: slide.primaryUrl,
      secondaryLabel: slide.secondaryLabel,
      secondaryUrl: slide.secondaryUrl,
      sortOrder: slide.sortOrder,
      isActive: slide.isActive,
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

  async function saveSlide() {
    setError("");
    setMessage("");
    if (!form.titleBefore.trim() || !form.highlight.trim() || !form.titleAfter.trim() || !form.description.trim()) {
      setError("Add the title parts and description before saving the slide.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        eyebrow: form.eyebrow.trim(),
        titleBefore: form.titleBefore.trim(),
        highlight: form.highlight.trim(),
        titleAfter: form.titleAfter.trim(),
        description: form.description.trim(),
        backgroundImageUrl: form.backgroundImageUrl.trim(),
        imageUrl: form.imageUrl.trim(),
        eyebrowColor: form.eyebrowColor,
        titleColor: form.titleColor,
        highlightColor: form.highlightColor,
        descriptionColor: form.descriptionColor,
        primaryButtonTextColor: form.primaryButtonTextColor,
        featureTextColor: form.featureTextColor,
        primaryLabel: form.primaryLabel.trim(),
        primaryUrl: form.primaryUrl.trim() || "/register",
        secondaryLabel: form.secondaryLabel.trim(),
        secondaryUrl: form.secondaryUrl.trim() || "/how-it-works",
        sortOrder: Math.max(0, Number(form.sortOrder) || 0),
      };
      if (editingId) {
        await adminMutation("/api/admin/hero-slides", { action: "update", id: editingId, ...payload });
        setMessage("Hero slide updated.");
      } else {
        await adminMutation("/api/admin/hero-slides", { action: "create", ...payload });
        setMessage("Hero slide added.");
      }
      setEditingId(null);
      setIsCreating(false);
      setForm(emptyForm);
    } catch (saveError) {
      console.error("Hero slide save error:", saveError);
      setError("The slide could not be saved. Confirm that you are an active admin.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSlide(slide: HeroSlide) {
    if (!window.confirm(`Delete “${slide.highlight}” from the homepage hero?`)) return;
    setError("");
    try {
      await adminMutation("/api/admin/hero-slides", { action: "delete", id: slide.id });
      if (editingId === slide.id) cancelEdit();
      setMessage("Hero slide deleted.");
    } catch (deleteError) {
      console.error("Hero slide delete error:", deleteError);
      setError("The slide could not be deleted.");
    }
  }

  async function toggleSlide(slide: HeroSlide) {
    setError("");
    try {
      await adminMutation("/api/admin/hero-slides", {
        action: "toggle",
        id: slide.id,
        isActive: !slide.isActive,
      });
    } catch (toggleError) {
      console.error("Hero slide status error:", toggleError);
      setError("The slide status could not be updated.");
    }
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900">Homepage hero sliders</h3>
          <p className="mt-1 text-xs text-gray-500">Manage the rotating hero messages shown on the homepage. {activeCount} active.</p>
        </div>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700">
          <Plus size={15} /> Add slide
        </button>
      </div>

      {message && <div className="rounded-2xl bg-green-50 p-3 text-xs font-medium text-green-700">{message}</div>}
      {error && <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700"><AlertCircle size={15} />{error}</div>}

      {editingId !== null || isCreating || slides.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-green-100 bg-green-50/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-gray-900">{editingId ? "Edit slide" : "New slide"}</h4>
            {editingId && <button type="button" onClick={cancelEdit} className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-700"><X size={16} /></button>}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-[11px] font-bold text-gray-600 md:col-span-3">Small label<input value={form.eyebrow} onChange={(event) => updateField("eyebrow", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Title before highlight<input value={form.titleBefore} onChange={(event) => updateField("titleBefore", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-green-700">Green highlighted text<input value={form.highlight} onChange={(event) => updateField("highlight", event.target.value)} className="mt-1 w-full rounded-xl border border-green-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Title after highlight<input value={form.titleAfter} onChange={(event) => updateField("titleAfter", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600 md:col-span-3">Description<textarea rows={2} value={form.description} onChange={(event) => updateField("description", event.target.value)} className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <div className="text-[11px] font-bold text-gray-600 md:col-span-3"><span className="inline-flex items-center gap-1"><ImageIcon size={13} />Background image URL (optional)</span><input value={form.backgroundImageUrl} onChange={(event) => updateField("backgroundImageUrl", event.target.value)} placeholder="/images/hero/sellon-hero-bg.webp or https://..." className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /><span className="mt-2 flex items-center gap-3"><input id="hero-background-image-picker" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploadingField !== null} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadHeroImage("backgroundImageUrl", file); }} /><label htmlFor="hero-background-image-picker" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-gray-700"><Upload size={13} />{uploadingField === "backgroundImageUrl" ? "Uploading..." : "Choose background image"}</label><span className="truncate text-[10px] font-medium text-gray-400">Saved to /images/hero/</span></span></div>
            <div className="text-[11px] font-bold text-gray-600 md:col-span-3"><span className="inline-flex items-center gap-1"><ImageIcon size={13} />Hero image URL (optional)</span><input value={form.imageUrl} onChange={(event) => updateField("imageUrl", event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /><span className="mt-2 flex items-center gap-3"><input id="hero-main-image-picker" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={uploadingField !== null} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadHeroImage("imageUrl", file); }} /><label htmlFor="hero-main-image-picker" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-gray-700"><Upload size={13} />{uploadingField === "imageUrl" ? "Uploading..." : "Choose hero image"}</label><span className="truncate text-[10px] font-medium text-gray-400">Saved to /images/hero/</span></span></div>
            <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 md:col-span-3">
              <div><p className="text-xs font-black uppercase tracking-wide text-gray-700">Hero text colors</p><p className="mt-1 text-[11px] font-medium text-gray-500">Adjust these colors for contrast when you use a different background image.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Eyebrow text<input type="color" value={form.eyebrowColor} onChange={(event) => updateField("eyebrowColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Title text<input type="color" value={form.titleColor} onChange={(event) => updateField("titleColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Highlighted title<input type="color" value={form.highlightColor} onChange={(event) => updateField("highlightColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Description text<input type="color" value={form.descriptionColor} onChange={(event) => updateField("descriptionColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Button text<input type="color" value={form.primaryButtonTextColor} onChange={(event) => updateField("primaryButtonTextColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
                <label className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">Feature text<input type="color" value={form.featureTextColor} onChange={(event) => updateField("featureTextColor", event.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" /></label>
              </div>
            </div>
            <label className="text-[11px] font-bold text-gray-600">Primary button<input value={form.primaryLabel} onChange={(event) => updateField("primaryLabel", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Primary link<input value={form.primaryUrl} onChange={(event) => updateField("primaryUrl", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Display order<input type="number" min={0} value={form.sortOrder} onChange={(event) => updateField("sortOrder", Number(event.target.value))} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Secondary button<input value={form.secondaryLabel} onChange={(event) => updateField("secondaryLabel", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="text-[11px] font-bold text-gray-600">Secondary link<input value={form.secondaryUrl} onChange={(event) => updateField("secondaryUrl", event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500" /></label>
            <label className="flex items-center gap-2 self-end rounded-xl bg-white p-3 text-xs font-bold text-gray-700"><input type="checkbox" checked={form.isActive} onChange={(event) => updateField("isActive", event.target.checked)} className="h-4 w-4 accent-green-600" />Active on homepage</label>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void saveSlide()} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Save size={14} />{saving ? "Saving..." : "Save slide"}</button>{editingId && <button type="button" onClick={cancelEdit} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-gray-600">Cancel</button>}</div>
        </div>
      ) : null}

      {loading ? <div className="flex items-center justify-center rounded-2xl bg-gray-50 p-8"><Loader2 className="animate-spin text-green-600" size={22} /></div> : slides.length === 0 ? <p className="rounded-2xl bg-gray-50 p-5 text-center text-xs font-medium text-gray-500">The starter slide form is ready above. Save your first slide to publish it.</p> : <div className="space-y-3">{slides.map((slide) => <div key={slide.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 p-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-sm font-black text-green-700">{slide.sortOrder}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-900">{slide.titleBefore} <span className="text-green-600">{slide.highlight}</span> {slide.titleAfter}</p><p className="mt-1 truncate text-xs text-gray-500">{slide.description}</p></div><button type="button" onClick={() => void toggleSlide(slide)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${slide.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{slide.isActive ? "Active" : "Hidden"}</button><div className="flex items-center gap-1"><button type="button" title="Edit slide" onClick={() => startEdit(slide)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-900"><Edit3 size={15} /></button><button type="button" title="Delete slide" onClick={() => void removeSlide(slide)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div></div>)}</div>}
    </section>
  );
}
