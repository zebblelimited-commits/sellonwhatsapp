import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-gray-50 text-sm font-medium text-gray-500">Loading password reset...</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
