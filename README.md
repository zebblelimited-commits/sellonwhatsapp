This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# sellonwhatsapp
# sellonwhatsapp



rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Admin access is tied to the same active-admin check used by /admin.
    // Admin documents are not client-creatable, so this cannot be self-granted.
    function isActiveAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.isActive == true;
    }
  
    match /boosts/{boostId} {
      // Allow read if user owns the boost (storeId matches auth uid)
      allow read: if request.auth != null && resource.data.storeId == request.auth.uid;
      // Allow write only via Cloud Functions / API (prevent client-side tampering)
      allow write: if false;
      allow create: if false;
      allow update: if false;
      allow delete: if false;
    }
    
    // ✅ Store boosts query index rule (for where clauses)
    match /boosts/{boostId} {
      allow read: if request.auth != null 
        && request.query.value.fields.storeId.stringValue == request.auth.uid;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🔐 ADMINS: Role-based access for admin panel
    // ═══════════════════════════════════════════════════════════
    match /admins/{adminId} {
      // ✅ Allow reading if:
      // (1) User is reading their own admin profile, OR
      // (2) Requester is an admin/super_admin checking another admin's role
      allow read: if request.auth != null && (
        request.auth.uid == adminId ||
        isActiveAdmin()
      );
      
      // ✅ ALLOW LIMITED UPDATES: Only lastLogin & updatedAt (prevents privilege escalation)
      allow update: if request.auth != null && 
        request.auth.uid == adminId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(["lastLogin", "updatedAt"]);
      
      // 🔒 Block creates & deletes entirely
      allow create, delete: if false;
    }

    // ═══════════════════════════════════════════════════════════
    // 🖥️ HOMEPAGE HERO SLIDES: Public display, active-admin management
    // ═══════════════════════════════════════════════════════════
    match /hero_slides/{slideId} {
      // The homepage is public and must be able to render active slides.
      allow read: if true;

      // Slide mutations go through the protected admin API using the Admin SDK.
      allow create, update, delete: if false;
    }

    // ═══════════════════════════════════════════════════════════
    // 📣 SPONSORED STORES: Public display, protected admin management
    // ═══════════════════════════════════════════════════════════
    match /sponsored_stores/{cardId} {
      allow read: if true;
      allow create, update, delete: if false;
    }

    // ═══════════════════════════════════════════════════════════
    // ✅ STORE VERIFICATIONS: Admin review queue + owner access
    // ═══════════════════════════════════════════════════════════
    match /store_verifications/{docId} {
      // ✅ FIX: Allow reading if the docId matches the user's UID 
      // (This safely handles the case where the document DOES NOT EXIST YET)
      allow read: if request.auth != null && (
        request.auth.uid == docId || 
        (resource.data != null && request.auth.uid == resource.data.storeId)
      );
      
      // ✅ FIX: Allow writing/updating if it's their own document
      allow write: if request.auth != null && (
        request.auth.uid == docId || 
        (resource.data != null && request.auth.uid == resource.data.storeId)
      );
      
      // Allow creating if they are creating it for themselves
      allow create: if request.auth != null && (
        request.auth.uid == docId || 
        request.resource.data.storeId == request.auth.uid
      );
      
      // ✅ Admins can READ all pending verifications (for review queue)
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"];
      
      // ✅ Admins can UPDATE status to approved/rejected (but not other fields)
      allow update: if request.auth != null && 
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"] &&
        request.resource.data.status in ["approved", "rejected", "pending"] &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "reviewNotes", "reviewedAt", "updatedAt"]);
    }

    // ═══════════════════════════════════════════════════════════
    // 🔤 USERNAMES: Public read, owner write/delete
    // ═══════════════════════════════════════════════════════════
    match /usernames/{username} {
      // Anyone can read to check if a username is taken
      allow read: if true; 
      
      // Authenticated users can claim a username, linking it to their UID
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      
      // ✅ FIX: Only the owner can update or delete their OWN claimed username
      // (This allows them to "release" their old username when they change it)
      allow update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🏪 STORES: Owner read/write, public read
    // ═══════════════════════════════════════════════════════════
    match /stores/{storeId} {
      // ✅ Public can read store profiles (needed for product pages)
      allow read: if true;
      
      // ✅ Store owner can update their own store 
      // ✅ OR Anyone can update analytics fields & followerCount (Fixes trackMetric & FollowButton)
      allow update: if 
        (request.auth != null && request.auth.uid == storeId) ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'followersCount', 
          'followerCount', 
          'views', 
          'clicks', 
          'buy_now_clicks', 
          'whatsapp_clicks', 
          'add_to_cart_clicks', // ✅ NEW: Allows incrementing add to cart clicks
          'follows',            // ✅ NEW: Allows incrementing follows
          'unfollows',          // ✅ NEW: Allows incrementing unfollows
          'updatedAt'
        ]);
      
      // ✅ Only owner can create/delete their store profile
      allow create, delete: if request.auth != null && request.auth.uid == storeId;
    }

    // ═══════════════════════════════════════════════════════════
    // 🚀 STORE BOOSTS: Vendor read access for their own boosts
    // ═══════════════════════════════════════════════════════════
    match /store_boosts/{documentId} {
      allow read: if request.auth != null && resource.data.storeId == request.auth.uid;
      // No write rules here because your backend Admin SDK handles all creations/updates!
    }
    
    // ═══════════════════════════════════════════════════════════
    // 📦 PRODUCTS: Public read; vendor write
    // ═══════════════════════════════════════════════════════════
    match /products/{productId} {
      allow read: if true;
      
      // ✅ Vendor can write anything to their own products
      allow write: if request.auth != null && request.auth.uid == resource.data.storeId;
      
      // ✅ Allow public to update ONLY analytics fields on products
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly([
        'views', 'clicks', 'buy_now_clicks', 'whatsapp_clicks', 'updatedAt'
      ]);
      
      allow create: if request.auth != null && request.resource.data.storeId == request.auth.uid;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🛒 ORDERS: Buyer/vendor/admin access
    // ═══════════════════════════════════════════════════════════
    match /orders/{orderId} {
      allow read: if request.auth != null && (
        resource.data.vendorId == request.auth.uid || 
        resource.data.buyerId == request.auth.uid ||
        isActiveAdmin()
      );
      
      allow create: if request.auth != null && 
        request.resource.data.buyerId == request.auth.uid &&
        request.resource.data.vendorId is string &&
        request.resource.data.totalAmount is number &&
        request.resource.data.status == "PAID_HELD" &&
        request.resource.data.createdAt is timestamp;
      
      allow update: if request.auth != null && (
        resource.data.vendorId == request.auth.uid || 
        resource.data.buyerId == request.auth.uid
      ) && request.resource.data.status in [
        "PAID_HELD", "SHIPPED", "COMPLETED", "DISPUTED", "CANCELLED",
        "paid_held", "shipped", "completed", "disputed", "cancelled", "under_review" // ✅ Added lowercase
      ];
    }
    
    // ═══════════════════════════════════════════════════════════
    // 📊 ANALYTICS: Public write, owner/admin read
    // ═══════════════════════════════════════════════════════════
    match /analytics/{eventId} {
      // ✅ Allow anyone to create analytics events (even unauthenticated users)
      // Updated to include "search", "follow", "unfollow", and "add_to_cart_click"
      // Also makes 'storeId' optional to support global search events
      allow create: if request.resource.data.eventType in [
          "view", 
          "click", 
          "buy_now_click", 
          "whatsapp_click",
          "follow",
          "unfollow",
          "search",
          "add_to_cart_click" // ✅ NEW: Allows tracking add to cart events
        ] && (
          // If storeId is provided, it must be a string. If not provided (e.g., global search), that's also allowed.
          !('storeId' in request.resource.data) || request.resource.data.storeId is string
        );
        
      // ✅ Store owners can read their own analytics, and admins can read all
      allow read: if request.auth != null && (
        ('storeId' in resource.data && request.auth.uid == resource.data.storeId) ||
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"]
      );

      // ❌ No updates or deletes allowed for analytics events (immutable ledger)
      allow update, delete: if false;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 💳 SUBSCRIPTIONS: Owner read, backend write
    // ═══════════════════════════════════════════════════════════
    match /subscriptions/{documentId} {
      // ✅ FIX: Check the 'userId' field INSIDE the document, not the Document ID!
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      
      // 🔒 Block client-side writes.
      allow write: if false; 
    }
    
    // ═══════════════════════════════════════════════════════════
    // 💸 PAYOUTS (Owner read, system write)
    // ═══════════════════════════════════════════════════════════
    match /payouts/{payoutId} {
      // ✅ Store owners can read their own payout history
      allow read: if request.auth != null && (
        resource.data.storeId == request.auth.uid ||
        resource.data.vendorId == request.auth.uid ||
        isActiveAdmin()
      );

      // ✅ Only admin/API can create payouts (via Firebase Admin SDK)
      allow create: if false;

      // ✅ Only admin/API can update payouts (webhook updates status)
      allow update, delete: if false;
    }
    
    // ═══════════════════════════════════════════════════════════
    // ⚖️ DISPUTES: Two-sided access + admin read
    // ═══════════════════════════════════════════════════════════
    match /disputes/{disputeId} {
      allow read: if request.auth != null && (
        resource.data.vendorId == request.auth.uid || 
        resource.data.buyerId == request.auth.uid ||
        isActiveAdmin()
      );

      allow create: if request.auth != null && 
        request.resource.data.buyerId == request.auth.uid &&
        request.resource.data.status == "open" &&
        request.resource.data.reason in [
          "item_not_received", "damaged", "wrong_item", "not_as_described", "other"
        ] &&
        request.resource.data.createdAt is timestamp &&
        request.resource.data.updatedAt is timestamp;

      allow update: if request.auth != null && (
        resource.data.vendorId == request.auth.uid || 
        resource.data.buyerId == request.auth.uid
      ) && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
        "response", "evidence", "read", "status", "updatedAt", 
        "vendorResponded", "lastVendorResponse", "resolution"
      ]) && (
        (resource.data.status == "open" && request.resource.data.status in ["open", "under_review"]) ||
        (resource.data.status == "under_review" && request.resource.data.status in ["under_review", "resolved_vendor", "resolved_refund"]) ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(["read", "updatedAt"]) ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(["vendorResponded", "lastVendorResponse", "updatedAt"]) ||
        (resource.data.status in ["resolved_vendor", "resolved_refund", "closed"] && 
         request.resource.data.status == resource.data.status)
      );
    }
    
    match /disputes/{disputeId}/messages/{msgId} {
      allow read: if request.auth != null && (
        get(/databases/$(database)/documents/disputes/$(disputeId)).data.buyerId == request.auth.uid ||
        get(/databases/$(database)/documents/disputes/$(disputeId)).data.vendorId == request.auth.uid ||
        isActiveAdmin()
      );
      allow create: if request.auth != null && request.resource.data.senderId == request.auth.uid && (
        get(/databases/$(database)/documents/disputes/$(disputeId)).data.buyerId == request.auth.uid ||
        get(/databases/$(database)/documents/disputes/$(disputeId)).data.vendorId == request.auth.uid ||
        isActiveAdmin()
      );
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🔔 NOTIFICATIONS: Backend creates; users mark as read
    // ═══════════════════════════════════════════════════════════
    match /notifications/{notifId} {
      allow read: if request.auth != null && (
        resource.data.get("vendorId", "") == request.auth.uid || 
        resource.data.get("buyerId", "") == request.auth.uid ||
        resource.data.get("recipientId", "") == request.auth.uid ||
        resource.data.get("adminId", "") == request.auth.uid ||
        isActiveAdmin()
      );
      allow create: if false;
      allow update: if request.auth != null && (
        resource.data.get("vendorId", "") == request.auth.uid ||
        resource.data.get("buyerId", "") == request.auth.uid ||
        resource.data.get("recipientId", "") == request.auth.uid ||
        resource.data.get("adminId", "") == request.auth.uid
      ) && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["read", "readAt", "updatedAt"]);
      allow delete: if request.auth != null && (
        resource.data.get("vendorId", "") == request.auth.uid ||
        resource.data.get("buyerId", "") == request.auth.uid ||
        resource.data.get("recipientId", "") == request.auth.uid
      );
    }
    
    // ═══════════════════════════════════════════════════════════
    // 👥 FOLLOWS: Secure follow system
    // ═══════════════════════════════════════════════════════════
    match /follows/{followId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.followerId == request.auth.uid;
      allow delete: if request.auth != null && resource.data.followerId == request.auth.uid;
    }
    
    // ═══════════════════════════════════════════════════════════
    // 💬 CHAT SYSTEMS
    // ═══════════════════════════════════════════════════════════
    match /support_chats/{chatId} {
      allow read: if request.auth != null && (
        isActiveAdmin() ||
        resource.data.buyerId == request.auth.uid ||
        resource.data.vendorId == request.auth.uid ||
        request.auth.uid in resource.data.participants
      );
      // Messages, read receipts, unread counters, and notifications are written
      // by the authenticated server routes so fan-out remains atomic.
      allow create, update, delete: if false;

      match /messages/{messageId} {
        allow read: if request.auth != null && (
          isActiveAdmin() ||
          (exists(/databases/$(database)/documents/support_chats/$(chatId)) && (
            get(/databases/$(database)/documents/support_chats/$(chatId)).data.buyerId == request.auth.uid ||
            get(/databases/$(database)/documents/support_chats/$(chatId)).data.vendorId == request.auth.uid ||
            request.auth.uid in get(/databases/$(database)/documents/support_chats/$(chatId)).data.participants
          ))
        );
        allow create, update, delete: if false;
      }
    }

    match /vendor_chats/{chatId} {
      // ✅ Allow read if docId matches UID, user is vendor/buyer/participant, OR is admin
      allow read: if request.auth != null && (
        request.auth.uid == chatId ||
        (resource.data != null && (
          resource.data.vendorId == request.auth.uid || 
          resource.data.buyerId == request.auth.uid ||
          request.auth.uid in resource.data.participants
        )) ||
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"]
      );  
      
      allow create, update, delete: if request.auth != null && (
        request.auth.uid == chatId ||
        (resource.data != null && (
          request.auth.uid == resource.data.vendorId || 
          request.auth.uid == resource.data.buyerId ||
          request.auth.uid in resource.data.participants
        ))
      );
      
      match /messages/{msgId} {
        // ✅ Safe read: Uses exists() to prevent crash if parent chat doesn't exist yet
        allow read: if request.auth != null && (
          request.auth.uid == chatId ||
          (exists(/databases/$(database)/documents/vendor_chats/$(chatId)) && (
            get(/databases/$(database)/documents/vendor_chats/$(chatId)).data.vendorId == request.auth.uid ||
            get(/databases/$(database)/documents/vendor_chats/$(chatId)).data.buyerId == request.auth.uid ||
            request.auth.uid in get(/databases/$(database)/documents/vendor_chats/$(chatId)).data.participants
          )) ||
          get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"]
        );
        allow create: if request.auth != null && request.resource.data.senderId == request.auth.uid;
        allow update: if request.auth != null && request.resource.data.read == true;
      }
    }
    
    match /admin_chats/{chatId} {
      allow read, write: if request.auth != null && (
        request.auth.uid == chatId ||
        (resource.data != null && request.auth.uid in resource.data.participants) ||
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"]
      );
      
      match /messages/{msgId} {
        allow read: if request.auth != null && (
          request.auth.uid == chatId ||
          (exists(/databases/$(database)/documents/admin_chats/$(chatId)) && 
           request.auth.uid in get(/databases/$(database)/documents/admin_chats/$(chatId)).data.participants) ||
          get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"]
        );
        allow create: if request.auth != null && request.resource.data.senderId == request.auth.uid;
        allow update: if request.auth != null && request.resource.data.read == true;
      }
    }
    
    match /chats/{chatId} {
      // ✅ FIX: Explicitly allow read if user is the vendor, buyer, OR in the participants array.
      // This satisfies the query: where("vendorId", "==", user.uid)
      allow read, write: if request.auth != null && (
        request.auth.uid == chatId ||
        (resource.data != null && (
          resource.data.vendorId == request.auth.uid ||
          resource.data.buyerId == request.auth.uid ||
          request.auth.uid in resource.data.participants
        ))
      );
      
      match /messages/{messageId} {
        allow read, write: if request.auth != null && (
          request.auth.uid == chatId ||
          (exists(/databases/$(database)/documents/chats/$(chatId)) && (
            get(/databases/$(database)/documents/chats/$(chatId)).data.vendorId == request.auth.uid ||
            get(/databases/$(database)/documents/chats/$(chatId)).data.buyerId == request.auth.uid ||
            request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants
          ))
        );
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🏪 VENDORS (Used by AuthProvider & Cloud Functions)
    // ═══════════════════════════════════════════════════════════
    match /vendors/{vendorId} {
      // Allow the vendor to read and write their own profile
      allow read, write: if request.auth != null && request.auth.uid == vendorId;
      
      // Allow admins to read/update vendor profiles (for banning/managing)
      allow read, update: if request.auth != null && 
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role in ["admin", "super_admin"];
    }
    
    // ═══════════════════════════════════════════════════════════
    // 👥 USERS & BUYERS
    // ═══════════════════════════════════════════════════════════
    match /users/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || isActiveAdmin()
      );
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /buyers/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          "preferences", "address", "phone", "firstName", "lastName", "updatedAt", "displayName", "phoneNumber", "shippingAddress"
        ]);
      allow create: if request.auth != null && request.auth.uid == userId && request.resource.data.role == "buyer";
    }
    
    // ═══════════════════════════════════════════════════════════
    // 🔐 DEFAULT DENY
    // ═══════════════════════════════════════════════════════════
    match /{document=**} {
      allow read, write: if false;
    }
  }
}



