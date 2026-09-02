"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, updatePassword, User } from "firebase/auth";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

function errorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Your current password is incorrect.";
  if (code === "auth/requires-recent-login") return "Please sign in again before changing your password.";
  if (code === "auth/weak-password") return "Use a stronger password with at least 8 characters.";
  return "Password could not be changed. Please try again.";
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setCheckingAuth(false);
    if (!nextUser) router.replace("/login");
  }), [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!user?.email) return setError("This account does not have an email/password login.");
    if (newPassword.length < 8) return setError("Use a password with at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("The new passwords do not match.");

    setSaving(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (changeError) {
      console.error("Password change failed:", changeError);
      setError(errorMessage(changeError));
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-green-600" size={28} /></main>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-gray-100 bg-white p-7 shadow-xl shadow-gray-200/50 sm:p-10">
        <Link href="/buyer/dashboard" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600"><ArrowLeft size={16} /> Back to settings</Link>
        <div className="mb-7 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700"><KeyRound size={23} /></div><div><h1 className="text-2xl font-extrabold text-gray-900">Change password</h1><p className="text-sm font-medium text-gray-500">Protect your account with a new password.</p></div></div>
        {success && <div className="mb-5 flex items-start gap-2 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-medium text-green-700"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /> Password updated successfully.</div>}
        {error && <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        {!user?.providerData.some((provider) => provider.providerId === "password") ? (
          <div className="space-y-4"><p className="rounded-2xl bg-amber-50 p-4 text-sm font-medium leading-5 text-amber-800">This account uses social sign-in. Request a password reset link to create an email password.</p><Link href="/forgot-password" className="block rounded-2xl bg-green-600 py-4 text-center font-bold text-white hover:bg-green-700">Request reset link</Link></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-sm font-bold text-gray-700">Current password<div className="relative mt-2"><input required type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 pr-12 text-sm outline-none focus:border-green-600" /><button type="button" onClick={() => setShowPasswords((shown) => !shown)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <label className="block text-sm font-bold text-gray-700">New password<input required minLength={8} type={showPasswords ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-sm outline-none focus:border-green-600" /></label>
            <label className="block text-sm font-bold text-gray-700">Confirm new password<input required minLength={8} type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-sm outline-none focus:border-green-600" /></label>
            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 font-bold text-white hover:bg-green-700 disabled:opacity-70">{saving ? <><Loader2 size={18} className="animate-spin" /> Updating...</> : "Update password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
