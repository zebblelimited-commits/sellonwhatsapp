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

    // Existing compatibility
    storeName?: string;

    // Store collection data
    store?: StoreData;

    // NEW: Default tab to open based on user type
    defaultTab?: "generate" | "scan";
}

export default function QrCodeModal({
    isOpen,
    onClose,
    storeUrl,
    storeName = "My Store",
    store,
    defaultTab = "generate", // NEW: Default to generate
}: QrCodeModalProps) {
    // NEW: Initialize state with the defaultTab prop
    const [activeTab, setActiveTab] = useState<"generate" | "scan">(defaultTab);

    const qrCodeRef = useRef<HTMLDivElement>(null);
    const qrCodeInstance = useRef<QRCodeStyling | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // NEW: Ensure the correct tab is selected every time the modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(defaultTab);
        }
    }, [isOpen, defaultTab]);

    /*
     * Store Data
     */
    const displayStoreName =
        store?.storeName?.trim() || storeName || "My Store";

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

        const targetUrl =
            storeUrl || "https://sellonwhatsapp.com";

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
                            {
                                offset: 0,
                                color: "#013c02",
                            },
                            {
                                offset: 1,
                                color: "#1e8a00",
                            },
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
            qrCodeInstance.current.update({
                data: targetUrl,
            });
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
                {
                    facingMode: "environment",
                },

                {
                    fps: 10,
                    qrbox: {
                        width: 250,
                        height: 250,
                    },
                },

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
     * Important because Firestore values are being
     * inserted into the printable HTML.
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
     * 3. PRINT FULL QR BANNER
     */
    const handlePrint = async () => {
        if (!qrCodeInstance.current) return;

        try {
            const qrBlob = (await qrCodeInstance.current.getRawData(
                "png"
            )) as Blob;

            if (!qrBlob) return;

            const qrImageUrl = URL.createObjectURL(qrBlob);

            const socialItems = [
                {
                    name: "Instagram",
                    url: socials.instagram,
                    icon: "◎",
                },
                {
                    name: "Facebook",
                    url: socials.facebook,
                    icon: "f",
                },
                {
                    name: "TikTok",
                    url: socials.tiktok,
                    icon: "♪",
                },
                {
                    name: "X",
                    url: socials.twitter,
                    icon: "𝕏",
                },
                {
                    name: "YouTube",
                    url: socials.youtube,
                    icon: "▶",
                },
            ].filter((item) => item.url);

            const socialHtml =
                socialItems.length > 0
                    ? `
          <section class="section">
            <div class="section-title">
              <span></span>
              CONNECT WITH ME
              <span></span>
            </div>

            <div class="social-grid">
              ${socialItems
                        .map(
                            (social) => `
                    <div class="social-item">
                      <div class="social-icon">
                        ${social.icon}
                      </div>

                      <div class="social-name">
                        ${escapeHtml(social.name)}
                      </div>

                      <div class="social-handle">
                        ${escapeHtml(
                                getSocialLabel(social.url || "")
                            )}
                      </div>
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
              <span></span>
              VISIT / CONTACT
              <span></span>
            </div>

            <div class="contact-grid">
              ${phone
                        ? `
                  <div class="contact-card">
                    <div class="contact-icon">☎</div>

                    <div>
                      <div class="contact-label">Phone</div>
                      <div class="contact-value">
                        ${escapeHtml(phone)}
                      </div>
                    </div>
                  </div>
                `
                        : ""
                    }

              ${address
                        ? `
                  <div class="contact-card">
                    <div class="contact-icon">⌖</div>

                    <div>
                      <div class="contact-label">Address</div>
                      <div class="contact-value">
                        ${escapeHtml(address)}
                      </div>
                    </div>
                  </div>
                `
                        : ""
                    }
            </div>
          </section>
        `
                    : "";

            const printWindow = window.open("", "_blank");

            if (!printWindow) {
                alert(
                    "Could not open the print window. Please allow popups and try again."
                );

                URL.revokeObjectURL(qrImageUrl);
                return;
            }

            printWindow.document.write(`
        <!DOCTYPE html>

        <html>
          <head>
            <title>
              ${escapeHtml(displayStoreName)} - QR Code
            </title>

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />

            <style>
              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                padding: 0;
                background: #e9e9e9;
                font-family:
                  Arial,
                  Helvetica,
                  sans-serif;
                color: #152019;
              }

              .banner {
                width: 210mm;
                min-height: 297mm;
                margin: auto;
                background:
                  linear-gradient(
                    135deg,
                    #f9faf7,
                    #ffffff
                  );
                position: relative;
                overflow: hidden;
              }

              .top-shape {
                position: absolute;
                top: 0;
                left: 0;
                width: 210px;
                height: 210px;
                background: #075c2a;
                border-radius:
                  0 0 140px 0;
              }

              .top-dots {
                position: absolute;
                top: 30px;
                right: 35px;
                color: #087533;
                font-size: 25px;
                letter-spacing: 8px;
              }

              .content {
                position: relative;
                padding:
                  45px
                  45px
                  0;
              }

              .logo {
                width: 65px;
                height: 65px;
                border-radius: 18px;
                object-fit: cover;
                display: block;
                margin:
                  0 auto
                  15px;
                border:
                  1px solid
                  #e5e7eb;
              }

              .logo-placeholder {
                width: 65px;
                height: 65px;
                margin:
                  0 auto
                  15px;
                border-radius: 18px;
                background: #075c2a;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                font-weight: 800;
              }

              h1 {
                margin: 0;
                text-align: center;
                color: #0b3d1c;
                font-size: 46px;
                line-height: 1;
                font-weight: 900;
                letter-spacing: -1.5px;
              }

              .subtitle {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                margin-top: 15px;
                color: #5b615d;
                font-size: 15px;
                letter-spacing: 4px;
                text-align: center;
              }

              .subtitle span {
                width: 55px;
                height: 1px;
                background: #15803d;
              }

              .description {
                max-width: 560px;
                margin:
                  18px auto
                  20px;
                text-align: center;
                color: #667085;
                font-size: 13px;
                line-height: 1.6;
              }

              .qr-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
                margin-top: 20px;
              }

              .qr-card {
                background: white;
                border:
                  2px solid
                  #16803c;
                border-radius: 26px;
                padding: 18px;
                box-shadow:
                  0 12px 30px
                  rgba(0,0,0,.08);
              }

              .qr-image {
                width: 330px;
                height: 330px;
                display: block;
              }

              .username {
                margin-top: 16px;
                background:
                  linear-gradient(
                    90deg,
                    #073b20,
                    #0b6b35
                  );
                color: white;
                padding:
                  10px
                  32px;
                border-radius: 999px;
                font-size: 25px;
                font-weight: 800;
              }

              .visit-text {
                margin:
                  22px auto
                  12px;
                text-align: center;
                font-size: 15px;
                color: #525b55;
              }

              .visit-text strong {
                color: #087533;
              }

              .store-link {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background:
                  linear-gradient(
                    90deg,
                    #087a2d,
                    #0b9c32
                  );
                color: white;
                padding: 16px;
                border-radius: 16px;
                font-size: 16px;
                font-weight: 700;
                text-align: center;
                word-break: break-all;
              }

              .section {
                margin-top: 30px;
              }

              .section-title {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 14px;
                color: #155d31;
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 2px;
              }

              .section-title span {
                width: 100px;
                height: 1px;
                background: #79a889;
              }

              .social-grid {
                display: grid;
                grid-template-columns:
                  repeat(5, 1fr);
                gap: 8px;
                margin-top: 16px;
              }

              .social-item {
                min-height: 105px;
                background: white;
                border:
                  1px solid
                  #e5e7eb;
                border-radius: 14px;
                padding: 12px 8px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
              }

              .social-icon {
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: #0b7a36;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 21px;
                font-weight: 800;
                margin-bottom: 7px;
              }

              .social-name {
                font-size: 10px;
                font-weight: 700;
                color: #374151;
              }

              .social-handle {
                margin-top: 3px;
                font-size: 8px;
                color: #6b7280;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .contact-grid {
                display: grid;
                grid-template-columns:
                  repeat(2, 1fr);
                gap: 14px;
                margin-top: 16px;
              }

              .contact-card {
                display: flex;
                align-items: center;
                gap: 13px;
                padding: 16px;
                background: white;
                border:
                  1px solid
                  #e5e7eb;
                border-radius: 16px;
              }

              .contact-icon {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: #087533;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 21px;
                flex-shrink: 0;
              }

              .contact-label {
                font-size: 11px;
                color: #6b7280;
                margin-bottom: 4px;
              }

              .contact-value {
                font-size: 12px;
                font-weight: 700;
                color: #1f2937;
                line-height: 1.4;
              }

              .footer {
                margin-top: 35px;
                padding:
                  22px
                  30px;
                background: #075c2a;
                color: white;
                text-align: center;
                font-size: 22px;
                font-style: italic;
              }

              @media print {
                body {
                  background: white;
                }

                .banner {
                  width: 210mm;
                  min-height: 297mm;
                  box-shadow: none;
                }

                @page {
                  size: A4 portrait;
                  margin: 0;
                }
              }
            </style>
          </head>

          <body>
            <div class="banner">

              <div class="top-shape"></div>

              <div class="top-dots">
                · · ·<br/>
                · · ·
              </div>

              <div class="content">

                ${logoUrl
                    ? `
                    <img
                      src="${escapeHtml(logoUrl)}"
                      class="logo"
                      alt="${escapeHtml(displayStoreName)}"
                    />
                  `
                    : `
                    <div class="logo-placeholder">
                      ${escapeHtml(
                        displayStoreName.charAt(0).toUpperCase()
                    )}
                    </div>
                  `
                }

                <h1>FOLLOW MY STORE</h1>

                <div class="subtitle">
                  <span></span>
                  FOR QUALITY PRODUCTS
                  <span></span>
                </div>

                ${description
                    ? `
                    <div class="description">
                      ${escapeHtml(description)}
                    </div>
                  `
                    : ""
                }

                <div class="qr-wrap">

                  <div class="qr-card">
                    <img
                      class="qr-image"
                      src="${qrImageUrl}"
                      alt="QR Code"
                    />
                  </div>

                  <div class="username">
                    @${escapeHtml(username)}
                  </div>
                </div>

                <div class="visit-text">
                  Follow
                  <strong>
                    ${escapeHtml(displayStoreName)}
                  </strong>
                  or scan the QR code to visit my store
                </div>

                <div class="store-link">
                  🔗
                  ${escapeHtml(storeUrl)}
                </div>

                ${socialHtml}

                ${contactHtml}

              </div>

              <div class="footer">
                Thank you for your support! ♡
              </div>

            </div>
          </body>
        </html>
      `);

            printWindow.document.close();

            /*
             * Wait for QR image and logo to load
             * before opening the print dialog.
             */
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();

                setTimeout(() => {
                    URL.revokeObjectURL(qrImageUrl);
                }, 1000);
            }, 800);
        } catch (error) {
            console.error("Error printing QR banner:", error);

            alert(
                "Something went wrong while generating the QR banner."
            );
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
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>

                    {/* Tabs */}
                    <div className="flex p-2 bg-gray-50 border-b border-gray-100">
                        <button
                            onClick={() => setActiveTab("generate")}
                            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-[12px] transition-all duration-200 ${activeTab === "generate"
                                ? "bg-[#09A03D] text-white shadow-md"
                                : "text-gray-500 hover:bg-gray-100"
                                }`}
                        >
                            Generate QR Code
                        </button>

                        <button
                            onClick={() => setActiveTab("scan")}
                            className={`flex-1 py-3 px-4 text-sm font-semibold rounded-[12px] transition-all duration-200 ${activeTab === "scan"
                                ? "bg-[#09A03D] text-white shadow-md"
                                : "text-gray-500 hover:bg-gray-100"
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
                                    <div
                                        ref={qrCodeRef}
                                        className="flex justify-center items-center"
                                    />
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
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                                            />
                                        </svg>

                                        Print Banner
                                    </button>

                                    <button
                                        onClick={() => setIsShareModalOpen(true)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-[12px] transition-colors shadow-sm"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-5 w-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                            />
                                        </svg>

                                        Share Store
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                key="scanner-view"
                                className="flex flex-col items-center justify-center space-y-4 py-4 w-full"
                            >
                                {scanResult ? (
                                    <div className="text-center space-y-4 w-full">
                                        <div className="bg-green-50 border border-[#09A03D]/20 rounded-xl p-4">
                                            <p className="text-sm font-bold text-[#09A03D] mb-1">
                                                Successfully Scanned!
                                            </p>

                                            <p className="text-xs text-gray-600 break-all">
                                                {scanResult}
                                            </p>
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
                                        <div
                                            id="qr-reader"
                                            className="w-full max-w-[300px] rounded-[10px] overflow-hidden bg-gray-900 flex items-center justify-center min-h-[300px] relative"
                                        >
                                            {!isScanning && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        className="h-16 w-16 mb-2"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={1.5}
                                                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                                        />

                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={1.5}
                                                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                                        />
                                                    </svg>

                                                    <p className="text-sm">
                                                        Camera is off
                                                    </p>
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
                                            Position the QR code within the frame.
                                            Ensure you have granted camera permissions
                                            and are using HTTPS.
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