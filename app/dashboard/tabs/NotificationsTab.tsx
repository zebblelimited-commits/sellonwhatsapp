"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, CreditCard, Package, TrendingUp, Users, MessageSquare,
  ShieldCheck, AlertCircle, CheckCircle2, XCircle, Clock,
  Eye, ShoppingCart, Star, Zap, Filter, CheckCheck
} from "lucide-react";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, orderBy, limit, onSnapshot, 
  doc, updateDoc, serverTimestamp, writeBatch 
} from "firebase/firestore";

// Define TypeScript interfaces for type safety
interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  time: Date;
  read: boolean;
  actionable: boolean;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: any;
}

interface NotificationsTabProps {
  vendorId: string;
  disputes?: any[];
  onNotificationAction?: (action: string, data?: any) => void;
}

export default function NotificationsTab({ vendorId, onNotificationAction }: NotificationsTabProps) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔔 REAL-TIME FIRESTORE LISTENER
  useEffect(() => {
    if (!vendorId) return;

    // Query notifications for this specific vendor, ordered by creation time
    const q = query(
      collection(db, "notifications"),
      where("vendorId", "==", vendorId),
      orderBy("createdAt", "desc"),
      limit(50) // Limit to prevent excessive reads
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || "system",
          priority: data.priority || "low",
          title: data.title || "Notification",
          body: data.body || "",
          time: data.createdAt?.toDate() || new Date(),
          read: data.read || false,
          actionable: data.actionable || false,
          actionLabel: data.actionLabel,
          actionUrl: data.actionUrl,
          metadata: data.metadata || {}
        };
      });
      setNotifications(notifs);
      setLoading(false);
    }, (error) => {
      console.error("Notification listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [vendorId]);

  // 🔔 Mark single notification as read (Updates Firestore)
  const markAsRead = async (id: string) => {
    // Optimistic UI update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  // 🔔 Mark all as read (Uses Firestore Batch for professional-grade efficiency)
  const markAllAsRead = async () => {
    const unreadNotifs = notifications.filter(n => !n.read);
    if (unreadNotifs.length === 0) return;

    // Optimistic UI update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      const batch = writeBatch(db);
      unreadNotifs.forEach(n => {
        const ref = doc(db, "notifications", n.id);
        batch.update(ref, { read: true, updatedAt: serverTimestamp() });
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  // 🔔 Format time with relative labels
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
  };

  // 🔔 Get icon & color by notification type
  const getNotificationStyle = (type: string, priority: string) => {
    const styles: Record<string, any> = {
      order: { icon: ShoppingCart, bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
      payment: { icon: CreditCard, bg: "bg-green-50", text: "text-green-600", border: "border-green-100" },
      product: { icon: Package, bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100" },
      follower: { icon: Users, bg: "bg-pink-50", text: "text-pink-600", border: "border-pink-100" },
      stats: { icon: TrendingUp, bg: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-100" },
      message: { icon: MessageSquare, bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-100" },
      security: { icon: ShieldCheck, bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-100" },
      system: { icon: Bell, bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-100" },
    };
    const base = styles[type] || styles.system;
    
    if (priority === "high") return { ...base, bg: "bg-red-50", text: "text-red-600", border: "border-red-200" };
    if (priority === "urgent") return { ...base, bg: "bg-red-100", text: "text-red-700", border: "border-red-300" };
    return base;
  };

  // 🔔 Get priority badge
  const getPriorityBadge = (priority: string) => {
    if (!priority || priority === "low") return null;
    const config: Record<string, any> = {
      medium: { label: "Important", class: "bg-yellow-100 text-yellow-700" },
      high: { label: "Action Required", class: "bg-orange-100 text-orange-700" },
      urgent: { label: "Urgent", class: "bg-red-100 text-red-700 animate-pulse" }
    };
    const { label, class: className } = config[priority] || {};
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${className}`}>
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 animate-pulse">
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 bg-gray-200 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = notifications.filter(n => filter === "all" || n.type === filter);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {[
              { id: "all", label: "All" },
              { id: "order", label: "Orders" },
              { id: "payment", label: "Payments" },
              { id: "product", label: "Products" },
              { id: "system", label: "System" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Mark all as read"
            >
              <CheckCheck size={14} />
              <span className="hidden sm:inline">Mark all read</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bell size={20} className="text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">All caught up!</h3>
            <p className="text-sm text-gray-500 mb-4">No new notifications in this category.</p>
            <button onClick={() => setFilter("all")} className="text-xs font-bold text-green-600 hover:underline">
              View all notifications →
            </button>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const { icon: Icon, bg, text, border } = getNotificationStyle(n.type, n.priority);
            
            return (
              <div 
                key={n.id} 
                className={`bg-white p-4 sm:p-5 rounded-2xl border ${n.read ? 'border-gray-100' : `${border} ring-1 ring-inset ${border.replace('border', 'ring')}`} flex gap-3 sm:gap-4 items-start transition-all hover:shadow-md ${!n.read ? 'bg-gradient-to-r from-white to-gray-50/50' : ''}`}
              >
                <div className={`p-2.5 sm:p-3 rounded-xl ${bg} ${text} shrink-0`}>
                  <Icon size={18} className="sm:w-5 sm:h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-bold text-sm ${n.read ? 'text-gray-700' : 'text-gray-900'}`}>
                        {n.title}
                      </h4>
                      {getPriorityBadge(n.priority)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                        {formatTime(n.time)}
                      </span>
                      {!n.read && (
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Unread" />
                      )}
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{n.body}</p>
                  
                  {n.actionable && n.actionLabel && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <a
                        href={n.actionUrl || "#"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          markAsRead(n.id);
                          onNotificationAction?.("action_click", n);
                          if (n.actionUrl) router.push(n.actionUrl);
                        }}
                      >
                        {n.actionLabel} →
                      </a>
                      {n.type === "security" && (
                        <button
                          onClick={() => {
                            markAsRead(n.id);
                            onNotificationAction?.("dismiss_security", n);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <XCircle size={14} />
                          Not Me
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {!n.read && (
                  <button
                    onClick={() => markAsRead(n.id)}
                    className="hidden sm:flex items-center justify-center w-8 h-8 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors shrink-0"
                    title="Mark as read"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {filteredNotifications.length > 0 && (
        <div className="text-center pt-2">
          <button className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors">
            Load older notifications
          </button>
        </div>
      )}
    </div>
  );
}