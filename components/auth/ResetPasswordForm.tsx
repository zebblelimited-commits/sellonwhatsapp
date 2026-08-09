"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, KeyRound, Loader2 } from "lucide-react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";

function resetErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  if (code === "auth/expired-action-code") return "This reset link has expired. Request a new one.";
  if (code === "auth/invalid-action-code") return "This reset link is invalid or has already been used.";
  if (code === "auth/weak-password") return "Use a stronger password with at least 8 characters.";
  if (code === "auth/user-disabled") return "This account has been disabled. Contact support.";
  return "This password reset link could not be verified. Request a new one.";
}

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || "";
  const isAdmin = searchParams.get("portal") === "admin";
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function verifyLink() {
      if (!oobCode) {
        if (active) {
          setError("This page is missing a password reset code. Open the link from your email.");
          setChecking(false);
        }
        return;
      }

      try {
        const resetEmail = await verifyPasswordResetCode(auth, oobCode);
        if (active) {
          setEmail(resetEmail);
          setValid(true);
          setError("");
        }
      } catch (verifyError) {
        if (active) setError(resetErrorMessage(verifyError));
      } finally {
        if (active) setChecking(false);
      }
    }

    void verifyLink();
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setComplete(true);
      setValid(false);
    } catch (resetError) {
      console.error("Password reset failed:", resetError);
      setError(resetErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-gray-100 bg-white p-7 shadow-xl shadow-gray-200/50 sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700"><KeyRound size={24} /></div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Reset password</h1>
            <p className="text-sm font-medium text-gray-500">Choose a new password for your account.</p>
          </div>
        </div>

        {checking && <div className="flex items-center gap-2 text-sm font-medium text-gray-500"><Loader2 size={18} className="animate-spin text-green-600" /> Verifying reset link...</div>}

        {!checking && error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium leading-5 text-red-600">{error}</div>
        )}

        {complete && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-medium leading-5 text-green-700">
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> Password updated successfully.
            </div>
            <Link href={isAdmin ? "/admin/login" : "/login"} className="block w-full rounded-2xl bg-green-600 py-4 text-center font-bold text-white hover:bg-green-700">Continue to sign in</Link>
          </div>
        )}

        {!checking && valid && !complete && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">Resetting password for <span className="font-bold text-gray-700">{email}</span></p>
            <label className="block text-sm font-bold text-gray-700">
              New password
              <div className="relative mt-2">
                <input type={showPasswords ? "text" : "password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-gray-100 bg-gray-50 py-3.5 pl-4 pr-12 text-sm outline-none focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-500/10" />
                <button type="button" onClick={() => setShowPasswords((shown) => !shown)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"><Eye size={18} /></button>
              </div>
            </label>
            <label className="block text-sm font-bold text-gray-700">
              Confirm new password
              <input type={showPasswords ? "text" : "password"} required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3.5 text-sm outline-none focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-500/10" />
            </label>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 font-bold text-white shadow-lg shadow-green-200 hover:bg-green-700 disabled:opacity-70">
              {loading ? <><Loader2 size={19} className="animate-spin" /> Updating...</> : "Update password"}
            </button>
          </form>
        )}

        {!checking && !valid && !complete && <Link href={isAdmin ? "/admin/forgot-password" : "/forgot-password"} className="mt-5 block text-center text-sm font-bold text-green-600 hover:underline">Request another reset link</Link>}
      </section>
    </main>
  );
}
