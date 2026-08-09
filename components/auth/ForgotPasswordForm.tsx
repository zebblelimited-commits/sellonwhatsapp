"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

type ForgotPasswordFormProps = {
  admin?: boolean;
};

function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";

  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait and try again later.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  return "We could not send the reset email. Please try again.";
}

export default function ForgotPasswordForm({ admin = false }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setMessage("");
    setError("");

    if (!normalizedEmail) {
      setError("Enter the email address for your account.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail, {
        url: `${window.location.origin}/reset-password${admin ? "?portal=admin" : ""}`,
        handleCodeInApp: true,
      });
      setMessage("If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.");
    } catch (resetError) {
      console.error("Password reset request failed:", resetError);
      setError(authErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  }

  const loginHref = admin ? "/admin/login" : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-gray-100 bg-white p-7 shadow-xl shadow-gray-200/50 sm:p-10">
        <Link href={loginHref} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600">
          <ArrowLeft size={16} /> Back to sign in
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            {admin ? <ShieldCheck size={24} /> : <Mail size={24} />}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Forgot password?</h1>
            <p className="text-sm font-medium text-gray-500">
              {admin ? "Recover your administrator account." : "Recover access to your account."}
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-medium text-green-700">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block text-sm font-bold text-gray-700">
            Email address
            <div className="relative mt-2">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={admin ? "admin@zebble.com" : "name@company.com"}
                disabled={loading}
                className="w-full rounded-2xl border border-gray-100 bg-gray-50 py-3.5 pl-12 pr-4 text-sm font-medium outline-none transition focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-500/10 disabled:opacity-60"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 font-bold text-white shadow-lg shadow-green-200 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? <><Loader2 size={19} className="animate-spin" /> Sending...</> : "Send reset link"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs font-medium leading-5 text-gray-400">
          The reset link expires for security. You can request a new one if it expires.
        </p>
      </section>
    </main>
  );
}
