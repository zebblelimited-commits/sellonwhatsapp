# Flutter Seller Dashboard, Add Product, and Orders

This guide maps the existing SellOnWhatsApp seller dashboard into Flutter. It covers:

- Seller Dashboard Overview
- Add Product modal
- Product type-specific fields
- Product image upload
- Seller Orders screen
- Shipping and completion actions
- Required Firebase and API usage
- Loading, validation, error, and permission states

Use Firebase Authentication for identity and send the Firebase ID token with every protected API request.

This guide complements FLUTTER_API_INTEGRATION.md, FLUTTER_ROLE_SETTINGS.md, and FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

## 1. Flutter dependencies

Add these packages:

```yaml
dependencies:
  flutter:
    sdk: flutter
  firebase_core: ^latest
  firebase_auth: ^latest
  cloud_firestore: ^latest
  http: ^latest
  image_picker: ^latest
  intl: ^latest
  fl_chart: ^latest
  share_plus: ^latest
```

Run:

```bash
flutter pub get
```

Configure Firebase for Android and iOS. The production API base URL must use HTTPS.

## 2. Suggested file structure

```text
lib/
  core/
    api/api_client.dart
    auth/session_manager.dart
    media/image_uploader.dart
    widgets/status_chip.dart
  features/
    seller/
      seller_shell.dart
      dashboard/
        seller_dashboard_screen.dart
        seller_metric_card.dart
        seller_analytics_chart.dart
      products/
        add_product_modal.dart
        product_form_state.dart
        product_repository.dart
        product_models.dart
      orders/
        seller_orders_screen.dart
        seller_order_model.dart
        seller_order_repository.dart
        seller_order_details_screen.dart
        ship_order_dialog.dart
```

Use the shared ApiClient from FLUTTER_API_INTEGRATION.md. Inject it into repositories instead of creating a new HTTP client in every widget.

## 3. Authentication and authorization

Every protected request must include:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
Accept: application/json
```

Example:

```dart
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  throw ApiException(401, 'Seller session expired');
}

final token = await user.getIdToken();
```

Before opening the seller shell, confirm the account has the seller/vendor role. The web application resolves seller access from seller/store/vendor records and redirects buyers away from the seller dashboard.

The Flutter client must not:

- Trust a sellerId sent from a form.
- Let a seller read another seller's products or orders.
- Assign itself a seller role.
- Store Firebase Admin credentials.
- Store Nomba credentials.
- Mark an order completed by directly editing Firestore.

The API and Firestore security rules remain the final authorization layer.

## 4. Seller dashboard overview

### 4.1 Existing dashboard data sources

The existing web seller dashboard reads these sources:

```text
stores/{sellerUid}
  totalSales
  escrowBalance
  availableBalance
  followerCount
  productCount
  store profile fields

products
  where storeId == sellerUid

orders
  where storeId == sellerUid
  where vendorId == sellerUid
  merge results by order ID

analytics
  where storeId == sellerUid
  where eventType == view, click, buy_now_click, add_to_cart_click
  filter by timestamp range

subscriptions
  where userId == sellerUid

payouts
  where vendorId == sellerUid
  where storeId == sellerUid

disputes
  where vendorId == sellerUid

notifications
  where vendorId == sellerUid

support_chats
  where vendorId == sellerUid
```

The web dashboard uses realtime Firestore listeners for most of these records. For Flutter, use Firestore listeners only when the deployed security rules permit the seller query. Otherwise, expose a protected seller dashboard API before release.

### 4.2 Overview layout

Use this mobile layout:

```text
AppBar
  Store logo/name
  Notification bell
  Chat unread badge

Scrollable body
  Store status card
  Total Sales card
  Available Balance card
  Escrow Balance card
  Followers card
  Products card
  Time range selector: 7 days, 1 month, 6 months, 1 year
  Performance chart
  Traffic source summary
  Quick actions
    Add Product
    View Orders
    Open Store
    Share Store
```

The web overview also shows:

- Total Views
- Total Clicks
- Buy Now clicks
- WhatsApp clicks
- Add to Cart clicks
- Conversion rate
- Reviews, likes, and wishlist placeholders

Show premium metrics as locked when the seller plan does not allow them. Do not calculate plan access solely from the Flutter UI; read the subscription state from the server or the seller subscription document.

### 4.3 Overview model

```dart
class SellerOverview {
  final double totalSales;
  final double availableBalance;
  final double escrowBalance;
  final int followers;
  final int products;
  final int views;
  final int clicks;
  final int buyNowClicks;
  final int addToCartClicks;
  final int whatsappClicks;
  final bool analyticsPremium;

  const SellerOverview({
    this.totalSales = 0,
    this.availableBalance = 0,
    this.escrowBalance = 0,
    this.followers = 0,
    this.products = 0,
    this.views = 0,
    this.clicks = 0,
    this.buyNowClicks = 0,
    this.addToCartClicks = 0,
    this.whatsappClicks = 0,
    this.analyticsPremium = false,
  });

  double get conversionRate {
    if (views == 0) return 0;
    return buyNowClicks / views * 100;
  }
}
```

### 4.4 Store and product listeners

```dart
Stream<DocumentSnapshot<Map<String, dynamic>>> watchStore(String sellerUid) {
  return FirebaseFirestore.instance
      .collection('stores')
      .doc(sellerUid)
      .snapshots();
}

Stream<QuerySnapshot<Map<String, dynamic>>> watchProducts(String sellerUid) {
  return FirebaseFirestore.instance
      .collection('products')
      .where('storeId', isEqualTo: sellerUid)
      .snapshots();
}
```

The seller dashboard should treat the store ledger as canonical:

- totalSales comes from stores/{sellerUid}.totalSales
- escrowBalance comes from stores/{sellerUid}.escrowBalance
- availableBalance comes from stores/{sellerUid}.availableBalance

Do not reconstruct the balance by summing client-side order values.

### 4.5 Analytics queries

The current web dashboard counts analytics events by store and event type. A Flutter implementation can use count aggregation where supported:

```dart
Future<int> countAnalytics({
  required String sellerUid,
  required String eventType,
  required DateTime start,
  required DateTime end,
}) async {
  final query = FirebaseFirestore.instance
      .collection('analytics')
      .where('storeId', isEqualTo: sellerUid)
      .where('eventType', isEqualTo: eventType)
      .where(
        'timestamp',
        isGreaterThanOrEqualTo: Timestamp.fromDate(start),
      )
      .where(
        'timestamp',
        isLessThanOrEqualTo: Timestamp.fromDate(end),
      );

  final result = await query.count().get();
  return result.count ?? 0;
}
```

If the Flutter Firebase SDK version does not support count aggregation, use a protected analytics API. Do not download an unbounded analytics collection to the phone.

Calculate:

```text
views          eventType == view
clicks         eventType == click
buyNowClicks   eventType == buy_now_click
addToCart      eventType == add_to_cart_click
whatsappClicks eventType == whatsapp_click
conversion     buyNowClicks / views * 100
```

For the chart, group the returned events by date or request an aggregated server response. Use fl_chart for the mobile line or area chart.

### 4.6 Overview widget example

```dart
class SellerDashboardOverview extends StatelessWidget {
  final SellerOverview overview;
  final VoidCallback onAddProduct;
  final VoidCallback onOrders;

  const SellerDashboardOverview({
    super.key,
    required this.overview,
    required this.onAddProduct,
    required this.onOrders,
  });

  String money(double value) {
    return 'NGN ' + value.toStringAsFixed(2);
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Store overview',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.55,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          children: [
            _metric('Total sales', money(overview.totalSales)),
            _metric('Available balance', money(overview.availableBalance)),
            _metric('Escrow balance', money(overview.escrowBalance)),
            _metric('Followers', overview.followers.toString()),
            _metric('Products', overview.products.toString()),
            _metric('Views', overview.views.toString()),
            _metric('Clicks', overview.clicks.toString()),
            _metric(
              'Conversion',
              overview.conversionRate.toStringAsFixed(1) + '%',
            ),
          ],
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: onAddProduct,
          icon: const Icon(Icons.add_box_outlined),
          label: const Text('Add product'),
        ),
        OutlinedButton.icon(
          onPressed: onOrders,
          icon: const Icon(Icons.receipt_long_outlined),
          label: const Text('View orders'),
        ),
      ],
    );
  }

  Widget _metric(String label, String value) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label),
            const Spacer(),
            Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
```

## 5. Add Product modal

### 5.1 Product types

The existing seller modal supports:

```text
physical
service
booking
utility
```

The product type controls which fields are displayed.

```text
Physical
  Name, description, price, discount price
  Main category, subcategory
  Images, features, variants
  Stock quantity
  State or nationwide delivery
  Weight, length, width, height

Service
  Name, description, price, discount price
  Main category, subcategory
  Images, features, variants
  Delivery method: WhatsApp document, email, direct link
  Turnaround time

Booking
  Name, description, price, discount price
  Main category, subcategory
  Images, features, variants
  Maximum daily bookings
  Remote or physical location
  Availability calendar after publishing

Utility
  Name, description, price, discount price
  Main category, subcategory
  Images, features, variants
  Billing type: flat, hourly, usage
  Unit label
```

The supported category IDs in the current web implementation are:

```text
physical: physical-products, vehicles, property
service: freelance-services
booking: bookable-services, events-tickets
utility: digital-products
```

Load the category catalog from a shared app asset or a public configuration endpoint so Flutter and web use the same values.

### 5.2 Add Product UI

Open the Add Product modal from:

- Seller dashboard overview
- Products tab
- Empty products state
- Quick action button

Recommended mobile UI is a full-screen route or modal bottom sheet rather than a wide desktop dialog:

```text
AppBar
  Close
  Add product / Update listing

Product type segmented selector
  Physical | Service | Booking | Utility

Form sections
  Images
  Pricing
  Product information
  Variations
  Type-specific settings

Bottom action bar
  Cancel
  Save product / Publish product
```

For long forms, use a full-screen page with sections. The form must preserve values when the keyboard opens and should validate before submission.

### 5.3 Form model

```dart
enum ProductType { physical, service, booking, utility }

class ProductFormData {
  ProductType productType = ProductType.physical;
  String name = '';
  String description = '';
  String price = '';
  String discountPrice = '';
  String mainCategory = '';
  String subCategory = '';
  String stockCount = '1';
  String deliveryType = 'state';
  String duration = '1 Hour';
  String metricType = 'flat';
  String unitLabel = 'Service';
  String locationType = 'remote';
  String weightKg = '';
  String lengthCm = '';
  String widthCm = '';
  String heightCm = '';
  final List<String> features = [];
  final List<ProductVariant> variants = [];
  final List<String> imageUrls = [];
}

class ProductVariant {
  String type;
  String value;

  ProductVariant({
    required this.type,
    required this.value,
  });
}
```

### 5.4 Required form controls

Build reusable widgets:

```dart
class ProductTextField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool requiredField;
  final TextInputType keyboardType;

  const ProductTextField({
    super.key,
    required this.label,
    required this.controller,
    this.requiredField = false,
    this.keyboardType = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      validator: (value) {
        if (requiredField && (value == null || value.trim().isEmpty)) {
          return 'Required';
        }
        return null;
      },
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    );
  }
}
```

The modal should include:

- Multi-image picker with previews.
- Remove image action.
- Product title.
- Description.
- Base price.
- Optional discount price.
- Main category dropdown.
- Subcategory dropdown.
- Features list with Add and Remove.
- Variations list with type and value.
- Type-specific fields.
- Product limit message.
- Save progress indicator.

### 5.5 Image upload

The web modal uploads new images to Cloudinary and saves secure URLs in the product document. For Flutter, prefer a server-side upload endpoint so the upload configuration is not embedded in the app.

Recommended flow:

```text
Pick image
  -> Show local preview
  -> Compress image
  -> Upload to approved server endpoint
  -> Receive secure URL
  -> Add URL to product payload
  -> Submit product
```

If the project intentionally uses an unsigned Cloudinary upload preset, keep the preset limited to image uploads and do not put any signed API secret in Flutter. Use image_picker:

```dart
final picker = ImagePicker();

Future<XFile?> pickImage() {
  return picker.pickImage(
    source: ImageSource.gallery,
    imageQuality: 82,
    maxWidth: 1600,
  );
}
```

The upload method should return a secure HTTPS URL. Do not submit local file paths.

### 5.6 Physical product validation

Physical products require all package measurements:

```text
weightKg > 0
lengthCm > 0
widthCm > 0
heightCm > 0
```

Also validate:

- Name is not empty.
- Price is greater than zero.
- Stock is an integer greater than or equal to zero.
- Category and subcategory are selected.
- At least one image is recommended.
- Discount price is not greater than the base price when both are provided.

The seller web implementation displays the package dimensions because inaccurate values may produce courier surcharges.

### 5.7 Product payload

The web implementation builds this canonical payload:

```json
{
  "name": "Product name",
  "description": "Product description",
  "price": 10000,
  "discountPrice": 8500,
  "mainCategory": "physical-products",
  "subCategory": "fashion",
  "category": "fashion",
  "productType": "physical",
  "trackInventory": true,
  "images": [
    "https://cdn.example.com/product-image.jpg"
  ],
  "features": [
    "Feature one"
  ],
  "variants": [
    {
      "type": "Size",
      "value": "XL"
    }
  ],
  "storeId": "SELLER_UID",
  "stockCount": 10,
  "stock": 10,
  "availability": "in_stock",
  "deliveryType": "state",
  "shipping": {
    "weightKg": 1.2,
    "lengthCm": 30,
    "widthCm": 20,
    "heightCm": 10
  }
}
```

For service:

```json
{
  "productType": "service",
  "fulfillmentMethod": "whatsapp",
  "turnaroundTime": "24 Hours"
}
```

For booking:

```json
{
  "productType": "booking",
  "duration": "1 Hour",
  "locationType": "remote",
  "maxDaily": 5
}
```

For utility:

```json
{
  "productType": "utility",
  "metricType": "hourly",
  "unitLabel": "Hour"
}
```

Only include type-specific fields that apply to the selected product type.

## 6. Product API usage

### 6.1 Current products API

The current API route is:

```http
GET  /api/products
POST /api/products
```

Public GET examples:

```http
GET /api/products?limit=24&page=1
GET /api/products?storeId=SELLER_UID
GET /api/products?search=shoes
GET /api/products?category=fashion
```

The GET response includes:

```json
{
  "products": [],
  "page": 1,
  "limit": 24,
  "total": 0,
  "hasMore": false
}
```

The current POST route expects:

```json
{
  "userId": "CURRENT_SELLER_UID",
  "productPayload": {
    "name": "Product name",
    "price": 10000,
    "storeId": "CURRENT_SELLER_UID"
  }
}
```

The Authorization Bearer token must belong to userId. A Flutter repository method should use the current Firebase UID and must not allow a text field to supply it.

```dart
Future<String> createProduct(ProductFormData form) async {
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) throw ApiException(401, 'Sign in again');

  final payload = toProductPayload(form, user.uid);
  final result = await apiClient.request(
    'POST',
    '/api/products',
    body: {
      'userId': user.uid,
      'productPayload': payload,
    },
  );

  return result['id'].toString();
}
```

### 6.2 Important existing implementation note

The current web AddProductModal writes products directly to Firestore and updates stores/{uid}.productCount. The current POST API uses a productPayload wrapper and counts products using a userId field.

Before Flutter production release, standardize the write path. Recommended approach:

1. Use POST /api/products for Flutter.
2. Make the server write the canonical owner fields consistently: storeId, vendorId if required, and userId if the API depends on it.
3. Make the server update product limits and store productCount transactionally.
4. Make the server trigger referral milestone synchronization.
5. Return the saved product record.
6. Remove the need for Flutter to write products directly to Firestore.

Until that contract is harmonized, creating a product through Flutter may not appear in every seller query because some existing queries use storeId while the API count uses userId.

### 6.3 Updating a product

The public product route is:

```http
GET   /api/products/{productId}
PATCH /api/products/{productId}
DELETE /api/products/{productId}
```

Confirm the deployed route supports seller-owned PATCH and DELETE before enabling edit and delete buttons in Flutter. If it does not, add a protected seller route instead of allowing direct client writes.

When editing:

- Keep existing image URLs.
- Upload only new images.
- Send the final image URL list.
- Re-run type-specific validation.
- Disable product type changes if the web dashboard does not support changing it after creation.

## 7. Product limit and subscription gating

The web AddProductModal reads:

```text
users/{uid}.productLimit
products where storeId == uid
```

The API also enforces a server-side limit. Flutter should show:

- Current product count.
- Product limit.
- Remaining slots.
- Upgrade action when the limit is reached.

The client display is informational. The server response is authoritative.

If the API returns:

```text
PRODUCT_LIMIT_EXCEEDED
```

show an upgrade prompt and do not retry the same request.

## 8. Seller Orders screen

### 8.1 Order data source

The existing seller Orders tab listens to two queries because older orders may use vendorId while newer orders use storeId:

```dart
Stream<QuerySnapshot<Map<String, dynamic>>> watchStoreOrders(
  String sellerUid,
) {
  return FirebaseFirestore.instance
      .collection('orders')
      .where('storeId', isEqualTo: sellerUid)
      .snapshots();
}

Stream<QuerySnapshot<Map<String, dynamic>>> watchVendorOrders(
  String sellerUid,
) {
  return FirebaseFirestore.instance
      .collection('orders')
      .where('vendorId', isEqualTo: sellerUid)
      .snapshots();
}
```

Merge both streams by document ID. The web implementation does this to avoid duplicate orders while records migrate to the canonical owner fields.

### 8.2 Orders UI

```text
AppBar
  Orders
  Search
  Notifications

Sticky filter row
  All
  Escrow
  In Progress
  Completed
  Disputes

Order list
  Order ID
  Customer name and phone
  Total amount
  Order type
  Status chip
  Tracking ID
  Created date
  Dispute warning
  Open chat action

Order detail
  Items
  Buyer information
  Delivery information
  Payment and escrow state
  Shipment state
  Dispute timeline
  Respond to dispute
  Mark as shipped
  Mark work completed
  Mark order completed
```

Search the order ID, customer name, customer phone, amount, or tracking ID.

### 8.3 Status mapping

The seller dashboard normalizes order statuses:

```text
PAID, HELD, PAID_HELD
  -> PAID_HELD / Escrow

SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY
  -> SHIPPED / In Transit

WORK_DONE, COMPLETED_PENDING_BUYER
  -> WORK_DONE / Work Done

COMPLETED, DELIVERED
  -> COMPLETED / Completed

Open dispute
  -> Disputed
```

Do not rely only on the label. Preserve the raw status for API actions and audit display.

### 8.4 Seller order model

```dart
class SellerOrder {
  final String id;
  final String? status;
  final String? orderType;
  final double totalAmount;
  final String? customerName;
  final String? customerPhone;
  final String? buyerId;
  final String? trackingId;
  final String? carrier;
  final DateTime? createdAt;
  final bool hasDispute;

  const SellerOrder({
    required this.id,
    this.status,
    this.orderType,
    this.totalAmount = 0,
    this.customerName,
    this.customerPhone,
    this.buyerId,
    this.trackingId,
    this.carrier,
    this.createdAt,
    this.hasDispute = false,
  });

  String get displayStatus {
    if (hasDispute) return 'Disputed';
    final value = (status ?? '').toUpperCase();
    if (value == 'PAID' || value == 'HELD' || value == 'PAID_HELD') {
      return 'Escrow';
    }
    if (value == 'SHIPPED' ||
        value == 'IN_TRANSIT' ||
        value == 'OUT_FOR_DELIVERY') {
      return 'In Transit';
    }
    if (value == 'WORK_DONE' ||
        value == 'COMPLETED_PENDING_BUYER') {
      return 'Work Done';
    }
    if (value == 'COMPLETED' || value == 'DELIVERED') {
      return 'Completed';
    }
    return value.isEmpty ? 'Unknown' : value;
  }
}
```

### 8.5 Orders list example

```dart
class SellerOrdersList extends StatelessWidget {
  final Stream<List<SellerOrder>> orders;
  final ValueChanged<SellerOrder> onOpen;

  const SellerOrdersList({
    super.key,
    required this.orders,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<SellerOrder>>(
      stream: orders,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Center(
            child: Text('Orders could not be loaded'),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final list = snapshot.data!;
        if (list.isEmpty) {
          return const Center(
            child: Text('No seller orders yet'),
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final order = list[index];
            return Card(
              child: ListTile(
                title: Text('Order ' + order.id),
                subtitle: Text(
                  (order.customerName ?? 'Customer') +
                  ' • ' +
                  order.displayStatus,
                ),
                trailing: Text(
                  'NGN ' + order.totalAmount.toStringAsFixed(2),
                ),
                onTap: () => onOpen(order),
              ),
            );
          },
        );
      },
    );
  }
}
```

## 9. Seller order actions

### 9.1 Mark as shipped

The API route is:

```http
POST /api/orders/ship
```

Request:

```json
{
  "orderId": "ORDER_ID",
  "trackingId": "TRACKING_NUMBER",
  "carrier": "COURIER_NAME"
}
```

Rules:

- Physical orders require trackingId and carrier unless shipping is self-arranged.
- Service, booking, and utility orders do not require physical tracking.
- Service and booking orders move to COMPLETED_PENDING_BUYER.
- Physical orders move to SHIPPED.
- The API verifies that storeId or vendorId belongs to the authenticated seller.
- The API creates a buyer notification.

Flutter repository method:

```dart
Future<void> shipOrder({
  required String orderId,
  String trackingId = '',
  String carrier = '',
}) async {
  await apiClient.request(
    'POST',
    '/api/orders/ship',
    body: {
      'orderId': orderId,
      'trackingId': trackingId.trim(),
      'carrier': carrier.trim(),
    },
  );
}
```

Show a different form for physical versus service/booking orders. Refresh the order listener after the API succeeds.

### 9.2 Mark as completed

The API route is:

```http
POST /api/orders/complete
```

Request:

```json
{
  "orderId": "ORDER_ID"
}
```

The endpoint:

- Verifies the authenticated seller or buyer owns the order.
- Validates escrow state.
- Changes status to COMPLETED.
- Releases escrow ledger values through a server transaction.
- Creates a seller payout record.
- Attempts Nomba settlement when seller payout details are configured.
- Records referral order rewards.
- Sends notifications.

Flutter method:

```dart
Future<void> completeOrder(String orderId) async {
  await apiClient.request(
    'POST',
    '/api/orders/complete',
    body: {'orderId': orderId},
  );
}
```

Do not update status locally before the API confirms success. The API may return a conflict when the order is refunded, already completed, or has an escrow mismatch.

### 9.3 Seller-to-buyer chat

The seller Orders tab can open a buyer chat:

```http
POST /api/chats
```

Request:

```json
{
  "participantId": "BUYER_ID",
  "participantRole": "buyer",
  "subject": "Order ORDER_ID"
}
```

Then navigate to the seller support chat screen documented in FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

### 9.4 Dispute response

A seller can respond to an existing dispute through:

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

Status changes and final dispute decisions remain admin-controlled. The seller UI should not expose admin-only actions.

## 10. Orders repository

```dart
class SellerOrderRepository {
  final ApiClient apiClient;
  final FirebaseFirestore firestore;

  SellerOrderRepository({
    required this.apiClient,
    FirebaseFirestore? firestore,
  }) : firestore = firestore ?? FirebaseFirestore.instance;

  Stream<List<SellerOrder>> watchOrders(String sellerUid) {
    final storeStream = firestore
        .collection('orders')
        .where('storeId', isEqualTo: sellerUid)
        .snapshots();

    final vendorStream = firestore
        .collection('orders')
        .where('vendorId', isEqualTo: sellerUid)
        .snapshots();

    return _mergeOrderStreams(storeStream, vendorStream);
  }

  Stream<List<SellerOrder>> _mergeOrderStreams(
    Stream<QuerySnapshot<Map<String, dynamic>>> storeStream,
    Stream<QuerySnapshot<Map<String, dynamic>>> vendorStream,
  ) async* {
    final storeEvents = storeStream.asBroadcastStream();
    final vendorEvents = vendorStream.asBroadcastStream();
    final merged = <String, SellerOrder>{};

    await for (final event in StreamGroup.merge([
      storeEvents,
      vendorEvents,
    ])) {
      for (final doc in event.docs) {
        merged[doc.id] = SellerOrder(
          id: doc.id,
          status: doc.data()['status']?.toString(),
          orderType: doc.data()['orderType']?.toString(),
          totalAmount: (doc.data()['totalAmount'] as num?)?.toDouble() ?? 0,
          customerName: doc.data()['customerName']?.toString(),
          customerPhone: doc.data()['customerPhone']?.toString(),
          buyerId: doc.data()['buyerId']?.toString(),
          trackingId: doc.data()['trackingId']?.toString(),
          carrier: doc.data()['carrier']?.toString(),
        );
      }
      yield merged.values.toList();
    }
  }

  Future<void> shipOrder({
    required String orderId,
    String trackingId = '',
    String carrier = '',
  }) {
    return apiClient.request(
      'POST',
      '/api/orders/ship',
      body: {
        'orderId': orderId,
        'trackingId': trackingId,
        'carrier': carrier,
      },
    );
  }

  Future<void> completeOrder(String orderId) {
    return apiClient.request(
      'POST',
      '/api/orders/complete',
      body: {'orderId': orderId},
    );
  }
}
```

The StreamGroup example requires the async package:

```yaml
dependencies:
  async: ^latest
```

Alternatively, implement two StreamBuilders in the screen and merge their snapshots in a controller. The important requirement is deduplicating by order document ID.

## 11. Seller dashboard shell

The seller shell should expose:

```text
Overview
Orders
Products
Shipping
Disputes
Chat Support
Notifications
Payouts
Settings
```

Use the seller settings guide to keep seller profile, store, shipping, payout, subscription, and dashboard preferences inside Seller Settings.

The mobile shell should:

- Keep the seller navigation available.
- Show unread notification and chat badges.
- Preserve the selected tab when returning from product or order details.
- Close modals safely when the route is disposed.
- Refresh the overview after adding a product or completing an order.

## 12. Loading and error states

### Add Product

Show:

- Loading while product limit is fetched.
- Upload progress for each image.
- Form validation errors.
- Product limit error.
- Unauthorized state.
- Retry after upload failure.
- Success state after server confirmation.

### Overview

Show:

- Skeleton cards while store data loads.
- Empty chart when no analytics events exist.
- Partial metrics when one listener fails.
- Retry for analytics errors.
- Locked state for premium metrics.

### Orders

Show:

- Loading while both owner queries initialize.
- Empty orders state.
- Search no-results state.
- Permission error.
- Offline cached list with stale indicator.
- Confirmation before ship or complete actions.
- API error without changing the displayed status.

## 13. Firestore indexes and security

Possible indexes:

```text
orders:
  storeId ascending

orders:
  vendorId ascending

analytics:
  storeId ascending
  eventType ascending
  timestamp ascending

products:
  storeId ascending
```

Use the indexes generated by Firebase for the deployed project.

Security rules should ensure:

- A seller can read products where storeId equals request.auth.uid.
- A seller can read orders where storeId or vendorId equals request.auth.uid.
- A seller cannot write escrowBalance, availableBalance, totalSales, payout status, or settlement fields.
- Product ownership is checked on create, update, and delete.
- Analytics reads are restricted to the owning seller.
- Support chats are restricted to participants or authorized admin staff.

Financial fields must be written only by server transactions.

## 14. API and data-contract checklist

Before Flutter production release, verify:

- POST /api/products accepts the canonical mobile payload.
- Product ownership fields are consistent across API writes and Firestore queries.
- Product limit is enforced on the server.
- Image upload has a stable mobile contract.
- Seller orders can be queried securely by both storeId and vendorId during migration.
- POST /api/orders/ship is available in production.
- POST /api/orders/complete is available in production.
- Seller chat creation is authorized.
- Seller dispute responses are authorized.
- Seller analytics has a bounded query or aggregation endpoint.
- Payment and payout secrets remain server-side.
- All API errors return a stable JSON error field.

## 15. Implementation order

1. Build the authenticated ApiClient and seller role guard.
2. Build the seller shell and navigation badges.
3. Implement the overview store and product listeners.
4. Add bounded analytics queries and the chart.
5. Implement the Add Product full-screen modal.
6. Implement image upload and product validation.
7. Standardize POST /api/products ownership fields.
8. Implement merged seller order listeners.
9. Add order search and status filters.
10. Add ship and complete actions.
11. Add seller chat and dispute response links.
12. Add loading, offline, retry, and permission states.
13. Test with two seller accounts and a buyer account.
14. Verify all financial changes occur only through protected server APIs.

The Flutter UI may share visual components with buyer and admin dashboards, but seller product, order, balance, payout, and analytics data must stay role-scoped.

## 16. Courier and self-arranged handover flow

Handover belongs on the seller Orders screen. It should not be presented as a
shipping-tracking action.

Show a handover action only when all of these are true:

- The order payment is confirmed and fundsState is held.
- The order is not completed, disputed, cancelled, or expired.
- The seller owns the order through storeId or vendorId.

For self-arranged delivery, show Confirm Handover and call:

~~~http
POST /api/orders/ship
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
~~~

~~~json
{
  "orderId": "ORDER_ID",
  "carrier": "self_arranged"
}
~~~

For a selected courier, show Courier Processing and collect both the courier
name and tracking number:

~~~json
{
  "orderId": "ORDER_ID",
  "carrier": "Courier name",
  "trackingId": "TRACKING_NUMBER"
}
~~~

On success, the server sets the order to SHIPPED, sets deliveryStatus to
IN_TRANSIT, records handover metadata, updates the shipment record, and creates
a buyer notification. The buyer should then see In transit and later confirm
delivery, which calls POST /api/orders/complete.

This endpoint records the seller handover and tracking details. It does not yet
create a courier waybill through POST /api/shipping/dispatch. Add that provider
dispatch integration separately before promising automatic courier booking.

## 17. Payment status and EXPIRED handling

EXPIRED must be rendered from the server response; Flutter must not infer it
from a checkout callback. A payment window is assigned server-side, and a
confirmed provider payment can recover an escrow that was prematurely marked
expired while the callback was delayed.

After a buyer returns from checkout, call:

~~~http
POST /api/orders/confirm-payment
~~~

with the buyer Firebase token and:

~~~json
{
  "orderReference": "CHECKOUT_REFERENCE"
}
~~~

Treat HTTP 202 or confirmed false as Payment processing and offer Check again.
If Nomba confirms the payment, the response is PAID_HELD and the seller order
listener will update. If a genuinely successful payment remains EXPIRED after
the confirmation retry, inspect the backend order fields status, paymentStatus,
fundsState, paymentReference, and the matching escrow transaction before
allowing any handover action.
