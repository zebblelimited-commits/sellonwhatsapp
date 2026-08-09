export type InventoryAdjustment = {
  tracked: boolean;
  quantity: number;
  currentStock: number;
  nextStock: number;
  productUpdate: Record<string, unknown>;
  orderUpdate: Record<string, unknown>;
  error?: string;
};

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function orderQuantity(order: Record<string, unknown>) {
  const quantity = Math.floor(finiteNumber(order.quantity, 1));
  return Math.max(1, quantity);
}

/**
 * Physical products use stockCount as the canonical inventory field.
 * Services, utilities, and bookings use their own availability systems and
 * are not decremented here.
 */
export function inventoryAdjustment(
  product: Record<string, unknown>,
  order: Record<string, unknown>,
  now: unknown,
  orderId: string,
): InventoryAdjustment {
  const productType = String(product.productType || "physical").trim().toLowerCase();
  const tracked = order.isBooking !== true && product.trackInventory !== false && !["service", "utility", "booking"].includes(productType);
  const quantity = orderQuantity(order);
  const currentStock = finiteNumber(product.stockCount ?? product.stock, 0);

  if (!tracked) {
    return {
      tracked: false,
      quantity,
      currentStock,
      nextStock: currentStock,
      productUpdate: {},
      orderUpdate: {},
    };
  }

  if (currentStock < quantity) {
    return {
      tracked: true,
      quantity,
      currentStock,
      nextStock: currentStock,
      productUpdate: {},
      orderUpdate: {},
      error: `Insufficient inventory. Only ${currentStock} item${currentStock === 1 ? "" : "s"} remaining.`,
    };
  }

  const nextStock = currentStock - quantity;
  const productUpdate: Record<string, unknown> = {
    stockCount: nextStock,
    availability: nextStock <= 0 ? "out_of_stock" : "in_stock",
    updatedAt: now,
  };

  // Keep the legacy stock field synchronized for older product screens.
  if (Object.prototype.hasOwnProperty.call(product, "stock")) {
    productUpdate.stock = nextStock;
  }

  return {
    tracked: true,
    quantity,
    currentStock,
    nextStock,
    productUpdate,
    orderUpdate: {
      inventoryAdjusted: true,
      inventoryAdjustedQuantity: quantity,
      inventoryAdjustmentId: `inventory_${orderId}`,
      inventoryAdjustedAt: now,
    },
  };
}
