export type PortalRole = "admin" | "vendor" | "buyer" | "unknown";

type ProfileSource = {
  exists: boolean;
  role?: unknown;
};

type PortalRoleInput = {
  admin: ProfileSource;
  store: ProfileSource;
  vendor: ProfileSource;
  buyer: ProfileSource;
  user: ProfileSource;
  tokenRole?: unknown;
};

function normalizedRole(value: unknown): PortalRole | "" {
  return value === "admin" || value === "vendor" || value === "buyer" ? value : "";
}

/**
 * Resolves the portal from explicit role data first. A store document alone is
 * only a legacy vendor fallback; payment syncs must not turn buyers into
 * vendors merely by creating a partial store document.
 */
export function resolvePortalRole(input: PortalRoleInput): PortalRole {
  if (input.admin.exists) return "admin";

  const vendorRole = normalizedRole(input.vendor.role) || normalizedRole(input.store.role) || normalizedRole(input.user.role);
  const buyerRole = normalizedRole(input.buyer.role) || normalizedRole(input.user.role);

  if (input.vendor.exists || vendorRole === "vendor") return "vendor";
  if (input.buyer.exists || buyerRole === "buyer") return "buyer";

  // Preserve support for older vendor accounts that only have a stores doc.
  if (input.store.exists) return "vendor";
  if (input.user.exists) return "buyer";

  const tokenRole = normalizedRole(input.tokenRole);
  return tokenRole || "unknown";
}
