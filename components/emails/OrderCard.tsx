import * as React from "react";
import {
    Section,
    Text,
    Hr,
} from "@react-email/components";

import ProductCard from "./ProductCard";

export interface OrderItem {
    name: string;
    imageUrl?: string;
    quantity?: number;
    price: string;
    variant?: string;
}

interface OrderCardProps {
    orderNumber: string;
    storeName?: string;
    items: OrderItem[];
    subtotal: string;
    shipping?: string;
    discount?: string;
    total: string;
    currency?: string;
}

export default function OrderCard({
    orderNumber,
    storeName,
    items,
    subtotal,
    shipping = "₦0",
    discount = "₦0",
    total,
}: OrderCardProps) {
    return (
        <Section
            style={{
                width: "100%",
                margin: "24px 0",
                padding: "20px",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                backgroundColor: "#ffffff",
            }}
        >
            <Text
                style={{
                    margin: "0 0 4px",
                    fontSize: "12px",
                    lineHeight: "18px",
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                }}
            >
                Order
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "17px",
                    lineHeight: "24px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                #{orderNumber}
            </Text>

            {storeName && (
                <Text
                    style={{
                        margin: "5px 0 20px",
                        fontSize: "13px",
                        lineHeight: "20px",
                        color: "#6b7280",
                    }}
                >
                    From {storeName}
                </Text>
            )}

            {!storeName && <div style={{ height: "20px" }} />}

            {items.map((item, index) => (
                <ProductCard
                    key={`${item.name}-${index}`}
                    name={item.name}
                    imageUrl={item.imageUrl}
                    quantity={item.quantity}
                    price={item.price}
                    variant={item.variant}
                />
            ))}

            <Hr
                style={{
                    margin: "20px 0",
                    border: 0,
                    borderTop: "1px solid #e5e7eb",
                }}
            />

            <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                role="presentation"
            >
                <tbody>
                    <tr>
                        <td>
                            <Text style={labelStyle}>Subtotal</Text>
                        </td>
                        <td align="right">
                            <Text style={valueStyle}>{subtotal}</Text>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <Text style={labelStyle}>Shipping</Text>
                        </td>
                        <td align="right">
                            <Text style={valueStyle}>{shipping}</Text>
                        </td>
                    </tr>

                    {discount !== "₦0" && (
                        <tr>
                            <td>
                                <Text style={labelStyle}>Discount</Text>
                            </td>
                            <td align="right">
                                <Text
                                    style={{
                                        ...valueStyle,
                                        color: "#027a48",
                                    }}
                                >
                                    -{discount}
                                </Text>
                            </td>
                        </tr>
                    )}

                    <tr>
                        <td
                            colSpan={2}
                            style={{
                                paddingTop: "14px",
                            }}
                        >
                            <Hr
                                style={{
                                    margin: "0 0 14px",
                                    border: 0,
                                    borderTop: "1px solid #e5e7eb",
                                }}
                            />
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "15px",
                                    lineHeight: "22px",
                                    fontWeight: "700",
                                    color: "#111827",
                                }}
                            >
                                Total
                            </Text>
                        </td>

                        <td align="right">
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "17px",
                                    lineHeight: "24px",
                                    fontWeight: "700",
                                    color: "#111827",
                                }}
                            >
                                {total}
                            </Text>
                        </td>
                    </tr>
                </tbody>
            </table>
        </Section>
    );
}

const labelStyle: React.CSSProperties = {
    margin: "0",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#6b7280",
};

const valueStyle: React.CSSProperties = {
    margin: "0",
    fontSize: "13px",
    lineHeight: "20px",
    color: "#374151",
};