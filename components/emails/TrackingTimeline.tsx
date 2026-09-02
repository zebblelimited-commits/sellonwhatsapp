import * as React from "react";
import { Section, Text } from "@react-email/components";

export interface TrackingStep {
    label: string;
    description?: string;
    completed?: boolean;
    current?: boolean;
    date?: string;
}

interface TrackingTimelineProps {
    steps: TrackingStep[];
}

export default function TrackingTimeline({
    steps,
}: TrackingTimelineProps) {
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
            {steps.map((step, index) => {
                const isLast = index === steps.length - 1;

                return (
                    <table
                        key={`${step.label}-${index}`}
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        role="presentation"
                    >
                        <tbody>
                            <tr>
                                <td
                                    width="32"
                                    valign="top"
                                    style={{
                                        position: "relative",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: "12px",
                                            height: "12px",
                                            marginTop: "4px",
                                            borderRadius: "50%",
                                            backgroundColor:
                                                step.completed || step.current
                                                    ? "#25D366"
                                                    : "#d1d5db",
                                            border:
                                                step.current
                                                    ? "3px solid #d9fbe5"
                                                    : "none",
                                        }}
                                    />

                                    {!isLast && (
                                        <div
                                            style={{
                                                width: "2px",
                                                height: "34px",
                                                marginLeft: "5px",
                                                backgroundColor: step.completed
                                                    ? "#25D366"
                                                    : "#e5e7eb",
                                            }}
                                        />
                                    )}
                                </td>

                                <td
                                    valign="top"
                                    style={{
                                        paddingBottom: isLast ? "0" : "20px",
                                    }}
                                >
                                    <Text
                                        style={{
                                            margin: "0",
                                            fontSize: "14px",
                                            lineHeight: "20px",
                                            fontWeight:
                                                step.current || step.completed
                                                    ? "600"
                                                    : "400",
                                            color:
                                                step.current || step.completed
                                                    ? "#111827"
                                                    : "#9ca3af",
                                        }}
                                    >
                                        {step.label}
                                    </Text>

                                    {step.description && (
                                        <Text
                                            style={{
                                                margin: "3px 0 0",
                                                fontSize: "12px",
                                                lineHeight: "18px",
                                                color: "#6b7280",
                                            }}
                                        >
                                            {step.description}
                                        </Text>
                                    )}

                                    {step.date && (
                                        <Text
                                            style={{
                                                margin: "3px 0 0",
                                                fontSize: "11px",
                                                lineHeight: "17px",
                                                color: "#9ca3af",
                                            }}
                                        >
                                            {step.date}
                                        </Text>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                );
            })}
        </Section>
    );
}