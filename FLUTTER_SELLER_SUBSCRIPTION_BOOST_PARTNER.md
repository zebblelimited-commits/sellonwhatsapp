# Flutter Seller Subscription, Store Boost, and Marketplace Partner

This guide implements the Flutter seller experiences for:

- Premium subscriptions
- Store Boost
- Marketplace Partner
- Nomba checkout redirects
- Payment verification and status polling
- Entitlement and expiry handling
- Subscription, boost, and partner UI states

Use this guide with:

- FLUTTER_SELLER_DASHBOARD.md
- FLUTTER_SELLER_STORE_PRODUCTS_ORDERS_ANALYTICS.md
- FLUTTER_SELLER_PAYOUTS_WITHDRAW_SETTINGS.md
- FLUTTER_API_INTEGRATION.md

All payment initialization and payment verification remain server-side.

## 0. Current payment contract at a glance

The three checkout products use separate protected APIs and separate server records:

| Product | Initialize checkout | Verify/refresh status | Server record |
|---|---|---|---|
| Pricing subscription | `POST /api/premium/subscription-checkout` | `GET /api/subscription/{reference}` | `subscriptions/{reference}` |
| Store Boost | `POST /api/premium/boost-checkout` | `GET /api/boost-store/{reference}` | `boosts/{reference}` |
| Marketplace Partner | `POST /api/partner/subscribe` | Refresh `stores/{sellerUid}` | `stores/{sellerUid}` |

All three requests require a Firebase ID token:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
Accept: application/json
```

The Flutter app must call the web application's deployed API base URL, not Nomba directly. Nomba client credentials, access tokens, account IDs, split configuration, and webhook secrets must remain server-only.

Flutter does not calculate or add the Nomba processing fee. The web server reconciles the product amount against either the exact product amount or the configured Nomba fee-inclusive amount, then stores `expectedAmount`, `providerAmount`, and `providerFee`. The subscription, boost, or partner price shown by Flutter remains the product price.

The Nomba dashboard must send payment events to the deployed unified webhook:

```text
POST /api/webhooks/nomba
```

The webhook confirms the transaction and activates the corresponding server record. Opening a checkout URL, returning from the browser, or receiving a successful redirect is not proof of payment.

For subscriptions and Store Boost, the current implementation creates a Nomba parent-account checkout. These are not seller-order escrow payments and do not use the buyer/seller/courier split. Marketplace Partner also uses the parent-account checkout.

### Current fee entitlement rule

The seller commission is settled at order checkout, not charged again during withdrawal. An active Pro Business Lite (`pro_lite`), Pro Yearly Business Max (`pro_max`), or Marketplace Partner entitlement waives the seller commission for eligible orders. Flutter should display the entitlement returned by the server and must not calculate or deduct another seller commission locally.

## 1. Product separation

These are three related but different products.

```text
Premium subscription
  Unlocks seller platform features and plan limits.
  Examples: Pro Seller badge, chat, advanced analytics, product capacity.

Store Boost
  Temporary paid visibility campaign for one seller store.
  Examples: search ranking, featured placement, nearby buyer notifications.

Marketplace Partner
  A time-limited seller partnership benefit.
  The current checkout is a one-time NGN 10,000 payment for 30 days;
  automatic recurring billing is not implemented by this route.
  It waives the seller commission, and provides a partner badge,
  higher visibility, priority support, advanced analytics, and boost discounts.
```

Do not combine their records or status flags:

```text
subscriptions/{id}
boosts/{id}
stores/{sellerUid}.isPartner
stores/{sellerUid}.partnerExpiry
stores/{sellerUid}.subscriptionPlan
```

## 2. Flutter dependencies and structure

Add:

```yaml
dependencies:
  flutter:
    sdk: flutter
  firebase_auth: ^latest
  cloud_firestore: ^latest
  firebase_core: ^latest
  http: ^latest
  url_launcher: ^latest
  intl: ^latest
  uuid: ^latest
```

Recommended files:

```text
lib/features/seller/
  growth/
    growth_screen.dart
    subscription/
      subscription_model.dart
      subscription_repository.dart
      subscription_screen.dart
      subscription_checkout_state.dart
    boost/
      boost_model.dart
      boost_repository.dart
      boost_screen.dart
      boost_checkout_state.dart
    partner/
      partner_model.dart
      partner_repository.dart
      partner_screen.dart
    payment/
      checkout_redirect.dart
      payment_status_polling.dart
      payment_result_screen.dart
```

The same growth screen can use tabs:

```text
Premium
Store Boost
Partner
```

## 3. Authentication

Every checkout initialization call must include:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
Accept: application/json
```

The server verifies that the token belongs to the seller account. Do not use a user ID or store ID as the only authorization mechanism.

The Flutter app must not contain:

- Nomba client ID
- Nomba client secret
- Nomba account ID
- Nomba access token
- Firebase Admin credentials
- Webhook signing secrets
- Payment provider private keys

The checkout link returned by the API is safe to open as an external payment page, but the redirect callback is not proof of payment. Always verify status through the server or a server-backed Firestore record.

## 4. Premium subscription

### 4.1 Plans

The current pricing page defines:

```text
Free
  Price: 0
  Forever
  Basic store listing
  Up to 20 products
  Standard analytics
  Email support
  WhatsApp order sync

Pro Business Lite
  Plan ID: pro_lite
  Monthly base price: NGN 4,999
  Pro Seller badge
  Real-time chat support
  Up to 500 products
  Advanced analytics
  Priority support

Pro Yearly Business Max
  Plan ID: pro_max
  Yearly base price: NGN 49,990
  Unlimited products
  Custom branding and domain
  API access
  Dedicated account manager
  Early feature access
```

The backend subscription route is the source of truth for plan validity and price. Do not trust a price stored only in Flutter.

The current paid plan IDs accepted by the web API are `pro_lite` and `pro_max`. The paid Pro plans waive the seller commission while active; this is separate from the buyer-facing platform fee and from courier handling charges.

### 4.2 Duration options

The current checkout supports:

```text
1 month
  0% discount

3 months
  10% discount

6 months
  17% discount

12 months
  25% discount
```

Pricing calculation:

```text
basePrice = monthlyPrice * durationMonths
finalPrice = round(basePrice * (1 - discount))
savings = basePrice - finalPrice
```

The server recalculates or validates the charge. Flutter can display an estimate and must show the final amount returned by the API.

### 4.3 Subscription UI

```text
Subscription screen
  Current plan banner
  Active or expired status
  Expiry / next renewal date
  Auto-renew switch
  Plan cards
    Plan name
    Price
    Features
    Missing features
    Select duration
    Savings
    Upgrade button

Payment state
  Preparing checkout
  Opening secure checkout
  Verifying payment
  Active
  Failed
  Still processing
```

If the current seller already has an active plan, show Manage, Renew, or Upgrade rather than presenting the same Upgrade action without context.

### 4.4 Subscription data model

```dart
class SellerSubscription {
  final String id;
  final String planId;
  final String planName;
  final String status;
  final int durationMonths;
  final String? durationLabel;
  final double finalPrice;
  final double savingsAmount;
  final bool autoRenew;
  final DateTime? startDate;
  final DateTime? expiryDate;
  final String? nombaReference;

  const SellerSubscription({
    required this.id,
    this.planId = '',
    this.planName = '',
    this.status = 'pending_payment',
    this.durationMonths = 1,
    this.durationLabel,
    this.finalPrice = 0,
    this.savingsAmount = 0,
    this.autoRenew = true,
    this.startDate,
    this.expiryDate,
    this.nombaReference,
  });

  bool get active {
    if (status != 'active') return false;
    final expiry = expiryDate;
    return expiry == null || expiry.isAfter(DateTime.now());
  }
}
```

### 4.5 Subscription listener

The dashboard currently reads subscriptions where userId equals the seller UID:

```dart
Stream<List<SellerSubscription>> watchSubscriptions(
  String sellerUid,
) {
  return FirebaseFirestore.instance
      .collection('subscriptions')
      .where('userId', isEqualTo: sellerUid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(
              (doc) => SellerSubscription.fromFirestore(
                doc.id,
                doc.data(),
              ),
            )
            .toList(),
      );
}
```

Sort by createdAt or expiryDate in a repository/controller. If Firestore rules do not allow this query, add a protected seller subscription endpoint.

## 5. Subscription checkout API

### 5.1 Initialize checkout

```http
POST /api/premium/subscription-checkout
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "planId": "pro_lite",
  "planName": "Pro Business Lite",
  "durationMonths": 3,
  "durationLabel": "3 Months",
  "monthlyBasePrice": 4999,
  "basePrice": 14997,
  "finalPrice": 13497,
  "discount": 0.1,
  "discountPercentage": 10,
  "savingsAmount": 1500,
  "autoRenew": true,
  "userId": "SELLER_UID",
  "userEmail": "seller@example.com",
  "returnUrl": "sellonwhatsapp://payment/subscription",
  "metadata": {
    "isSubscription": true,
    "planType": "pro_lite",
    "durationMonths": 3
  }
}
```

The current backend returns:

```json
{
  "success": true,
  "checkoutLink": "https://checkout.example.com/...",
  "reference": "SUB_PRO_LITE_SELLER_UID_...",
  "amount": 13497,
  "planName": "Pro Business Lite",
  "duration": "3 Months",
  "savings": 1500
}
```

The exact return URL accepted by the backend must be verified for mobile. If the backend only accepts an HTTP return URL, route the user to a web success page and then return to Flutter through a universal link or app link.

The server currently also stores a pending subscription record before the checkout is opened. Its important fields are `userId`, `planId`, `planName`, `durationMonths`, `basePrice`, `finalPrice`, `discount`, `savingsAmount`, `autoRenew`, `status: "pending_payment"`, `nombaReference`, `createdAt`, and a tentative expiry date. Flutter should treat this as Processing until the status endpoint or an authenticated subscription listener confirms activation.

Important implementation note: the current route accepts some pricing fields from the request body for compatibility with the web client. Flutter must not use this to alter prices or grant access. The backend should derive the plan price, duration discount, and final amount from `planId` and `durationMonths`; until that hardening is deployed, keep the Flutter plan table synchronized with the web plan table and show the server response amount.

### 5.2 Flutter repository method

```dart
Future<Map<String, dynamic>> startSubscriptionCheckout({
  required String planId,
  required String planName,
  required int durationMonths,
  required String durationLabel,
  required double monthlyBasePrice,
  required double basePrice,
  required double finalPrice,
  required double discount,
  required double savingsAmount,
  required bool autoRenew,
  required String returnUrl,
}) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) throw ApiException(401, 'Sign in again');

  final result = await apiClient.request(
    'POST',
    '/api/premium/subscription-checkout',
    body: {
      'planId': planId,
      'planName': planName,
      'durationMonths': durationMonths,
      'durationLabel': durationLabel,
      'monthlyBasePrice': monthlyBasePrice,
      'basePrice': basePrice,
      'finalPrice': finalPrice,
      'discount': discount,
      'discountPercentage': (discount * 100).round(),
      'savingsAmount': savingsAmount,
      'autoRenew': autoRenew,
      'userId': user.uid,
      'userEmail': user.email,
      'returnUrl': returnUrl,
      'metadata': {
        'isSubscription': true,
        'planType': planId,
        'durationMonths': durationMonths,
        'userId': user.uid,
      },
    },
  );

  return Map<String, dynamic>.from(result as Map);
}
```

The server verifies userId against the Firebase token. In a future API revision, userId should be derived entirely from the token rather than accepted in the body.

## 6. Subscription payment verification

The subscription status route is:

```http
GET /api/subscription/{reference}
```

The current web success page polls approximately every two seconds for a limited number of attempts. Flutter should use a bounded polling controller:

```dart
Future<SellerSubscription> pollSubscription(
  String reference,
) async {
  for (var attempt = 0; attempt < 15; attempt++) {
    final result = await apiClient.request(
      'GET',
      '/api/subscription/' + reference,
      authenticated: false,
    );

    final map = Map<String, dynamic>.from(result as Map);
    final raw = map['subscription'] ?? map['data'] ?? map;
    final status = raw is Map
        ? raw['status']?.toString().toLowerCase()
        : null;

    if (status == 'active') {
      return SellerSubscription.fromJson(
        Map<String, dynamic>.from(raw as Map),
      );
    }

    if (status == 'failed') {
      throw ApiException(400, 'Subscription payment failed');
    }

    await Future<void>.delayed(const Duration(seconds: 2));
  }

  throw ApiException(
    408,
    'Payment is still processing. Check your subscription status again.',
  );
}
```

Use authenticated verification if the deployed status endpoint requires it. The current web route is public by reference, so references must be treated as sensitive and not logged or exposed unnecessarily.

The status route may perform just-in-time Nomba verification when the subscription is still pending. When payment is confirmed, it activates the subscription and synchronizes seller feature flags and store fields such as `subscriptionPlan`, `isPartner` where applicable, and expiry information. Therefore, after a successful response, refresh both the subscription state and the seller store state.

On timeout:

- Do not create another checkout automatically.
- Show “Still processing”.
- Refresh the subscription listener.
- Offer Check Again and Return to Dashboard.
- Tell the seller that webhook processing may take one or two minutes.

## 7. Store Boost

### 7.1 Boost packages

The current seller UI uses these package IDs and daily base prices:

```text
Micro Boost
  Plan ID: micro
  NGN 999 per day
  Trending Stores
  15% search ranking boost
  Basic analytics

Pro Boost
  Plan ID: pro
  NGN 4,999 per day
  Nearby buyer push within 5 km
  WhatsApp broadcast to opted-in buyers
  Category priority
  Advanced conversion analytics

Max Boost
  Plan ID: max
  NGN 14,999 per day
  Homepage hero banner
  Editor's Picks newsletter
  Social media shoutout
  A/B testing
  Success manager chat
```

Current optional add-ons:

```text
Geo targeting       + NGN 1,500
Category priority   + NGN 1,000
Boost insurance     + NGN 500
```

Current duration choices are:

```text
1 day   0% discount
3 days  10% discount
7 days  17% discount
14 days 25% discount
```

Final boost price:

```text
daily base price * duration days * (1 - duration discount)
  + selected add-ons
```

The current web UI calculates this total and rounds the result to the nearest naira. The server must still validate the package, duration, add-ons, and final charge. The Store Boost payment itself does not waive seller commission; it only creates a temporary store sponsorship/visibility entitlement after confirmed payment.

### 7.2 Boost UI

```text
Store Boost screen
  Active boost card
    Package
    Status
    Start date
    Expiry date
    Countdown
    Views
    Clicks
    Conversions

Package selector
  Micro
  Pro
  Max

Add-ons
  Geo targeting
  Category priority
  Boost insurance

Order summary
  Package price
  Add-ons
  Total
  Secure checkout button

States
  Inactive
  Pending payment
  Active
  Expiring soon
  Expired
  Failed
```

The active boost card should refresh the countdown once per minute or when the screen resumes.

### 7.3 Boost model

```dart
class StoreBoost {
  final String id;
  final String tier;
  final String packageName;
  final String status;
  final double totalAmount;
  final int durationDays;
  final String? durationLabel;
  final DateTime? startDate;
  final DateTime? expiryDate;
  final int views;
  final int clicks;
  final int conversions;
  final String? nombaReference;

  const StoreBoost({
    required this.id,
    this.tier = '',
    this.packageName = '',
    this.status = 'pending_payment',
    this.totalAmount = 0,
    this.durationDays = 1,
    this.durationLabel,
    this.startDate,
    this.expiryDate,
    this.views = 0,
    this.clicks = 0,
    this.conversions = 0,
    this.nombaReference,
  });

  bool get active {
    final value = status.toLowerCase();
    return ['active', 'success', 'completed', 'paid', 'verified', 'approved']
        .contains(value);
  }

  bool get expired {
    final expiry = expiryDate;
    return expiry != null && expiry.isBefore(DateTime.now());
  }
}
```

### 7.4 Boost listener

```dart
Stream<List<StoreBoost>> watchBoosts(String sellerUid) {
  return FirebaseFirestore.instance
      .collection('boosts')
      .where('storeId', isEqualTo: sellerUid)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(
              (doc) => StoreBoost.fromFirestore(
                doc.id,
                doc.data(),
              ),
            )
            .toList(),
      );
}
```

Select the active boost first, then pending boost. If an active boost is expired, show Renew instead of Active.

## 8. Boost checkout API

### 8.1 Initialize boost checkout

```http
POST /api/premium/boost-checkout
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "planId": "micro",
  "planName": "Micro Boost",
  "price": 999,
  "finalPrice": 999,
  "durationDays": 1,
  "durationLabel": "1 day",
  "storeId": "SELLER_UID",
  "userId": "SELLER_UID",
  "storeName": "My Store"
}
```

The current backend:

- Resolves the seller from the Firebase token.
- Requires the store ID to match the authenticated UID.
- Creates a pending boosts record.
- Creates a platform Nomba checkout.
- Returns checkoutUrl and orderReference.

The server stores a pending `boosts/{orderReference}` record containing `packageName`, `tier`, `totalAmount`, `durationDays`, `durationLabel`, `storeId`, `userId`, `storeName`, `nombaReference`, `paymentProvider`, `paymentStatus`, and timestamps.

Important implementation note: the current route accepts price fields for web-client compatibility. Do not allow a Flutter user to edit the amount. The backend should derive the amount from the selected package, duration, and add-ons before creating the Nomba order.

Response:

```json
{
  "success": true,
  "checkoutUrl": "https://checkout.example.com/...",
  "orderReference": "ZEBBLE_BST_..."
}
```

Flutter method:

```dart
Future<Map<String, dynamic>> startBoostCheckout({
  required String planId,
  required String planName,
  required double price,
  required double finalPrice,
  required double durationDays,
  required String durationLabel,
  required String storeName,
}) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) throw ApiException(401, 'Sign in again');

  final result = await apiClient.request(
    'POST',
    '/api/premium/boost-checkout',
    body: {
      'planId': planId,
      'planName': planName,
      'price': price,
      'finalPrice': finalPrice,
      'durationDays': durationDays,
      'durationLabel': durationLabel,
      'storeId': user.uid,
      'userId': user.uid,
      'storeName': storeName,
    },
  );

  return Map<String, dynamic>.from(result as Map);
}
```

### 8.2 Boost status

The status route is:

```http
GET /api/boost-store/{reference}
Authorization: Bearer FIREBASE_ID_TOKEN
```

The route verifies the reference belongs to the authenticated seller and may return the boost under:

```json
{
  "success": true,
  "status": "active",
  "packageName": "Pro Boost",
  "boost": {},
  "data": {}
}
```

Flutter should accept the boost, data, or flattened response shape during the current compatibility period, then normalize it into StoreBoost.

Poll using a bounded timer. Do not poll forever and do not treat the checkout callback alone as activation.

## 9. Marketplace Partner

### 9.1 Partner benefits

The current Partner tab presents:

```text
Seller commission waived
  The normal seller commission is 1.5% of eligible product value.
  Partner seller commission: 0%
  Buyer platform and shipping charges remain separate checkout amounts.

Partner badge
Higher marketplace visibility
Priority support
Advanced analytics
Boost discounts
```

The Partner tab calculates savings:

```text
standard seller commission = monthly sales * 0.015
partner seller commission = monthly sales * 0
monthly savings = standard seller commission - partner seller commission
```

This is an estimate for UI only. The server is authoritative for actual fees.

### 9.2 Partner state

The current UI checks:

```text
stores/{sellerUid}.isPartner == true
OR
stores/{sellerUid}.subscriptionPlan == pro_max
OR
subscriptionPlan contains max
```

Expiry fallback:

```text
stores/{sellerUid}.partnerExpiry
or
stores/{sellerUid}.subscriptionExpiry
```

Normalize this in Flutter:

```dart
class MarketplacePartner {
  final bool active;
  final DateTime? expiryDate;
  final String? plan;
  final double monthlySales;

  const MarketplacePartner({
    this.active = false,
    this.expiryDate,
    this.plan,
    this.monthlySales = 0,
  });

  bool get currentlyActive {
    if (!active) return false;
    final expiry = expiryDate;
    return expiry == null || expiry.isAfter(DateTime.now());
  }

  double get standardFees => monthlySales * 0.03;
  double get partnerFees => monthlySales * 0.015;
  double get monthlySavings => standardFees - partnerFees;
}
```

### 9.3 Partner UI

```text
Partner screen
  Active partner banner or Become a Partner banner
  Expiry date
  Partner benefits grid
  Monthly sales input or calculated sales
  Standard seller fee comparison
  Partner fee comparison
  Estimated savings
  How it works
  Subscribe / Manage subscription
```

If the partner is active, show Manage Subscription and expiry. If inactive, show Get Started and the 30-day partner price.

### 9.4 Partner subscription API

```http
POST /api/partner/subscribe
Authorization: Bearer FIREBASE_ID_TOKEN
```

The current route uses a fixed NGN 10,000 monthly amount and creates a Nomba parent checkout. It returns:

```json
{
  "checkoutUrl": "https://checkout.example.com/..."
}
```

Flutter method:

```dart
Future<String> startPartnerCheckout() async {
  final result = await apiClient.request(
    'POST',
    '/api/partner/subscribe',
  );

  final url = result['checkoutUrl']?.toString();
  if (url == null || url.isEmpty) {
    throw ApiException(500, 'Partner checkout URL was not returned');
  }
  return url;
}
```

The route actually creates a one-time 30-day checkout reference, not an automatically recurring subscription. It creates a reference in the form `PARTNER_{storeId}_{timestamp}` and includes `partner_subscription` metadata with `storeId`, `userId`, and `durationDays: "30"`. The deployed webhook verifies the payment and updates `stores/{storeId}` with `isPartner: true`, `partnerExpiry`, `partnerPlan: "marketplace-pro"`, and `lastPartnerPaymentAt`.

### 9.5 Partner verification

The current Partner tab reads stores/{sellerUid} for status, and there is no separate Flutter-facing partner status endpoint in the current route inventory.

After checkout:

1. Open checkoutUrl.
2. Return to Flutter or a web callback.
3. Refresh stores/{sellerUid}.
4. Look for isPartner, subscriptionPlan, partnerExpiry, or subscriptionExpiry.
5. If not updated, show Processing and retry.
6. Do not display Active just because checkoutUrl opened or returned successfully.

Before mobile production release, add a protected partner status endpoint or ensure Firestore rules safely expose the seller's own partner fields.

Because there is no separate partner status endpoint in the current API, Flutter should refresh the authenticated seller's own store document after checkout and on app resume. If the store has not changed after bounded retries, show Processing rather than Active.

## 10. External checkout in Flutter

Use url_launcher:

```dart
Future<void> openCheckout(String checkoutUrl) async {
  final uri = Uri.parse(checkoutUrl);
  final opened = await launchUrl(
    uri,
    mode: LaunchMode.externalApplication,
  );

  if (!opened) {
    throw ApiException(500, 'Could not open secure checkout');
  }
}
```

Recommended mobile flow:

```text
Seller taps Subscribe / Boost / Partner
  -> Validate selected plan
  -> Call protected checkout API
  -> Receive checkout URL and reference
  -> Open external Nomba checkout
  -> Return through deep link or success page
  -> Poll or refresh server status
  -> Show active, failed, or processing result
```

Configure Android App Links and iOS Universal Links or a custom scheme only after the backend return URL contract supports it. Do not place a secret in a deep link.

## 11. Payment result screen

Create a reusable PaymentResultScreen with:

```text
Verifying payment
  Spinner
  Reference preview
  “Do not close the app” message

Success
  Green confirmation
  Product name
  Expiry date
  Go to dashboard

Failed
  Reason
  Retry checkout
  Contact support

Processing timeout
  Payment may still be confirmed
  Check again
  Go to dashboard
```

Never make the success screen itself activate the subscription or boost. The server webhook and verification route do that.

## 12. Subscription and boost status rules

Subscription is active only when:

```text
status == active
and expiryDate is absent or in the future
```

Boost is active only when:

```text
status is active, success, completed, paid, verified, or approved
and expiryDate is absent or in the future
```

Partner is active only when:

```text
isPartner == true
or an approved max subscription maps to partner access
and the partner expiry is absent or in the future
```

Handle these states:

```text
pending_payment
active
expiring_soon
expired
failed
cancelled
processing
```

The server may return a status not yet known by Flutter. Show a neutral Processing state instead of assuming failure.

## 13. Notifications and entitlement refresh

After a successful payment:

- Refresh the subscription, boost, or store listener.
- Refresh notifications.
- Refresh dashboard product limits and premium feature locks.
- Refresh partner and fee calculations.
- Show the new entitlement only after the server confirms it.

Relevant notification types may include:

```text
subscription_active
subscription_failed
boost_active
boost_failed
partner_active
partner_expiring
payment_processing
```

Use the notification implementation in FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

## 14. Security and payment requirements

- The server validates plan IDs and should derive prices from the selected plan and duration.
- The server validates seller/store ownership.
- The server verifies Nomba payment status.
- Flutter never calls Nomba directly.
- Flutter never changes subscription or boost status directly.
- Flutter never writes partner flags directly.
- Use a bounded polling interval.
- Cancel timers when the screen is disposed.
- Do not log full checkout URLs or private references in production logs.
- Treat unknown callback results as Processing.
- Do not create duplicate checkouts after a timeout without checking the existing reference.
- Require authentication before opening seller growth screens.
- Use server-side idempotency for checkout initialization where supported.
- Do not mark a payment active from the browser redirect.
- Do not add `NOMBA_PROCESSING_FEE_RATE` or `NOMBA_PROCESSING_FEE_CAP` to the Flutter app; those are server-only reconciliation settings.
- When the server returns Processing, keep the bounded status poll and refresh the entitlement instead of creating another checkout.

## 15. API checklist

Verify these routes in the deployed environment:

```text
POST /api/premium/subscription-checkout
GET  /api/subscription/{reference}

POST /api/premium/boost-checkout
GET  /api/boost-store/{reference}

POST /api/partner/subscribe
GET  /api/notifications
PATCH /api/notifications/{id}/read
```

Before release, confirm:

- Mobile return URLs are accepted.
- Checkout URLs open correctly on Android and iOS.
- Subscription status can be verified after redirect.
- Boost status is owner-protected.
- Partner state is safely readable after payment.
- Webhooks update records consistently.
- Development mock mode cannot be enabled in production.
- Prices and entitlements are server-authoritative.
- Failed payments do not grant access.
- Expired products correctly remove premium access.

## 16. Implementation order

1. Create shared growth models and repositories.
2. Build the subscription screen and plan cards.
3. Add subscription checkout and status polling.
4. Build Store Boost packages, add-ons, and active boost card.
5. Add boost checkout and status verification.
6. Build Partner benefits and savings UI.
7. Add Partner checkout and store-state refresh.
8. Add external checkout and deep-link handling.
9. Add payment result states and cancellation-safe polling.
10. Refresh notifications, dashboard metrics, and entitlement locks.
11. Test successful, failed, cancelled, delayed, duplicate, and expired payments.
