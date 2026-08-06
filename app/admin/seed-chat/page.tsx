// app/admin/seed-chat/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

export default function SeedChatPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    async function seed() {
      try {
        if (!auth.currentUser) {
          setStatus("❌ Not signed in");
          return;
        }

        const docRef = await addDoc(collection(db, "admin_chats"), {
          participants: [auth.currentUser.uid, "testBuyerUid123"],
          userName: "Test Buyer",
          userEmail: "test@zebble.com",
          userRole: "buyer",
          lastMessage: "Hello admin, I need help with my order",
          lastMessageAt: new Date(),
          status: "active",
          unreadCount: 1,
          createdAt: new Date()
        });

        setStatus(`✅ Chat created: ${docRef.id}`);
        
        // Auto-redirect after 3 seconds
        setTimeout(() => router.push("/admin?tab=chat"), 3000);
      } catch (error) {
        console.error("Seed failed:", error);
        setStatus(`❌ Error: ${error.message}`);
      }
    }
    seed();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md text-center">
        <h1 className="text-xl font-bold mb-4">Seed Test Chat</h1>
        <p className="text-gray-600">{status}</p>
        <button 
          onClick={() => router.push("/admin")}
          className="mt-6 px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}