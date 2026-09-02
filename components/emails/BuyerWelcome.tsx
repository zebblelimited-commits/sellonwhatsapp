import * as React from "react";
import {
    Heading,
    Section,
    Text,
} from "@react-email/components";

import EmailLayout from "@/components/emails/EmailLayout";
import Button from "@/components/emails/Button";

interface BuyerWelcomeProps {
    customerName?: string;
    exploreUrl?: string;
}

export default function BuyerWelcome({
    customerName = "there",
    exploreUrl = "https://sellonwhatsapp.com",
}: BuyerWelcomeProps) {
    return (
        <EmailLayout
            preview="Welcome to SellOnWhatsApp — a simpler way to discover and shop from businesses."
        >
            <Heading
                style={{
                    margin: "0 0 16px",
                    fontSize: "28px",
                    lineHeight: "36px",
                    fontWeight: "700",
                    color: "#111827",
                    letterSpacing: "-0.5px",
                }}
            >
                Welcome to SellOnWhatsApp! 👋
            </Heading>

            <Text
                style={{
                    margin: "0 0 18px",
                    fontSize: "16px",
                    lineHeight: "26px",
                    color: "#374151",
                }}
            >
                Hey {customerName},
            </Text>

            <Text style={paragraphStyle}>
                We're excited to have you here.
            </Text>

            <Text style={paragraphStyle}>
                We created SellOnWhatsApp to make shopping from businesses
                simpler and more convenient.
            </Text>

            <Text style={paragraphStyle}>
                Discover stores, explore products and services, place your
                orders, and stay connected with the businesses you buy from —
                without making online shopping feel complicated.
            </Text>

            <Section style={{ margin: "28px 0" }}>
                <Button href={exploreUrl}>
                    Explore SellOnWhatsApp
                </Button>
            </Section>

            <Text
                style={{
                    margin: "28px 0 14px",
                    fontSize: "17px",
                    lineHeight: "25px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Here are 3 ways to get started:
            </Text>

            <Text style={stepStyle}>
                <strong>1. Discover stores</strong>
                <br />
                Find businesses, products, and services that interest you.
            </Text>

            <Text style={stepStyle}>
                <strong>2. Find something you like</strong>
                <br />
                Browse products and services and learn more before you buy.
            </Text>

            <Text style={stepStyle}>
                <strong>3. Place your order</strong>
                <br />
                Order from a seller and receive updates as your purchase
                progresses.
            </Text>

            <Section
                style={{
                    margin: "28px 0",
                    padding: "20px",
                    backgroundColor: "#f8faf9",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                }}
            >
                <Text
                    style={{
                        margin: "0",
                        fontSize: "14px",
                        lineHeight: "22px",
                        color: "#374151",
                    }}
                >
                    <strong>We'd love to hear from you.</strong>
                    <br />
                    What brought you to SellOnWhatsApp? What are you hoping to
                    find or buy?
                </Text>
            </Section>

            <Text style={paragraphStyle}>
                Just reply to this email and let us know. Your feedback helps
                us build a better experience for everyone.
            </Text>

            <Text
                style={{
                    margin: "30px 0 4px",
                    fontSize: "15px",
                    lineHeight: "22px",
                    color: "#374151",
                }}
            >
                Cheers,
            </Text>

            <Text
                style={{
                    margin: "0",
                    fontSize: "15px",
                    lineHeight: "22px",
                    fontWeight: "700",
                    color: "#111827",
                }}
            >
                Asugh Iyorlaha
            </Text>

            <Text
                style={{
                    margin: "2px 0 0",
                    fontSize: "13px",
                    lineHeight: "20px",
                    color: "#6B7280",
                }}
            >
                C.E.O & Founder, SellOnWhatsApp
            </Text>
        </EmailLayout>
    );
}

const paragraphStyle: React.CSSProperties = {
    margin: "0 0 16px",
    fontSize: "15px",
    lineHeight: "24px",
    color: "#4B5563",
};

const stepStyle: React.CSSProperties = {
    margin: "0 0 18px",
    fontSize: "14px",
    lineHeight: "22px",
    color: "#4B5563",
};