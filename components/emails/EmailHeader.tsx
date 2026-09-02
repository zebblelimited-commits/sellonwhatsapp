import * as React from "react";
import { Section } from "@react-email/components";
import Logo from "./Logo";

interface EmailHeaderProps {
    logoHref?: string;
}

export default function EmailHeader({
    logoHref = "https://sellonwhatsapp.com",
}: EmailHeaderProps) {
    return (
        <Section
            style={{
                width: "100%",
                padding: "28px 32px 24px",
                textAlign: "center",
                borderBottom: "1px solid #eeeeee",
            }}
        >
            <Logo href={logoHref} />
        </Section>
    );
}

