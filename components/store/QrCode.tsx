"use client";

import React, { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { Html5Qrcode } from "html5-qrcode";
import SocialShareModal from "@/app/dashboard/modals/SocialShareModal";

interface StoreSocials {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    twitter?: string;
    youtube?: string;
    whatsapp?: string; // Added for completeness
}

interface StoreData {
    storeName?: string;
    username?: string;
    description?: string;
    logoUrl?: string;
    phone?: string;
    address?: string;
    socials?: StoreSocials;
}

interface QrCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    storeUrl: string;
    storeName?: string;
    store?: StoreData;
    defaultTab?: "generate" | "scan";
}

export default function QrCodeModal({
    isOpen,
    onClose,
    storeUrl,
    storeName = "My Store",
    store,
    defaultTab = "generate",
}: QrCodeModalProps) {
    const [activeTab, setActiveTab] = useState<"generate" | "scan">(defaultTab);

    const qrCodeRef = useRef<HTMLDivElement>(null);
    const qrCodeInstance = useRef<QRCodeStyling | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Ensure the correct tab is selected every time the modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab);
        }
    }, [isOpen, defaultTab]);

    /*
     * Store Data
     */
    const displayStoreName = store?.storeName?.trim() || storeName || "My Store";

    const username =
        store?.username ||
        storeUrl
            .replace(/\/$/, "")
            .split("/")
            .filter(Boolean)
            .pop() ||
        "store";

    const description = store?.description || "";
    const logoUrl = store?.logoUrl || "";
    const phone = store?.phone || "";
    const address = store?.address || "";
    const socials = store?.socials || {};

    /*
     * 1. QR Code Generation
     */
    useEffect(() => {
        if (!isOpen || activeTab !== "generate") {
            if (qrCodeRef.current) {
                qrCodeRef.current.innerHTML = "";
            }
            return;
        }

        const targetUrl = storeUrl || "https://sellonwhatsapp.com";

        if (!qrCodeInstance.current) {
            qrCodeInstance.current = new QRCodeStyling({
                width: 250,
                height: 250,
                type: "canvas",
                data: targetUrl,
                margin: 20,
                qrOptions: {
                    typeNumber: 0,
                    mode: "Byte",
                    errorCorrectionLevel: "Q",
                },
                imageOptions: {
                    saveAsBlob: true,
                    hideBackgroundDots: true,
                    imageSize: 0.4,
                    margin: 4,
                },
                dotsOptions: {
                    type: "dots",
                    color: "#0c2b08",
                    roundSize: true,
                    gradient: {
                        type: "linear",
                        rotation: 0,
                        colorStops: [
                            { offset: 0, color: "#013c02" },
                            { offset: 1, color: "#1e8a00" },
                        ],
                    },
                },
                backgroundOptions: {
                    round: 0,
                    color: "#f5f5f5",
                },
                cornersSquareOptions: {
                    type: "extra-rounded",
                    color: "#03a51e",
                },
                cornersDotOptions: {
                    type: "dot",
                    color: "#000000",
                },
                image: "/icons/sowaicon.png",
            });
        } else {
            qrCodeInstance.current.update({ data: targetUrl });
        }

        if (qrCodeRef.current) {
            qrCodeRef.current.innerHTML = "";
            qrCodeInstance.current.append(qrCodeRef.current);
        }

        return () => {
            if (qrCodeRef.current) {
                qrCodeRef.current.innerHTML = "";
            }
        };
    }, [isOpen, activeTab, storeUrl]);

    /*
     * 2. Camera Scanner
     */
    const startScanning = async () => {
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode("qr-reader");
        }

        try {
            await html5QrCodeRef.current.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    setScanResult(decodedText);
                    stopScanning();
                },
                () => {
                    // Ignore scan errors
                }
            );
            setIsScanning(true);
        } catch (err) {
            console.error("Camera error:", err);
            alert(
                "Could not access camera. Please ensure:\n\n" +
                "1. You are using HTTPS or localhost.\n" +
                "2. You have granted camera permissions."
            );
        }
    };

    const stopScanning = async () => {
        try {
            if (html5QrCodeRef.current) {
                await html5QrCodeRef.current.stop();
            }
        } catch (error) {
            console.error("Error stopping scanner:", error);
        } finally {
            setIsScanning(false);
        }
    };

    /*
     * Scanner Cleanup
     */
    useEffect(() => {
        if (!isOpen || activeTab !== "scan") {
            if (html5QrCodeRef.current && isScanning) {
                html5QrCodeRef.current.stop().catch(() => { });
                setIsScanning(false);
            }
            setScanResult(null);
        }

        return () => {
            if (html5QrCodeRef.current && isScanning) {
                html5QrCodeRef.current.stop().catch(() => { });
            }
        };
    }, [isOpen, activeTab, isScanning]);

    /*
     * Escape HTML
     */
    const escapeHtml = (value: string) => {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    /*
     * Get Social Media Username/Display Text
     */
    const getSocialLabel = (url: string) => {
        try {
            const parsedUrl = new URL(url);
            const path = parsedUrl.pathname.replace(/\//g, "");
            return path ? `@${path}` : url;
        } catch {
            return url;
        }
    };

    /*
     * 3. PRINT FULL QR BANNER (Optimized for strict A4 fit with real SVGs)
     */
    const handlePrint = async () => {
        if (!qrCodeInstance.current) return;

        try {
            const qrBlob = (await qrCodeInstance.current.getRawData("png")) as Blob;
            if (!qrBlob) return;

            const qrImageUrl = URL.createObjectURL(qrBlob);

            // Using ACTUAL SVG paths from SocialIcons.tsx
            const socialItems = [
                {
                    name: "WhatsApp",
                    url: (socials as any).whatsapp,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.8 11.8 0 0012.05 0C5.48 0 .16 5.32.16 11.9c0 2.1.55 4.15 1.6 5.97L0 24l6.33-1.66a11.9 11.9 0 005.72 1.45h.01c6.57 0 11.9-5.32 11.9-11.9 0-3.17-1.23-6.15-3.44-8.41zM12.06 21.6a9.7 9.7 0 01-4.94-1.34l-.35-.2-3.76.99 1-3.66-.23-.37a9.7 9.7 0 01-1.49-5.15c0-5.36 4.37-9.73 9.75-9.73 2.6 0 5.05 1.01 6.88 2.84a9.64 9.64 0 012.86 6.89c0 5.36-4.37 9.73-9.72 9.73zm5.35-7.3c-.29-.15-1.7-.84-1.97-.94-.26-.1-.45-.15-.64.15-.19.29-.73.94-.9 1.13-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.34-1.43-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.43-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.64-1.54-.87-2.11-.23-.56-.47-.48-.64-.49h-.55c-.2 0-.52.07-.79.37-.26.29-1.04 1.02-1.04 2.49s1.06 2.9 1.21 3.1c.15.2 2.08 3.18 5.04 4.46.71.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.08 1.7-.7 1.94-1.38.24-.67.24-1.25.17-1.38-.07-.12-.26-.2-.55-.35z"/></svg>`,
                },
                {
                    name: "Instagram",
                    url: socials.instagram,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M7.75 2C4.57 2 2 4.57 2 7.75v8.5C2 19.43 4.57 22 7.75 22h8.5C19.43 22 22 19.43 22 16.25v-8.5C22 4.57 19.43 2 16.25 2h-8.5zm0 2h8.5A3.75 3.75 0 0120 7.75v8.5A3.75 3.75 0 0116.25 20h-8.5A3.75 3.75 0 014 16.25v-8.5A3.75 3.75 0 017.75 4zm4.25 2.5A5.5 5.5 0 106.5 12 5.5 5.5 0 0012 6.5zm0 2A3.5 3.5 0 118.5 12 3.5 3.5 0 0112 8.5zm4.75-2.25a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0z"/></svg>`,
                },
                {
                    name: "Facebook",
                    url: socials.facebook,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.19 2.23.19v2.45h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99C18.34 21.13 22 16.99 22 12z"/></svg>`,
                },
                {
                    name: "TikTok",
                    url: socials.tiktok,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.29a7.72 7.72 0 01-4.35-1.35v6.15a5.56 5.56 0 11-4.81-5.5v2.27a3.29 3.29 0 103.58 3.28V2h2.38a5.36 5.36 0 003.2 3.22V8.3z"/></svg>`,
                },
                {
                    name: "X",
                    url: socials.twitter,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M22 5.92c-.77.35-1.6.58-2.46.69a4.2 4.2 0 001.84-2.31 8.3 8.3 0 01-2.65 1.02 4.15 4.15 0 00-7.07 3.78A11.77 11.77 0 013 4.89a4.15 4.15 0 001.28 5.53 4.1 4.1 0 01-1.88-.52v.05a4.16 4.16 0 003.33 4.07c-.45.12-.93.18-1.42.07a4.17 4.17 0 003.88 2.88A8.34 8.34 0 012 19.54a11.74 11.74 0 006.36 1.86c7.64 0 11.82-6.32 11.82-11.8v-.54A8.5 8.5 0 0022 5.92z"/></svg>`,
                },
                {
                    name: "YouTube",
                    url: socials.youtube,
                    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2s-.23-1.63-.94-2.35c-.9-.95-1.91-.95-2.37-1C16.78 2.5 12 2.5 12 2.5h-.01s-4.78 0-8.19.35c-.46.05-1.47.05-2.37 1-.71.72-.94 2.35-.94 2.35S0 8.1 0 10v1.99c0 1.9.49 3.8.49 3.8s.23 1.63.94 2.35c.9.95 2.08.92 2.6 1.02 1.89.18 7.97.34 7.97.34s4.79-.01 8.2-.36c.46-.05 1.47-.05 2.37-1 .71-.72.94-2.35.94-2.35s.49-1.9.49-3.8V10c0-1.9-.49-3.8-.49-3.8zM9.75 14.57V7.98l6.27 3.3-6.27 3.29z"/></svg>`,
                },
            ].filter((item) => item.url);

            const socialHtml =
                socialItems.length > 0
                    ? `
          <section class="section">
            <div class="section-title">
              <span></span> CONNECT WITH ME <span></span>
            </div>
            <div class="social-grid">
              ${socialItems
                        .map(
                            (social) => `
                    <div class="social-item">
                      <div class="social-icon">${social.icon}</div>
                      <div class="social-name">${escapeHtml(social.name)}</div>
                      <div class="social-handle">${escapeHtml(getSocialLabel(social.url || ""))}</div>
                    </div>
                  `
                        )
                        .join("")}
            </div>
          </section>
        `
                    : "";

            const contactHtml =
                phone || address
                    ? `
          <section class="section">
            <div class="section-title">
              <span></span> VISIT / CONTACT <span></span>
            </div>
            <div class="contact-grid">
              ${phone
                        ? `
                  <div class="contact-card">
                    <div class="contact-icon">☎</div>
                    <div>
                      <div class="contact-label">Phone</div>
                      <div class="contact-value">${escapeHtml(phone)}</div>
                    </div>
                  </div>
                `
                        : ""}
              ${address
                        ? `
                  <div class="contact-card">
                    <div class="contact-icon">⌖</div>
                    <div>
                      <div class="contact-label">Address</div>
                      <div class="contact-value">${escapeHtml(address)}</div>
                    </div>
                  </div>
                `
                        : ""}
            </div>
          </section>
        `
                    : "";

            const printWindow = window.open("", "_blank");

            if (!printWindow) {
                alert("Could not open the print window. Please allow popups and try again.");
                URL.revokeObjectURL(qrImageUrl);
                return;
            }

            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${escapeHtml(displayStoreName)} - QR Code</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              * { box-sizing: border-box; }
              body { margin: 0; padding: 0; background: #e9e9e9; font-family: Arial, Helvetica, sans-serif; color: #152019; }
              
              /* STRICT A4 FIT */
              .banner {
                width: 210mm;
                height: 297mm; /* Exact A4 height, no spillover */
                margin: auto;
                background: linear-gradient(135deg, #f9faf7, #ffffff);
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
              }
              .top-shape { position: absolute; top: 0; left: 0; width: 210px; height: 210px; background: #075c2a; border-radius: 0 0 140px 0; }
              .top-dots { position: absolute; top: 30px; right: 35px; color: #087533; font-size: 25px; letter-spacing: 8px; }
              
              .content {
                position: relative;
                padding: 30px 40px 0;
                flex: 1;
                display: flex;
                flex-direction: column;
              }
              .logo { width: 60px; height: 60px; border-radius: 16px; object-fit: cover; display: block; margin: 0 auto 12px; border: 1px solid #e5e7eb; }
              .logo-placeholder { width: 60px; height: 60px; margin: 0 auto 12px; border-radius: 16px; background: #075c2a; color: white; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; }
              h1 { margin: 0; text-align: center; color: #0b3d1c; font-size: 42px; line-height: 1; font-weight: 900; letter-spacing: -1.5px; }
              .subtitle { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; color: #5b615d; font-size: 14px; letter-spacing: 3px; text-align: center; }
              .subtitle span { width: 45px; height: 1px; background: #15803d; }
              .description { max-width: 560px; margin: 12px auto 15px; text-align: center; color: #667085; font-size: 13px; line-height: 1.5; }
              
              .qr-wrap { display: flex; flex-direction: column; align-items: center; margin-top: 10px; }
              .qr-card { background: white; border: 2px solid #16803c; border-radius: 24px; padding: 16px; box-shadow: 0 12px 30px rgba(0,0,0,.08); }
              .qr-image { width: 300px; height: 300px; display: block; }
              .username { margin-top: 14px; background: linear-gradient(90deg, #073b20, #0b6b35); color: white; padding: 8px 28px; border-radius: 999px; font-size: 22px; font-weight: 800; }
              
              .visit-text { margin: 15px auto 8px; text-align: center; font-size: 14px; color: #525b55; }
              .visit-text strong { color: #087533; }
              .store-link { display: flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(90deg, #087a2d, #0b9c32); color: white; padding: 12px; border-radius: 14px; font-size: 14px; font-weight: 700; text-align: center; word-break: break-all; }
              
              .section { margin-top: 18px; }
              .section-title { display: flex; align-items: center; justify-content: center; gap: 12px; color: #155d31; font-size: 13px; font-weight: 800; letter-spacing: 2px; }
              .section-title span { width: 80px; height: 1px; background: #79a889; }
              
              .social-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 12px; }
              .social-item { min-height: 85px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 6px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
              .social-icon { width: 32px; height: 32px; border-radius: 50%; background: #0b7a36; color: white; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; }
              .social-name { font-size: 9px; font-weight: 700; color: #374151; }
              .social-handle { margin-top: 2px; font-size: 8px; color: #6b7280; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              
              .contact-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
              .contact-card { display: flex; align-items: center; gap: 10px; padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 14px; }
              .contact-icon { width: 38px; height: 38px; border-radius: 50%; background: #087533; color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
              .contact-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
              .contact-value { font-size: 12px; font-weight: 700; color: #1f2937; line-height: 1.3; }
              
              .footer {
                margin-top: auto; /* Pushes footer to the very bottom of the A4 page */
                padding: 15px 30px;
                background: #075c2a;
                color: white;
                text-align: center;
                font-size: 18px;
                font-style: italic;
              }

              @media print {
                body { background: white; }
                .banner { width: 210mm; height: 297mm; box-shadow: none; }
                @page { size: A4 portrait; margin: 0; }
              }
            </style>
          </head>
          <body>
            <div class="banner">
              <div class="top-shape"></div>
              <div class="top-dots">· · ·<br/>· · ·</div>
              <div class="content">
                ${logoUrl
                    ? `<img src="${escapeHtml(logoUrl)}" class="logo" alt="${escapeHtml(displayStoreName)}" />`
                    : `<div class="logo-placeholder">${escapeHtml(displayStoreName.charAt(0).toUpperCase())}</div>`}
                <h1>FOLLOW MY STORE</h1>
                <div class="subtitle"><span></span> FOR QUALITY PRODUCTS <span></span></div>
                ${description ? `<div class="description">${escapeHtml(description)}</div>` : ""}
                <div class="qr-wrap">
                  <div class="qr-card">
                    <img class="qr-image" src="${qrImageUrl}" alt="QR Code" />
                  </div>
                  <div class="username">@${escapeHtml(username)}</div>
                </div>
                <div class="visit-text">Follow <strong>${escapeHtml(displayStoreName)}</strong> or scan the QR code to visit my store</div>
                <div class="store-link">🔗 ${escapeHtml(storeUrl)}</div>
                ${socialHtml}
                ${contactHtml}
              </div>
              <div class="footer">Thank you for your support! ♡</div>
            </div>
          </body>
        </html>
      `);

            printWindow.document.close();

            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                setTimeout(() => {
                    URL.revokeObjectURL(qrImageUrl);
                }, 1000);
            }, 800);
        } catch (error) {
            console.error("Error printing QR banner:", error);
            alert("Something went wrong while generating the QR banner.");
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
                        aria-label="Close modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Tabs */}
                    <div className="flex p-2 bg-gray-50 border-b border-gray-100">
                        <button
                            onClick={() => setActiveTab("generate")}
                            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-[12px] transition-all duration-200 ${activeTab === "generate" ? "bg-[#09A03D] text-white shadow-md" : "text-gray-500 hover:bg-gray-100"
                                }`}
                        >
                            Generate QR Code
                        </button>
                        <button
                            onClick={() => setActiveTab("scan")}
                            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-[12px] transition-all duration-200 ${activeTab === "scan" ? "bg-[#09A03D] text-white shadow-md" : "text-gray-500 hover:bg-gray-100"
                                }`}
                        >
                            Scan QR Code
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {activeTab === "generate" ? (
                            <div className="flex flex-col items-center space-y-6">
                                {/* QR Code */}
                                <div className="bg-[#f5f5f5] p-6 rounded-[10px] border border-gray-100 shadow-inner flex items-center justify-center min-h-[290px] w-full overflow-hidden">
                                    <div ref={qrCodeRef} className="flex justify-center items-center" />
                                </div>

                                {/* Store Information */}
                                <div className="text-center space-y-1 w-full">
                                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                                        {displayStoreName}
                                    </p>
                                    <p className="text-sm font-medium text-gray-700 break-all px-2">
                                        {storeUrl}
                                    </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex w-full gap-3 pt-2">
                                    <button
                                        onClick={handlePrint}
                                        className="flex-1 flex items-center justify-center gap-2 bg-[#09A03D] hover:bg-[#078030] text-white font-semibold py-3 px-4 rounded-[12px] transition-colors shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        Print Banner
                                    </button>
                                    <button
                                        onClick={() => setIsShareModalOpen(true)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-[12px] transition-colors shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                        </svg>
                                        Share Store
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div key="scanner-view" className="flex flex-col items-center justify-center space-y-4 py-4 w-full">
                                {scanResult ? (
                                    <div className="text-center space-y-4 w-full">
                                        <div className="bg-green-50 border border-[#09A03D]/20 rounded-xl p-4">
                                            <p className="text-sm font-bold text-[#09A03D] mb-1">Successfully Scanned!</p>
                                            <p className="text-xs text-gray-600 break-all">{scanResult}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setScanResult(null);
                                                startScanning();
                                            }}
                                            className="w-full bg-[#09A03D] hover:bg-[#078030] text-white font-semibold py-3 px-8 rounded-[12px] transition-colors shadow-sm"
                                        >
                                            Scan Another
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div id="qr-reader" className="w-full max-w-[300px] rounded-[10px] overflow-hidden bg-gray-900 flex items-center justify-center min-h-[300px] relative">
                                            {!isScanning && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    <p className="text-sm">Camera is off</p>
                                                </div>
                                            )}
                                        </div>

                                        {!isScanning ? (
                                            <button
                                                onClick={startScanning}
                                                className="w-full max-w-[300px] bg-[#09A03D] hover:bg-[#078030] text-white font-semibold py-3 px-8 rounded-[12px] transition-colors shadow-sm flex items-center justify-center gap-2"
                                            >
                                                Start Scanning
                                            </button>
                                        ) : (
                                            <button
                                                onClick={stopScanning}
                                                className="w-full max-w-[300px] bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-8 rounded-[12px] transition-colors shadow-sm"
                                            >
                                                Stop Scanning
                                            </button>
                                        )}

                                        <p className="text-gray-500 text-xs text-center px-4 max-w-[300px]">
                                            Position the QR code within the frame. Ensure you have granted camera permissions and are using HTTPS.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Social Share Modal */}
            <SocialShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={displayStoreName}
                url={storeUrl}
            />
        </>
    );
}