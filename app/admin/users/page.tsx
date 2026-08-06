"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, addDoc, serverTimestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase"; // ✅ Add this for auth.currentUser
import { 
  Search, Filter, User, ShieldCheck, XCircle, CheckCircle2, 
  Mail, Phone, MapPin, Clock, MoreVertical, Loader2
} from "lucide-react";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionConfirmModal } from "@/components/admin/ActionConfirmModal";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [actionModal, setActionModal] = useState<{ type: string; user: any } | null>(null);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      setUsers(usersList);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchQuery || 
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" ? true :
      statusFilter === "active" ? user.isActive !== false :
      statusFilter === "banned" ? user.isBanned === true :
      statusFilter === "unverified" ? user.isVerified !== true : true;
    
    return matchesSearch && matchesStatus;
  });

  const handleAction = async (action: string, user: any, reason?: string) => {
    try {
      const userRef = doc(db, "users", user.id);
      
      switch (action) {
        case "ban":
          await updateDoc(userRef, {
            isBanned: true,
            bannedAt: new Date(),
            banReason: reason,
            updatedAt: new Date()
          });
          break;
        case "unban":
          await updateDoc(userRef, {
            isBanned: false,
            unbannedAt: new Date(),
            updatedAt: new Date()
          });
          break;
        case "verify":
          await updateDoc(userRef, {
            isVerified: true,
            verifiedAt: new Date(),
            updatedAt: new Date()
          });
          break;
        case "suspend":
          await updateDoc(userRef, {
            isSuspended: true,
            suspendedAt: new Date(),
            suspendReason: reason,
            updatedAt: new Date()
          });
          break;
      }
      
      // Log the action
      await logAdminAction(action, user.id, reason);
      
      setActionModal(null);
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
    }
  };

  const columns = [
    { 
      header: "User", 
      accessor: "user",
      render: (user: any) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
            <User size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">{user.displayName || "Unnamed User"}</p>
            <p className="text-[10px] text-gray-400">{user.email}</p>
          </div>
        </div>
      )
    },
    { 
      header: "Status", 
      accessor: "status",
      render: (user: any) => (
        <div className="flex flex-col gap-1">
          <StatusBadge 
            status={user.isBanned ? "banned" : user.isSuspended ? "suspended" : user.isVerified ? "verified" : "active"} 
          />
          {user.isBanned && (
            <p className="text-[9px] text-red-600">Banned: {user.banReason}</p>
          )}
        </div>
      )
    },
    { 
      header: "Joined", 
      accessor: "createdAt",
      render: (user: any) => (
        <span className="text-xs text-gray-500">
          {user.createdAt?.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
        </span>
      )
    },
    { 
      header: "Actions", 
      accessor: "actions",
      render: (user: any) => (
        <div className="flex items-center gap-1">
          {user.isBanned ? (
            <button 
              onClick={() => setActionModal({ type: "unban", user })}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
              title="Unban user"
            >
              <CheckCircle2 size={14} />
            </button>
          ) : (
            <button 
              onClick={() => setActionModal({ type: "ban", user })}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
              title="Ban user"
            >
              <XCircle size={14} />
            </button>
          )}
          {!user.isVerified && (
            <button 
              onClick={() => setActionModal({ type: "verify", user })}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
              title="Verify user"
            >
              <ShieldCheck size={14} />
            </button>
          )}
          <button className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg">
            <MoreVertical size={14} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">Manage buyer and vendor accounts</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none w-64"
            />
          </div>
          
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="verified">Verified</option>
            <option value="banned">Banned</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="animate-spin mx-auto text-green-600" size={32} />
          </div>
        ) : (
          <DataTable 
            columns={columns} 
            data={filteredUsers} 
            emptyMessage="No users found matching your filters"
          />
        )}
      </div>

      {/* Action Confirmation Modal */}
      {actionModal && (
        <ActionConfirmModal
          action={actionModal.type}
          target={actionModal.user.displayName || actionModal.user.email}
          onConfirm={(reason) => handleAction(actionModal.type, actionModal.user, reason)}
          onCancel={() => setActionModal(null)}
        />
      )}
    </div>
  );
}

// Helper: Log admin actions to audit trail
async function logAdminAction(action: string, targetId: string, reason?: string) {
  // In production: use a Cloud Function for secure logging
  // For dev: direct write (ensure rules allow it)
  try {
    await addDoc(collection(db, "admin_logs"), {
      adminId: auth.currentUser?.uid,
      action,
      targetType: "user",
      targetId,
      reason,
      timestamp: serverTimestamp(),
      ipAddress: "client-side", // In prod: get from request headers
      userAgent: navigator.userAgent
    });
  } catch (error) {
    console.error("Failed to log admin action:", error);
  }
}