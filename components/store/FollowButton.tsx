"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { auth, db } from "@/lib/firebase";
import { User } from "firebase/auth";
import {
  doc,
  getDoc,
  increment,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trackMetric } from "@/lib/analytics";

// ✅ Added Props Interface for Parent-Child Communication
interface FollowButtonProps {
  vendorId: string;
  currentCount: number;
  onFollowChange: (newCount: number) => void;
}

export default function FollowButton({ vendorId, currentCount, onFollowChange }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [modal, setModal] = useState({
    show: false,
    message: "",
    type: "info" as "info" | "success" | "error"
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        checkFollowStatus(currentUser.uid);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [vendorId]);

  const showAlert = (message: string, type: "info" | "success" | "error" = "info") => {
    setModal({ show: true, message, type });
    if (type !== "info") {
      setTimeout(() => setModal(prev => ({ ...prev, show: false })), 3000);
    }
  };

  const checkFollowStatus = async (userId: string) => {
    try {
      const followDocId = `${userId}_${vendorId}`;
      const followRef = doc(db, "follows", followDocId);
      const docSnap = await getDoc(followRef);
      setIsFollowing(docSnap.exists());
    } catch (error) {
      console.error("Error checking follow status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      showAlert("Please login to follow this store and get updates!", "info");
      return;
    }

    if (user.uid === vendorId) {
      showAlert("You cannot follow your own store.", "error");
      return;
    }

    setActionLoading(true);
    void trackMetric(vendorId, "click");

    const followDocId = `${user.uid}_${vendorId}`;
    const followRef = doc(db, "follows", followDocId);
    const storeRef = doc(db, "stores", vendorId);
    const batch = writeBatch(db);

    try {
      if (isFollowing) {
        batch.delete(followRef);
        batch.update(storeRef, { followerCount: increment(-1) });
        await batch.commit();
        
        setIsFollowing(false);
        onFollowChange(currentCount - 1); // ✅ Instantly update parent UI
        showAlert("Unfollowed successfully", "success");
      } else {
        batch.set(followRef, {
          followerId: user.uid,
          vendorId: vendorId,
          createdAt: serverTimestamp(),
        });
        batch.update(storeRef, { followerCount: increment(1) });
        await batch.commit();
        
        setIsFollowing(true);
        onFollowChange(currentCount + 1); // ✅ Instantly update parent UI
        showAlert("You are now following this store!", "success");
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      showAlert("Something went wrong. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="h-9 w-28 bg-gray-100 animate-pulse rounded-xl" />;

  const whiteFilter = { filter: 'brightness(0) invert(1)' };
  const greyFilter = {
    filter: 'invert(60%) sepia(3%) saturate(10%) hue-rotate(320deg) brightness(95%) contrast(85%)'
  };

  return (
    <>
      <button
        onClick={handleFollowToggle}
        disabled={actionLoading}
        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-extrabold transition-all active:scale-95 border-none bg-black w-full ${
          isFollowing ? "text-gray-400" : "text-white"
        }`}
      >
        {actionLoading ? (
          <Loader2 size={14} className="animate-spin text-white" />
        ) : (
          <>
            <Image
              src="/icons/userfollow.svg"
              width={14}
              height={14}
              alt="follow"
              className="opacity-100"
              style={isFollowing ? greyFilter : whiteFilter}
            />
            {isFollowing ? "Following" : "Follow Store"}
          </>
        )}
      </button>

      <AnimatePresence>
        {modal.show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[4px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] p-8 shadow-2xl border border-gray-100 max-w-xs w-full text-center relative"
            >
              <div className="flex flex-col items-center gap-5">
                {modal.type === "success" && (
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                    <CheckCircle2 size={32} />
                  </div>
                )}
                {modal.type === "error" && (
                  <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                    <AlertCircle size={32} />
                  </div>
                )}
                {modal.type === "info" && (
                  <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <AlertCircle size={32} />
                  </div>
                )}
                <div className="px-2">
                  <h3 className="text-base font-black text-gray-900 mb-2">
                    {modal.type === "success" ? "Success!" : modal.type === "error" ? "Error" : "Attention"}
                  </h3>
                  <p className="text-[13px] text-gray-500 font-bold leading-relaxed">
                    {modal.message}
                  </p>
                </div>
                <button
                  onClick={() => setModal(prev => ({ ...prev, show: false }))}
                  className="w-full py-3.5 bg-gray-900 text-white rounded-2xl text-[12px] font-black hover:bg-gray-800 shadow-lg transition-all active:scale-[0.98]"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
