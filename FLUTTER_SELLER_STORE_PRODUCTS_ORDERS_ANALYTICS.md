# Flutter Seller Store, Products, Orders, Shipping, and Analytics

This guide implements the seller-facing Flutter screens for:

- My Store
- Products
- Orders
- Shipping
- Analytics

It maps the current SellOnWhatsApp seller dashboard data sources, UI behavior, and API usage. Use this guide with FLUTTER_SELLER_DASHBOARD.md and the shared ApiClient from FLUTTER_API_INTEGRATION.md.

## 1. Dependencies and structure

Add these packages:

```yaml
dependencies:
  flutter:
    sdk: flutter
  firebase_auth: ^latest
  cloud_firestore: ^latest
  firebase_core: ^latest
  http: ^latest
  image_picker: ^latest
  intl: ^latest
  fl_chart: ^latest
  async: ^latest
```

Recommended files:

```text
lib/features/seller/
  seller_shell.dart
  store/
    my_store_screen.dart
    store_repository.dart
    store_model.dart
  products/
    products_screen.dart
    product_model.dart
    product_repository.dart
    add_product_screen.dart
    product_card.dart
  orders/
    seller_orders_screen.dart
    seller_order_details_screen.dart
    seller_order_repository.dart
  shipping/
    shipping_screen.dart
    shipping_repository.dart
  analytics/
    analytics_screen.dart
    analytics_repository.dart
    analytics_models.dart
```

All protected API calls must use a current Firebase ID token. Firestore listeners must be restricted by Firestore security rules.

## 2. Seller shell

Seller navigation should contain:

```text
Overview
My Store
Products
Orders
Shipping
Analytics
Chat Support
Notifications
Payouts
Withdraw
Settings
```

Keep the AppBar notification and chat badges shared with the implementations in FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

Before opening this shell, verify that the authenticated account is a seller/vendor. A client-side role check improves UX; server and Firestore rules provide the actual protection.

## 3. My Store screen

### 3.1 Store document

The current web dashboard reads and updates:

```text
stores/{sellerUid}
  storeName
  username
  description
  mainCategory
  subCategory
  state
  lga
  latitude
  longitude
  phone
  address
  email
  bannerUrl
  logoUrl
  socials
    instagram
    facebook
    twitter
    youtube
    tiktok
  verificationStatus
  followerCount
  productCount
  totalSales
  escrowBalance
  availableBalance
  storeHours
  notifications
  updatedAt
```

The mobile screen should use sellerUid from FirebaseAuth.currentUser.uid. Do not let the user edit a different store ID.

### 3.2 My Store UI

Use a scrollable screen:

```text
Store header
  Banner image
  Store logo
  Store name
  Username and public URL
  Verification status
  Profile completion percentage

Store profile
  Store name
  Username
  Description
  Main category
  Subcategory
  Phone
  Email
  Address
  State
  LGA
  Map coordinates

Social links
  Instagram
  Facebook
  X/Twitter
  YouTube
  TikTok

Actions
  Edit
  Save
  Preview store
  Share store
  Verification
  Boost store
```

The web implementation calculates profile completion from store name, banner, logo, description, location, phone, category, coordinates, and at least one social link. Reuse that checklist in Flutter.

### 3.3 Store model

```dart
class SellerStore {
  final String id;
  final String storeName;
  final String username;
  final String description;
  final String mainCategory;
  final String subCategory;
  final String state;
  final String lga;
  final String phone;
  final String address;
  final String email;
  final String? logoUrl;
  final String? bannerUrl;
  final Map<String, String> socials;
  final String verificationStatus;
  final int followerCount;
  final int productCount;

  const SellerStore({
    required this.id,
    this.storeName = '',
    this.username = '',
    this.description = '',
    this.mainCategory = '',
    this.subCategory = '',
    this.state = '',
    this.lga = '',
    this.phone = '',
    this.address = '',
    this.email = '',
    this.logoUrl,
    this.bannerUrl,
    this.socials = const {},
    this.verificationStatus = 'none',
    this.followerCount = 0,
    this.productCount = 0,
  });

  factory SellerStore.fromFirestore(
    String id,
    Map<String, dynamic> data,
  ) {
    final rawSocials = data['socials'];
    final socials = rawSocials is Map
        ? rawSocials.map(
            (key, value) => MapEntry(
              key.toString(),
              value?.toString() ?? '',
            ),
          )
        : <String, String>{};

    return SellerStore(
      id: id,
      storeName: data['storeName']?.toString() ?? '',
      username: data['username']?.toString() ?? '',
      description: data['description']?.toString() ?? '',
      mainCategory: data['mainCategory']?.toString() ?? '',
      subCategory: data['subCategory']?.toString() ?? '',
      state: data['state']?.toString() ?? '',
      lga: data['lga']?.toString() ?? '',
      phone: data['phone']?.toString() ?? '',
      address: data['address']?.toString() ?? '',
      email: data['email']?.toString() ?? '',
      logoUrl: data['logoUrl']?.toString(),
      bannerUrl: data['bannerUrl']?.toString(),
      socials: socials,
      verificationStatus: data['verificationStatus']?.toString() ?? 'none',
      followerCount: (data['followerCount'] as num?)?.toInt() ?? 0,
      productCount: (data['productCount'] as num?)?.toInt() ?? 0,
    );
  }
}
```

### 3.4 Store listener and save

```dart
Stream<DocumentSnapshot<Map<String, dynamic>>> watchStore(
  String sellerUid,
) {
  return FirebaseFirestore.instance
      .collection('stores')
      .doc(sellerUid)
      .snapshots();
}

Future<void> saveStore(
  String sellerUid,
  Map<String, dynamic> values,
) {
  return FirebaseFirestore.instance
      .collection('stores')
      .doc(sellerUid)
      .set(
        {
          ...values,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
}
```

If the deployed rules do not allow direct seller profile writes, expose a protected seller store API and use that API instead.

### 3.5 Username changes

The web implementation uses a usernames collection to reserve usernames:

```text
usernames/{username}
  uid
  createdAt
```

When changing the username:

1. Normalize to lowercase.
2. Validate allowed characters.
3. Check whether usernames/{newUsername} exists.
4. Reject if it belongs to another user.
5. Reserve the new username.
6. Update stores/{uid}.username.
7. Delete the old reservation only after the new one succeeds.

This should preferably be moved into a server transaction because two devices can otherwise reserve the same username simultaneously.

### 3.6 Store images

The web UI uploads banner and logo images to Cloudinary and saves returned secure URLs. For Flutter:

1. Pick and compress the image.
2. Upload through the project-approved upload endpoint.
3. Save only the returned HTTPS URL.
4. Keep the previous URL if the new upload fails.
5. Show upload progress.

Never ship a signed Cloudinary secret in the mobile app.

### 3.7 Store verification

The web store verification flow stores a request under:

```text
store_verifications/{sellerUid}
  cacNumber
  cacFile
  whatsappNumber
  bankName
  accountNumber
  accountName
  idType
  idFile
  businessAddress
  status
  createdAt
```

The Flutter app should present verification as a multi-step form:

```text
Business information
  CAC number
  WhatsApp number
  Business address

Identity
  ID type
  ID document

Payout identity
  Bank name
  Account number
  Account name

Review
  Uploaded documents
  Submit for review
```

Document uploads should use a secure server or storage flow. Do not allow clients to change verificationStatus to approved.

## 4. Products screen

### 4.1 Product list

The current web Products tab:

- Reads products where storeId equals the seller UID.
- Orders by createdAt descending.
- Supports search by product name.
- Shows product image, type, availability, and stock.
- Opens Add Product for new listings.
- Opens edit mode for an existing product.
- Supports share.
- Requires confirmation before deletion.
- Allows stock availability toggling.

Flutter layout:

```text
AppBar
  Products
  Add button

Search field
  Search inventory

Product grid or list
  Image
  Name
  Product type
  Price
  Stock or availability
  Edit
  Share
  More menu

More menu
  Edit
  Toggle availability
  Share
  Delete

Empty state
  Add your first product
```

### 4.2 Product listener

```dart
Stream<List<Map<String, dynamic>>> watchProducts(
  String sellerUid,
) {
  return FirebaseFirestore.instance
      .collection('products')
      .where('storeId', isEqualTo: sellerUid)
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((doc) => <String, dynamic>{
                  'id': doc.id,
                  ...doc.data(),
                })
            .toList(),
      );
}
```

If this query is denied, use a protected seller products endpoint. Do not remove the owner filter.

### 4.3 Availability logic

The current web behavior treats product types differently:

```text
Physical
  stockCount <= 0 or availability == out_of_stock
  -> Sold Out

Booking
  no available quantity
  -> No Slots

Service
  availability == out_of_stock
  -> Fully Committed

Utility
  availability == out_of_stock
  -> Fully Committed
```

Toggling availability updates:

```json
{
  "availability": "in_stock",
  "stockCount": 10,
  "stock": 10,
  "updatedAt": "server timestamp"
}
```

Do not use a hard-coded stock of 10 for business-critical inventory. Prefer a stock editor that asks the seller for the desired quantity and use a protected API for inventory changes.

### 4.4 Product delete

The web UI deletes the product and decrements stores/{uid}.productCount. For mobile, use a protected delete API so the product and store count are updated atomically.

If the existing endpoint supports it:

```http
DELETE /api/products/{productId}
Authorization: Bearer FIREBASE_ID_TOKEN
```

Before deleting:

1. Show the product name.
2. Explain that the listing will be removed.
3. Confirm the action.
4. Disable duplicate taps.
5. Refresh the list after server success.

Do not decrement productCount locally before the server confirms deletion.

### 4.5 Add and edit product

Use the full-screen Add Product implementation in FLUTTER_SELLER_DASHBOARD.md. The mobile form must support:

- Physical
- Service
- Booking
- Utility
- Images
- Pricing
- Categories
- Features
- Variants
- Stock
- Shipping dimensions
- Delivery type
- Service fulfillment method
- Booking capacity and location
- Utility billing metric

The form should call the protected product API where possible:

```http
POST /api/products
```

Current body shape:

```json
{
  "userId": "CURRENT_SELLER_UID",
  "productPayload": {
    "name": "Product name",
    "description": "Description",
    "price": 10000,
    "storeId": "CURRENT_SELLER_UID",
    "productType": "physical"
  }
}
```

The current web modal writes directly to Firestore while this API expects a userId/productPayload wrapper. Standardize this contract before production Flutter release so product count, owner fields, and referral sync are consistent.

## 5. Orders screen

### 5.1 Order ownership

The web dashboard listens to both:

```text
orders where storeId == sellerUid
orders where vendorId == sellerUid
```

Merge records by order document ID. This supports older and newer order records without duplicates.

```dart
Stream<List<DocumentSnapshot<Map<String, dynamic>>>> watchSellerOrders(
  String sellerUid,
) {
  final store = FirebaseFirestore.instance
      .collection('orders')
      .where('storeId', isEqualTo: sellerUid)
      .snapshots();

  final vendor = FirebaseFirestore.instance
      .collection('orders')
      .where('vendorId', isEqualTo: sellerUid)
      .snapshots();

  return combineAndDeduplicateOrderStreams(store, vendor);
}
```

Implement combineAndDeduplicateOrderStreams in a repository/controller so the widget stays focused on rendering.

### 5.2 Order UI

```text
Orders
  Search order ID, customer, amount, tracking ID

Filters
  All
  Escrow
  In Progress
  Completed
  Disputes

Order card
  Order ID
  Customer
  Amount
  Order type
  Status
  Tracking ID
  Created date
  Dispute badge
  Open chat

Order detail
  Items
  Buyer details
  Shipping details
  Escrow state
  Dispute thread
  Ship order
  Mark work completed
  Mark order completed
```

Normalize statuses for display:

```text
PAID, HELD, PAID_HELD
  -> Escrow

SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY
  -> In Progress

WORK_DONE, COMPLETED_PENDING_BUYER
  -> Work Done

COMPLETED, DELIVERED
  -> Completed

Open dispute
  -> Disputed
```

Keep the raw status in the model because API actions depend on server state.

### 5.3 Order actions

Ship:

```http
POST /api/orders/ship
```

Body:

```json
{
  "orderId": "ORDER_ID",
  "trackingId": "TRACKING_NUMBER",
  "carrier": "COURIER"
}
```

Complete:

```http
POST /api/orders/complete
```

Body:

```json
{
  "orderId": "ORDER_ID"
}
```

Open a buyer chat:

```http
POST /api/chats
```

Body:

```json
{
  "participantId": "BUYER_ID",
  "participantRole": "buyer",
  "subject": "Order ORDER_ID"
}
```

Respond to a dispute:

```http
POST /api/disputes/{disputeId}/actions
```

Body:

```json
{
  "action": "respond",
  "content": "Seller response"
}
```

The server verifies seller ownership. Flutter must not change escrow, payout, or completed status by direct Firestore writes.

## 6. Shipping screen

### 6.1 Data sources

The current seller Shipping tab combines:

```text
orders where storeId == sellerUid
orders where vendorId == sellerUid
shipments where storeId == sellerUid
```

A shipment is matched to an order by orderId.

Non-physical service, booking, and utility orders are hidden from the shipment queue when no shipment exists.

### 6.2 Shipping UI

```text
Hero summary
  Active shipments
  Delivered
  Shipping fees

Search
  Buyer, order, courier, item

Filters
  All statuses
  Ready for fulfilment
  Awaiting pickup
  In transit
  Delivered

Shipment card
  Buyer
  Order ID
  Courier
  Status
  Tracking ID

Shipment detail
  Pickup address
  Delivery address
  Courier
  Delivery fee
  Items
  Tracking reference
  Shipment journey
  Dispatch error
```

Display statuses:

```text
pending_payment
paid_held
pending_pickup
awaiting_pickup
preparing
shipped
out_for_delivery
completed
cancelled
self_arranged
```

### 6.3 Shipping actions

Use the order ship endpoint for manual seller handoff:

```http
POST /api/orders/ship
```

For courier dispatch features, the available routes are:

```http
POST /api/shipping/calculate
POST /api/shipping/dispatch
```

Confirm the deployed request bodies before wiring courier actions because courier providers may require provider-specific fields.

A dispatch action should show:

- Courier selection
- Pickup address
- Delivery address
- Package dimensions
- Shipping cost
- Confirmation
- Provider loading state
- Dispatch reference
- Provider error and retry state

Do not mark a shipment dispatched locally before the server returns success.

## 7. Analytics screen

### 7.1 Analytics source

The current seller Analytics tab reads:

```text
analytics where storeId == sellerUid
timestamp within selected date range
```

It also uses:

```http
POST /api/vendor/analytics/orders
```

to load customer details for up to 100 filtered order IDs. The endpoint verifies that the requested orders belong to the authenticated seller.

### 7.2 Analytics UI

```text
Time range
  7 days
  1 month
  6 months
  1 year

Metric cards
  Views
  Clicks
  Buy Now
  WhatsApp clicks
  Add to Cart
  Conversion rate
  Revenue

Charts
  Sales by period
  Customer engagement
  Escrow status
  Traffic source

Tables
  Top products
  Recent orders
  Customer details
```

Premium metrics should be visually locked when the seller subscription does not include them.

### 7.3 Event metrics

Count these event types:

```text
view
click
buy_now_click
whatsapp_click
add_to_cart_click
```

Conversion:

```text
buy_now_click / view * 100
```

Sales revenue is calculated from paid orders in the selected date range. Use the seller orders already loaded and filter by createdAt.

Escrow chart grouping:

```text
PAID_HELD, SHIPPED, DISPUTED
  -> locked

COMPLETED
  -> released

PENDING
  -> pending
```

### 7.4 Bounded Firestore query

```dart
Future<List<Map<String, dynamic>>> loadAnalytics({
  required String sellerUid,
  required DateTime start,
  required DateTime end,
}) async {
  final snapshot = await FirebaseFirestore.instance
      .collection('analytics')
      .where('storeId', isEqualTo: sellerUid)
      .where(
        'timestamp',
        isGreaterThanOrEqualTo: Timestamp.fromDate(start),
      )
      .where(
        'timestamp',
        isLessThanOrEqualTo: Timestamp.fromDate(end),
      )
      .get();

  return snapshot.docs
      .map((doc) => <String, dynamic>{
            'id': doc.id,
            ...doc.data(),
          })
      .toList();
}
```

Do not download the entire analytics collection. Add indexes suggested by Firebase.

### 7.5 Customer details API

```dart
Future<Map<String, dynamic>> loadCustomerDetails(
  ApiClient apiClient,
  List<String> orderIds,
) async {
  final result = await apiClient.request(
    'POST',
    '/api/vendor/analytics/orders',
    body: {
      'orderIds': orderIds.take(100).toList(),
    },
  );

  return Map<String, dynamic>.from(
    result['customers'] as Map? ?? const {},
  );
}
```

The endpoint returns customer name, email, and phone only for orders owned by the authenticated seller.

## 8. Loading, errors, and offline behavior

My Store:

- Show skeleton while the store loads.
- Preserve unsaved edits on network failure.
- Show upload progress.
- Warn before leaving with unsaved changes.

Products:

- Show loading inventory.
- Show empty inventory.
- Show search no-results.
- Confirm deletion.
- Refresh after create, edit, delete, or stock change.

Orders:

- Wait for both owner streams.
- Deduplicate by order ID.
- Show permission errors.
- Keep cached orders with a stale indicator.
- Disable action buttons while API requests run.

Shipping:

- Continue showing order data if shipment details are unavailable.
- Show dispatch errors separately from order status.
- Never silently convert a failed dispatch into a shipped state.

Analytics:

- Use bounded date ranges.
- Show an empty chart when there are no events.
- Show index/permission errors with Retry.
- Display a last-updated timestamp.

## 9. Security and indexes

Required ownership rules:

- Seller reads only products where storeId equals request.auth.uid.
- Seller reads only orders where storeId or vendorId equals request.auth.uid.
- Seller reads only shipments for owned orders/storeId.
- Seller reads analytics only for the matching storeId.
- Seller cannot write balances, escrow, payout status, or settlement fields.
- Seller cannot change verificationStatus to approved.
- Product delete and inventory writes should be server-authorized.

Likely indexes:

```text
products:
  storeId ascending
  createdAt descending

analytics:
  storeId ascending
  timestamp ascending

orders:
  storeId ascending

orders:
  vendorId ascending

shipments:
  storeId ascending
```

Use the index URL generated by Firebase for the deployed project.

## 10. Integration order

1. Build seller role guard and shell.
2. Implement My Store listener and profile form.
3. Implement safe image upload and username reservation.
4. Build Products list and Add Product route.
5. Standardize product API ownership fields.
6. Build merged Orders listener.
7. Add order detail and protected actions.
8. Build Shipping merge and shipment details.
9. Add Analytics bounded query and charts.
10. Add loading, offline, retry, and security-rule tests.


