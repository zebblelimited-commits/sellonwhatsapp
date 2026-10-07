# Utility Products: Web/API Implementation Guide

This guide describes how to implement Utility/Digital Products in the web dashboard and API while remaining compatible with the Flutter mobile app.

The main use case is digital audio products such as:

- Beats & Instrumentals
- Sound Packs & Samples
- Music Loops

The seller can attach an optional preview sample. Buyers can play or pause that preview from product cards and from the product detail page.

## 1. Product classification

Use the following canonical values:

```json
{
  "productType": "utility",
  "mainCategory": "digital-products",
  "subCategory": "Beats & Instrumentals",
  "trackInventory": false
}
```

The available digital-product subcategories currently include:

```text
Beats & Instrumentals
Sound Packs & Samples
Music Loops
E-books & Guides
Online Courses
Design Templates
Website Templates
Mobile App Templates
UI/UX Kits
Icons & Graphics
Fonts & Typography
Lightroom Presets
Video LUTs
AI Prompts
Stock Photos
Stock Videos
Digital Wallpapers
Digital Planners
```

The web form should show the audio-preview controls when the selected product is an audio-oriented subcategory. It is also safe to show the control for every Utility product because the field is optional.

## 2. Web form fields

The Utility form should support these fields:

| Field | Required | Suggested value/type |
|---|---:|---|
| Product name | Yes | Text |
| Description | No | Long text |
| Base price | Yes | Positive number |
| Discount price | No | Number, not greater than base price |
| Main category | Yes | `digital-products` |
| Subcategory | Yes | One of the digital subcategories |
| Utility type | Yes | `file`, `key`, `ticket`, or `sub` |
| Billing cycle | Yes | `one_time`, `monthly`, or `yearly` |
| Metric type | Yes | `flat`, `hourly`, or `usage` |
| Unit label | Yes | Example: `Beat`, `License`, `Hour`, or `GB` |
| Delivery/access instructions | No | Text shown after purchase |
| Cover images | No | One or more image URLs |
| Audio preview | No | Audio sample URL of any duration |
| Features | No | String array |
| Variants | No | Array of attribute/value objects |

For a beat listing, a good default is:

```text
Utility type: file
Billing cycle: one_time
Metric type: flat
Unit label: Beat
```

## 3. Canonical product payload

The API should accept and return the following shape. Keep `previewAudioUrl` as the canonical audio field name.

```json
{
  "name": "Midnight Drive Beat",
  "description": "Dark Afrobeats instrumental in C minor.",
  "price": 25000,
  "discountPrice": 20000,
  "mainCategory": "digital-products",
  "subCategory": "Beats & Instrumentals",
  "category": "Beats & Instrumentals",
  "productType": "utility",
  "type": "utility",
  "trackInventory": false,
  "stockCount": 1,
  "availability": "in_stock",
  "utilityType": "file",
  "billingCycle": "one_time",
  "metricType": "flat",
  "unitLabel": "Beat",
  "deliveryInstructions": "The download link will be sent after payment confirmation.",
  "images": [
    "https://res.cloudinary.com/dmjzgqigl/image/upload/v123/beat-cover.jpg"
  ],
  "imageUrl": "https://res.cloudinary.com/dmjzgqigl/image/upload/v123/beat-cover.jpg",
  "previewAudioUrl": "https://res.cloudinary.com/dmjzgqigl/video/upload/v123/midnight-drive-preview.mp3",
  "previewDurationSeconds": 30,
  "features": [
    "Afrobeats",
    "C minor",
    "Tagged preview"
  ],
  "variants": [],
  "storeId": "SELLER_FIREBASE_UID"
}
```

### Compatibility fields

The mobile parser also recognizes these legacy aliases when reading products:

```text
audioPreviewUrl
previewUrl
audioUrl
audioDurationSeconds
```

New web/API code should write only `previewAudioUrl` and `previewDurationSeconds`. Supporting the aliases on reads prevents older listings from losing their previews.

## 4. Important existing mobile gaps

The current mobile Utility form displays these controls but does not currently include all of them in the Firestore write payload:

- `utilityType`
- `billingCycle`
- `deliveryInstructions`

The web/API implementation should persist all three fields. If the mobile app is later updated, use these exact names so both clients share one contract.

The current mobile “Digital Asset Delivery” panel is also only a visual placeholder; it does not upload the purchased digital file. Implementing secure post-purchase delivery is separate from the public audio preview and should not expose the full downloadable beat in the public product response.

## 5. Cloudinary upload flow

Use the existing Cloudinary account:

```text
Cloud name: dmjzgqigl
Unsigned upload preset: sellonwhatsapp_preset
```

### Cover images

```text
POST https://api.cloudinary.com/v1_1/dmjzgqigl/image/upload
```

Multipart fields:

```text
upload_preset=sellonwhatsapp_preset
file=<image-file>
```

Store the returned `secure_url` in `images` and use the first image as `imageUrl`.

### Audio preview samples

```text
POST https://api.cloudinary.com/v1_1/dmjzgqigl/auto/upload
```

Multipart fields:

```text
upload_preset=sellonwhatsapp_preset
file=<audio-file>
```

Store the returned `secure_url` as `previewAudioUrl`. Cloudinary may report audio as a video resource internally; the `auto/upload` endpoint keeps the client independent of that detail.

Recommended accepted formats:

```text
mp3, wav, m4a, aac, ogg, flac
```

The seller may upload an audio preview of any duration. The web form records the actual `previewDurationSeconds` for the player, while the upload layer keeps a reasonable file-size limit. The full purchased file must remain private and must not be exposed through the public preview URL.

Never put a Cloudinary API secret in browser code. Use the unsigned preset for this public-media upload flow, or proxy/sign the upload from a trusted server if the preset must be private.

## 6. API requirements

The seller create/update endpoints should:

1. Authenticate the seller.
2. Confirm that `storeId` belongs to the authenticated seller.
3. Validate that `productType` is `utility` for Utility listings.
4. Validate `mainCategory` is `digital-products` and that the subcategory is valid.
5. Validate price and discount values.
6. Validate the Cloudinary URL host/resource type before persisting `previewAudioUrl`.
7. Persist `previewAudioUrl` and `previewDurationSeconds`.
8. Return the audio fields from list and detail endpoints.

The public product endpoints already used by the mobile app are:

```text
GET /api/products
GET /api/stores/:storeId/products
```

Ensure the serializer does not drop the new fields. Public responses may include the preview URL, but must not include the private/full purchased download URL.

For updates, support either:

```text
PATCH /api/products/:productId
```

or:

```text
PUT /api/products/:productId
```

When a seller removes a preview, clear `previewAudioUrl` and `previewDurationSeconds` rather than leaving stale values in the public response.

## 7. Web frontend playback

Use one HTML audio element per active preview, or a shared player service that stops the previous preview when a new product starts.

Each product card should show a compact control only when `previewAudioUrl` is non-empty:

```text
▶ Preview   0:30
```

The product detail page should show:

```text
🎵 Midnight Drive Beat
▶ 0:00 ━━━━━━━━━ 0:30
Preview
```

Required behavior:

- Play and pause the preview.
- Show current time and duration.
- Show a loading state while the audio source is preparing.
- Show an error state if the URL cannot be played.
- Stop the previous preview when another product starts playing.
- Do not autoplay audio.
- Do not start the full purchased file from the public preview control.

## 8. Firestore/API field mapping

If the API reads directly from the `products` collection, preserve these fields when writing the document:

```text
name
description
price
discountPrice
mainCategory
subCategory
category
productType
type
trackInventory
stockCount
availability
utilityType
billingCycle
metricType
unitLabel
deliveryInstructions
images
imageUrl
previewAudioUrl
previewDurationSeconds
features
variants
storeId
createdAt
updatedAt
```

The mobile client currently creates product records directly in Firestore, while catalog reads use the API. The web/API implementation should therefore keep Firestore field names and API response field names aligned.

## 9. Acceptance checklist

- [ ] Seller can choose `Digital Products` and `Beats & Instrumentals`.
- [ ] Seller can select an audio preview file.
- [ ] Audio is uploaded to the existing Cloudinary account.
- [ ] The product stores `previewAudioUrl`.
- [ ] The product API returns `previewAudioUrl`.
- [ ] Non-audio products do not show a player.
- [ ] Audio cards have play/pause controls.
- [ ] The detail page shows progress and duration.
- [ ] Starting one preview stops another preview.
- [ ] Full purchased files remain private/protected.
- [ ] Removing a preview clears the URL and duration.
- [ ] Existing physical, service, booking, and non-audio Utility products continue to work.
