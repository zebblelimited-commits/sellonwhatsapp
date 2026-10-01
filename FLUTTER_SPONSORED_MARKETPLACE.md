# Flutter Sponsored Stores and Products

This guide describes the current sponsored marketplace contract. The old
`sponsored_stores` promotional-card collection is retired. Flutter must read
sponsored stores and products from the public API.

## 1. Sponsorship rules

An item is displayed as sponsored only when all of these are true:

1. `isSponsored` is `true`.
2. The store or product is public and not deleted, inactive, banned, or
   suspended.
3. `sponsoredUntil` is missing or is later than the current time.

There are two independent ways to make an item sponsored:

- An administrator manually enables the store or product toggle.
- A seller completes a Store Boost payment.

Store Boost automatically sponsors the seller's store and all products that
reference the seller through `storeId`, `vendorId`, or `ownerId`. When the Boost
expires, only the Boost sponsorship is removed. A separate admin sponsorship is
preserved.

The useful Firestore fields are:

```text
isSponsored          Effective public flag
adminSponsored       Manual admin flag
boostSponsored       Active Store Boost flag
sponsorshipStatus    active, inactive, or expired
sponsorshipSource    admin, store_boost, or admin_and_store_boost
sponsoredAt          Effective sponsorship start time
sponsoredUntil       Effective expiration time, when applicable
priority             Lower numbers appear first
```

Flutter should not write these fields directly. Admin and payment mutations
are server-authorized.

## 2. Public API

All routes in this section are public and do not require a Firebase token.

### Sponsored stores

```text
GET /api/stores?sponsored=true&page=1&limit=20
```

Response:

```json
{
  "stores": [
    {
      "id": "store-id",
      "storeId": "store-id",
      "ownerId": "seller-uid",
      "vendorId": "seller-uid",
      "storeName": "Example Store",
      "username": "example-store",
      "description": "Featured marketplace store",
      "logoUrl": "https://...",
      "bannerUrl": "https://...",
      "category": "Fashion",
      "isVerified": true,
      "isSponsored": true,
      "sponsoredUntil": 1798761600000,
      "priority": 1
    }
  ],
  "sponsoredStores": [],
  "page": 1,
  "limit": 20,
  "total": 1,
  "hasMore": false
}
```

`stores` and `sponsoredStores` contain the same page for this filtered request.
Use either one, but prefer `sponsoredStores` when present. The API excludes
expired sponsorships and sorts by ascending `priority`, then newest
`sponsoredAt`.

### Sponsored products

The homepage API includes the first sponsored products:

```text
GET /api/homepage
```

Read `sponsoredProducts`. For a full sponsored-product screen, use the public
product/catalog API and filter the returned product records by `isSponsored` and
`sponsoredUntil`. Do not query the retired `sponsored_stores` collection.

```json
{
  "sponsoredProducts": [
    {
      "id": "product-id",
      "name": "Example Product",
      "price": 25000,
      "images": ["https://..."],
      "storeId": "seller-uid",
      "vendorName": "Example Store",
      "isSponsored": true,
      "sponsorshipSource": "store_boost",
      "sponsoredUntil": 1798761600000
    }
  ]
}
```

## 3. Dart models

```dart
class SponsoredStore {
  final String id;
  final String name;
  final String username;
  final String description;
  final String? logoUrl;
  final String? bannerUrl;
  final bool isVerified;
  final bool isSponsored;
  final int priority;

  const SponsoredStore({
    required this.id,
    required this.name,
    required this.username,
    required this.description,
    this.logoUrl,
    this.bannerUrl,
    required this.isVerified,
    required this.isSponsored,
    required this.priority,
  });

  factory SponsoredStore.fromJson(Map<String, dynamic> json) {
    return SponsoredStore(
      id: '${json['id'] ?? json['storeId'] ?? ''}',
      name: '${json['storeName'] ?? json['name'] ?? 'Store'}',
      username: '${json['username'] ?? ''}',
      description: '${json['description'] ?? ''}',
      logoUrl: json['logoUrl']?.toString(),
      bannerUrl: json['bannerUrl']?.toString(),
      isVerified: json['isVerified'] == true,
      isSponsored: json['isSponsored'] == true,
      priority: int.tryParse('${json['priority'] ?? 0}') ?? 0,
    );
  }
}

class SponsoredProduct {
  final String id;
  final String name;
  final double price;
  final List<String> images;
  final String storeId;
  final bool isSponsored;

  const SponsoredProduct({
    required this.id,
    required this.name,
    required this.price,
    required this.images,
    required this.storeId,
    required this.isSponsored,
  });

  factory SponsoredProduct.fromJson(Map<String, dynamic> json) {
    return SponsoredProduct(
      id: '${json['id'] ?? ''}',
      name: '${json['name'] ?? 'Product'}',
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      images: (json['images'] as List? ?? const [])
          .whereType<String>()
          .toList(),
      storeId: '${json['storeId'] ?? json['vendorId'] ?? json['ownerId'] ?? ''}',
      isSponsored: json['isSponsored'] == true,
    );
  }
}
```

## 4. Repository implementation

Use the existing authenticated/public API client in the mobile app. The
following repository only assumes that `get()` returns a decoded JSON map.

```dart
class SponsoredRepository {
  final ApiClient api;

  SponsoredRepository(this.api);

  Future<List<SponsoredStore>> getStores({int page = 1, int limit = 20}) async {
    final json = Map<String, dynamic>.from(await api.request(
      'GET',
      '/api/stores?sponsored=true&page=$page&limit=$limit',
      authenticated: false,
    ) as Map);
    final rows = (json['sponsoredStores'] ?? json['stores']) as List? ?? const [];
    return rows
        .whereType<Map>()
        .map((row) => SponsoredStore.fromJson(Map<String, dynamic>.from(row)))
        .where((store) => store.isSponsored)
        .toList();
  }

  Future<List<SponsoredProduct>> getHomepageProducts() async {
    final json = Map<String, dynamic>.from(await api.request(
      'GET',
      '/api/homepage',
      authenticated: false,
    ) as Map);
    final rows = json['sponsoredProducts'] as List? ?? const [];
    return rows
        .whereType<Map>()
        .map((row) => SponsoredProduct.fromJson(Map<String, dynamic>.from(row)))
        .where((product) => product.isSponsored)
        .toList();
  }
}
```

If the app uses `http` directly, attach no token for these public reads. For
admin mutations or seller payment-status calls, attach the current Firebase ID
token as `Authorization: Bearer <token>`.

## 5. UI flow

Use a `SponsoredStoreSection` on the home screen and a paginated sponsored-store
screen at `/sponsored-stores`. Each card should show the banner/logo, store
name, verification badge, and a `View store` action. Navigate to `/{username}`
when `username` exists; otherwise use the store ID route.

Use a sponsored-product carousel or grid on the home screen. Product cards can
reuse the existing product-card checkout behavior. Show a small `Sponsored`
label, but do not show expired records returned from a cached response.

Recommended loading behavior:

1. Display a skeleton while the first API request is pending.
2. Keep the previous page during pagination.
3. Treat an empty successful response as a valid empty state.
4. Retry transient network errors with the normal mobile retry policy.
5. Never let a failed sponsored request block the regular store/product feed.

## 6. Admin toggle contract

The Admin → Stores screen uses the same switch pattern as Sponsored Products:

```text
PATCH /api/admin/stores/{storeId}
Authorization: Bearer <admin-firebase-id-token>
Content-Type: application/json
```

```json
{
  "action": "sponsorship",
  "isSponsored": true,
  "priority": 1
}
```

Only an active admin can call this endpoint. Flutter must not expose this
mutation to buyer or seller roles. Turning the toggle off clears the manual
admin flag. If the store currently has an active Store Boost, it remains
sponsored until that Boost expires.

Product admin toggling remains:

```text
PATCH /api/admin/products
{ "id": "product-id", "isSponsored": true }
```

## 7. Boost Store lifecycle

The seller starts checkout through the existing Boost Store flow. After Nomba
confirms payment, the server:

1. Marks the `boosts/{reference}` record active.
2. Sets `boostSponsored` and effective sponsorship fields on the seller store.
3. Sets the same Boost fields on all products owned by that store.
4. Sets `sponsoredUntil` from the Boost expiry date.
5. Sends the normal Boost activation notification.

The scheduled subscription endpoint marks expired Boost records and removes
only their Boost sponsorship. Admin sponsorship is deliberately preserved.
Therefore the mobile app should not try to infer sponsorship from the payment
screen; it should always render the server's current `isSponsored` state.

## 8. Testing checklist

- Admin enables a store: it appears in `/api/stores?sponsored=true`.
- Admin disables a store: it disappears unless an active Boost still exists.
- Successful Boost: the store and every owned product appear as sponsored.
- Boost expiry: the store/products disappear unless manually sponsored.
- A deleted, suspended, or inactive store never appears publicly.
- A product with a past `sponsoredUntil` is not rendered.
- Buyer and unauthenticated requests can read public sponsored data.
- Buyer/seller accounts receive `403` for admin sponsorship mutations.
- A network failure in sponsored content leaves the normal marketplace usable.
