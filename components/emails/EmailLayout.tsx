import * as React from "react";
import {
    Body,
    Container,
    Head,
    Html,
    Preview,
    Section,
    Tailwind,
} from "@react-email/components";

import EmailHeader from "./EmailHeader";
import EmailFooter from "./EmailFooter";

interface EmailLayoutProps {
    children: React.ReactNode;
    preview?: string;
    showHeader?: boolean;
    showFooter?: boolean;
}

export default function EmailLayout({
    children,
    preview,
    showHeader = true,
    showFooter = true,
}: EmailLayoutProps) {
    return (
        <Html>
            <Head />

            {preview && <Preview>{preview}</Preview>}

            <Body style={bodyStyle}>
                <Container style={containerStyle}>
                    {showHeader && <EmailHeader />}

                    <Section style={contentStyle}>{children}</Section>

                    {showFooter && <EmailFooter />}
                </Container>
            </Body>
        </Html>
    );
}

const bodyStyle: React.CSSProperties = {
    margin: 0,
    padding: "32px 16px",
    backgroundColor: "#f5f7f8",
    fontFamily:
        "Arial, Helvetica, sans-serif",
    color: "#111827",
};

const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "600px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
};

const contentStyle: React.CSSProperties = {
    padding: "36px 32px",
};