export const EMAIL_CONFIG = {
    brand: {
        name: "SellOnWhatsApp",
        website: "https://sellonwhatsapp.com",
        logoUrl: "https://sellonwhatsapp.com/icons/sowa.png",
        primaryColor: "#25D366",
        primaryDark: "#128C7E",
        textColor: "#111827",
        mutedColor: "#6B7280",
        borderColor: "#E5E7EB",
        backgroundColor: "#F5F7F8",
        white: "#FFFFFF",
    },

    senders: {
        hello: {
            name: "Asugh Iyorlaha",
            email: process.env.EMAIL_FROM_HELLO || "hello@sellonwhatsapp.com",
        },

        support: {
            name: "SellOnWhatsApp Support",
            email: process.env.EMAIL_FROM_SUPPORT || "support@sellonwhatsapp.com",
        },
    },

    founder: {
        name: "Asugh Iyorlaha",
        title: "C.E.O & Founder",
    },

    contact: {
        supportEmail: process.env.EMAIL_FROM_SUPPORT || "support@sellonwhatsapp.com",
        helloEmail: process.env.EMAIL_FROM_HELLO || "hello@sellonwhatsapp.com",
        whatsapp: "09135146692",
    },
} as const;
