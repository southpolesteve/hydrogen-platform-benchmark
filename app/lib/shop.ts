// ─────────────────────────────────────────────────────────────────────────────
// Store configuration.
//
// Mode is auto-detected per request (see `getStorefrontMode` below):
//   • Private store — used whenever a PRIVATE Storefront API token is present.
//   • Public store — the default. It uses Shopify's real public
//     Hydrogen Preview store unless PUBLIC_STORE_DOMAIN overrides it.
//   • mock.shop — available only when explicitly forced with MOCK_SHOP=1.
//
// `storeDomain` below is the default used only when PUBLIC_STORE_DOMAIN is unset.
// It points at Shopify's public Hydrogen Preview store, a real Shopify backend.
// ─────────────────────────────────────────────────────────────────────────────

const HYDROGEN_PREVIEW_DOMAIN = "hydrogen-preview.myshopify.com";
const HYDROGEN_PREVIEW_PUBLIC_TOKEN = "33ad0f277e864013b8e3c21d19432501";

export const storefrontConfig = {
  storeDomain: HYDROGEN_PREVIEW_DOMAIN,
  i18n: { country: "US", language: "EN" },
} as const;

// Analytics shop identity. The Hydrogen sales channel populates SHOP_ID and
// PUBLIC_STOREFRONT_ID for a linked store (e.g. via `shopify hydrogen env pull`,
// or set them in `.env` / your host's project env). We read those and fall back
// to the public Hydrogen Preview store so a fresh deploy still renders.
function toShopGid(shopId: string): string {
  return shopId.startsWith("gid://") ? shopId : `gid://shopify/Shop/${shopId}`;
}

export const analyticsShop = {
  shopId: process.env.SHOP_ID
    ? toShopGid(process.env.SHOP_ID)
    : "gid://shopify/Shop/55145660472",
  acceptedLanguage: "EN",
  currency: "USD",
  hydrogenSubchannelId: process.env.PUBLIC_STOREFRONT_ID || "1000014875",
} as const;

export const analyticsConsent = {
  mode: "custom-banner",
  country: "US",
  language: "EN",
} as const;

export function getStorefrontMode(
  env:
    | { MOCK_SHOP?: string; PRIVATE_STOREFRONT_API_TOKEN?: string }
    | Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): "mock" | "public" | "private" {
  if (env.MOCK_SHOP === "1") return "mock";
  if (env.PRIVATE_STOREFRONT_API_TOKEN) return "private";
  return "public";
}

// Store domain for real-store mode: prefer PUBLIC_STORE_DOMAIN from the
// environment (set it in `.env` locally or in your host's project env vars), else
// fall back to the configured default above.
export function getStoreDomain(
  env:
    | { PUBLIC_STORE_DOMAIN?: string }
    | Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  return env.PUBLIC_STORE_DOMAIN || storefrontConfig.storeDomain;
}

export function getPublicStorefrontToken(
  env:
    | { PUBLIC_STORE_DOMAIN?: string; PUBLIC_STOREFRONT_API_TOKEN?: string }
    | Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  if (env.PUBLIC_STOREFRONT_API_TOKEN) return env.PUBLIC_STOREFRONT_API_TOKEN;
  if (getStoreDomain(env) === HYDROGEN_PREVIEW_DOMAIN) return HYDROGEN_PREVIEW_PUBLIC_TOKEN;
  throw new Error(
    "PUBLIC_STOREFRONT_API_TOKEN is required when PUBLIC_STORE_DOMAIN overrides the Hydrogen Preview store",
  );
}

export function getPrivateStorefrontToken(
  env:
    | { PRIVATE_STOREFRONT_API_TOKEN?: string }
    | Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const token = env.PRIVATE_STOREFRONT_API_TOKEN;
  if (!token) {
    throw new Error(
      "PRIVATE_STOREFRONT_API_TOKEN is required for SSR requests against a real store. " +
        "Set it in your environment (see .env.example), or run with MOCK_SHOP=1 for mock.shop.",
    );
  }
  return token;
}

export function createPublicStorefrontFetch(publicToken: string): typeof fetch {
  // Cart handlers currently require a private-client shape. Translate its
  // server-only header to Shopify's public Storefront API header on the wire.
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("shopify-storefront-private-token");
    headers.set("x-shopify-storefront-access-token", publicToken);
    return fetch(input, { ...init, headers });
  };
}

const BUYER_IP_HEADERS = ["oxygen-buyer-ip", "cf-connecting-ip", "x-forwarded-for"] as const;
export const DEVELOPMENT_BUYER_IP = "127.0.0.1";

export function getBuyerIp(headers: Pick<Headers, "get">): string {
  for (const header of BUYER_IP_HEADERS) {
    const ip = headers.get(header)?.split(",")[0]?.trim();
    if (ip) return ip;
  }
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_BUYER_IP;
  throw new Error(`${BUYER_IP_HEADERS.join(", ")} is required for private Storefront API clients`);
}
