// /workspace/middleware.ts (MUST be at the root, NOT inside /app)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const sessionCookie = request.cookies.get('__session')?.value;
    const { pathname } = request.nextUrl;

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
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Validate JWT token format and expiration (Edge Runtime safe)
    try {
        const parts = sessionCookie.split('.');
        if (parts.length !== 3) {
            const response = NextResponse.redirect(new URL('/login', request.url));
            response.cookies.delete('__session');
            return response;
        }

        // ✅ FIX: Replaced Buffer with atob for Edge Runtime compatibility
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decodedPayload = JSON.parse(atob(payloadBase64));
        const currentTime = Math.floor(Date.now() / 1000);

        if (decodedPayload.exp && decodedPayload.exp < currentTime) {
            const response = NextResponse.redirect(new URL('/login', request.url));
            response.cookies.delete('__session');
            return response;
        }
    } catch (error) {
        console.error('Session validation error:', error);
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('__session');
        return response;
    }

    return NextResponse.next();
}

export const config = {
    // ✅ FIX: Protects ALL buyer routes (profile, orders, escrow), not just dashboard
    matcher: ['/dashboard/:path*', '/buyer/:path*', '/admin/:path*'],
};