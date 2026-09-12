export interface ProductCheckoutAttributes {
  description?: string;
  category?: string;
  productType?: string;
  weightKg?: number;
  /** FEZ expects the weight field in kilograms. */
  weight?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  const result = String(value ?? "").trim();
  return result || undefined;
}

/** Maps product fields needed by checkout, courier quotes, and dispatch. */
export function productCheckoutAttributes(product: unknown): ProductCheckoutAttributes {
  if (!product || typeof product !== "object") return {};

  const record = product as Record<string, unknown>;
  const shipping = record.shipping && typeof record.shipping === "object"
    ? record.shipping as Record<string, unknown>
    : {};
  const category = text(record.category ?? record.subCategory ?? record.mainCategory);

  return {
    ...(text(record.description) ? { description: text(record.description) } : {}),
    ...(category ? { category } : {}),
    ...(text(record.productType) ? { productType: text(record.productType) } : {}),
    ...(positiveNumber(shipping.weightKg)
      ? { weightKg: positiveNumber(shipping.weightKg), weight: positiveNumber(shipping.weightKg) }
      : {}),
    ...(positiveNumber(shipping.lengthCm) ? { lengthCm: positiveNumber(shipping.lengthCm) } : {}),
    ...(positiveNumber(shipping.widthCm) ? { widthCm: positiveNumber(shipping.widthCm) } : {}),
    ...(positiveNumber(shipping.heightCm) ? { heightCm: positiveNumber(shipping.heightCm) } : {}),
  };
}
