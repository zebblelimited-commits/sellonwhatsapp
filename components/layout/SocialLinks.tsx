import type { ComponentType } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  WhatsAppIcon,
  YoutubeIcon,
} from "@/components/icons/SocialIcons";

type IconProps = { size?: number; className?: string };

function LinkedInIcon({ size = 20, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 8.25H3.1V21h3.4V8.25ZM4.8 3A2 2 0 1 0 4.8 7a2 2 0 0 0 0-4ZM21 13.7c0-3.84-2.05-5.63-4.78-5.63-2.2 0-3.18 1.2-3.73 2.04V8.25H9.1V21h3.39v-6.3c0-1.66.31-3.27 2.37-3.27 2.03 0 2.05 1.9 2.05 3.38V21H21v-7.3Z" />
    </svg>
  );
}

function ThreadsIcon({ size = 20, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M17.7 8.2c-.6-2.7-2.5-4.2-5.7-4.2-3.6 0-6 2.1-6 5.4 0 4.1 3.2 6.6 7.1 6.6 3.4 0 5.2-1.8 5.2-4.2 0-2.6-2.2-4.2-5.2-4.2-2.4 0-4 .9-4 2.6 0 1.6 1.4 2.5 3.3 2.5 2.9 0 4.9-1.8 4.9-4.8 0-3.4-2.3-5.7-5.5-5.7" />
    </svg>
  );
}

function XIcon({ size = 20, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.24-8.28L3 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.7h1.73L8.48 4.18H6.62L17.8 19.7Z" />
    </svg>
  );
}

export type SocialLink = {
  label: string;
  href: string;
  Icon: ComponentType<IconProps>;
  hoverClass: string;
};

export const SOCIAL_LINKS: SocialLink[] = [
  { label: "WhatsApp", href: "https://wa.me/2349135146692", Icon: WhatsAppIcon, hoverClass: "hover:text-[#16a34a]" },
  { label: "Facebook", href: "https://www.facebook.com/sellonwhatsapp", Icon: FacebookIcon, hoverClass: "hover:text-[#1877f2]" },
  { label: "Instagram", href: "https://www.instagram.com/sellonwhatsapp", Icon: InstagramIcon, hoverClass: "hover:text-[#e1306c]" },
  { label: "TikTok", href: "https://www.tiktok.com/@sellonwhatsapp", Icon: TikTokIcon, hoverClass: "hover:text-black" },
  { label: "YouTube", href: "https://www.youtube.com/@sellonwhatsapp", Icon: YoutubeIcon, hoverClass: "hover:text-[#ff0000]" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/sellonwhatsapp", Icon: LinkedInIcon, hoverClass: "hover:text-[#0a66c2]" },
  { label: "Threads", href: "https://www.threads.net/@sellonwhatsapp", Icon: ThreadsIcon, hoverClass: "hover:text-black" },
  { label: "X", href: "https://x.com/sellonwhatsapp", Icon: XIcon, hoverClass: "hover:text-black" },
];

export default function SocialLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {SOCIAL_LINKS.map(({ label, href, Icon, hoverClass }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Follow SellOnWhatsApp on ${label}`}
          title={label}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-all hover:border-green-200 hover:bg-green-50 ${hoverClass}`}
        >
          <Icon size={18} />
        </a>
      ))}
    </div>
  );
}
