"use client";
import { trackMetric, AnalyticsEvent } from "@/lib/analytics";

interface TrackedLinkProps {
  href: string;
  storeId: string;
  children: React.ReactNode;
  className?: string;
  eventType?: AnalyticsEvent; // ✅ Allows passing 'whatsapp_click', 'click', etc.
  onClick?: () => void;       // ✅ Allows custom click logic from parent
}

export default function TrackedLink({ 
  href, 
  storeId, 
  children, 
  className, 
  eventType = 'click', // ✅ Defaults to singular 'click'
  onClick 
}: TrackedLinkProps) {
  
  const handleClick = () => {
    // 1. Track the metric using the correct singular event type
    trackMetric(storeId, eventType);
    
    // 2. Execute any custom onClick passed from the parent
    if (onClick) {
      onClick();
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}