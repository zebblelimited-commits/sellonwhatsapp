"use client";
import React, { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { ShieldCheck, Save, Loader2, CheckCircle2, AlertCircle, Key, LogOut, Smartphone, Eye, EyeOff } from "lucide-react";

export default function SecuritySettings({ storeId, initialSettings }: { storeId: string; initialSettings: any }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialSettings?.twoFactorEnabled || false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return setMessage({ type: "error", text: "Passwords don't match" });
    if (newPassword.length < 6) return setMessage({ type: "error", text: "Password must be at least 6 characters" });

    setSaving(true);
    setMessage(null);
    
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("No authenticated user");
      
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      
      await updateDoc(doc(db, "stores", storeId), {
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setMessage({ type: "success", text: "Password updated successfully" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (error: any) {
      if (error.code === "auth/wrong-password") setMessage({ type: "error", text: "Current password is incorrect" });
      else if (error.code === "auth/requires-recent-login") setMessage({ type: "error", text: "Please log in again to change your password" });
      else setMessage({ type: "error", text: "Failed to update password." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle2FA = async () => {
    try {
      await updateDoc(doc(db, "stores", storeId), { twoFactorEnabled: !twoFactorEnabled, updatedAt: serverTimestamp() });
      setTwoFactorEnabled(!twoFactorEnabled);
      setMessage({ type: "success", text: `2FA ${!twoFactorEnabled ? "enabled" : "disabled"}` });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to update 2FA setting" });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {message.text}
        </div>
      )}

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Key size={18} className="text-gray-400" /> Change Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Current Password</label>
            <div className="relative">
              <input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none pr-10" placeholder="••••••••" required />
              <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">New Password</label>
            <input type={showPasswords ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none" placeholder="••••••••" minLength={6} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Confirm New Password</label>
            <input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none" placeholder="••••••••" minLength={6} required />
          </div>
          <button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword} className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Updating...</> : <><Save size={16} /> Update Password</>}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><ShieldCheck size={18} className="text-gray-400" /> Two-Factor Authentication</h3>
          <button onClick={handleToggle2FA} className={`relative w-12 h-7 rounded-full transition-colors ${twoFactorEnabled ? "bg-green-600" : "bg-gray-200"}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${twoFactorEnabled ? "translate-x-5" : ""}`} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Add an extra layer of security. When enabled, you'll need to verify your identity with a code sent to your phone.</p>
        {twoFactorEnabled && (
          <div className="p-3 bg-green-50 rounded-xl border border-green-100">
            <p className="text-xs font-bold text-green-700 flex items-center gap-2"><CheckCircle2 size={14} /> 2FA is active • Your account is protected</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><LogOut size={18} className="text-gray-400" /> Active Sessions</h3>
          <button onClick={async () => { if (window.confirm("Sign out from all other devices?")) await updateDoc(doc(db, "stores", storeId), { lastSessionRefresh: serverTimestamp() }); }} className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline">Sign out others</button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center"><ShieldCheck size={14} className="text-green-600" /></div>
              <div><p className="text-sm font-bold text-gray-900">This Device</p><p className="text-[10px] text-gray-400">Current session • Lagos, NG</p></div>
            </div>
            <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}