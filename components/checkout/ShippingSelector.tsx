"use client";

import { useState, useEffect } from "react";
import { Truck, Check, Loader2, AlertCircle } from "lucide-react";

export interface ShippingOption {
    id: string;
    name: string;
    logo: string;
    estimatedDays: string;
    shippingFee: number;
}

interface ShippingSelectorProps {
    selectedState: string;
    totalWeightKg?: number;
    onSelectOption: (option: ShippingOption | null) => void;
    selectedOptionId?: string;
}

export default function ShippingSelector({
    selectedState,
    totalWeightKg = 1,
    onSelectOption,
    selectedOptionId,
}: ShippingSelectorProps) {
    const [options, setOptions] = useState<ShippingOption[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedState) {
            setOptions([]);
            onSelectOption(null);
            return;
        }

        const fetchShippingRates = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch("/api/shipping/calculate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        destinationState: selectedState,
                        totalWeightKg,
                    }),
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error || "Failed to load shipping options");
                }

                setOptions(data.options);

                // Auto-select the cheapest (first) option by default
                if (data.options.length > 0) {
                    onSelectOption(data.options[0]);
                } else {
                    onSelectOption(null);
                }
            } catch (err: any) {
                console.error("Error fetching shipping rates:", err);
                setError(err.message || "Could not calculate rates");
                onSelectOption(null);
            } finally {
                setLoading(false);
            }
        };

        fetchShippingRates();
    }, [selectedState, totalWeightKg]);

    if (!selectedState) {
        return (
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-sm text-gray-500 flex items-center gap-2">
                <AlertCircle size={16} className="text-gray-400" />
                Select a delivery state to view available shipping options.
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={20} className="animate-spin text-green-600" />
                Calculating shipping rates for {selectedState}...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
            </div>
        );
    }

    if (options.length === 0) {
        return (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm text-amber-700 flex items-center gap-2">
                <AlertCircle size={16} />
                No couriers available for {selectedState}. Please contact support or vendor.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
                Select Shipping Option
            </label>
            <div className="grid grid-cols-1 gap-3">
                {options.map((option) => {
                    const isSelected = selectedOptionId === option.id;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelectOption(option)}
                            className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${isSelected
                                    ? "border-green-600 bg-green-50/50 shadow-sm"
                                    : "border-gray-100 hover:border-gray-200 bg-white"
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${isSelected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-gray-900">{option.name}</p>
                                    <p className="text-xs text-gray-500">{option.estimatedDays}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="font-black text-sm text-gray-900">
                                    ₦{option.shippingFee.toLocaleString()}
                                </span>
                                <div
                                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected
                                            ? "bg-green-600 border-green-600 text-white"
                                            : "border-gray-300 bg-white"
                                        }`}
                                >
                                    {isSelected && <Check size={12} strokeWidth={3} />}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}