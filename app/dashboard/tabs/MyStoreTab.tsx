"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  Store, Camera, Image as ImageIcon, Save, Edit2,
  FileText, Phone, Mail, MapPin, Loader2, ShieldCheck,
  X, ArrowRight, CheckCircle2, AlertTriangle, Star,
  MessageSquare, TrendingUp, Zap, Users, Clock, BarChart3,
  ChevronRight, CreditCard, Sparkles, Crown, Eye, MousePointerClick, Globe
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import {
  FacebookIcon, InstagramIcon, TwitterIcon,
  YoutubeIcon, TikTokIcon
} from "@/components/icons/SocialIcons";
import { STORE_CATEGORIES } from "../nigeriaData";
import LocationSelector from "../LocationSelector";
import { showToast } from "@/lib/toast";

// ✅ TypeScript Interfaces
interface StoreData {
  storeName: string;
  username?: string;
  description: string;
  mainCategory?: string;
  subCategory?: string;
  category?: string; // Kept for backward compatibility
  state: string;
  lga: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  address: string;
  email: string;
  bannerUrl?: string;
  logoUrl?: string;
  socials?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
  };
  verificationStatus?: "none" | "pending" | "approved" | "rejected";
  [key: string]: any;
}

interface MyStoreTabProps {
  initialData: StoreData | null;
}

type BoostTier = "micro" | "pro" | "max";
interface BoostPackage {
  id: BoostTier;
  name: string;
  price: number;
  duration: string;
  durationHours: number;
  description: string;
  features: string[];
  popular?: boolean;
}

type NotificationType = "success" | "error" | "info";
interface NotificationState {
  show: boolean;
  type: NotificationType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface BoostData {
  id: string;
  tier: BoostTier;
  packageName: string;
  expiryDate: string;
  startDate: string | null;
  durationDays: number;
  durationLabel: string;
  views: number;
  clicks: number;
  conversions: number;
  autoRenew: boolean;
  status: "active" | "pending" | "expired";
}

// ✅ Expiration and Status Helpers
export const isExpiringSoon = (expiryDateString: string, thresholdHours: number = 24): boolean => {
  const expiry = new Date(expiryDateString);
  const now = new Date();
  const hoursLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursLeft > 0 && hoursLeft <= thresholdHours;
};

export const isExpired = (expiryDateString: string): boolean => {
  return new Date(expiryDateString).getTime() <new Date().getTime();
};

export const getHoursRemaining = (expiryDateString: string): number => {
  const expiry = new Date(expiryDateString);
  const now = new Date();
  return Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60)));
};

export const getMinutesRemaining = (expiryDateString: string): number => {
  const expiry = new Date(expiryDateString);
  const now = new Date();
  return Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60)));
};

export const formatExpiryDate = (expiryDateString: string): string => {
  return new Date(expiryDateString).toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// ✅ Boost Status Display Helper
export const getBoostStatusDisplay = (boost: BoostData | null): {
  label: string;
  color: string;
  bgColor: string;
  showCountdown: boolean;
} => {
  if (!boost) return { label: "Inactive", color: "text-gray-500", bgColor: "bg-gray-100", showCountdown: false };
  if (boost.status === "pending") {
    return { label: "Pending", color: "text-amber-600", bgColor: "bg-amber-100", showCountdown: false };
  }
  if (boost.status === "active") {
    if (isExpired(boost.expiryDate)) {
      return { label: "Expired", color: "text-red-600", bgColor: "bg-red-100", showCountdown: false };
    }
    if (isExpiringSoon(boost.expiryDate, 6)) {
      return { label: "Expiring Soon", color: "text-orange-600", bgColor: "bg-orange-100", showCountdown: true };
    }
    return { label: "Active", color: "text-green-600", bgColor: "bg-green-100", showCountdown: true };
  }
  if (boost.status === "expired" || isExpired(boost.expiryDate)) {
    return { label: "Expired", color: "text-red-600", bgColor: "bg-red-100", showCountdown: false };
  }
  return { label: "Inactive", color: "text-gray-500", bgColor: "bg-gray-100", showCountdown: false };
};

// ✅ Expiry Calculator
export const calculateExpiryDate = (docData: any): string => {
  if (docData.expiryDate) {
    return new Date(docData.expiryDate).toISOString();
  }
  const baseDate = docData.paidAt
    ? new Date(docData.paidAt)
    : docData.createdAt
    ? new Date(docData.createdAt)
    : new Date();
  const days = docData.durationDays || 1;
  const expiry = new Date(baseDate);
  expiry.setDate(expiry.getDate() + days);
  return expiry.toISOString();
};

export default function MyStoreTab({ initialData }: MyStoreTabProps) {
  // ✅ Store Form State
  const [formData, setFormData] = useState({
    storeName: initialData?.storeName || "",
    username: initialData?.username || "",
    description: initialData?.description || "",
    mainCategory: initialData?.mainCategory || "",
    subCategory: initialData?.subCategory || "",
    state: initialData?.state || "",
    lga: initialData?.lga || "",
    phone: initialData?.phone || "",
    address: initialData?.address || "",
    latitude: initialData?.latitude != null ? String(initialData.latitude) : "",
    longitude: initialData?.longitude != null ? String(initialData.longitude) : "",
    email: initialData?.email || "",
    socials: {
      instagram: initialData?.socials?.instagram || "",
      facebook: initialData?.socials?.facebook || "",
      twitter: initialData?.socials?.twitter || "",
      youtube: initialData?.socials?.youtube || "",
      tiktok: initialData?.socials?.tiktok || ""
    }
  });

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previews, setPreviews] = useState({ 
    banner: initialData?.bannerUrl || "", 
    logo: initialData?.logoUrl || "" 
  });
  const [newFiles, setNewFiles] = useState({ banner: null as File | null, logo: null as File | null });
  
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // ✅ PROFILE COMPLETION LOGIC
  const calculateProfileCompletion = () => {
    let score = 0;
    const total = 8; 
    const missingItems: string[] = [];

    if (formData.storeName) score++; else missingItems.push("Store Name");
    if (previews.banner) score++; else missingItems.push("Store Banner");
    if (previews.logo) score++; else missingItems.push("Store Logo");
    if (formData.description) score++; else missingItems.push("Store Description");
    if (formData.state && formData.lga) score++; else missingItems.push("Location");
    if (formData.phone) score++; else missingItems.push("WhatsApp Phone");
    if (formData.mainCategory && formData.subCategory) score++; else missingItems.push("Category");
    
    const hasSocial = Object.values(formData.socials).some(s => s && s.trim().length > 0);
    if (hasSocial) score++; else missingItems.push("Social Media");

    const percentage = Math.round((score / total) * 100);
    return { percentage, missingItems, isComplete: percentage === 100 };
  };

  const profileCompletion = calculateProfileCompletion();

  // ✅ Verification System State
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState(1);
  const [verificationData, setVerificationData] = useState({
    cacNumber: "",
    cacFile: null as File | null,
    whatsappNumber: initialData?.phone || "",
    bankName: "",
    accountNumber: "",
    accountName: "",
    idType: "nin",
    idFile: null as File | null,
    businessAddress: initialData?.address || ""
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"none" | "pending" | "approved" | "rejected">(
    initialData?.verificationStatus || "none"
  );

  // ✅ DEBUG: Force verification state for testing
  const [debugVerificationState, setDebugVerificationState] = useState<"none" | "pending" | "approved" | "rejected" | null>(null);
  const displayVerificationStatus = debugVerificationState !== null ? debugVerificationState : verificationStatus;

  // ✅ Boost System State
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [selectedBoost, setSelectedBoost] = useState<BoostTier | null>(null);
  const [boostAddOns, setBoostAddOns] = useState({
    geoTarget: false,
    categoryPriority: false,
    boostInsurance: false
  });
  const [boostSubmitting, setBoostSubmitting] = useState(false);
  const [activeBoost, setActiveBoost] = useState<BoostData | null>(null);

  // ✅ Notification System State
  const [notification, setNotification] = useState<NotificationState>({
    show: false,
    type: "info",
    title: "",
    message: ""
  });

  const BOOST_PACKAGES: BoostPackage[] = [
    {
      id: "micro",
      name: "Micro Boost",
      price: 999,
      duration: "24 hours",
      durationHours: 24,
      description: "Perfect for testing the waters",
      features: [
        "Featured in Trending Stores carousel",
        "+15% search ranking boost",
        "Basic analytics (views, WhatsApp clicks)",
        "Cancel anytime"
      ]
    },
    {
      id: "pro",
      name: "Pro Boost",
      price: 4999,
      duration: "3 days",
      durationHours: 72,
      description: "For growing businesses",
      features: [
        "Everything in Micro Boost",
        "Push notification to nearby buyers (5km)",
        "WhatsApp broadcast to opted-in buyers",
        "Priority placement in category listings",
        "Advanced analytics with conversion tracking"
      ],
      popular: true
    },
    {
      id: "max",
      name: "Max Boost",
      price: 14999,
      duration: "7 days",
      durationHours: 168,
      description: "Scale without limits",
      features: [
        "Everything in Pro Boost",
        "Homepage hero banner slot (rotating)",
        "Featured in Editor's Picks newsletter",
        "Dedicated social media shoutout",
        "A/B testing for boost copy/images",
        "Dedicated success manager chat"
      ]
    }
  ];

  // ✅ Real-time Verification & Boost Sync Engine
  useEffect(() => {
    let unsubscribeBoost: () => void;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (unsubscribeBoost) unsubscribeBoost();
      if (!user) return;

      const loadVerification = async () => {
        try {
          const verifSnap = await getDoc(doc(db, "store_verifications", user.uid));
          if (verifSnap.exists()) {
            setVerificationStatus(verifSnap.data().status || "pending");
          }
        } catch (e) {
          console.error("Verification load failed:", e);
        }
      };
      loadVerification();

      const boostsRef = collection(db, "boosts");
      const boostQuery = query(boostsRef, where("storeId", "==", user.uid));

      unsubscribeBoost = onSnapshot(boostQuery, (snapshot) => {
        if (!snapshot.empty) {
          const boostDocs: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const runningBoost = boostDocs.find((b: any) => b.status === "active");
          const pendingBoost = boostDocs.find((b: any) => b.status === "pending");
          const targetingDoc = runningBoost || pendingBoost;

          if (targetingDoc) {
            const expiryDateStr = calculateExpiryDate(targetingDoc);
            const isTargetExpired = isExpired(expiryDateStr);

            if (targetingDoc.status === "pending") {
              setActiveBoost({
                id: targetingDoc.id,
                tier: targetingDoc.tier,
                packageName: targetingDoc.packageName || "Boost",
                expiryDate: expiryDateStr,
                startDate: targetingDoc.startDate || targetingDoc.paidAt || targetingDoc.createdAt || null,
                durationDays: targetingDoc.durationDays || 1,
                durationLabel: targetingDoc.durationLabel || "Pending",
                views: 0,
                clicks: 0,
                conversions: 0,
                autoRenew: targetingDoc.autoRenew || false,
                status: "pending"
              });
            } else if (targetingDoc.status === "active" && !isTargetExpired) {
              setActiveBoost({
                id: targetingDoc.id,
                tier: targetingDoc.tier,
                packageName: targetingDoc.packageName || "Boost",
                expiryDate: expiryDateStr,
                startDate: targetingDoc.startDate || targetingDoc.paidAt || targetingDoc.createdAt || null,
                durationDays: targetingDoc.durationDays || 1,
                durationLabel: "Live",
                views: targetingDoc.analytics?.views || 0,
                clicks: targetingDoc.analytics?.clicks || 0,
                conversions: targetingDoc.analytics?.conversions || 0,
                autoRenew: targetingDoc.autoRenew || false,
                status: "active"
              });
            } else {
              if (isTargetExpired && targetingDoc.status === "active") {
                console.log(`Boost ${targetingDoc.id} expired, clearing active state`);
              }
              setActiveBoost(null);
            }
          } else {
            setActiveBoost(null);
          }
        } else {
          setActiveBoost(null);
        }
      }, (error) => {
        console.error("Firestore listener error:", error);
        if (error.code === "permission-denied") {
          console.warn("⚠️ Check Firestore rules: boosts collection needs read access for storeId == auth.uid");
        }
        setActiveBoost(null);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeBoost) unsubscribeBoost();
    };
  }, []);

  // ✅ Countdown refresh effect for active boosts
  useEffect(() => {
    if (!activeBoost || activeBoost.status !== "active") return;
    
    const interval = setInterval(() => {
      setActiveBoost(prev => prev ? { ...prev } : null);
    }, 60000); 
    
    return () => clearInterval(interval);
  }, [activeBoost]);

  // ✅ Fallback Polling Mechanism for Redirect Hooks
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderRef = urlParams.get('orderReference') || urlParams.get('reference');
    
    if (!orderRef || !auth.currentUser?.uid || activeBoost?.status === "active") return;
    
    let attempts = 0;
    const maxAttempts = 8;
    let pollTimer: NodeJS.Timeout;
    
    const pollBoostStatus = async () => {
      try {
        const idToken = await auth.currentUser!.getIdToken();
        const res = await fetch(`/api/boost-store/${orderRef}`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.boost?.status === 'active') {
            const boost = data.boost;
            const expiryDateStr = calculateExpiryDate(boost);
            
            setActiveBoost({
              id: boost.id,
              tier: boost.tier,
              packageName: boost.packageName,
              expiryDate: expiryDateStr,
              startDate: boost.startDate || boost.paidAt || boost.createdAt || null,
              durationDays: boost.durationDays || 1,
              durationLabel: boost.durationLabel || "Live",
              views: boost.analytics?.views || 0,
              clicks: boost.analytics?.clicks || 0,
              conversions: boost.analytics?.conversions || 0,
              autoRenew: boost.autoRenew || false,
              status: "active"
            });
            showNotification('success', 'Boost Activated!', `Your ${boost.packageName} is now live 🚀`);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
        }
        
        attempts++;
        if (attempts <maxAttempts) {
          pollTimer = setTimeout(pollBoostStatus, 3500);
        }
      } catch (e) {
        console.error('Status verification parsing error:', e);
        attempts++;
        if (attempts <maxAttempts) {
          pollTimer = setTimeout(pollBoostStatus, 3500);
        }
      }
    };
    
    pollBoostStatus();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [activeBoost]);

  const showNotification = (type: NotificationType, title: string, message: string, actionLabel?: string, onAction?: () => void) => {
    setNotification({ show: true, type, title, message, actionLabel, onAction });
    if (!actionLabel) {
      setTimeout(() => setNotification(n => ({ ...n, show: false })), 5000);
    }
  };

  // ✅ Form Mutation Handlers
  const handleInputChange = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleSocialChange = (platform: string, value: string) => setFormData(prev => ({
    ...prev, socials: { ...prev.socials, [platform]: value }
  }));

  const handleLocationChange = (field: string, value: string) => {
    if (field === 'state') {
      setFormData(prev => ({ ...prev, state: value, lga: "" })); 
    } else {
      setFormData(prev => ({ ...prev, lga: value }));
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showNotification("error", "Location Unavailable", "Your browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        showNotification("success", "Location Captured", "Your store coordinates will be saved when you save the profile.");
      },
      () => showNotification("error", "Location Permission Needed", "Allow location access, then try again."),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  };

  const handleImgChange = (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "logo") => {
    const file = e.target.files?.[0];
    if (file) {
      setNewFiles(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => setPreviews(prev => ({ ...prev, [type]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const uploadFileToCloudinary = async (file: File | null) => {
    if (!file) return null;
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", "sellonwhatsapp_preset");
    try {
      const res = await fetch("https://api.cloudinary.com/v1_1/dmjzgqigl/image/upload", { 
        method: "POST", 
        body: data 
      });
      const resData = await res.json();
      return resData.secure_url;
    } catch (err) { 
      console.error("Cloudinary endpoint failure:", err);
      return null; 
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) {
      showNotification("error", "Authentication Required", "Please sign in to save changes");
      return;
    }

    const newUsername = (formData.username || "").toLowerCase().trim();
    if (!newUsername) {
      showNotification("error", "Username Required", "Your store username cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      const oldUsername = (initialData?.username || "").toLowerCase().trim();

      if (oldUsername !== newUsername) {
        const newUsernameDoc = await getDoc(doc(db, "usernames", newUsername));
        if (newUsernameDoc.exists() && newUsernameDoc.data().uid !== auth.currentUser.uid) {
          showNotification("error", "Username Taken", "This store username is already claimed by another store.");
          setSaving(false);
          return; 
        }

        if (oldUsername) {
          await deleteDoc(doc(db, "usernames", oldUsername)).catch(() => {}); 
        }

        await setDoc(doc(db, "usernames", newUsername), {
          uid: auth.currentUser.uid,
          claimedAt: new Date()
        });
      }

      let currentBannerUrl = initialData?.bannerUrl || "";
      let currentLogoUrl = initialData?.logoUrl || "";
      
      const [newBannerUrl, newLogoUrl] = await Promise.all([
        uploadFileToCloudinary(newFiles.banner),
        uploadFileToCloudinary(newFiles.logo)
      ]);
      
      if (newBannerUrl) currentBannerUrl = newBannerUrl;
      if (newLogoUrl) currentLogoUrl = newLogoUrl;

      await updateDoc(doc(db, "stores", auth.currentUser.uid), {
        ...formData,
        latitude: Number(formData.latitude) || null,
        longitude: Number(formData.longitude) || null,
        bannerUrl: currentBannerUrl,
        logoUrl: currentLogoUrl,
        updatedAt: new Date()
      });
      
      setIsEditing(false);
      showNotification("success", "Changes Saved", "Your store profile has been updated successfully");
    } catch (err) { 
      console.error("Profile mutation crash:", err);
      showNotification("error", "Save Failed", "Error saving changes. Please try again.");
    }
    setSaving(false);
  };

  // ✅ Verification Document Handlers
  const handleVerificationChange = (field: string, value: any) => {
    setVerificationData(prev => ({ ...prev, [field]: value }));
  };

  const handleVerificationFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: "cacFile" | "idFile") => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!validTypes.includes(file.type)) {
        showNotification("error", "Invalid File", "Please upload a PDF or image file (JPG/PNG)");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showNotification("error", "File Too Large", "File size must be under 5MB");
        return;
      }
      setVerificationData(prev => ({ ...prev, [field]: file }));
    }
  };

  const uploadVerificationFile = async (file: File | null, folder: string) => {
    if (!file) return null;
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", "sellonwhatsapp_preset");
    data.append("folder", `verifications/${folder}`);
    
    try {
      // Use the same public image delivery path as store images. The unsigned
      // preset does not expose raw assets correctly and those URLs return 401.
      // Cloudinary supports PDF uploads through image/upload as well.
      const res = await fetch("https://api.cloudinary.com/v1_1/dmjzgqigl/image/upload", {
        method: "POST",
        body: data
      });
      const resData = await res.json();
      if (!res.ok || !resData.secure_url) {
        throw new Error(resData.error?.message || "Cloudinary did not return a public document URL");
      }
      return { url: resData.secure_url, public_id: resData.public_id, resourceType: "image" };
    } catch (err) {
      console.error("Verification upload cluster failure:", err);
      return null;
    }
  };

  const resetVerificationForm = () => {
    setVerificationData({
      cacNumber: "",
      cacFile: null,
      whatsappNumber: formData.phone,
      bankName: "",
      accountNumber: "",
      accountName: "",
      idType: "nin",
      idFile: null,
      businessAddress: formData.address
    });
    setVerificationStep(1);
  };

  const handleSubmitVerification = async () => {
    if (!auth.currentUser) {
      showNotification("error", "Authentication Required", "Please sign in to submit verification");
      return;
    }
    
    setSubmitting(true);
    setUploading(true);
    
    try {
      const [cacUpload, idUpload] = await Promise.all([
        uploadVerificationFile(verificationData.cacFile, "cac_certificates"),
        uploadVerificationFile(verificationData.idFile, "government_ids")
      ]);

      if (!cacUpload || !idUpload) {
        throw new Error("Document upload failed. Please try again.");
      }

      await setDoc(doc(db, "store_verifications", auth.currentUser.uid), {
        storeId: auth.currentUser.uid,
        storeName: formData.storeName,
        ownerName: auth.currentUser.displayName || auth.currentUser.email || "",
        ownerEmail: auth.currentUser.email || "",
        businessAddress: formData.address,
        whatsappNumber: formData.phone,
        verificationType: "business",
        cacNumber: verificationData.cacNumber,
        cacDocument: cacUpload,
        payoutDetails: {
          bankName: verificationData.bankName,
          accountNumber: verificationData.accountNumber,
          accountName: verificationData.accountName
        },
        identification: {
          type: verificationData.idType,
          document: idUpload
        },
        status: "pending",
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setVerificationStatus("pending");
      setShowVerificationModal(false);
      resetVerificationForm();
      showNotification("success", "Verification Submitted", "Your request is being reviewed. You'll hear back within 24-48 hours.");
    } catch (error: any) {
      console.error("Verification error:", error);
      showNotification("error", "Submission Failed", error.message || "An error occurred during submission.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // ✅ Boost Checkout Operations
  const calculateBoostTotal = () => {
    if (!selectedBoost) return 0;
    const pkg = BOOST_PACKAGES.find(p => p.id === selectedBoost);
    if (!pkg) return 0;
    let total = pkg.price;
    if (boostAddOns.geoTarget) total += 1500;
    if (boostAddOns.categoryPriority) total += 1000;
    if (boostAddOns.boostInsurance) total += 500;
    return total;
  };

  const handleBoostCheckout = async () => {
    if (!auth.currentUser || !selectedBoost) {
      showNotification("error", "Checkout Error", "Please pick a boost tier to proceed.");
      return;
    }
    
    setBoostSubmitting(true);
    
    try {
      const idToken = await auth.currentUser.getIdToken();
      const selectedPackage = BOOST_PACKAGES.find(p => p.id === selectedBoost);
      
      if (!selectedPackage) throw new Error("Invalid boost package selected");
      
      const payload = {
        planId: selectedPackage.id,
        planName: selectedPackage.name,
        price: selectedPackage.price,
        finalPrice: calculateBoostTotal(),
        durationDays: selectedPackage.durationHours / 24,
        durationLabel: selectedPackage.duration,
        storeId: auth.currentUser.uid,
        userId: auth.currentUser.uid,
        storeName: formData.storeName || "My Store"
      };

      const response = await fetch("/api/premium/boost-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Payment server initialization rejected");
      }

      if (data.checkoutUrl) {
        showNotification("success", "Payment Ready", "Redirecting to secure gateway...");
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("Checkout link not received from server");
      }

    } catch (error: any) {
      console.error("Checkout Master Route Error:", error);
      showNotification("error", "Connection Failed", error.message || "Could not complete payment setup.");
    } finally {
      setBoostSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      {/* Profile Header Block */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Store Profile</h2>
          <p className="text-sm text-gray-500">Manage your WhatsApp store configuration and profile details</p>
        </div>
        
        <div>
          {isEditing ? (
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  // ✅ FIXED: Reset includes new username and category fields
                  setFormData({
                    storeName: initialData?.storeName || "",
                    username: initialData?.username || "",
                    description: initialData?.description || "",
                    mainCategory: initialData?.mainCategory || "",
                    subCategory: initialData?.subCategory || "",
                    state: initialData?.state || "",
                    lga: initialData?.lga || "",
                    phone: initialData?.phone || "",
                    address: initialData?.address || "",
                    latitude: initialData?.latitude != null ? String(initialData.latitude) : "",
                    longitude: initialData?.longitude != null ? String(initialData.longitude) : "",
                    email: initialData?.email || "",
                    socials: {
                      instagram: initialData?.socials?.instagram || "",
                      facebook: initialData?.socials?.facebook || "",
                      twitter: initialData?.socials?.twitter || "",
                      youtube: initialData?.socials?.youtube || "",
                      tiktok: initialData?.socials?.tiktok || ""
                    }
                  });
                  setPreviews({
                    banner: initialData?.bannerUrl || "",
                    logo: initialData?.logoUrl || ""
                  });
                  setIsEditing(false);
                }} 
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex items-center gap-2 px-5 py-2 bg-[#00a63e] hover:bg-green-700 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsEditing(true)} 
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Edit2 size={14} />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* ✅ STORE PROFILE COMPLETION BANNER */}
      {!profileCompletion.isComplete && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-[24px] p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-amber-600" />
                <h3 className="font-bold text-amber-900 text-sm">Complete your store profile</h3>
                <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                  {profileCompletion.percentage}%
                </span>
              </div>
              <p className="text-xs text-amber-700 mb-3 font-medium">
                Stores with complete profiles get <strong>3x more visibility</strong> and build trust faster with buyers.
              </p>
              
              {/* Animated Progress Bar */}
              <div className="w-full bg-amber-100 rounded-full h-2 mb-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all duration-700 ease-out" 
                  style={{ width: `${profileCompletion.percentage}%` }} 
                />
              </div>
              
              {/* Missing Items Tags */}
              <div className="flex flex-wrap gap-2">
                {profileCompletion.missingItems.slice(0, 3).map((item) => (
                  <span key={item} className="text-[10px] font-bold bg-white/80 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                    <span className="text-amber-500">+</span> {item}
                  </span>
                ))}
                {profileCompletion.missingItems.length > 3 && (
                  <span className="text-[10px] font-bold text-amber-600 px-2 py-1">
                    +{profileCompletion.missingItems.length - 3} more
                  </span>
                )}
              </div>
            </div>
            
            {/* Action Button */}
            <div className="md:border-l md:border-amber-200/50 md:pl-5 flex flex-col items-start md:items-end gap-2">
              <button 
                onClick={() => {
                  if (!isEditing) setIsEditing(true);
                  setTimeout(() => {
                    const el = document.getElementById('business-details-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2"
              >
                <Edit2 size={14} /> Update Profile
              </button>
              <p className="text-[10px] text-amber-600 font-medium italic">Takes less than 2 mins</p>
            </div>
          </div>
        </div>
      )}

      {/* Brand Visual Media Assets Banner */}
      <div className="relative rounded-[24px] overflow-hidden bg-gray-100 border border-gray-200 h-48 md:h-60 group">
        {previews.banner ? (
          <img src={previews.banner} alt="Store Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <ImageIcon size={32} />
            <span className="text-xs font-medium">No store banner uploaded</span>
          </div>
        )}
        {isEditing && (
          <button 
            onClick={() => bannerRef.current?.click()}
            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold text-sm gap-2"
          >
            <Camera size={18} />
            Change Store Banner
          </button>
        )}
        <input type="file" ref={bannerRef} className="hidden" accept="image/*" onChange={(e) => handleImgChange(e, "banner")} />

        {/* Logo Placement Container */}
        <div className="absolute bottom-4 left-6 w-20 h-20 md:w-24 md:h-24 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden group/logo">
          {previews.logo ? (
            <img src={previews.logo} alt="Store Logo" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
              <Store size={28} />
            </div>
          )}
          {isEditing && (
            <button 
              onClick={() => logoRef.current?.click()}
              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity text-white flex items-center justify-center"
            >
              <Camera size={16} />
            </button>
          )}
          <input type="file" ref={logoRef} className="hidden" accept="image/*" onChange={(e) => handleImgChange(e, "logo")} />
        </div>
      </div>

      {/* ✅ Horizontal Top Operational Status Widget Containers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Compliance Verification Card */}
        <div className="lg:col-span-7 bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-900 text-md flex items-center gap-2">
              <ShieldCheck size={18} className="text-gray-400" />
              Merchant Verification
            </h3>
            {process.env.NODE_ENV === 'development' && (
              <select 
                value={debugVerificationState || ""}
                onChange={(e) => setDebugVerificationState(e.target.value as any || null)}
                className="text-xs border rounded-lg px-2 py-1 bg-gray-50"
              >
                <option value="">Live State</option>
                <option value="none">Test: Not Verified</option>
                <option value="pending">Test: Pending</option>
                <option value="approved">Test: Approved</option>
                <option value="rejected">Test: Rejected</option>
              </select>
            )}
          </div>
          
          {displayVerificationStatus === "approved" && (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex gap-3">
              <CheckCircle2 className="text-[#00a63e] shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold text-green-900">Verified Business ✓</p>
                <p className="text-xs text-green-700 mt-0.5">Your business details are confirmed. Enjoy high trust limits, blue badge visibility, and fast checkout disbursements.</p>
              </div>
            </div>
          )}

          {displayVerificationStatus === "pending" && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
              <Clock className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold text-amber-900">Verification Pending</p>
                <p className="text-xs text-amber-700 mt-0.5">Our compliance team is reviewing your documents. This usually takes 24-48 hours. You'll receive a notification once approved.</p>
              </div>
            </div>
          )}

          {displayVerificationStatus === "rejected" && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold text-red-900">Verification Needs Attention</p>
                <p className="text-xs text-red-700 mt-0.5">Some documents didn't meet our requirements. Please review and re-submit to unlock verified status.</p>
                <button 
                  onClick={() => { setVerificationStep(1); setShowVerificationModal(true); }}
                  className="mt-3 text-xs font-bold text-red-700 hover:underline flex items-center gap-1"
                >
                  Re-submit Documents <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}

          {displayVerificationStatus === "none" && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-gray-600 font-medium">Verify your store with a valid government ID or CAC registration to unlock the official blue badge, gain maximum consumer trust, and access premium seller features.</p>
              <button 
                onClick={() => setShowVerificationModal(true)}
                className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck size={14} />
                Start Verification
              </button>
            </div>
          )}
        </div>

        {/* Marketing Traffic Boost Configuration Card */}
        <div className="lg:col-span-5 bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-900 text-md flex items-center gap-2">
            <Zap size={18} className="text-amber-500 fill-amber-500" />
            Store Visibility Boost
          </h3>

          {activeBoost ? (
            <BoostCard 
              boost={activeBoost} 
              onExtend={() => { setSelectedBoost(activeBoost.tier); setShowBoostModal(true); }}
              onRenew={() => { setSelectedBoost(activeBoost.tier); setShowBoostModal(true); }}
            />
          ) : (
            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-gray-600 font-medium">Get featured in trending carousels, priority product placements, and secure more buyers instantly with automated ad campaigns.</p>
              <button 
                onClick={() => { setSelectedBoost("pro"); setShowBoostModal(true); }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles size={14} className="fill-white/20" />
                Boost Store Traffic
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ Core Profile Inputs Content Layout Grid Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* WIDENED LAYER: Core Properties Directory Card */}
        {/* ✅ ADDED ID FOR SCROLL ANCHOR */}
        <div id="business-details-section" className="lg:col-span-7 bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-4 h-fit">
          <h3 className="font-bold text-gray-900 text-lg">Business Details</h3>
          
          <EditableDetail label="Store Name" value={formData.storeName} icon={<Store size={14}/>} isEditing={isEditing} onChange={(v) => handleInputChange('storeName', v)} />
          <EditableDetail 
            label="Store Username" 
            value={formData.username} 
            icon={<Globe size={14}/>} 
            isEditing={isEditing} 
            onChange={(v) => handleInputChange('username', v.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())} 
          />
          
          {/* ✅ Simple Category & Subcategory Selection */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Store Category</p>
            
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="w-full p-3 bg-white border border-green-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-green-500"
                  value={formData.mainCategory}
                  onChange={(e) => {
                    handleInputChange('mainCategory', e.target.value);
                    handleInputChange('subCategory', ''); 
                  }}
                >
                  <option value="">Select Main Category</option>
                  {STORE_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>

                <select
                  className="w-full p-3 bg-white border border-green-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-400"
                  value={formData.subCategory}
                  onChange={(e) => handleInputChange('subCategory', e.target.value)}
                  disabled={!formData.mainCategory} 
                >
                  <option value="">Select Subcategory</option>
                  {STORE_CATEGORIES.find(c => c.id === formData.mainCategory)?.subcategories.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50 border-gray-100 text-sm text-gray-700 font-bold">
                <Store size={14} className="text-gray-400" />
                <span>
                  {formData.mainCategory && formData.subCategory 
                    ? `${STORE_CATEGORIES.find(c => c.id === formData.mainCategory)?.name} → ${formData.subCategory}` 
                    : "Not selected"}
                </span>
              </div>
            )}
          </div>
          
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location (State & LGA)</p>
            {isEditing ? (
              <LocationSelector 
                stateValue={formData.state} lgaValue={formData.lga} onChange={handleLocationChange} isEditing={isEditing} />
            ) : (
              <div className="flex items-center gap-3 p-3 border rounded-xl bg-gray-50 border-gray-100 text-sm text-gray-700 font-bold">
                <MapPin size={14} className="text-gray-400" />
                <span>{formData.state && formData.lga ? `${formData.lga}, ${formData.state} State` : "Not set"}</span>
              </div>
            )}
            {isEditing && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black text-blue-900">Map coordinates</p>
                  <p className="mt-1 text-[10px] font-medium text-blue-700">Used to show your store to nearby buyers.</p>
                </div>
                <button type="button" onClick={handleUseCurrentLocation} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black text-white transition hover:bg-blue-700"><MapPin size={13} /> Use current location</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input aria-label="Store latitude" value={formData.latitude} onChange={(event) => handleInputChange("latitude", event.target.value)} placeholder="Latitude" inputMode="decimal" className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500" />
                <input aria-label="Store longitude" value={formData.longitude} onChange={(event) => handleInputChange("longitude", event.target.value)} placeholder="Longitude" inputMode="decimal" className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500" />
              </div>
            </div>}
          </div>

          <EditableDetail label="WhatsApp Phone Number" value={formData.phone} icon={<Phone size={14}/>} isEditing={isEditing} onChange={(v) => handleInputChange('phone', v)} />
          <EditableDetail label="Store Address" value={formData.address} icon={<MapPin size={14}/>} isEditing={isEditing} onChange={(v) => handleInputChange('address', v)} />
          <EditableDetail label="Store Email Address" value={formData.email} icon={<Mail size={14}/>} isEditing={isEditing} onChange={(v) => handleInputChange('email', v)} type="email" />
        </div>

        {/* COMPACT LAYER: Store Bio and Social Mapping */}
        <div className="lg:col-span-5 space-y-6">
          {/* About / Bio Panel */}
          <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">About Your Store</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Store Description</label>
              {isEditing ? (
                <textarea
                  className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 outline-none h-32 resize-none text-gray-800"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Tell your customers about what you sell, store hours, delivery options, etc."
                />
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-wrap p-1">
                  {formData.description || "No description provided yet. Click Edit Profile to add one."}
                </p>
              )}
            </div>
          </div>

          {/* Social Feeds Connection Profiles */}
          <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">Social Media Links</h3>
            <div className="grid grid-cols-1 gap-4">
              <SocialInput isEditing={isEditing} icon={<InstagramIcon size={16}/>} value={formData.socials.instagram} label="Instagram" onChange={(v) => handleSocialChange('instagram', v)} />
              <SocialInput isEditing={isEditing} icon={<FacebookIcon size={16}/>} value={formData.socials.facebook} label="Facebook" onChange={(v) => handleSocialChange('facebook', v)} />
              <SocialInput isEditing={isEditing} icon={<TwitterIcon size={16}/>} value={formData.socials.twitter} label="Twitter / X" onChange={(v) => handleSocialChange('twitter', v)} />
              <SocialInput isEditing={isEditing} icon={<YoutubeIcon size={16}/>} value={formData.socials.youtube} label="YouTube" onChange={(v) => handleSocialChange('youtube', v)} />
              <SocialInput isEditing={isEditing} icon={<TikTokIcon size={16}/>} value={formData.socials.tiktok} label="TikTok" onChange={(v) => handleSocialChange('tiktok', v)} />
            </div>
          </div>
        </div>

      </div>

      {/* ✅ Compliance Document Submission Setup Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <h3 className="text-lg font-bold text-gray-900">Store Verification Setup</h3>
              <button onClick={() => setShowVerificationModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            
            {verificationStep === 1 ? (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Provide your official business identification documents below to verify your corporate entity status.</p>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CAC Registration Number *</label>
                  <input 
                    type="text" 
                    value={verificationData.cacNumber} 
                    onChange={(e) => handleVerificationChange("cacNumber", e.target.value)} 
                    placeholder="RC or BN Number" 
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Upload CAC Document *</label>
                  <div 
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer ${verificationData.cacFile ? "border-green-300 bg-green-50" : "border-gray-200"}`}
                    onClick={() => document.getElementById("cacFileInput")?.click()}
                  >
                    {verificationData.cacFile ? (
                      <span className="text-sm font-bold text-green-600">{verificationData.cacFile.name}</span>
                    ) : (
                      <span className="text-xs font-medium text-gray-400">Click to upload PDF, JPG, or PNG certificate</span>
                    )}
                    <input id="cacFileInput" type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => handleVerificationFileChange(e, "cacFile")} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={() => setVerificationStep(2)}
                    disabled={!verificationData.cacNumber || !verificationData.cacFile}
                    className="px-5 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-xl disabled:opacity-50 flex items-center gap-2"
                  >
                    Next Step <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Provide account payout mapping metrics and government identification data.</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Bank Name</label>
                    <input type="text" value={verificationData.bankName} onChange={(e) => handleVerificationChange("bankName", e.target.value)} placeholder="e.g. GTBank" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Account Number</label>
                    <input type="text" value={verificationData.accountNumber} onChange={(e) => handleVerificationChange("accountNumber", e.target.value)} placeholder="10 digits" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Account Name</label>
                  <input type="text" value={verificationData.accountName} onChange={(e) => handleVerificationChange("accountName", e.target.value)} placeholder="Official Business / Personal Name" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none" />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">ID Document Type</label>
                  <select value={verificationData.idType} onChange={(e) => handleVerificationChange("idType", e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-green-500 outline-none">
                    <option value="nin">NIN Slip / Card</option>
                    <option value="pvc">Permanent Voter's Card (PVC)</option>
                    <option value="driver_license">Driver's License</option>
                    <option value="passport">International Passport</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Upload ID File *</label>
                  <div 
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer ${verificationData.idFile ? "border-green-300 bg-green-50" : "border-gray-200"}`}
                    onClick={() => document.getElementById("idFileInput")?.click()}
                  >
                    {verificationData.idFile ? (
                      <span className="text-sm font-bold text-green-600">{verificationData.idFile.name}</span>
                    ) : (
                      <span className="text-xs font-medium text-gray-400">Click to upload Government ID image or PDF</span>
                    )}
                    <input id="idFileInput" type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => handleVerificationFileChange(e, "idFile")} />
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button onClick={() => setVerificationStep(1)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 text-gray-600">Back</button>
                  <button 
                    onClick={handleSubmitVerification}
                    disabled={submitting || !verificationData.idFile}
                    className="px-6 py-2 bg-[#00a63e] hover:bg-green-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : "Submit Verification"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✅ Premium Subscription Package Selection Modal Area */}
      {showBoostModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500 fill-amber-500" />
                  Select Store Boost Tier
                </h3>
                <p className="text-xs text-gray-500">Pick a package below to supercharge your traffic and double conversions.</p>
              </div>
              <button onClick={() => setShowBoostModal(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {BOOST_PACKAGES.map((pkg) => {
                const isSelected = selectedBoost === pkg.id;
                return (
                  <div 
                    key={pkg.id}
                    onClick={() => setSelectedBoost(pkg.id)}
                    className={`border-2 rounded-[20px] p-5 cursor-pointer relative transition-all flex flex-col justify-between ${
                      isSelected ? "border-amber-500 bg-amber-50/20 shadow-md transform scale-[1.01]" : "border-gray-100 hover:border-gray-200 bg-white"
                    }`}
                  >
                    {pkg.popular && (
                      <span className="absolute -top-2.5 right-4 px-2 py-0.5 bg-amber-500 text-white font-extrabold text-[9px] rounded-full uppercase tracking-wider shadow-sm">
                        Most Popular
                      </span>
                    )}
                    <div>
                      <h4 className="font-black text-gray-900 text-base">{pkg.name}</h4>
                      <p className="text-xs text-gray-500 mt-1">{pkg.description}</p>
                      <div className="mt-4 mb-4">
                        <span className="text-2xl font-black text-gray-950">₦{pkg.price.toLocaleString()}</span>
                        <span className="text-xs text-gray-400 font-medium"> / {pkg.duration}</span>
                      </div>
                      <ul className="space-y-2 border-t pt-3 border-gray-100 text-xs text-gray-600 font-medium">
                        {pkg.features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle2 size={14} className="text-amber-500 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-6">
                      <button 
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                          isSelected ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {isSelected ? "Selected Tier" : "Choose Tier"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedBoost && (
              <div className="bg-gray-50 border-t p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="space-y-2 w-full sm:w-auto">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Available Enhancements</p>
                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={boostAddOns.geoTarget} onChange={(e) => setBoostAddOns(p => ({ ...p, geoTarget: e.target.checked }))} className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                      <span>Geo-Targeting Suburbs (+₦1,500)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={boostAddOns.categoryPriority} onChange={(e) => setBoostAddOns(p => ({ ...p, categoryPriority: e.target.checked }))} className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                      <span>Category Priority Placement (+₦1,000)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={boostAddOns.boostInsurance} onChange={(e) => setBoostAddOns(p => ({ ...p, boostInsurance: e.target.checked }))} className="rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                      <span>Boost Protection Guarantee (+₦500)</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-between w-full sm:w-auto sm:justify-end border-t sm:border-none pt-4 sm:pt-0">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Total Amount</p>
                    <p className="text-xl font-black text-gray-900">₦{calculateBoostTotal().toLocaleString()}</p>
                  </div>
                  <button 
                    onClick={handleBoostCheckout}
                    disabled={boostSubmitting}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {boostSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Initializing Gateway Handshake...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} />
                        Pay
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✅ Toast Notifications Container System */}
      {notification.show && (
        <div className="fixed bottom-5 right-5 z-[200] max-w-sm w-full bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className={`rounded-xl p-2 h-fit ${
            notification.type === "success" ? "bg-green-50 text-green-600" : 
            notification.type === "error" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
          }`}>
            {notification.type === "success" ? <CheckCircle2 size={18} /> : 
             notification.type === "error" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-gray-900">{notification.title}</h4>
            <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{notification.message}</p>
            {notification.actionLabel && notification.onAction && (
              <button onClick={notification.onAction} className="mt-2 text-xs font-bold text-green-600 hover:underline">
                {notification.actionLabel}
              </button>
            )}
          </div>
          <button onClick={() => setNotification(p => ({ ...p, show: false }))} className="text-gray-400 hover:text-gray-600 h-fit p-0.5">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ✅ Extracted BoostCard Component
function BoostCard({
  boost,
  onExtend,
  onRenew
}: {
  boost: BoostData;
  onExtend: () => void;
  onRenew: () => void;
}) {
  const status = getBoostStatusDisplay(boost);
  const hoursLeft = getHoursRemaining(boost.expiryDate);
  const minutesLeft = getMinutesRemaining(boost.expiryDate);

  const showExtend = boost.status === "active" && !isExpiringSoon(boost.expiryDate);
  const showRenew = boost.status === "expired" || (boost.status === "active" && isExpiringSoon(boost.expiryDate));

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-4 border ${
        boost.status === "pending" ? "bg-amber-50 border-amber-100" : 
        boost.status === "expired" || isExpired(boost.expiryDate) ? "bg-red-50 border-red-100" : 
        isExpiringSoon(boost.expiryDate, 6) ? "bg-orange-50 border-orange-100" : 
        "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100"
      }`}>
        <div className="flex justify-between items-start">
          <div>
            <span className={`inline-block px-2 py-0.5 font-extrabold text-[9px] rounded-full uppercase tracking-wider ${status.bgColor} ${status.color}`}>
              {status.label}
            </span>
            <h4 className="font-bold text-gray-900 text-sm mt-1">{boost.packageName}</h4>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {boost.status === "pending"
                ? "Activating shortly..."
                : `Expires: ${formatExpiryDate(boost.expiryDate)}`
              }
            </p>
          </div>

          {status.showCountdown && !isExpired(boost.expiryDate) && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl px-2 py-1 border border-amber-200 text-center">
              <p className={`text-xs font-black ${isExpiringSoon(boost.expiryDate, 6) ? 'text-orange-600' : 'text-amber-600'}`}>
                {hoursLeft > 0 ? `${hoursLeft}h` : `${minutesLeft}m`}
              </p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tight">Left</p>
            </div>
          )}
        </div>

        {boost.status === "active" && !isExpired(boost.expiryDate) && (
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-amber-100/50 text-center">
            <div>
              <div className="flex items-center justify-center gap-0.5 text-gray-700 font-extrabold text-sm">
                <Eye size={12} className="text-gray-400" />
                {boost.views?.toLocaleString() || 0}
              </div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Views</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-0.5 text-gray-700 font-extrabold text-sm">
                <MousePointerClick size={12} className="text-gray-400" />
                {boost.clicks?.toLocaleString() || 0}
              </div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Clicks</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-0.5 text-gray-700 font-extrabold text-sm">
                <MessageSquare size={12} className="text-gray-400" />
                {boost.conversions?.toLocaleString() || 0}
              </div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Chats</p>
            </div>
          </div>
        )}

        {(boost.status === "expired" || isExpired(boost.expiryDate)) && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <p className="text-xs text-red-700 font-medium flex items-center gap-1">
              <AlertTriangle size={12} />
              This boost has expired. Renew to restore visibility.
            </p>
          </div>
        )}

        {boost.status === "pending" && (
          <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
              <Clock size={12} />
              Your boost is being activated. This may take up to 5 minutes.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button 
          onClick={() => showToast("info", "Detailed performance logs are refreshed in real time.")}
          className="flex-1 py-2 border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 rounded-xl transition-colors"
          disabled={boost.status === "pending"}
        >
          View Insights
        </button>
        {showExtend && (
          <button 
            onClick={onExtend}
            className="py-2 px-4 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors"
          >
            Extend
          </button>
        )}
        {showRenew && (
          <button 
            onClick={onRenew}
            className="py-2 px-4 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-colors"
          >
            {boost.status === "expired" ? "Renew Boost" : "Renew Now"}
          </button>
        )}
      </div>
    </div>
  );
}

// ✅ Original Component Child Subcomponents
function EditableDetail({ label, value, icon, isEditing, onChange, type = "text" }: {
  label: string; value: string; icon: React.ReactNode; isEditing: boolean; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className={`flex items-center gap-3 p-3 border rounded-xl font-bold ${isEditing ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-100'}`}>
        <div className="text-gray-400 shrink-0">{icon}</div>
        {isEditing ? (
          <input
            type={type}
            className="flex-1 bg-transparent outline-none text-sm text-gray-800"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <span className="truncate text-sm text-gray-700 font-medium">{value || "Not provided"}</span>
        )}
      </div>
    </div>
  );
}

function SelectDetail({ label, value, icon, isEditing, options, onChange }: {
  label: string; value: string; icon: React.ReactNode; isEditing: boolean; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className={`flex items-center gap-3 p-3 border rounded-xl font-bold ${isEditing ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-100'}`}>
        <div className="text-gray-400 shrink-0">{icon}</div>
        {isEditing ? (
          <select
            className="flex-1 bg-transparent outline-none text-sm text-gray-800"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select category</option>
            {options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <span className="truncate text-sm text-gray-700 font-medium">{value || "Not selected"}</span>
        )}
      </div>
    </div>
  );
}

function SocialInput({ icon, value, label, isEditing, onChange }: {
  icon: React.ReactNode; value: string; label: string; isEditing: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 border rounded-xl ${isEditing ? 'bg-white border-green-100' : 'bg-gray-50 border-gray-100'}`}>
      <div className="text-gray-500">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[8px] font-extrabold text-gray-400 uppercase tracking-wider">{label}</p>
        {isEditing ? (
          <input
            type="text"
            className="w-full bg-transparent outline-none text-xs text-gray-800 font-semibold"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Your ${label}`}
          />
        ) : (
          <span className="truncate block text-xs text-gray-600 font-medium">{value || "Not linked"}</span>
        )}
      </div>
    </div>
  );
}
