"use client";

import { MapPin, X } from "lucide-react";

type CoordinateRecord = {
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
  location?: CoordinateRecord | null;
  shippingAddress?: CoordinateRecord | string | null;
};

export function getSavedCoordinates(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as CoordinateRecord;
  const nestedLocation = record.location && typeof record.location === "object" ? record.location : undefined;
  const nestedAddress = record.shippingAddress && typeof record.shippingAddress === "object" ? record.shippingAddress : undefined;
  const firstValue = (...values: unknown[]) => values.find((candidate) => candidate !== undefined && candidate !== null && !(typeof candidate === "string" && candidate.trim() === ""));
  const latitude = Number(firstValue(record.latitude, record.lat, nestedLocation?.latitude, nestedLocation?.lat, nestedAddress?.latitude, nestedAddress?.lat));
  const longitude = Number(firstValue(record.longitude, record.lng, nestedLocation?.longitude, nestedLocation?.lng, nestedAddress?.longitude, nestedAddress?.lng));
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

export function hasSavedCoordinates(value: unknown): boolean {
  return getSavedCoordinates(value) !== null;
}

export default function CoordinatesRequiredModal({
  role,
  onContinue,
  onClose,
}: {
  role: "buyer" | "seller";
  onContinue: () => void;
  onClose: () => void;
}) {
  const isSeller = role === "seller";
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="coordinates-required-title" className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white p-7 shadow-2xl">
        <button type="button" aria-label="Close coordinates notice" onClick={onClose} className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <X size={18} />
        </button>
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <MapPin size={28} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Location setup required</p>
        <h2 id="coordinates-required-title" className="mt-2 text-2xl font-black tracking-tight text-gray-900">
          Save your exact coordinates
        </h2>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-500">
          {isSeller
            ? "Add your store latitude and longitude so buyers can discover your store nearby and couriers can calculate reliable pickup and delivery rates."
            : "Add your delivery latitude and longitude so nearby stores and courier services can calculate reliable delivery routes to you."}
        </p>
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
          Coordinates are used only to improve store discovery, pickup, shipping, and delivery accuracy.
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button type="button" onClick={onContinue} className="flex-1 rounded-2xl bg-emerald-600 px-5 py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-700">
            {isSeller ? "Open My Store" : "Open Location Settings"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-gray-200 px-5 py-3.5 text-xs font-black uppercase tracking-wider text-gray-600 transition hover:bg-gray-50">
            Continue for now
          </button>
        </div>
      </div>
    </div>
  );
}
