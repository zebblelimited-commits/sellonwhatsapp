"use client";
import React, { useState } from "react";
import { X, Copy, Check, ExternalLink } from "lucide-react";
// Import all icons from your SocialIcons component
import { 
  WhatsAppIcon, InstagramIcon, FacebookIcon, 
  TikTokIcon, YoutubeIcon, TwitterIcon 
} from "@/components/icons/SocialIcons"; 

export default function SocialShareModal({ isOpen, onClose, title, url }: { isOpen: boolean; onClose: () => void; title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`Check out ${title} on SellOnWhatsApp! 🚀`);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };

  // Logic: Some platforms have direct share links, others are for copy-paste reference
  const socialPlatforms = [
    { name: "WhatsApp", icon: <WhatsAppIcon size={24}/>, color: "bg-[#25D366]", link: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
    { name: "Twitter", icon: <TwitterIcon size={24}/>, color: "bg-black", link: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
    { name: "Facebook", icon: <FacebookIcon size={24}/>, color: "bg-[#1877F2]", link: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: "Instagram", icon: <InstagramIcon size={24}/>, color: "bg-[#E4405F]", isCopyOnly: true },
    { name: "TikTok", icon: <TikTokIcon size={24}/>, color: "bg-black", isCopyOnly: true },
    { name: "YouTube", icon: <YoutubeIcon size={24}/>, color: "bg-[#FF0000]", isCopyOnly: true },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 text-gray-900">
      <div className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
        <button onClick={onClose} className="absolute right-8 top-8 text-gray-400 hover:text-gray-900 transition-colors">
          <X size={20}/>
        </button>
        
        <div className="text-center mb-8">
          <h3 className="text-xl font-extrabold tracking-tight">Share {title}</h3>
          <p className="text-gray-400 text-sm font-bold">Select a platform to spread the word</p>
        </div>

        <div className="grid grid-cols-3 gap-y-8 gap-x-4 mb-10">
          {socialPlatforms.map((platform) => {
            const content = (
              <>
                <div className={`${platform.color} text-white p-4 rounded-[24px] shadow-lg group-hover:scale-110 transition-transform flex items-center justify-center`}>
                  {platform.icon}
                </div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{platform.name}</span>
              </>
            );

            return platform.isCopyOnly ? (
              <button key={platform.name} onClick={handleCopy} className="flex flex-col items-center gap-2 group">
                {content}
              </button>
            ) : (
              <a key={platform.name} href={platform.link} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 group">
                {content}
              </a>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded-2xl">
            <input readOnly value={url} className="bg-transparent border-none outline-none text-[10px] font-bold text-gray-500 flex-1 pl-3 truncate" />
            <button onClick={handleCopy} className="bg-white text-gray-900 border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase hover:bg-gray-100 transition-all flex items-center gap-2 shadow-sm min-w-[90px] justify-center">
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          
          <p className="text-[9px] text-center text-gray-400 font-bold uppercase tracking-tighter">
            Tip: For Instagram and TikTok, copy the link and paste it in your bio or story.
          </p>
        </div>
      </div>
    </div>
  );
}
