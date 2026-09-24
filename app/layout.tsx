import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { Suspense } from "react";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import GlobalToast from "@/components/ui/GlobalToast";
import OffCanvasCart from "@/components/cart/OffCanvasCart"; // ✅ Import it here
import ReferralCapture from "@/components/referrals/ReferralCapture";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SellOnWhatsApp | Secure Social Commerce",
  description: "Secure WhatsApp Commerce & Escrow Solutions",
  icons: {
    icon: [
      {
        url: "/icon.png",
        type: "image/png",
      },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <div className="site-scale min-h-full flex flex-col">
        <AuthProvider>
          <CartProvider>
            <GlobalToast />
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <ReferralCapture />
              {children}
            </Suspense>
            {/* ✅ Add OffCanvasCart here so it's globally available */}
            <OffCanvasCart />
          </CartProvider>
        </AuthProvider>
        </div>
      </body>
    </html>
  );
}
