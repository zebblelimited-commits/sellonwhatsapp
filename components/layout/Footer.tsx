"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "@/lib/fonts";
import { MapPin, Phone, Mail, X, CheckCircle2 } from "lucide-react";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });
const headingFont = font;

type StoreType = "Apple App Store" | "Google Play Store" | null;

export default function Footer() {
  const [selectedStore, setSelectedStore] = useState<StoreType>(null);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleStoreClick = (storeName: StoreType) => {
    setSelectedStore(storeName);
    setIsSubmitted(false);
    setEmail("");
  };

  const closeModal = () => {
    setSelectedStore(null);
    setIsSubmitted(false);
    setEmail("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // TODO: Connect this to your API endpoint or newsletter service
    console.log(`Submitting email: ${email} for ${selectedStore}`);

    setIsSubmitted(true);
  };

  return (
    <>
      <footer className={`${font.className} border-t border-gray-200 bg-white px-6 py-12 text-sm text-gray-600`}>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Section 1: Logo & About */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center px-2">
              <img
                src="/icons/sowa.png"
                alt="Sowa Logo"
                className="h-8 md:h-9 w-auto object-contain"
              />
            </Link>
            <p className="leading-relaxed">
              Empowering small businesses to sell smarter and faster by turning WhatsApp into a professional storefront.
            </p>
          </div>

          {/* Section 2: Quick Links */}
          <div>
            <h4 className={`${headingFont.className} font-bold text-gray-900 mb-4`}>
              Quick Links
            </h4>
            <ul className="flex flex-col gap-2">
              <li><Link href="/explore" className="hover:text-green-600 transition-colors">Explore</Link></li>
              <li><Link href="/search" className="hover:text-green-600 transition-colors">Search</Link></li>
              <li><Link href="/categories" className="hover:text-green-600 transition-colors">Categories</Link></li>
              <li><Link href="/products" className="hover:text-green-600 transition-colors">Products</Link></li>
              <li><Link href="/stores" className="hover:text-green-600 transition-colors">Stores</Link></li>
              <li><Link href="/verified-stores" className="hover:text-green-600 transition-colors">Verified Stores</Link></li>
              <li><Link href="/sponsored-stores" className="hover:text-green-600 transition-colors">Sponsored Stores</Link></li>
              <li><Link href="/sponsored-products" className="hover:text-green-600 transition-colors">Sponsored Products</Link></li>
              <li><Link href="/how-it-works" className="hover:text-green-600 transition-colors">How it works</Link></li>
              <li><Link href="/pricing" className="hover:text-green-600 transition-colors">Pricing</Link></li>
              <li><Link href="/boost-store" className="hover:text-green-600 transition-colors">Boost Store</Link></li>
              <li><Link href="/faq" className="hover:text-green-600 transition-colors">FAQ</Link></li>
              <li><Link href="/login" className="hover:text-green-600 transition-colors">Login</Link></li>
              <li><Link href="/register" className="hover:text-green-600 transition-colors">Create Store</Link></li>
            </ul>
          </div>

          {/* Section 3: Legal */}
          <div>
            <h4 className={`${headingFont.className} font-bold text-gray-900 mb-4`}>
              Legal
            </h4>
            <ul className="flex flex-col gap-2">
              <li><Link href="/privacy" className="hover:text-green-600 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-green-600 transition-colors">Terms of Service</Link></li>
              <li><Link href="/cookies" className="hover:text-green-600 transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>

          {/* Section 4: Contact, Socials & App Downloads */}
          <div className="flex flex-col gap-6">
            <div>
              <h4 className={`${headingFont.className} font-bold text-gray-900 mb-4`}>
                Contact & Follow
              </h4>

              {/* Contact Info */}
              <ul className="flex flex-col gap-3 mb-6 text-xs font-medium text-gray-500">
                <li className="flex items-center gap-2 transition-colors hover:text-green-600 group">
                  <MapPin size={14} className="text-gray-400 group-hover:text-green-600" /> Lagos, Nigeria
                </li>
                <li className="flex items-center gap-2 transition-colors hover:text-green-600 group">
                  <Phone size={14} className="text-gray-400 group-hover:text-green-600" /> +234 800 000 0000
                </li>
                <li className="flex items-center gap-2 transition-colors hover:text-green-600 group">
                  <Mail size={14} className="text-gray-400 group-hover:text-green-600" /> support@sellonwhatsapp.com
                </li>
              </ul>

              {/* Social Grid */}
              <div className="flex flex-wrap gap-2">
                {/* WhatsApp */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] transition-all">
                  <Image src="/icons/whatsapplogo.svg" width={18} height={18} alt="WhatsApp" />
                </a>

                {/* Threads */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] transition-all">
                  <Image src="/icons/threadslogo.svg" width={18} height={18} alt="Threads" />
                </a>

                {/* X (Twitter) */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-black transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" /></svg>
                </a>

                {/* Instagram */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-pink-600 transition-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                </a>

                {/* Facebook */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-blue-600 transition-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
                </a>

                {/* YouTube */}
                <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-red-600 transition-all">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 2-2 68.4 68.4 0 0 1 15 0 2 2 0 0 1 2 2 24.12 24.12 0 0 1 0 10 2 2 0 0 1-2 2 68.4 68.4 0 0 1-15 0 2 2 0 0 1-2-2Z" /><path d="m10 15 5-3-5-3z" /></svg>
                </a>
              </div>
            </div>

            {/* App Store Buttons - Vertical Stacking */}
            <div className="flex flex-col gap-3 pt-2">
              <h5 className={`${headingFont.className} text-xs font-semibold text-gray-900 uppercase tracking-wider`}>
                Get the App
              </h5>
              <div className="flex flex-col gap-2.5 max-w-[220px]">
                {/* App Store Button */}
                <button
                  onClick={() => handleStoreClick("Apple App Store")}
                  className="group relative flex items-center justify-between bg-black text-white px-3 py-2 rounded-xl border border-black hover:bg-gray-800 transition-all text-left w-full"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/images/apple-store.svg"
                      alt="Apple App Store"
                      className="h-5 w-auto object-contain"
                    />
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 leading-none">Download on the</span>
                      <span className="text-xs font-semibold leading-tight">App Store</span>
                    </div>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-500/30">
                    Soon
                  </span>
                </button>

                {/* Google Play Button */}
                <button
                  onClick={() => handleStoreClick("Google Play Store")}
                  className="group relative flex items-center justify-between bg-black text-white px-3 py-2 rounded-xl border border-black hover:bg-gray-800 transition-all text-left w-full"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/images/google-play.svg"
                      alt="Google Play Store"
                      className="h-5 w-auto object-contain"
                    />
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 leading-none">GET IT ON</span>
                      <span className="text-xs font-semibold leading-tight">Google Play</span>
                    </div>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-500/30">
                    Soon
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-100 text-center text-xs text-gray-400">
          <p>© {new Date().getFullYear()} SellOnWhatsApp. Powered by Zebble Quantum Solutions LTD</p>
        </div>
      </footer>

      {/* Notification Modal */}
      {selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl transition-all">
            {/* Close Button */}
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>

            {!isSubmitted ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className={`${headingFont.className} text-lg font-bold text-gray-900`}>
                      Coming Soon!
                    </h3>
                    <p className="text-xs text-gray-500">
                      Our app is currently under review for the {selectedStore}.
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Enter your email address below to receive an instant notification as soon as the app goes live on the store.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
                  <input
                    type="email"
                    required
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 transition-all"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-all"
                  >
                    Notify Me
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
                <CheckCircle2 size={48} className="text-green-600" />
                <h3 className={`${headingFont.className} text-xl font-bold text-gray-900`}>
                  You're on the list!
                </h3>
                <p className="text-sm text-gray-600">
                  We'll send an email to <span className="font-semibold text-gray-900">{email}</span> the moment the app becomes available on the {selectedStore}.
                </p>
                <button
                  onClick={closeModal}
                  className="mt-2 w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}