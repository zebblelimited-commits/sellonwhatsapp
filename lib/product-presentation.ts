const DIGITAL_UTILITY_SUBCATEGORIES = new Set([
  "beats & instrumentals",
  "sound packs & samples",
  "music loops",
  "e-books & guides",
  "online courses",
  "design templates",
  "website templates",
  "mobile app templates",
  "ui/ux kits",
  "icons & graphics",
  "fonts & typography",
  "lightroom presets",
  "video luts",
  "ai prompts",
  "stock photos",
  "stock videos",
  "digital wallpapers",
  "digital planners",
  // Common legacy aliases.
  "music-audio", "music", "audio", "beats", "instrumentals", "digital-products", "ebooks", "software", "templates", "digital-art", "courses", "online-courses",
]);

type ProductLike = {
  productType?: unknown;
  type?: unknown;
  mainCategory?: unknown;
  subCategory?: unknown;
  previewAudioUrl?: unknown;
  audioPreviewUrl?: unknown;
  previewUrl?: unknown;
  audioUrl?: unknown;
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function productTypeOf(product: ProductLike) {
  return normalized(product.productType || product.type);
}

/**
 * Utility is the legacy type used for both digital products and utility
 * services. A digital-products category is the authoritative discriminator
 * for downloadable items such as beats and instrumentals.
 */
export function isDigitalUtilityProduct(product: ProductLike) {
  return productTypeOf(product) === "utility" && (
    normalized(product.mainCategory) === "digital-products" ||
    DIGITAL_UTILITY_SUBCATEGORIES.has(normalized(product.subCategory))
  );
}

export function isBookingProduct(product: ProductLike) {
  return productTypeOf(product) === "booking";
}

export function isServiceProduct(product: ProductLike) {
  const type = productTypeOf(product);
  return type === "service" || (type === "utility" && !isDigitalUtilityProduct(product));
}

/** Only physical products need a courier/shipping checkout. */
export function requiresProductShipping(product: ProductLike) {
  const type = productTypeOf(product);
  // Empty type is retained as a physical fallback for older product records
  // created before productType was stored.
  return type === "physical" || type === "";
}

export function productPreviewAudioUrl(product: ProductLike) {
  const url = product.previewAudioUrl || product.audioPreviewUrl || product.previewUrl || product.audioUrl;
  return typeof url === "string" && url.trim() ? url.trim() : "";
}
