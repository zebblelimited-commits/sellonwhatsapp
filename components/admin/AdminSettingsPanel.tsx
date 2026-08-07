"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { adminMutation } from "@/components/admin/adminApi";

const permissionGroups = [
  ["users", ["read", "write", "delete"]], ["stores", ["read", "write", "delete", "ban"]],
  ["orders", ["read", "write", "refund"]], ["payouts", ["read", "approve", "reject"]],
  ["disputes", ["read", "resolve", "escalate"]], ["analytics", ["read", "export"]],
  ["settings", ["read", "write"]], ["chat", ["read", "write"]], ["notifications", ["read", "send"]],
] as const;

type Profile = { uid?: string; email?: string; displayName?: string; phoneNumber?: string; timezone?: string; role?: string; isActive?: boolean; lastLogin?: unknown; createdAt?: unknown };
type ManagedAdmin = Profile & { uid: string; permissions?: Record<string, Record<string, boolean>> };

function authErrorMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "The current password is incorrect.";
  if (code === "auth/weak-password") return "The new password is too weak. Use at least 8 characters.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again later.";
  if (code === "auth/requires-recent-login") return "Please sign in again before changing this password.";
  if (code === "auth/invalid-email") return "The admin email address is invalid.";
  return error instanceof Error ? error.message : fallback;
}

export default function AdminSettingsPanel() {
  const [profile, setProfile] = useState<Profile>({});
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [adminsError, setAdminsError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isSuperAdmin = profile.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    setAdminsError("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Your admin session has expired.");
      const profileResponse = await fetch("/api/admin/profile", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const profilePayload = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) throw new Error(profilePayload.error || "Profile could not be loaded");
      const nextProfile = profilePayload.profile || {};
      setProfile(nextProfile); setDisplayName(nextProfile.displayName || ""); setPhoneNumber(nextProfile.phoneNumber || ""); setTimezone(nextProfile.timezone || "Africa/Lagos");
      if (nextProfile.role === "super_admin") {
        const adminsResponse = await fetch("/api/admin/admins", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const adminsPayload = await adminsResponse.json().catch(() => ({}));
        if (!adminsResponse.ok) setAdminsError(adminsPayload.error || "Admin accounts could not be loaded.");
        else setAdmins(adminsPayload.admins || []);
      } else {
        setAdmins([]);
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Settings could not be loaded"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveProfile() {
    setSaving(true); setMessage(""); setError("");
    try {
      await adminMutation("/api/admin/profile", { displayName, phoneNumber, timezone });
      setMessage("Profile settings saved.");
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Profile could not be saved"); }
    finally { setSaving(false); }
  }

  async function resetPassword() {
    setMessage(""); setError("");
    setSecurityLoading(true);
    try {
      const email = auth.currentUser?.email;
      if (!email) throw new Error("No email address is attached to this admin account.");
      await sendPasswordResetEmail(auth, email);
      setMessage("A password reset link has been sent to your admin email.");
    } catch (resetError) { setError(authErrorMessage(resetError, "Password reset could not be sent")); }
    finally { setSecurityLoading(false); }
  }

  async function changePassword() {
    setMessage(""); setError("");
    if (!currentPassword) return setError("Enter your current password first.");
    if (newPassword.length < 8) return setError("Use a password with at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");
    setSecurityLoading(true);
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Your admin session has expired.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Password changed successfully.");
    } catch (passwordError) { setError(authErrorMessage(passwordError, "Password could not be changed")); }
    finally { setSecurityLoading(false); }
  }

  async function updateManagedAdmin(admin: ManagedAdmin, changes: Record<string, unknown>) {
    setError("");
    try {
      await adminMutation(`/api/admin/admins/${admin.uid}`, changes);
      setMessage("Admin permissions updated.");
      await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Admin permissions could not be updated"); }
  }

  function togglePermission(admin: ManagedAdmin, group: string, permission: string) {
    const nextPermissions = { ...(admin.permissions || {}) };
    nextPermissions[group] = { ...(nextPermissions[group] || {}), [permission]: !(nextPermissions[group]?.[permission] === true) };
    void updateManagedAdmin(admin, { permissions: nextPermissions });
  }

  const initials = useMemo(() => (displayName || profile.email || "A").slice(0, 1).toUpperCase(), [displayName, profile.email]);

  if (loading) return <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-green-600" size={30} /></div>;

  return <div className="max-w-5xl space-y-6 animate-in fade-in duration-300">
    <div><h2 className="text-xl font-bold text-gray-900">Admin settings</h2><p className="text-sm text-gray-500">Manage your profile, credentials, permissions, and security posture.</p></div>
    {message && <div className="rounded-2xl bg-green-50 p-4 text-sm font-medium text-green-700">{message}</div>}
    {error && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 font-bold text-green-700">{initials}</div><div><p className="font-bold text-gray-900">{profile.email || auth.currentUser?.email}</p><p className="text-[10px] uppercase text-gray-400">{profile.role || "admin"}</p></div></div>
        <label className="block text-xs font-bold text-gray-500">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" /></label>
        <label className="block text-xs font-bold text-gray-500">Phone number<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" /></label>
        <label className="block text-xs font-bold text-gray-500">Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-green-500"><option value="Africa/Lagos">Africa/Lagos (WAT)</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
        <button disabled={saving} onClick={() => void saveProfile()} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{saving ? "Saving..." : "Save profile"}</button>
      </section>
      <section className="space-y-4 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="font-bold text-gray-900">Password and security</h3><p className="text-xs text-gray-500">Changing a password requires your current password. You can also request a reset link.</p>
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-green-500" />
        <div className="flex flex-wrap gap-2"><button disabled={securityLoading} onClick={() => void changePassword()} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{securityLoading ? "Updating..." : "Change password"}</button><button disabled={securityLoading} onClick={() => void resetPassword()} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50">Email reset link</button></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="flex items-center gap-2 font-bold text-amber-900"><ShieldCheck size={17} /> Two-factor authentication</div><p className="mt-1 text-xs text-amber-800">Rollout planned: configure Firebase multi-factor enrollment, verified phone/reCAPTCHA, recovery codes, and an admin-only enforcement policy before enabling this control.</p><span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">Planning</span></div>
      </section>
    </div>
    {isSuperAdmin && <section className="space-y-4 rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm"><div><h3 className="font-bold text-gray-900">Admin roles and permissions</h3><p className="text-xs text-gray-500">Only super admins can change access. Changes are written through the protected admin API and audited.</p></div>{adminsError && <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{adminsError}</div>}{admins.length === 0 && !adminsError && <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">No additional admin accounts found.</p>}{admins.map((admin) => <div key={admin.uid} className="rounded-2xl border border-gray-100 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-sm text-gray-900">{admin.displayName || admin.email || admin.uid}</p><p className="text-xs text-gray-400">{admin.email || admin.uid}</p></div><div className="flex items-center gap-2"><select value={admin.role || "admin"} onChange={(event) => void updateManagedAdmin(admin, { role: event.target.value })} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"><option value="super_admin">Super admin</option><option value="admin">Admin</option><option value="support">Support</option><option value="finance">Finance</option><option value="moderator">Moderator</option></select><button onClick={() => void updateManagedAdmin(admin, { isActive: admin.isActive === false })} className={`rounded-xl px-3 py-2 text-xs font-bold ${admin.isActive === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{admin.isActive === false ? "Inactive" : "Active"}</button></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissionGroups.map(([group, permissions]) => <div key={group} className="rounded-xl bg-gray-50 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-500">{group}</p>{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={admin.permissions?.[group]?.[permission] === true} onChange={() => togglePermission(admin, group, permission)} /><span>{permission}</span></label>)}</div>)}</div></div>)}</section>}
  </div>;
}
