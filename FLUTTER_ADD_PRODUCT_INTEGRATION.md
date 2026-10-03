# Flutter Add Product Integration Guide

This document maps the current web Add Product flow to Flutter. The canonical web implementation is [`AddProductModal.tsx`](app/dashboard/modals/AddProductModal.tsx).

## 1. Supported product types

```text
physical
service
booking
utility
```

The product type should be immutable after creation, matching the web edit modal. If a seller needs another type, create a new listing.

## 2. Authentication and ownership

Every product must belong to the authenticated Firebase user:

```text
storeId = Firebase Auth UID
```

Flutter must not accept a seller/store ID from an untrusted form field. Read the UID from the current Firebase user and set `storeId` from that value.

Firestore rules currently allow:

```text
Public read
Create when request.auth.uid == request.resource.data.storeId
Owner updates/deletes when request.auth.uid == resource.data.storeId
```

Use Firebase ID tokens when calling protected HTTP APIs.

## 3. Common product document

These fields are shared by all product types. In the tables below, “Required” means Flutter should send a valid value or the documented default so the mobile record remains compatible, even where the current web input uses a default instead of an HTML `required` attribute:

```json
{
  "name": "Product or service name",
  "description": "Detailed description",
  "price": 10000,
  "discountPrice": null,
  "mainCategory": "physical-products",
  "subCategory": "Fashion & Clothing",
  "category": "Fashion & Clothing",
  "productType": "physical",
  "trackInventory": true,
  "images": [
    "https://res.cloudinary.com/.../product-image.jpg"
  ],
  "features": [
    "Feature one",
    "Feature two"
  ],
  "variants": [
    {
      "type": "Size",
      "value": "XL"
    }
  ],
  "storeId": "SELLER_FIREBASE_UID",
  "stockCount": 10,
  "createdAt": "Firestore server timestamp",
  "updatedAt": "Firestore server timestamp"
}
```

### Common field rules

| Field | Required | Rule |
|---|---:|---|
| `name` | Yes | Non-empty product/listing title |
| `description` | No | Text shown on the product page |
| `price` | Yes | Numeric NGN amount; Flutter should require a positive value |
| `discountPrice` | No | Numeric or `null`; validate it is not greater than `price` |
| `mainCategory` | Yes | Must be one of the categories allowed for the selected product type |
| `subCategory` | Yes | Must belong to the selected main category |
| `category` | Yes | Set equal to `subCategory` for compatibility |
| `productType` | Yes | `physical`, `service`, `booking`, or `utility` |
| `images` | No | Array of uploaded HTTPS image URLs |
| `features` | No | Remove empty strings before saving |
| `variants` | No | Remove entries with empty `value` |
| `storeId` | Yes | Authenticated seller UID |
| `createdAt` | Create only | Firestore server timestamp |
| `updatedAt` | Create/update | Firestore server timestamp |

The web modal supports these variant types:

```text
Size
Color
Weight
Material
```

## 4. Product-type fields

### Physical product

Use:

```json
{
  "productType": "physical",
  "trackInventory": true,
  "stockCount": 10,
  "stock": 10,
  "availability": "in_stock",
  "deliveryType": "state",
  "shipping": {
    "weightKg": 1.5,
    "lengthCm": 30,
    "widthCm": 20,
    "heightCm": 10
  }
}
```

Rules:

- `stockCount` must be an integer greater than or equal to zero.
- `stock` must mirror `stockCount` for compatibility with older web records.
- `availability` is `in_stock` when stock is greater than zero; otherwise `out_of_stock`.
- `deliveryType` is currently `state` or `nationwide`.
- `shipping.weightKg`, `lengthCm`, `widthCm`, and `heightCm` are required and must be greater than zero.
- Shipping dimensions are required because courier quotation and dispatch use them.
- The backend reads these dimensions through `productCheckoutAttributes`.

### Service

Use:

```json
{
  "productType": "service",
  "trackInventory": false,
  "stockCount": 1,
  "fulfillmentMethod": "whatsapp",
  "turnaroundTime": "24 Hours"
}
```

Allowed `fulfillmentMethod` values from the web UI:

```text
whatsapp
email
link
```

`turnaroundTime` is a seller-provided text value, for example `24 Hours`, `3 Days`, or `Immediately`.

Services do not require shipping dimensions or courier inventory. They are treated as non-physical orders during checkout and fulfillment.

### Booking

Use:

```json
{
  "productType": "booking",
  "trackInventory": false,
  "stockCount": 5,
  "maxDaily": 5,
  "duration": "1 Hour",
  "locationType": "remote",
  "setupComplete": true
}
```

Rules:

- `stockCount` represents the maximum daily capacity in the Add Product form.
- `maxDaily` must mirror `stockCount`.
- `duration` is a seller-provided value such as `1 Hour`.
- `locationType` is `remote` or `physical`.
- After creating a booking product, save its weekly availability before treating it as fully configured.

### Utility / digital product

Use:

```json
{
  "productType": "utility",
  "trackInventory": false,
  "stockCount": 1,
  "metricType": "flat",
  "unitLabel": "Service"
}
```

Allowed `metricType` values:

```text
flat
hourly
usage
```

`unitLabel` examples include `KM`, `Hour`, `GB`, or `Service`.

Utility products do not require shipping dimensions and are treated as non-physical orders.

## 5. Booking availability subcollection

Booking availability is stored separately:

```text
products/{productId}/availability/{dayName}
```

The web implementation creates these seven documents:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

Each document has this shape:

```json
{
  "dayName": "Monday",
  "isOpen": true,
  "slots": [
    {
      "start": "09:00",
      "end": "17:00"
    }
  ],
  "lastUpdated": "Firestore timestamp"
}
```

For a closed day:

```json
{
  "dayName": "Sunday",
  "isOpen": false,
  "slots": [],
  "lastUpdated": "Firestore timestamp"
}
```

After saving all seven days, update the product:

```json
{
  "setupComplete": true,
  "updatedAt": "Firestore server timestamp"
}
```

## 6. Categories

Use the same category IDs and subcategories as the web file `app/dashboard/nigeriaData.ts`.

| Product type | Allowed main category IDs |
|---|---|
| `physical` | `physical-products`, `vehicles`, `property` |
| `service` | `freelance-services` |
| `booking` | `bookable-services`, `events-tickets` |
| `utility` | `digital-products` |

The Flutter app should load or copy the same category catalog rather than inventing alternate IDs. The subcategory text must be saved in `subCategory` and copied to `category`.

## 7. Image upload

The web client uploads images to Cloudinary before writing the product document. Flutter should either:

1. Use the same Cloudinary unsigned upload preset and save the returned `secure_url`; or
2. Upload through a backend endpoint that returns a trusted HTTPS URL.

The product document should store final URLs only:

```json
{
  "images": ["https://..." ]
}
```

Do not store local file paths, device URIs, or base64 image data in the product document.

## 8. Create, edit, and delete behavior

### Create

1. Authenticate the seller with Firebase Auth.
2. Read the seller UID.
3. Check the seller's `users/{uid}.productLimit`.
4. Count products belonging to `storeId == uid`.
5. Upload images.
6. Write the product document.
7. Increment `stores/{uid}.productCount` by one.

### Edit

Update the existing document at:

```text
products/{productId}
```

Do not change:

```text
productId
storeId
createdAt
```

The web modal does not allow changing `productType` while editing.

### Delete

Delete:

```text
products/{productId}
```

Then decrement:

```text
stores/{sellerUid}.productCount
```

The safer mobile/backend implementation is to perform the product deletion and counter update in one trusted backend transaction so the counter cannot drift.

## 9. Product limit

Current default limit:

```text
20 products
```

The subscription activation flow currently uses:

```text
Free: 20
Pro Business Lite: 500
Pro Yearly Business Max: 999999
```

Use `users/{sellerUid}.productLimit` as the authoritative value when it exists.

## 10. Current API warning

The web Add Product modal currently writes directly to Firestore. It does not use `POST /api/products`.

The current `POST /api/products` route expects:

```json
{
  "userId": "SELLER_UID",
  "productPayload": {
    "storeId": "SELLER_UID"
  }
}
```

However, that route currently counts products using `where("userId", "==", userId)`, while the canonical web records use `storeId`. Therefore, Flutter should not use this route as a product-limit authority until the backend changes the count query to use `storeId` or the route is made the single canonical create/update implementation.

For direct Firestore integration, use the exact document schema in this guide and the Firebase security rules. For a production mobile contract, the preferred long-term approach is an authenticated product API that derives `storeId` from the Firebase token and performs the limit check, product write, and store counter update transactionally.

## 11. Read compatibility fields

These fields may be returned by public product APIs or older product records. Flutter should support them when reading, but sellers do not need to enter them in Add Product:

```text
id
originalPrice
currency
status
vendorName
storeName
username
storeUsername
popularityScore
salesCount
orderCount
views
clicks
add_to_cart_clicks
addToCartClicks
isSponsored
sponsored
sponsorshipStatus
sponsoredAt
sponsoredUntil
priority
placement
source
createdAt
updatedAt
```

## 12. Flutter model

```dart
class ProductVariant {
  final String type;
  final String value;

  ProductVariant({required this.type, required this.value});

  Map<String, dynamic> toJson() => {
        'type': type,
        'value': value,
      };
}

class ProductShipping {
  final double weightKg;
  final double lengthCm;
  final double widthCm;
  final double heightCm;

  ProductShipping({
    required this.weightKg,
    required this.lengthCm,
    required this.widthCm,
    required this.heightCm,
  });

  Map<String, dynamic> toJson() => {
        'weightKg': weightKg,
        'lengthCm': lengthCm,
        'widthCm': widthCm,
        'heightCm': heightCm,
      };
}
```

The main Flutter request model should include:

```text
name
description
price
discountPrice
mainCategory
subCategory
category
productType
trackInventory
images
features
variants
storeId
stockCount
stock
availability
deliveryType
shipping
fulfillmentMethod
turnaroundTime
duration
locationType
maxDaily
metricType
unitLabel
setupComplete
```

Only include type-specific fields when they apply. Do not send contradictory fields such as physical shipping dimensions on a utility product.

## 13. Required-field matrix

| Field | Physical | Service | Booking | Utility |
|---|---:|---:|---:|---:|
| `name` | Required | Required | Required | Required |
| `description` | Optional | Optional | Optional | Optional |
| `price` | Required | Required | Required | Required |
| `discountPrice` | Optional | Optional | Optional | Optional |
| `mainCategory` | Required | Required | Required | Required |
| `subCategory` | Required | Required | Required | Required |
| `category` | Required | Required | Required | Required |
| `images` | Optional | Optional | Optional | Optional |
| `features` | Optional | Optional | Optional | Optional |
| `variants` | Optional | Optional | Optional | Optional |
| `storeId` | Required | Required | Required | Required |
| `productType` | `physical` | `service` | `booking` | `utility` |
| `trackInventory` | `true` | `false` | `false` | `false` |
| `stockCount` | Required | Default `1` | Required as daily capacity | Default `1` |
| `stock` | Required | Omit | Omit | Omit |
| `availability` | Required | Optional | Optional | Optional |
| `deliveryType` | `state`/`nationwide` | Omit | Omit | Omit |
| `shipping` | Required | Omit | Omit | Omit |
| `fulfillmentMethod` | Omit | Required | Omit | Omit |
| `turnaroundTime` | Omit | Required | Omit | Omit |
| `duration` | Omit | Optional | Required | Omit |
| `locationType` | Omit | Omit | Required | Omit |
| `maxDaily` | Omit | Omit | Required | Omit |
| `metricType` | Omit | Omit | Omit | Required |
| `unitLabel` | Omit | Omit | Omit | Required |
| `setupComplete` | Omit | Omit | Required after availability setup | Omit |

## 14. Final compatibility checklist

- Use Firebase Auth UID as `storeId`.
- Preserve the exact product type enum values.
- Copy `subCategory` into `category`.
- Store image URLs, not local file paths.
- Send `stock` and `stockCount` together for physical products.
- Require all four physical shipping dimensions.
- Keep services, bookings, and utilities out of physical courier inventory logic.
- Create the seven booking availability documents.
- Do not change `productType` during edit.
- Do not charge or calculate checkout fees inside Add Product.
- Treat sponsorship, popularity, views, sales, and order counters as server/admin-managed fields.
- Prefer a transactional backend product write for production mobile use.
