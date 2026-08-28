"use client";

import React, { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { Html5Qrcode } from "html5-qrcode";
import SocialShareModal from "@/app/dashboard/modals/SocialShareModal";

interface QrCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    storeUrl: string;
    storeName?: string;
}

export default function QrCodeModal({
    isOpen,
    onClose,
    storeUrl,
    storeName = "My Store",
}: QrCodeModalProps) {
    const [activeTab, setActiveTab] = useState<"generate" | "scan">("generate");
    const qrCodeRef = useRef<HTMLDivElement>(null);
    const qrCodeInstance = useRef<QRCodeStyling | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Initialize QR Code
    useEffect(() => {
        if (qrCodeRef.current && !qrCodeInstance.current) {
            qrCodeInstance.current = new QRCodeStyling({
                width: 300, // Increased size to prevent clipping
                height: 300,
                type: "canvas",
                data: storeUrl || "https://example.com",
                margin: 10,
                qrOptions: {
                    typeNumber: 0,
                    mode: "Byte",
                    errorCorrectionLevel: "Q",
                },
                imageOptions: {
                    hideBackgroundDots: true,
                    imageSize: 0.4,
                    margin: 6,
                },
                dotsOptions: {
                    type: "dots",
                    color: "#09A03D", // Updated green shade
                    gradient: {
                        type: "linear",
                        rotation: 0,
                        colorStops: [
                            { offset: 0, color: "#09A03D" },
                            { offset: 1, color: "#078030" },
                        ],
                    },
                },
                backgroundOptions: {
                    color: "#ffffff",
                },
                cornersSquareOptions: {
                    type: "extra-rounded",
                    color: "#09A03D",
                },
                cornersDotOptions: {
                    type: "dot",
                    color: "#09A03D",
                },
                image: "/icons/sowaicon.png",
            });

            qrCodeInstance.current.append(qrCodeRef.current);
        }

        return () => {
            if (qrCodeRef.current) {
                qrCodeRef.current.innerHTML = "";
                qrCodeInstance.current = null;
            }
        };
    }, []);

    // Update QR Code when storeUrl changes
    useEffect(() => {
        if (qrCodeInstance.current && storeUrl) {
            qrCodeInstance.current.update({
                data: storeUrl,
            });
        }
    }, [storeUrl]);

    // Camera Scanner Logic
    const startScanning = async () => {
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode("qr-reader");
        }

        try {
            await html5QrCodeRef.current.start(
                { facingMode: "environment" }, // Prefer back camera on mobile
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    setScanResult(decodedText);
                    stopScanning();
                },
                () => {
                    // Ignore parse errors while scanning
                }
            );
            setIsScanning(true);
        } catch (err) {
            console.error("Failed to start scanning. Ensure camera permissions are granted.", err);
            alert("Could not access camera. Please check your browser permissions.");
        }
    };

    const stopScanning = async () => {
        if (html5QrCodeRef.current && isScanning) {
            await html5QrCodeRef.current.stop();
            setIsScanning(false);
        }
    };

    // Cleanup scanner on unmount or tab change
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

    // Print Handler
    const handlePrint = async () => {
        if (!qrCodeInstance.current) return;
        const blob = (await qrCodeInstance.current.getRawData("png")) as Blob;
        if (blob) {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                    printWindow.document.write(`
            <html>
              <head><title>Print QR Code</title></head>
              <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
                <img src="${url}" alt="QR Code" style="max-width:100%;height:auto;" />
              </body>
            </html>
          `);
                    printWindow.document.close();
                    printWindow.print();
                    URL.revokeObjectURL(url);
                }
            };
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

                    {/* Tabs with 12px border radius */}
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
                                {/* QR Code Display with rounded background */}
                                <div className="bg-gray-50 p-6 rounded-[20px] border border-gray-100 shadow-inner flex items-center justify-center min-h-[340px] w-full">
                                    <div ref={qrCodeRef} className="flex justify-center items-center" />
                                </div>

                                {/* Store URL */}
                                <div className="text-center space-y-1 w-full">
                                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Store URL</p>
                                    <p className="text-sm font-medium text-gray-700 break-all px-2">{storeUrl}</p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex w-full gap-3 pt-2">
                                    <button
                                        onClick={handlePrint}
                                        className="flex-1 flex items-center justify-center gap-2 bg-[#09A03D] hover:bg-[#078030] text-white font-semibold py-3 px-4 rounded-[12px] transition-colors shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        Print QR Code
                                    </button>
                                    <button
                                        onClick={() => setIsShareModalOpen(true)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-[12px] transition-colors shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                        </svg>
                                        Share
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Scan Tab UI */
                            <div className="flex flex-col items-center justify-center space-y-4 py-4 w-full">
                                {scanResult ? (
                                    <div className="text-center space-y-4 w-full">
                                        <div className="bg-green-50 border border-[#09A03D]/20 rounded-xl p-4">
                                            <p className="text-sm font-bold text-[#09A03D] mb-1">Successfully Scanned!</p>
                                            <p className="text-xs text-gray-600 break-all">{scanResult}</p>
                                        </div>
                                        <button
                                            onClick={() => { setScanResult(null); startScanning(); }}
                                            className="w-full bg-[#09A03D] hover:bg-[#078030] text-white font-semibold py-3 px-8 rounded-[12px] transition-colors shadow-sm"
                                        >
                                            Scan Another
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div id="qr-reader" className="w-full max-w-[300px] rounded-[20px] overflow-hidden bg-gray-900 flex items-center justify-center min-h-[300px] relative">
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
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                </svg>
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
                                            Position the QR code within the frame. Ensure you have granted camera permissions in your browser.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Social Share Modal Integration */}
            <SocialShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={storeName}
                url={storeUrl}
            />
        </>
    );
}