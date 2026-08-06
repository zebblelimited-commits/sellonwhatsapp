"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type UserRole = "vendor" | "buyer" | null;

interface AuthContextType {
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
        // ✅ FIX 1: Wrap Firestore calls in try/catch so the app doesn't crash if permissions fail
        try {
          let userRole: UserRole = null;
          const vendorDoc = await getDoc(doc(db, "stores", firebaseUser.uid));
          if (vendorDoc.exists()) {
            userRole = "vendor";
          } else {
            const buyerDoc = await getDoc(doc(db, "buyers", firebaseUser.uid));
            if (buyerDoc.exists()) userRole = "buyer";
          }
          setRole(userRole);

          // 2. Centralized Routing Logic (The Safety Net)
          const currentPath = window.location.pathname;
          const rolePath = '/register/onboarding/role'; 
          
          // ✅ FIX 2: Define public routes where we shouldn't force onboarding
          const publicRoutes = ['/', '/explore', '/register', '/login', '/pricing', '/boost-store'];
          const isPublicRoute = publicRoutes.includes(currentPath) || 
                                currentPath.startsWith('/pricing') || 
                                currentPath.startsWith('/boost-store');
          
          // ✅ FIX 3: Check if it's a dynamic product/store page (e.g., /username/productId)
          const pathSegments = currentPath.split('/').filter(Boolean);
          const isProductPage = pathSegments.length === 2 && 
                                !currentPath.startsWith('/admin') && 
                                !currentPath.startsWith('/dashboard') && 
                                !currentPath.startsWith('/buyer') && 
                                !currentPath.startsWith('/register');

          // ✅ FIX 4: Wrap routing in setTimeout to prevent Next.js initialization crash
          if (!userRole && !isPublicRoute && !isProductPage && currentPath !== rolePath) {
             setTimeout(() => router.replace(rolePath), 0); 
          }
          else if (userRole === 'buyer' && currentPath.startsWith('/dashboard')) {
             setTimeout(() => router.replace('/buyer/dashboard'), 0);
          }
          else if (userRole === 'vendor' && currentPath.startsWith('/buyer/dashboard')) {
             setTimeout(() => router.replace('/dashboard'), 0);
          }
        } catch (error) {
          console.error("AuthProvider: Error fetching user role:", error);
          // If Firestore throws a permission error, we catch it and continue.
        }
      } else {
        setRole(null);
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/dashboard') || currentPath.startsWith('/buyer/dashboard') || currentPath.startsWith('/admin')) {
           setTimeout(() => router.replace('/login'), 0);
        }
      }
      
      // ✅ CRITICAL FIX: ALWAYS set loading to false, no matter what happens above!
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
}