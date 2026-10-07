import { auth } from "@/lib/firebase";

/**
 * Firebase can still be hydrating auth state when a checkout button is
 * clicked. Wait for that first so a signed-in buyer is not treated as a
 * signed-out buyer during the initial render.
 */
export async function getReadyAuthUser() {
  if (!auth.currentUser && typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  return auth.currentUser;
}
