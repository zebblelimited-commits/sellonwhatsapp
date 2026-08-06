"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, orderBy, limit, 
  doc, updateDoc, serverTimestamp, deleteDoc 
} from "firebase/firestore";
import { 
  Bell, Package, AlertTriangle, CheckCircle2, Clock, 
  Trash2, Eye, MessageCircle, CreditCard, Star, 
  ExternalLink, Loader2, X
} from "lucide-react";
import Link from "next/link";

export function BuyerNotification() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, unread, orders, disputes, payouts

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    // ✅ Real-time listener for buyer's notifications
    const q = query(
      collection(db, "notifications"),
      where("buyerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      setNotifications(notifs);
      setLoading(false);
    }, (error) => {
      console.error("Notifications fetch error:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ✅ Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    if (filter === "orders") return n.type === "order";
    if (filter === "disputes") return n.type === "dispute";
    if (filter === "payouts") return n.type === "payout";
    return true;
  });

  // ✅ Format time ago
  const formatTimeAgo = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
  };

  // ✅ Get icon & color by notification type
  const getNotificationConfig = (type: string) => {
    const configs: any = {
      order: { icon: Package, color: "bg-blue-100 text-blue-600", label: "Order" },
      dispute: { icon: AlertTriangle, color: "bg-red-100 text-red-600", label: "Dispute" },
      payout: { icon: CreditCard, color: "bg-green-100 text-green-600", label: "Payout" },
      review: { icon: Star, color: "bg-yellow-100 text-yellow-600", label: "Review" },
      promotion: { icon: Bell, color: "bg-purple-100 text-purple-600", label: "Promotion" },
      system: { icon: Bell, color: "bg-gray-100 text-gray-600", label: "System" }
    };
    return configs[type] || configs.system;
  };

  // ✅ Mark as read
  const handleMarkRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, "notifications", notifId), {
        read: true,
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  // ✅ Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      for (const notif of unread) {
        await updateDoc(doc(db, "notifications", notif.id), {
          read: true,
          readAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  // ✅ Delete notification
  const handleDelete = async (notifId: string) => {
    try {
      await deleteDoc(doc(db, "notifications", notifId));
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  // ✅ Get action link based on notification type
  const getActionLink = (notif: any) => {
    switch (notif.type) {
      case "order":
        return `/buyer/orders/${notif.orderId}`;
      case "dispute":
        return `/buyer/disputes#${notif.disputeId}`;
      case "payout":
        return `/buyer/dashboard?tab=withdraw`;
      case "review":
        return `/store/${notif.storeUsername || notif.storeId}/${notif.productId}`;
      default:
        return "/buyer/dashboard";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Bell size={20} className="text-gray-400" /> Notifications
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500">Stay updated on your orders and account</p>
        </div>
        
        {unreadCount > 0 && (
          <button 
            onClick={handleMarkAllRead}
            className="text-xs font-bold text-green-600 hover:text-green-700 hover:underline flex items-center gap-1"
          >
            <Eye size={14} /> Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
          { id: "orders", label: "Orders" },
          { id: "disputes", label: "Disputes" },
          { id: "payouts", label: "Payouts" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              filter === tab.id 
                ? "bg-green-600 text-white shadow-md" 
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-[32px] p-8 border border-dashed border-gray-200 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell size={32} className="text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {filter === "unread" 
                ? "You're all caught up! 🎉" 
                : "We'll notify you about orders, disputes, and account updates here."
              }
            </p>
            {filter !== "all" && (
              <button 
                onClick={() => setFilter("all")}
                className="text-xs font-bold text-green-600 hover:underline"
              >
                View all notifications →
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const { icon: NotifIcon, color, label } = getNotificationConfig(notif.type);
            const actionLink = getActionLink(notif);
            
            return (
              <div 
                key={notif.id} 
                className={`bg-white p-5 rounded-[32px] border ${!notif.read ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-100'} hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`p-3 rounded-2xl shrink-0 ${color}`}>
                    <NotifIcon size={20} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-gray-900">
                          {notif.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!notif.read && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleMarkRead(notif.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Mark as read"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(notif.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> {formatTimeAgo(notif.createdAt)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${color}`}>
                        {label}
                      </span>
                    </div>
                    
                    {/* Action Button */}
                    {notif.actionText && actionLink && (
                      <Link 
                        href={actionLink}
                        className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-green-600 hover:text-green-700 hover:underline"
                        onClick={() => !notif.read && handleMarkRead(notif.id)}
                      >
                        {notif.actionText} <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load More */}
      {filteredNotifications.length >= 50 && (
        <div className="text-center pt-4">
          <button className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 mx-auto">
            <Clock size={12} /> Load older notifications
          </button>
        </div>
      )}
    </div>
  );
}