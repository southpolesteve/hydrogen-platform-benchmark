# Hydrogen — Next.js (App Router) example

A brand-new Next.js 16 (App Router, Turbopack, React 19.2) storefront example,
translating `examples/core` idiomatically into Next.js and bound to
`@shopify/hydrogen`. The same source runs on Next/Vercel and Vinext/Cloudflare
Workers. Zero secrets required (mock.shop fallback).

## Scripts

- `pnpm --filter @shopify/hydrogen-example-nextjs dev` — dev server (Turbopack).
- `pnpm --filter @shopify/hydrogen-example-nextjs build` — production build.
- `pnpm --filter @shopify/hydrogen-example-nextjs start` — serve the build.
- `pnpm --filter @shopify/hydrogen-example-nextjs dev:vinext` — Vinext dev
  server on port 3001.
- `pnpm --filter @shopify/hydrogen-example-nextjs build:vinext` — Vinext
  production build.
- `pnpm --filter @shopify/hydrogen-example-nextjs deploy:vinext` — deploy the
  Vinext build to Cloudflare Workers.
- `pnpm --filter @shopify/hydrogen-example-nextjs typecheck` — `tsc` +
  `gql.tada check --fail-on-warn`.

See the repository-level [`BENCHMARK.md`](../../BENCHMARK.md) for live URLs,
results, and cache-behavior notes.

## Architecture

- **Request lifecycle:** `proxy.ts` (`handleShopifyRoutes` pre-routing +
  forwarded headers + mock.shop fallback) + `app/not-found.tsx`
  (`handleShopifyRedirects` post-404).
- **Storefront client:** `getStorefrontClient()` (per-buyer, cart seed only) +
  `staticStorefrontClient` (shared rate-limit, all catalog reads) — F2. A
  browser-safe `publicStorefrontClient` (`lib/public-storefront.ts`) is provided
  for future client-side Storefront fetches (e.g. TanStack Query); browser
  predictive search currently goes through the same-origin
  `/api/predictive-search` handler instead.
- **Layout:** shared code lives at the top level — `lib/` (storefront clients,
  queries, fragments, cart, analytics, image, money, filters, markets) and
  `components/` (Header, ProductCard, CartDrawer, …). `app/` holds only route
  files. Imports use the `@/` alias (`tsconfig` `"@/*": ["./*"]`).
- **Caching:** Next-native `use cache` + `cacheLife`/`cacheTag` cache-points
  keyed by serializable inputs (`cacheComponents: true`). No Oxygen LRU.
- **Cart seed (F1, F4):** root layout is a static shell wrapping an async
  `AppShell` (cart seed via `Promise.race` + analytics shop) in `<Suspense>` —
  the Cache Components idiom (static shell prerenders, per-buyer parts stream).
- **Markets:** `getMarketFromHeaders` reads `x-storefront-url`; the client
  auto-injects `$country`/`$language` (never passed in query variables).
- **No-JS (F4):** variant GET-links switch variants server-side; cart reachable
  via footer `/cart`; filter forms `method="get"` + explicit `action`.

## mock.shop fallback

When no `PRIVATE_STOREFRONT_API_TOKEN` is present, the example falls back to
`mock.shop` + `mock-private-token` so it runs with zero secrets. Decrypt
secrets (`pnpm examples:secrets:decrypt`) to hit a real store.

## Customer Accounts (local HTTPS + real store)

Customer Accounts require an HTTPS origin (Shopify OAuth rejects `http`) and a
real store (mock.shop has no Customer Account API).

One-time setup:

1. `pnpm https:setup` (repo root) — trusts `mkcert` and creates the
   `.cert/localtest.me*` certificates.
2. `pnpm examples:secrets:decrypt` — provisions `PRIVATE_STOREFRONT_API_TOKEN`
   so the example runs against a real store instead of mock.shop.

Run the HTTPS dev server and open <https://localtest.me:5173>:

```
pnpm --filter @shopify/hydrogen-example-nextjs https:dev
```

The `/account` page shows your name + email. `/account/login`,
`/account/logout`, `/account/refresh`, and `/account/authorize` are
Hydrogen-owned routes intercepted in `proxy.ts` (no app route files exist for
them) — Customer Account OAuth login/refresh/logout is handled there. The
header account link is hidden on mock.shop and shown only when a real store is
configured.

## Production builds

The example uses a normal `next build`. The earlier `--debug-prerender`
workaround for `/_global-error` is no longer necessary with the current
Next.js and React patch releases.
