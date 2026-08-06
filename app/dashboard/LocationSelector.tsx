"use client";
import React from "react";
import { MapPin, ChevronDown } from "lucide-react";

// ✅ CRITICAL: This MUST match the path used in MyStoreTab.tsx
import { NIGERIA_STATES_LGA } from "./nigeriaData"; 

interface LocationSelectorProps {
  stateValue: string;
  lgaValue: string;
  onChange: (field: string, value: string) => void;
  isEditing: boolean;
}

export default function LocationSelector({ stateValue, lgaValue, onChange, isEditing }: LocationSelectorProps) {
  // ✅ Safety check to prevent crashes if data is missing
  const states = NIGERIA_STATES_LGA ? Object.keys(NIGERIA_STATES_LGA) : [];
  const lgas = stateValue && NIGERIA_STATES_LGA?.[stateValue] ? NIGERIA_STATES_LGA[stateValue] : [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* State Selection */}
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">State (Nigeria)</label>
        <div className={`w-full mt-1.5 p-3.5 border rounded-2xl text-xs font-bold flex items-center justify-between gap-3 ${isEditing ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-100 opacity-80'}`}>
          <div className="flex items-center gap-3 truncate flex-1">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            {isEditing ? (
              <select 
                className="bg-transparent outline-none cursor-pointer appearance-none w-full text-gray-800" 
                value={stateValue} 
                onChange={(e) => onChange('state', e.target.value)}
              >
                <option value="">Select State</option>
                {states.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className="truncate text-gray-700">{stateValue || "Not selected"}</span>
            )}
          </div>
          {isEditing && <ChevronDown size={14} className="text-gray-400 shrink-0" />}
        </div>
      </div>

      {/* LGA Selection */}
      <div>
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Local Government (LGA)</label>
        <div className={`w-full mt-1.5 p-3.5 border rounded-2xl text-xs font-bold flex items-center justify-between gap-3 ${isEditing ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-100 opacity-80'}`}>
          <div className="flex items-center gap-3 truncate flex-1">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            {isEditing ? (
              <select 
                disabled={!stateValue}
                className="bg-transparent outline-none cursor-pointer appearance-none w-full text-gray-800 disabled:cursor-not-allowed disabled:text-gray-400" 
                value={lgaValue} 
                onChange={(e) => onChange('lga', e.target.value)}
              >
                <option value="">{stateValue ? "Select LGA" : "Select State first"}</option>
                {lgas.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            ) : (
              <span className="truncate text-gray-700">{lgaValue || "Not selected"}</span>
            )}
          </div>
          {isEditing && <ChevronDown size={14} className="text-gray-400 shrink-0" />}
        </div>
      </div>
    </div>
  );
}