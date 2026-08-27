"use client";

import { useState, useEffect, useRef } from "react";
import { Truck, Check, Loader2, AlertCircle, Store } from "lucide-react";
import Image from "next/image";

export interface ShippingOption {
    id: string;
    name: string;
    logo?: string;
    estimatedDays: string;
    shippingFee: number;
}

interface ShippingSelectorProps {
    selectedState: string;
    totalWeightKg?: number;
    onSelectOption: (option: ShippingOption | null) => void;
    selectedOptionId?: string;
}

const SELF_ARRANGED_OPTION: ShippingOption = {
    id: "self_arranged",
    name: "Self-Arranged (Pickup / Direct Arrangement)",
    logo: "/images/couriers/self-arranged.png",
    estimatedDays: "Flexible / Arrange with Seller",
    shippingFee: 0,
};

export default function ShippingSelector({
    selectedState,
    totalWeightKg = 1,
    onSelectOption,
    selectedOptionId,
}: ShippingSelectorProps) {
    const [options, setOptions] = useState<ShippingOption[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    // Keep track of the latest onSelectOption reference
    const onSelectRef = useRef(onSelectOption);
    useEffect(() => {
        onSelectRef.current = onSelectOption;
    }, [onSelectOption]);

    useEffect(() => {
        if (!selectedState) {
            setOptions([]);
            onSelectRef.current(null);
            return;
        }

        const fetchShippingRates = async () => {
            setLoading(true);
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

                let fetchedCouriers: ShippingOption[] = [];
                if (response.ok && data.success && Array.isArray(data.options)) {
                    fetchedCouriers = data.options;
                }

                const combinedOptions = [SELF_ARRANGED_OPTION, ...fetchedCouriers];
                setOptions(combinedOptions);

                // Auto-select valid option without triggering endless loops
                const currentValid = combinedOptions.find((opt) => opt.id === selectedOptionId);
                onSelectRef.current(currentValid || combinedOptions[0]);

            } catch (err: any) {
                console.error("Error fetching shipping rates:", err);
                const fallbackOptions = [SELF_ARRANGED_OPTION];
                setOptions(fallbackOptions);
                onSelectRef.current(SELF_ARRANGED_OPTION);
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

    return (
        <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
                Select Shipping Option
            </label>
            <div className="grid grid-cols-1 gap-3">
                {options.map((option) => {
                    const isSelected = selectedOptionId === option.id;
                    const isSelfArranged = option.id === "self_arranged";

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
                                <div
                                    className={`p-2.5 rounded-xl flex items-center justify-center w-11 h-11 ${isSelected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                                        }`}
                                >
                                    {option.logo ? (
                                        <img
                                            src={option.logo}
                                            alt={option.name}
                                            className="w-6 h-6 object-contain"
                                            onError={(e) => {
                                                // Hide broken img tag if image fails to load
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    ) : isSelfArranged ? (
                                        <Store size={20} />
                                    ) : (
                                        <Truck size={20} />
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-gray-900">{option.name}</p>
                                    <p className="text-xs text-gray-500">{option.estimatedDays}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span
                                    className={`font-black text-sm ${isSelfArranged ? "text-green-600" : "text-gray-900"
                                        }`}
                                >
                                    {isSelfArranged ? "FREE" : `₦${option.shippingFee.toLocaleString()}`}
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