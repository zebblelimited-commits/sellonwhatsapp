"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type UserRole = "vendor" | "buyer" | null;

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
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                try {
                    let userRole: UserRole = null;

                    console.log("🔍 AuthProvider: Checking vendors collection...");
                    const vendorDoc = await getDoc(doc(db, "vendors", firebaseUser.uid));
                    if (vendorDoc.exists()) {
                        userRole = "vendor";
                        console.log("✅ AuthProvider: User is a VENDOR");
                    } else {
                        console.log("🔍 AuthProvider: Checking users collection...");
                        const buyerDoc = await getDoc(doc(db, "users", firebaseUser.uid));
                        if (buyerDoc.exists()) {
                            userRole = "buyer";
                            console.log("✅ AuthProvider: User is a BUYER");
                        } else {
                            console.warn("⚠️ AuthProvider: No document found in 'vendors' or 'users'");
                        }
                    }
                    setRole(userRole);

                    const currentPath = window.location.pathname;
                    const rolePath = '/register/onboarding/role';

                    const publicRoutes = ['/', '/explore', '/register', '/login', '/pricing', '/boost-store', '/search'];
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

                    if (!userRole && !isPublicRoute && !isProductPage && currentPath !== rolePath) {
                        console.log("🔄 AuthProvider: Redirecting to onboarding...");
                        setTimeout(() => router.replace(rolePath), 0);
                    }
                    else if (userRole === 'buyer' && (currentPath.startsWith('/dashboard') || currentPath.startsWith('/admin'))) {
                        setTimeout(() => router.replace('/buyer/dashboard'), 0);
                    }
                    else if (userRole === 'vendor' && (currentPath.startsWith('/buyer') || currentPath.startsWith('/admin'))) {
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
                if (currentPath.startsWith('/dashboard') || currentPath.startsWith('/buyer') || currentPath.startsWith('/admin')) {
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