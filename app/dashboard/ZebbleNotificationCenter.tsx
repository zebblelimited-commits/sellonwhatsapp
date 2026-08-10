// app/dashboard/ZebbleNotificationCenter.tsx
"use client";

import { Inbox } from "@novu/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export function ZebbleNotificationCenter() {
    const router = useRouter();
    const [subscriberId, setSubscriberId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) setSubscriberId(user.uid);
            else setSubscriberId(null);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (isLoading) return <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />;
    if (!subscriberId) return null;

    return (
        <div className="relative">
            <Inbox
                applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APP_ID!}
                subscriberId={subscriberId}
                // We use the onNotificationClick handler as the primary navigation method
                onNotificationClick={(notification) => {
                    // Extract actionUrl from the payload. 
                    // Defaults to /dashboard?tab=orders if not present.
                    const payload = (notification as unknown as { payload?: { actionUrl?: string } }).payload;
                    const targetUrl = payload?.actionUrl || "/dashboard?tab=orders";
                    router.push(targetUrl);
                }}
                appearance={{
                    elements: {
                        bellIcon: "text-slate-500 hover:text-green-600 transition-colors",
                        badge: "bg-green-600 text-white border-2 border-white",
                        popoverContent: "rounded-[24px] border-gray-100 shadow-2xl bg-white",
                    },
                    variables: {
                        borderRadius: "16px",
                        colorPrimary: "#16a34a",
                    }
                }}
            />
        </div>
    );
}
