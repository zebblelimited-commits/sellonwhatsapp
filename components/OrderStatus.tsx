import React from "react";

interface OrderStatusProps {
    status: string;
}

const OrderStatus: React.FC<OrderStatusProps> = ({ status }) => {
    const getStatusConfig = (status: string) => {
        switch (status?.toLowerCase()) {
            case "pending":
            case "awaiting_payment":
                return {
                    label: "Pending Payment",
                    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
                };
            case "paid":
            case "confirmed":
                return {
                    label: "Paid",
                    color: "bg-blue-100 text-blue-800 border-blue-300",
                };
            case "processing":
            case "in_progress":
                return {
                    label: "Processing",
                    color: "bg-purple-100 text-purple-800 border-purple-300",
                };
            case "shipped":
            case "out_for_delivery":
                return {
                    label: "Shipped",
                    color: "bg-indigo-100 text-indigo-800 border-indigo-300",
                };
            case "delivered":
            case "completed":
                return {
                    label: "Completed",
                    color: "bg-green-100 text-green-800 border-green-300",
                };
            case "cancelled":
                return {
                    label: "Cancelled",
                    color: "bg-red-100 text-red-800 border-red-300",
                };
            case "disputed":
            case "under_review":
                return {
                    label: "Under Review",
                    color: "bg-orange-100 text-orange-800 border-orange-300",
                };
            case "refunded":
                return {
                    label: "Refunded",
                    color: "bg-gray-100 text-gray-800 border-gray-300",
                };
            // ✅ ADDED: Escrow specific statuses
            case "held":
            case "in_escrow":
                return {
                    label: "Held in Escrow",
                    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
                };
            case "released":
                return {
                    label: "Released",
                    color: "bg-green-100 text-green-800 border-green-300",
                };
            default:
                return {
                    label: status || "Unknown",
                    color: "bg-gray-100 text-gray-800 border-gray-300",
                };
        }
    };

    const config = getStatusConfig(status);

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}
        >
            {config.label}
        </span>
    );
};

export default OrderStatus;