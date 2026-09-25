# SellOnWhatsApp Flutter API Integration Guide

This document is the implementation guide for a native Flutter client that consumes the SellOnWhatsApp API.

## 1. Current architecture

The web application is a Next.js app backed by Firebase Authentication, Firebase Admin, Firestore, Firebase Storage, and Nomba payments.

Use this architecture in Flutter:

```text
Flutter
  -> Firebase Authentication (sign in and obtain ID token)
  -> https://sellonwhatsapp.com/api/*
       -> verifies Firebase ID token
       -> applies buyer/vendor/admin authorization
       -> writes server-owned data to Firestore
       -> calls Nomba, couriers, notifications, and payout services
```

For local development, use `http://10.0.2.2:3000` from the Android emulator, `http://127.0.0.1:3000` from the iOS simulator, and the computer's LAN IP from a physical device. Do not use `localhost` from a physical phone.

Production base URL:

```text
https://sellonwhatsapp.com
```

The native app does not need the web session cookie. It should send the Firebase ID token on every protected request:

```http
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

Native Flutter requests are not affected by browser CORS. Flutter Web is different and needs a CORS policy on the API host.

## 2. Flutter packages

Add the following packages. Use the current versions supported by the project at the time the Flutter app is created:

```yaml
dependencies:
  firebase_core: any
  firebase_auth: any
  cloud_firestore: any
  firebase_storage: any
  firebase_messaging: any
  http: any
  url_launcher: any
```

Configure Firebase for Android and iOS with the Firebase CLI/FlutterFire tooling. The mobile app must use the same Firebase project as the web app (`sellonwhatsapp-c3e0c`). Do not put Firebase Admin credentials, Nomba secrets, webhook secrets, or other server environment variables in the Flutter bundle.

Initialize Firebase before using Auth:

```dart
await Firebase.initializeApp(
  options: DefaultFirebaseOptions.currentPlatform,
);
```

## 3. Authentication and token handling

Use Firebase Auth for registration, login, password reset, and sign-out. After sign-in, obtain an ID token and send it to the API. The token is short-lived; Firebase refreshes it when requested.

```dart
final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
  email: email,
  password: password,
);

final user = credential.user;
if (user == null) throw Exception('Firebase did not return a user');

final idToken = await user.getIdToken(true);
```

Do not send a user-supplied `userId` as proof of identity. The API takes the identity from the verified token. Where an endpoint accepts a user ID for compatibility, it must match `FirebaseAuth.instance.currentUser.uid`.

The web-only endpoints `/api/login`, `/api/session`, and `/api/logout` create or clear a browser session cookie. A native app normally does not need them. Use Firebase Auth directly and use the bearer-token endpoints below.

### Recommended API client

Create one API client instead of calling `http` independently from every screen:

```dart
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.statusCode, this.message, [this.body]);

  final int statusCode;
  final String message;
  final Object? body;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  ApiClient({required this.baseUrl, FirebaseAuth? auth})
      : _auth = auth ?? FirebaseAuth.instance;

  final String baseUrl;
  final FirebaseAuth _auth;

  Future<Map<String, String>> _headers({required bool authenticated}) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      final user = _auth.currentUser;
      if (user == null) throw ApiException(401, 'Sign in required');
      final token = await user.getIdToken();
      if (token == null || token.isEmpty) {
        throw ApiException(401, 'Could not obtain Firebase ID token');
      }
      headers['Authorization'] = 'Bearer $token';
    }

    return headers;
  }

  Future<dynamic> request(
    String method,
    String path, {
    Object? body,
    bool authenticated = true,
    Map<String, String>? headers,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final requestHeaders = await _headers(authenticated: authenticated);
    if (headers != null) requestHeaders.addAll(headers);

    final encodedBody = body == null ? null : jsonEncode(body);
    late http.Response response;
    switch (method.toUpperCase()) {
      case 'GET':
        response = await http.get(uri, headers: requestHeaders);
        break;
      case 'POST':
        response = await http.post(uri, headers: requestHeaders, body: encodedBody);
        break;
      case 'PATCH':
        response = await http.patch(uri, headers: requestHeaders, body: encodedBody);
        break;
      case 'DELETE':
        response = await http.delete(uri, headers: requestHeaders);
        break;
      default:
        throw ArgumentError('Unsupported method: $method');
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = response.body;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = payload is Map && payload['error'] is String
          ? payload['error'] as String
          : 'Request failed (${response.statusCode})';
      throw ApiException(response.statusCode, message, payload);
    }

    return payload;
  }
}
```

Create the client with an environment-specific base URL, for example:

```dart
final api = ApiClient(baseUrl: 'https://sellonwhatsapp.com');
final referrals = await api.request('GET', '/api/referrals');
```

For production, add timeouts, connectivity handling, and one retry after forcing `getIdToken(true)` when a protected request returns `401`. Do not blindly retry payment or withdrawal requests.

## 4. Public and authenticated API inventory

All paths below are relative to the API base URL.

### Public or payment-flow endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/referrals/leaderboard` | Public referral leaderboard. Response contains `leaderboard`. |
| `GET` | `/api/webhooks/nomba/banks` | Fetches Nomba bank list. Cache it in Flutter and do not call it on every keystroke. |
| `POST` | `/api/shipping/calculate` | Public shipping quote calculation. |
| `GET` | `/api/subscription/{reference}` | Reads/verifies a subscription payment reference. |

`/api/subscription/{reference}` and the Nomba bank route make external provider calls and can be slow. Give them a longer timeout and show a retry state.

### Buyer and seller authenticated endpoints

Every endpoint in this table requires `Authorization: Bearer <Firebase ID token>` unless noted otherwise.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/account/delete` | Deletes the authenticated account and related data. Require a confirmation screen. |
| `POST` | `/api/checkout` | Creates a Nomba checkout for a buyer cart. The server recalculates the totals. |
| `POST` | `/api/orders/confirm-payment` | Confirms a checkout/payment reference and returns order payment status. |
| `POST` | `/api/orders/complete` | Buyer or authorized party completes an order and releases escrow. Body: `{ "orderId": "..." }`. |
| `POST` | `/api/orders/ship` | Seller marks an order shipped or service work complete. Body includes `orderId`, and physical shipments use `trackingId` and `carrier`. |
| `POST` | `/api/shipping/dispatch` | Dispatches a shipment. Body: `{ "shipmentId": "..." }`. |
| `POST` | `/api/products` | Seller creates a product. Body: `{ "userId": "current_uid", "productPayload": { ... } }`. |
| `POST` | `/api/stores/{storeId}/follow` | Follow a store. |
| `DELETE` | `/api/stores/{storeId}/follow` | Unfollow a store. |
| `POST` | `/api/chats` | Creates or finds a chat. Body includes `participantId`, `participantRole`, and optional `buyerId`, `vendorId`, `subject`. |
| `POST` | `/api/chats/{chatId}/messages` | Sends a chat message. Body: `{ "content": "..." }`. |
| `POST` | `/api/chats/{chatId}/read` | Marks chat messages read. |
| `POST` | `/api/disputes` | Opens a dispute. Body: `{ "orderId", "reason", "description", "evidence": [] }`. |
| `GET` | `/api/disputes/{disputeId}/actions` | Reads dispute messages/actions. |
| `POST` | `/api/disputes/{disputeId}/actions` | Responds to a dispute. Body: `{ "action": "respond", "content": "..." }`. Status changes are admin-only. |
| `POST` | `/api/partner/subscribe` | Starts the fixed partner subscription flow. |
| `POST` | `/api/premium/checkout` | Starts a premium subscription checkout. Body includes `planId`, `userId`, and `returnUrl`. |
| `POST` | `/api/premium/subscription-checkout` | Starts the subscription checkout variant used by the web app. |
| `POST` | `/api/premium/boost-checkout` | Starts a store boost checkout. Body includes `planId`, `durationDays`, price, and `storeId`. |
| `GET` | `/api/boost-store/{reference}` | Reads the authenticated user's boost payment status. |
| `GET` | `/api/referrals` | Reads the authenticated user's referral wallet, settings, activity, and ledger. |
| `POST` | `/api/referrals` | Referral action endpoint. Use `action: "attribute"` with `referralCode`, or `action: "activity"` for a recorded activity. |
| `GET` | `/api/referrals/payout-account` | Reads the authenticated user's referral payout account. |
| `POST` | `/api/referrals/payout-account` | Saves referral payout details. Body: `bankName`, `bankCode`, `accountNumber`. Status starts as `pending_review`. |
| `POST` | `/api/referrals/withdraw` | Requests a referral points withdrawal. Body: `{ "points": number, "idempotencyKey": "unique-key" }`. A verified/approved payout account is required. |
| `GET` | `/api/vendor/payout-settings?storeId={uid}` | Reads seller payout settings. `storeId` must be the authenticated seller's UID. |
| `POST` | `/api/vendor/payout-settings` | Saves seller payout details. Body: `storeId`, `bankCode`, `accountNumber`, optional `bankName`. |
| `POST` | `/api/withdraw` | Withdraws seller available balance through Nomba. Body: `{ "amount": number, "idempotencyKey": "unique-key" }`; also send `Idempotency-Key`. |
| `POST` | `/api/vendor/analytics/orders` | Returns customer analytics for seller-owned order IDs. Body: `{ "orderIds": ["..."] }`. |
| `POST` | `/api/notifications/welcome` | Triggers the authenticated user's welcome notification workflow. |
| `POST` | `/api/notifications/channels/telegram` | Starts Telegram notification-channel linking. |

The old `/api/vendor/withdraw` endpoint is intentionally disabled with HTTP `410`. Use `/api/withdraw`.

### Important request examples

#### Shipping quote

```dart
final quote = await api.request(
  'POST',
  '/api/shipping/calculate',
  authenticated: false,
  body: {
    'destinationState': 'Lagos',
    'totalWeightKg': 2.0,
    'items': cartItems,
    'cartTotal': cartTotal,
    'pickupAddress': pickupAddress,
    'destinationAddress': destinationAddress,
  },
);
```

The response includes `options`. Each option can contain `id`, `name`, `estimatedDays`, `shippingFee`, `dispatchEnabled`, `providerQuoteId`, and `providerQuote`.

#### Buyer checkout

The checkout endpoint expects seller-grouped orders. The server computes the authoritative total:

```dart
final checkout = await api.request(
  'POST',
  '/api/checkout',
  body: {
    'buyerId': FirebaseAuth.instance.currentUser!.uid,
    'customerEmail': email,
    'address': {
      'phone': phone,
      'line1': addressLine,
      'state': state,
      'latitude': latitude,
      'longitude': longitude,
    },
    'sellerOrders': [
      {
        'storeId': storeId,
        'storeName': storeName,
        'items': items,
        'shippingMethod': shippingMethod,
        'shippingCost': shippingCost,
        'subtotal': subtotal,
      },
    ],
    'paymentMethod': 'nomba',
    'total': total,
  },
);
```

The response contains `checkoutLink`, `reference`, and `orderIds`. Open `checkoutLink` with `url_launcher`. When the user returns to the app, call `/api/orders/confirm-payment` with `{ "orderReference": reference }`. Treat `202`/`confirmed: false` as pending and poll with backoff; do not create another checkout for the same cart while the first reference is pending.

#### Seller withdrawal

```dart
final idempotencyKey = 'withdraw_${DateTime.now().microsecondsSinceEpoch}';
final result = await api.request(
  'POST',
  '/api/withdraw',
  body: {
    'amount': amount,
    'idempotencyKey': idempotencyKey,
  },
  headers: {'Idempotency-Key': idempotencyKey},
);
```

Persist the idempotency key until the request resolves. If the network times out, query the seller's payout history/admin support rather than automatically submitting a second withdrawal. The API reserves the balance before contacting Nomba and reconciles ambiguous provider failures.

## 5. Referral integration flow

1. On an authenticated referral page, call `GET /api/referrals`.
2. Display the returned referral code and generate the registration/deep link locally using the production app URL.
3. Copy the code with Flutter's clipboard API and share the link with the platform share plugin.
4. When a new user registers with a code, call `POST /api/referrals` with `{ "action": "attribute", "referralCode": "...", "role": "buyer" }` after Firebase sign-in.
5. For supported activity events, call the same route with `{ "action": "activity", ... }` only once per business event. Do not call it on every screen render.
6. Load `GET /api/referrals/payout-account` and submit `POST /api/referrals/payout-account` for bank details.
7. Display `pending_review`, `approved`/`verified`, or `rejected` clearly. Referral withdrawal is only enabled for an approved/verified account.
8. Submit `POST /api/referrals/withdraw` with a durable idempotency key.

The referral account is sensitive financial data. Mask account numbers in normal UI and never log the full account number or Firebase token.

## 6. Admin mobile client

Admin routes use the same Firebase bearer token plus server-side admin verification. The server must decide whether the token belongs to an active admin and whether it has the required permission. Never treat a Flutter route guard, local role value, or a body field such as `role: "admin"` as authorization.

Admin endpoints currently available:

```text
GET/PATCH  /api/admin/profile
GET        /api/admin/auth
GET        /api/admin/overview
GET        /api/admin/analytics
GET        /api/admin/audit-logs
GET/PATCH  /api/admin/admins and /api/admin/admins/{id}
GET/PATCH  /api/admin/users/{id}
GET/PATCH  /api/admin/stores/{id}
GET/PATCH  /api/admin/products
GET/PATCH  /api/admin/verifications
GET/PATCH  /api/admin/bank-verifications
GET/PATCH  /api/admin/referral-payouts
GET/PATCH  /api/admin/notifications
GET/PATCH  /api/admin/couriers
GET/PATCH  /api/admin/hero-slides
POST       /api/admin/hero-images
POST       /api/admin/sponsored-images
PATCH      /api/admin/sponsored-stores
GET        /api/admin/stores/{id}
POST       /api/admin/refunds/{id}
POST       /api/admin/payouts/{id}/approve
PATCH      /api/admin/payouts/{id}/reconcile
PATCH      /api/admin/orders/{id}/reconcile
POST       /api/admin/chats/migrate
POST       /api/admin/seed-couriers
GET/POST    /api/admin/reset-test-data
```

Inspect the specific route before building an admin screen because admin PATCH bodies and permission names are intentionally route-specific. Never ship reset/test-data actions in a production-facing mobile build.

## 7. Server-only endpoints

Do not call these from Flutter. They are callback or scheduled-job endpoints and are protected by provider signatures/secrets or server environment variables:

```text
POST /api/webhooks/nomba
GET  /api/webhooks/nomba/banks       (the bank-list read is callable, but the route is grouped under webhooks)
POST /api/webhooks/fez
POST /api/webhooks/safehaven
POST /api/webhooks/sendbox
POST /api/webhooks/chowdeck
GET/POST /api/webhooks/whatsapp
POST /api/premium/boost-webhook
POST /api/premium/subscription-webhook
GET  /api/cron/subscriptions
GET  /api/cron/escrow-expiry
```

The Flutter application must never receive Nomba client secrets, webhook secrets, cron secrets, Firebase Admin credentials, or Novu keys.

## 8. Catalog and realtime gap to resolve before release

The current web client reads some public storefront/catalog data directly from Firestore. The API route inventory does not yet provide a complete public catalog GET surface. For a stable mobile contract, add read-only routes before the Flutter browse experience is finalized:

```text
GET /api/stores
GET /api/stores/{storeId-or-username}
GET /api/stores/{storeId}/products
GET /api/products/{productId}
GET /api/homepage
GET /api/notifications
PATCH /api/notifications/{id}/read
```

These routes should return stable DTOs, pagination cursors, explicit field names, and server-side filtering. Do not expose unrestricted Firestore queries merely to make the first mobile screen work. If Flutter uses Firestore temporarily for public reads, verify the Firestore rules and treat that as an interim implementation.

Chat and some dashboard activity currently rely on Firestore listeners in the web experience. For the first mobile release, use Firestore listeners only where rules allow it, or add authenticated API/listener contracts for chat lists, messages, and notifications. Firebase Cloud Messaging should be used for background notifications; the API's notification routes trigger workflows but are not a complete notification inbox API.

## 9. Uploads and images

Do not upload files to a provider directly with a secret embedded in Flutter. The recommended flow is:

1. Authenticate the user with Firebase.
2. Upload an image to the approved Firebase Storage path using the Flutter Storage SDK and secure Storage rules.
3. Obtain the resulting download URL.
4. Send that URL in `productPayload` or the relevant admin payload.
5. Render only HTTPS URLs and use placeholders when a URL is absent.

If server-side validation or image transformation is required, add a dedicated authenticated upload API rather than relaxing Storage rules.

## 10. Error handling, timeouts, and retries

Use the HTTP status as the first decision:

| Status | Flutter behavior |
|---|---|
| `400` | Show the validation message; do not retry unchanged input. |
| `401` | Force-refresh the Firebase ID token once, retry the same safe request once, then sign out. |
| `403` | Show an authorization or verification state; do not retry. |
| `404` | Show not found or stale-reference UI. |
| `409` | Refresh the resource and explain the state conflict. Common for order/payment/payout state. |
| `410` | The endpoint is retired; use the replacement documented above. |
| `429` | Back off and retry only for safe reads. |
| `500`/`502`/`503` | Show a recoverable error. Retry idempotent reads with exponential backoff. |

Recommended client timeouts are 15 seconds for normal API calls, 30 seconds for checkout/payment confirmation, and 30 seconds for bank lookup or shipping quotes. A timeout does not mean a payment or payout failed. Show a status-check path instead of creating a duplicate transaction.

## 11. Security requirements

- Use HTTPS in production and Android network security configuration that does not allow cleartext production traffic.
- Store only Firebase's normal Auth session data using the platform-secure storage behavior; never store raw passwords or server secrets.
- Do not trust prices, roles, seller IDs, payout amounts, or ownership values from the device. The API must remain authoritative.
- Redact Firebase tokens, bank account numbers, payment references, addresses, and customer data from logs and crash reports.
- Use least-privilege Firestore and Storage rules for any direct Firebase reads/listeners.
- Require re-authentication or an explicit confirmation before account deletion and financial actions.
- Use app links/universal links for payment return URLs when the mobile app is ready; continue supporting the web checkout URL as a fallback.

## 12. Suggested Flutter project structure

```text
lib/
  core/
    api/api_client.dart
    api/api_exception.dart
    auth/auth_service.dart
    config/app_config.dart
  features/
    auth/
    catalog/
    cart/
    checkout/
    orders/
    referrals/
    payouts/
    chats/
    disputes/
    seller/
    admin/
  models/
  routing/
  main.dart
```

Keep API DTOs separate from Firestore models. Add repository classes such as `ReferralRepository`, `CheckoutRepository`, and `OrderRepository`; widgets should not construct raw request maps or parse response JSON.

## 13. Release checklist

- Configure Android, iOS, and production Firebase apps in the same Firebase project.
- Test email/password sign-in and token refresh on a real device.
- Test buyer checkout with a Nomba sandbox/test account and verify pending, successful, and failed return flows.
- Test seller payout-account verification, rejected accounts, approved accounts, duplicate withdrawal taps, and network timeout recovery.
- Test referral attribution only once and verify ledger activity server-side.
- Test order completion and shipment transitions from both buyer and seller accounts.
- Test unauthorized access with a second account and expired token.
- Confirm no server secret is present in the APK/IPA or Flutter config files.
- Add automated API contract tests for every new catalog and notification endpoint before depending on them in Flutter.

## 14. Recommended implementation order

1. Create the Flutter shell, Firebase Auth, `ApiClient`, error mapping, and environment configuration.
2. Add authenticated profile/referral/payout settings screens.
3. Add seller product/order operations and buyer checkout/order confirmation.
4. Add chat, disputes, notifications, and deep links.
5. Add the dedicated public catalog GET APIs listed above, then build browse/search/store pages against those DTOs.
6. Add admin screens only after permission-specific request bodies are finalized.

The current API can support the authenticated buyer/seller workflows now. The public catalog and full notification inbox should be treated as the next backend API work before promising feature parity with the website.
