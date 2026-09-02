import * as React from "react";
import {
    Img,
    Section,
    Text,
} from "@react-email/components";

interface ProductCardProps {
    name: string;
    imageUrl?: string;
    quantity?: number;
    price: string;
    variant?: string;
}

export default function ProductCard({
    name,
    imageUrl,
    quantity = 1,
    price,
    variant,
}: ProductCardProps) {
    return (
        <Section
            style={{
                width: "100%",
                margin: "0 0 12px",
                padding: "14px",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                backgroundColor: "#ffffff",
            }}
        >
            <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                role="presentation"
            >
                <tbody>
                    <tr>
                        <td
                            width="72"
                            valign="middle"
                            style={{
                                paddingRight: "14px",
                            }}
                        >
                            {imageUrl ? (
                                <Img
                                    src={imageUrl}
                                    width="64"
                                    height="64"
                                    alt={name}
                                    style={{
                                        display: "block",
                                        width: "64px",
                                        height: "64px",
                                        borderRadius: "8px",
                                        objectFit: "cover",
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: "64px",
                                        height: "64px",
                                        borderRadius: "8px",
                                        backgroundColor: "#f3f4f6",
                                    }}
                                />
                            )}
                        </td>

                        <td valign="middle">
                            <Text
                                style={{
                                    margin: "0 0 4px",
                                    fontSize: "14px",
                                    lineHeight: "20px",
                                    fontWeight: "600",
                                    color: "#111827",
                                }}
                            >
                                {name}
                            </Text>

                            {variant && (
                                <Text
                                    style={{
                                        margin: "0 0 3px",
                                        fontSize: "12px",
                                        lineHeight: "18px",
                                        color: "#6b7280",
                                    }}
                                >
                                    {variant}
                                </Text>
                            )}

                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "12px",
                                    lineHeight: "18px",
                                    color: "#6b7280",
                                }}
                            >
                                Qty: {quantity}
                            </Text>
                        </td>

                        <td
                            valign="middle"
                            align="right"
                            style={{
                                paddingLeft: "12px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <Text
                                style={{
                                    margin: "0",
                                    fontSize: "14px",
                                    lineHeight: "20px",
                                    fontWeight: "600",
                                    color: "#111827",
                                }}
                            >
                                {price}
                            </Text>
                        </td>
                    </tr>
                </tbody>
            </table>
        </Section>
    );
}