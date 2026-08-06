"use client";

import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MapPin, Phone, Mail } from "lucide-react";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });
const headingFont = font;

export default function Footer() {
  return (
    <footer className={`${font.className} border-t border-gray-200 bg-white px-6 py-12 text-sm text-gray-600`}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">

        {/* Section 1: Logo & About - Balanced and Enlarged */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center px-2">
            <img 
              src="/icons/sowa.png" 
              alt="Sowa Logo" 
              className="h-11 w-auto object-contain" 
            />
          </div>
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
            <li><a href="#how" className="hover:text-green-600 transition-colors">How it works</a></li>
            <li><a href="#pricing" className="hover:text-green-600 transition-colors">Pricing</a></li>
            <li><a href="/login" className="hover:text-green-600 transition-colors">Login</a></li>
            <li><a href="/dashboard" className="hover:text-green-600 transition-colors">Create Store</a></li>
          </ul>
        </div>

        {/* Section 3: Legal */}
        <div>
          <h4 className={`${headingFont.className} font-bold text-gray-900 mb-4`}>
            Legal
          </h4>
          <ul className="flex flex-col gap-2">
            <li><a href="#" className="hover:text-green-600 transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-green-600 transition-colors">Terms of Service</a></li>
            <li><a href="#" className="hover:text-green-600 transition-colors">Cookie Policy</a></li>
          </ul>
        </div>

        {/* Section 4: Contact & Socials */}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/></svg>
            </a>

            {/* Instagram */}
            <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-pink-600 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>

            {/* Facebook */}
            <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-blue-600 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>

            {/* YouTube */}
            <a href="#" className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-[#f7fee7] hover:border-[#ecfcca] hover:text-red-600 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 2-2 68.4 68.4 0 0 1 15 0 2 2 0 0 1 2 2 24.12 24.12 0 0 1 0 10 2 2 0 0 1-2 2 68.4 68.4 0 0 1-15 0 2 2 0 0 1-2-2Z"/><path d="m10 15 5-3-5-3z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-gray-100 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} SellOnWhatsApp. Powered by Zebble Quantum Solutions LTD</p>
      </div>
    </footer>
  );
}