/**
 * Capability flags / feature gates used across routes + auth.
 * Keep keys stable; treat as public API for internal permissioning.
 */
export const CAPS = {
  // Learning / content
  LEARN_READ: "learn:read",
  LEARN_WRITE: "learn:write",

  // Marketplace
  MARKET_READ: "market:read",
  MARKET_PURCHASE: "market:purchase",

  // Admin
  ADMIN_READ: "admin:read",
  ADMIN_WRITE: "admin:write",

  // Publishing
  PUBLISH: "publish"
} as const;

export type Cap = (typeof CAPS)[keyof typeof CAPS];
