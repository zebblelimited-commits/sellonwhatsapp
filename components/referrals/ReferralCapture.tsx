"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export const REFERRAL_STORAGE_KEY = "sow_referral_code";

export default function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const referralCode = searchParams.get("ref")?.trim().toUpperCase();
    if (referralCode && /^[A-Z0-9]{3,24}$/.test(referralCode)) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, referralCode);
    }
  }, [searchParams]);

  return null;
}
