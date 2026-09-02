import * as React from "react";
import { Img, Link } from "@react-email/components";

interface LogoProps {
    href?: string;
    width?: number;
    height?: number;
}

export default function Logo({
    href = "https://sellonwhatsapp.com",
    width = 180,
    height = 48,
}: LogoProps) {
    return (
        <Link
            href={href}
            style={{
                display: "inline-block",
                textDecoration: "none",
            }}
        >
            <Img
                src="https://sellonwhatsapp.com/icons/sowa.png"
                width={width}
                height={height}
                alt="SellOnWhatsApp"
                style={{
                    display: "block",
                    width: `${width}px`,
                    height: `${height}px`,
                    objectFit: "contain",
                    border: 0,
                    outline: "none",
                    textDecoration: "none",
                }}
            />
        </Link>
    );
}

