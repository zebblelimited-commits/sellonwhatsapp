import { auth } from "@/lib/firebase";

async function adminRequest(path: string, init: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Your admin session has expired. Please sign in again.");

  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  const response = await send(await user.getIdToken());
  if (response.status !== 401) return response;

  // The admin page can outlive the short-lived Firebase ID token. Refresh it
  // once before reporting invalid credentials to the administrator.
  return send(await user.getIdToken(true));
}

async function readAdminResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload as T;
}

export async function adminMutation<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await adminRequest(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readAdminResponse<T>(response, "Admin action failed");
}

export async function adminUpload<T = unknown>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await adminRequest(path, {
    method: "POST",
    body: formData,
  });
  return readAdminResponse<T>(response, "File upload failed");
}
