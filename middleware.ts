// /workspace/middleware.ts (MUST be at the root, NOT inside /app)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('__session')?.value;
    const { pathname } = request.nextUrl;
    const loginPath = pathname.startsWith('/admin') ? '/admin/login' : '/login';

    // Public routes that don't need auth
    const publicRoutes = [
        '/login',
        '/register',
        '/role',
        '/explore',
        '/',
        '/pricing',
        '/boost-store',
        '/admin/login',
        '/search',
        '/stores'
    ];

    const isPublicRoute = publicRoutes.some(
        (route) => pathname === route || pathname.startsWith(route + '/')
    );

    if (isPublicRoute) {
        return NextResponse.next();
    }

    // Protected routes require session cookie
    if (!sessionCookie) {
        return NextResponse.redirect(new URL(loginPath, request.url));
    }

    // Validate JWT token format and expiration (Edge Runtime safe)
    let decodedPayload: Record<string, any>;
    try {
        const parts = sessionCookie.split('.');
        if (parts.length !== 3) {
            const response = NextResponse.redirect(new URL(loginPath, request.url));
            response.cookies.delete('__session');
            response.cookies.delete('__role');
            return response;
        }

        // ✅ FIX: Replaced Buffer with atob for Edge Runtime compatibility
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        decodedPayload = JSON.parse(atob(payloadBase64));
        const currentTime = Math.floor(Date.now() / 1000);

        if (decodedPayload.exp && decodedPayload.exp < currentTime) {
            const response = NextResponse.redirect(new URL(loginPath, request.url));
            response.cookies.delete('__session');
            response.cookies.delete('__role');
            return response;
        }
    } catch (error) {
        console.error('Session validation error:', error);
        const response = NextResponse.redirect(new URL(loginPath, request.url));
        response.cookies.delete('__session');
        response.cookies.delete('__role');
        return response;
    }

    const role = request.cookies.get('__role')?.value || decodedPayload.role;
    const redirectForRole = (target: string) => NextResponse.redirect(new URL(target, request.url));

    // A valid Firebase session is not enough to enter a portal. The role cookie
    // is minted server-side from the user's Firestore profile and is only used
    // here for fast routing; API handlers still verify the Firebase identity.
    if (pathname.startsWith('/admin') && role !== 'admin') {
        return redirectForRole(role === 'vendor' ? '/dashboard' : role === 'buyer' ? '/buyer/dashboard' : '/admin/login');
    }
    if (pathname.startsWith('/dashboard') && role !== 'vendor') {
        return redirectForRole(role === 'admin' ? '/admin' : role === 'buyer' ? '/buyer/dashboard' : '/register/onboarding/role');
    }
    if (pathname.startsWith('/buyer') && role !== 'buyer') {
        return redirectForRole(role === 'admin' ? '/admin' : role === 'vendor' ? '/dashboard' : '/register/onboarding/role');
    }

    return NextResponse.next();
}

export const config = {
    // ✅ FIX: Protects ALL buyer routes (profile, orders, escrow), not just dashboard
    matcher: ['/dashboard/:path*', '/buyer/:path*', '/admin/:path*'],
};
