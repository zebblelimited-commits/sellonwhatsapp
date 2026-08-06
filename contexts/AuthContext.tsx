"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type UserRole = "admin" | "vendor" | "buyer" | null;

export interface AuthContextType {
    user: User | null;
    role: UserRole;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const readDoc = async (collectionName: string, uid: string) => {
            try {
                return await getDoc(doc(db, collectionName, uid));
            } catch (error) {
                // A normal user may not be allowed to read the admins collection.
                // Treat that as "not an admin" and continue checking the portal
                // collections instead of misclassifying the user.
                return null;
            }
        };

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                try {
                    let userRole: UserRole = null;

                    const [adminDoc, storeDoc, vendorDoc, buyerDoc, userDoc] = await Promise.all([
                        readDoc("admins", firebaseUser.uid),
                        readDoc("stores", firebaseUser.uid),
                        readDoc("vendors", firebaseUser.uid),
                        readDoc("buyers", firebaseUser.uid),
                        readDoc("users", firebaseUser.uid),
                    ]);

                    if (adminDoc?.exists() && adminDoc.data()?.isActive === true) {
                        userRole = "admin";
                    } else if (storeDoc?.exists() || vendorDoc?.exists()) {
                        // Stores is the canonical seller profile. vendors is kept
                        // as a legacy-compatible fallback for older accounts.
                        userRole = "vendor";
                    } else if (buyerDoc?.exists() || userDoc?.exists()) {
                        // buyers is the canonical buyer profile. users is kept as
                        // a legacy-compatible fallback for older accounts.
                        userRole = "buyer";
                    }
                    setRole(userRole);

                    const currentPath = window.location.pathname;
                    const rolePath = '/register/onboarding/role';

                    const publicRoutes = ['/', '/explore', '/register', '/login', '/pricing', '/boost-store', '/search', '/admin/login'];
                    const isPublicRoute = publicRoutes.includes(currentPath) ||
                        currentPath.startsWith('/pricing') ||
                        currentPath.startsWith('/boost-store') ||
                        currentPath.startsWith('/search') ||
                        currentPath.startsWith('/stores/');

                    const pathSegments = currentPath.split('/').filter(Boolean);
                    const isProductPage = pathSegments.length === 2 &&
                        !currentPath.startsWith('/admin') &&
                        !currentPath.startsWith('/dashboard') &&
                        !currentPath.startsWith('/buyer') &&
                        !currentPath.startsWith('/register');

                    if (!userRole && (currentPath === '/admin' || currentPath.startsWith('/admin/')) && currentPath !== '/admin/login') {
                        setTimeout(() => router.replace('/admin/login'), 0);
                    } else if (!userRole && !isPublicRoute && !isProductPage && currentPath !== rolePath) {
                        setTimeout(() => router.replace(rolePath), 0);
                    } else if (userRole === 'admin' && (currentPath.startsWith('/dashboard') || currentPath.startsWith('/buyer'))) {
                        setTimeout(() => router.replace('/admin'), 0);
                    } else if (userRole === 'buyer' && (currentPath.startsWith('/dashboard') || currentPath.startsWith('/admin'))) {
                        setTimeout(() => router.replace('/buyer/dashboard'), 0);
                    } else if (userRole === 'vendor' && (currentPath.startsWith('/buyer') || currentPath.startsWith('/admin'))) {
                        setTimeout(() => router.replace('/dashboard'), 0);
                    }

                } catch (error) {
                    console.error("❌ AuthProvider: Error fetching user role:", error);
                } finally {
                    // ✅ CRITICAL: This GUARANTEES the spinner turns off, no matter what happens above
                    console.log("🏁 AuthProvider: Setting loading to FALSE");
                    setLoading(false);
                }
            } else {
                setRole(null);
                const currentPath = window.location.pathname;
                if (currentPath.startsWith('/admin') && currentPath !== '/admin/login') {
                    setTimeout(() => router.replace('/admin/login'), 0);
                } else if (currentPath.startsWith('/dashboard') || currentPath.startsWith('/buyer')) {
                    setTimeout(() => router.replace('/login'), 0);
                }
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [router]);

    return (
        <AuthContext.Provider value={{ user, role, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
