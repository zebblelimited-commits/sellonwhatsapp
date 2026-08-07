export type ToastType = "success" | "error" | "info";

export function showToast(type: ToastType, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("zebble:toast", { detail: { type, message } }));
}
