import type { User } from "firebase/auth";

export function triggerWelcomeNotifications(user: User, role: "buyer" | "vendor") {
  void user.getIdToken()
    .then((idToken) => fetch("/api/notifications/welcome", {
      method: "POST",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    }))
    .then(async (response) => {
      if (!response.ok) {
        console.warn(`[WELCOME NOTIFICATIONS] Server returned ${response.status}`);
      }
    })
    .catch((error) => {
      console.warn("[WELCOME NOTIFICATIONS] Could not queue welcome notifications:", error);
    });
}
