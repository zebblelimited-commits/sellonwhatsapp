"use client";
import { CheckCircle2, Clock, Truck, Package, AlertTriangle } from "lucide-react";

interface OrderTimelineProps {
    status: string;
    createdAt?: Date;
    shippedAt?: Date;
    completedAt?: Date;
}

export default function OrderTimeline({ status, createdAt, shippedAt, completedAt }: OrderTimelineProps) {
    const steps = [
        { 
            key: "ordered", 
            label: "Ordered", 
            icon: Package, 
            date: createdAt,
            active: true 
        },
        { 
            key: "paid", 
            label: "Payment Secured", 
            icon: Clock, 
            date: createdAt,
            active: ["PAID_HELD", "SHIPPED", "COMPLETED", "DISPUTED"].includes(status)
        },
        { 
            key: "shipped", 
            label: "Shipped", 
            icon: Truck, 
            date: shippedAt,
            active: ["SHIPPED", "COMPLETED", "DISPUTED"].includes(status)
        },
        { 
            key: "completed", 
            label: status === "DISPUTED" ? "Under Review" : "Completed", 
            icon: status === "DISPUTED" ? AlertTriangle : CheckCircle2,
            date: completedAt,
            active: status === "COMPLETED" || status === "DISPUTED",
            highlight: status === "DISPUTED"
        }
    ];

    return (
        <div className="relative">
            {/* Progress Line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100" />
            
            <div className="space-y-6">
                {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isLast = index === steps.length - 1;
                    const isComplete = step.active && !step.highlight;
                    const isCurrent = step.active && step.highlight;
                    
                    return (
                        <div key={step.key} className="relative flex items-start gap-4">
                            {/* Step Icon */}
                            <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                isComplete ? "bg-green-600 text-white" :
                                isCurrent ? "bg-red-600 text-white animate-pulse" :
                                "bg-gray-100 text-gray-400"
                            }`}>
                                <Icon size={14} />
                            </div>
                            
                            {/* Step Content */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${
                                    isComplete || isCurrent ? "text-gray-900" : "text-gray-400"
                                }`}>
                                    {step.label}
                                </p>
                                {step.date && (
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        {step.date.toLocaleDateString('en-NG', { 
                                            month: 'short', 
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                )}
                            </div>
                            
                            {/* Status Badge for Current Step */}
                            {isCurrent && (
                                <span className="absolute -right-2 top-0 px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded-full">
                                    Active
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}