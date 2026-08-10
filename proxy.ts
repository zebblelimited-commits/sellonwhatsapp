import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get("__session")?.value;
  const { pathname } = request.nextUrl;
  const loginPath = pathname.startsWith("/admin") ? "/admin/login" : "/login";

  const publicRoutes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/register",
    "/role",
    "/explore",
    "/",
    "/pricing",
    "/boost-store",
    "/admin/login",
    "/admin/forgot-password",
    "/search",
    "/stores",
  ];

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isPublicRoute) return NextResponse.next();

  if (!sessionCookie) {
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  let decodedPayload: Record<string, unknown>;
  try {
    const parts = sessionCookie.split(".");
    if (parts.length !== 3) {
      const response = NextResponse.redirect(new URL(loginPath, request.url));
      response.cookies.delete("__session");
      response.cookies.delete("__role");
      return response;
    }

    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    decodedPayload = JSON.parse(atob(payloadBase64)) as Record<string, unknown>;
    const currentTime = Math.floor(Date.now() / 1000);
    const expiresAt = typeof decodedPayload.exp === "number" ? decodedPayload.exp : 0;

    if (expiresAt > 0 && expiresAt < currentTime) {
      const response = NextResponse.redirect(new URL(loginPath, request.url));
      response.cookies.delete("__session");
      response.cookies.delete("__role");
      return response;
    }
  } catch (error) {
    console.error("Session validation error:", error);
    const response = NextResponse.redirect(new URL(loginPath, request.url));
    response.cookies.delete("__session");
    response.cookies.delete("__role");
    return response;
  }

  const role = request.cookies.get("__role")?.value || decodedPayload.role;
  const redirectForRole = (target: string) => NextResponse.redirect(new URL(target, request.url));

  if (pathname.startsWith("/admin") && role !== "admin") {
    return redirectForRole(role === "vendor" ? "/dashboard" : role === "buyer" ? "/buyer/dashboard" : "/admin/login");
  }
  if (pathname.startsWith("/dashboard") && role !== "vendor") {
    return redirectForRole(role === "admin" ? "/admin" : role === "buyer" ? "/buyer/dashboard" : "/register/onboarding/role");
  }
  if (pathname.startsWith("/buyer") && role !== "buyer") {
    return redirectForRole(role === "admin" ? "/admin" : role === "vendor" ? "/dashboard" : "/register/onboarding/role");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/buyer/:path*", "/admin/:path*"],
};
