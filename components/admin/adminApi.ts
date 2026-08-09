import { auth } from "@/lib/firebase";

export async function adminMutation<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Your admin session has expired. Please sign in again.");

  const response = await fetch(path, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Admin action failed");
  }

  return payload as T;
}

export async function adminUpload<T = unknown>(path: string, file: File): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Your admin session has expired. Please sign in again.");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "File upload failed");
  }

  return payload as T;
}
