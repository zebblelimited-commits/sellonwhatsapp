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
 * Resolves the portal from explicit role data and profile ownership. Seller
 * profiles are checked before shared buyer/user data so a stale shared profile
 * cannot send a seller to the buyer dashboard.
 */
export function resolvePortalRole(input: PortalRoleInput): PortalRole {
  if (input.admin.exists) return "admin";

  const vendorRole = normalizedRole(input.vendor.role) || normalizedRole(input.store.role) || normalizedRole(input.user.role);
  const buyerRole = normalizedRole(input.buyer.role) || normalizedRole(input.user.role);

  // A vendor/store profile is the strongest seller signal. This also repairs
  // older accounts whose shared users document was incorrectly left as buyer.
  if (input.vendor.exists || input.store.exists || vendorRole === "vendor") return "vendor";
  if (input.buyer.exists || buyerRole === "buyer") return "buyer";

  if (input.user.exists) return "buyer";

  const tokenRole = normalizedRole(input.tokenRole);
  return tokenRole || "unknown";
}
