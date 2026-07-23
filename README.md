# Hydrogen platform benchmark

This repository runs Shopify's official standalone Next.js Hydrogen template on
two production stacks from the same source tree:

- [Next.js on Vercel](https://hydrogen-next-benchmark.vercel.app)
- [Vinext on Cloudflare Workers](https://hydrogen-vinext-benchmark.southpolesteve.workers.dev)

It is based on
[`Shopify/hydrogen/templates/nextjs`](https://github.com/Shopify/hydrogen/tree/preview/templates/nextjs)
from preview commit
[`f216581`](https://github.com/Shopify/hydrogen/commit/f21658105fb68f0dda795142494ebce8f7325e90).
The application source is shared by both targets. The only storefront change
is a small backend selector that makes Shopify's real public Hydrogen Demo Store
the zero-config default; the Vinext configuration and benchmark harness are the
platform-specific additions.

See [BENCHMARK.md](./BENCHMARK.md) for the July 22, 2026 results and raw-data
links.

## Template behavior

This template does not use Next.js Cache Components, `use cache`, ISR, or a KV
adapter. Both deployments dynamically render each request and return
`no-store`, making this a comparison of the two production runtime stacks rather
than their page caches.

## Storefront

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FShopify%2Fhydrogen%2Ftree%2Fpreview%2Ftemplates%2Fnextjs)

A Next.js 16 App Router storefront built on [`@shopify/hydrogen`](https://www.npmjs.com/package/@shopify/hydrogen) for the Node.js runtime and Vercel. It's a standalone starting point you can clone and build your store on top of — five storefront pages on a shared layout, with a real cart, analytics, and a consent banner wired up.

## Pages

- `/` — home (editorial hero, best sellers, shop by category)
- `/products/:handle` — product detail (gallery, variants, add to cart)
- `/collections` — all collections
- `/collections/:handle` — collection with filters, sort, and pagination
- `/search` — product search with the same filtering
- `/cart` — cart (also the no-JS fallback for the cart drawer)

## What it demonstrates

- Next.js App Router with Server Components as the data path; each page owns its GraphQL query (typed via `gql.tada`).
- A real cart: storefront client + request handlers + `/api/cart` + an accessible cart drawer wired to Shopify Standard Actions.
- A shared layout (header with mobile nav, footer, announcement bar).
- Analytics + a consent banner.
- The design tokens in `app/tokens.css` and SVG icons in `public/icons/`.

## Run it

```bash
pnpm install
pnpm dev
```

**Zero-config real store** — with no environment variables, the app uses
Shopify's public Hydrogen Demo Store at `hydrogen-preview.myshopify.com`. Its
published public Storefront API token supports the complete product, search,
cart, inventory, and checkout flow.

To use the synthetic `mock.shop` backend instead, force it explicitly:

```bash
MOCK_SHOP=1 pnpm dev
```

**Against another public store** — set its domain and public Storefront API
token:

```bash
cp .env.example .env   # set PUBLIC_STORE_DOMAIN + PUBLIC_STOREFRONT_API_TOKEN
pnpm dev
```

**Against a private store** — add the server-only private Storefront API token:

```bash
cp .env.example .env   # set PUBLIC_STORE_DOMAIN + PRIVATE_STOREFRONT_API_TOKEN
pnpm dev
```

Mode is **auto-detected**: `MOCK_SHOP=1` selects mock.shop; otherwise a
`PRIVATE_STOREFRONT_API_TOKEN` selects private server access; with neither, the
app uses public Storefront API access. The default public store and token are
Shopify's published Hydrogen Demo Store credentials, so a fresh local run or
deploy is a real end-to-end Shopify storefront.

Useful commands:

| Script | Does |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server. |
| `pnpm build` | Build the production Next.js app. |
| `pnpm start` | Start the production server after `pnpm build`. |
| `pnpm dev:vinext` | Start the Vinext dev server on port 3001. |
| `pnpm build:vinext` | Build the Vinext production app. |
| `pnpm start:vinext` | Start the built Cloudflare Worker locally. |
| `pnpm deploy:vinext` | Deploy the built app to Cloudflare Workers. |
| `pnpm benchmark` | Benchmark both configured production URLs. |
| `pnpm lint` | Run ESLint. |
| `pnpm typecheck` | Run `tsc --noEmit` and `gql.tada check`. |

## Deploy to Vercel

The fastest path is one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FShopify%2Fhydrogen%2Ftree%2Fpreview%2Ftemplates%2Fnextjs)

1. Click **Deploy with Vercel** above. Vercel clones this template into a new repository on your own Git provider (GitHub, GitLab, or Bitbucket).
2. Keep the auto-detected Next.js settings (`next build`; no `vercel.json` needed).
3. Deploy. The first build renders immediately against Shopify's real public Hydrogen Demo Store with no environment variables.
4. Connect your store: add `PUBLIC_STORE_DOMAIN` and either `PUBLIC_STOREFRONT_API_TOKEN` or `PRIVATE_STOREFRONT_API_TOKEN` under **Project Settings → Environment Variables**, then redeploy.

Prefer to wire it up yourself? Push this project to a Git provider, import it in
Vercel, keep the detected Next.js settings, and deploy. The same backend
auto-detection applies. Vercel runs this storefront on the Node.js runtime that
Next.js auto-detects.

## Where to start

- Swap the store in `app/lib/shop.ts` + `.env` (or Vercel environment variables).
- Pages live in `app/`; shared UI in `app/components/`; data/query helpers in `app/lib/`.
- The design is yours to change — `app/tokens.css` holds the design tokens; the components use them via semantic classes.

## License

MIT — see [LICENSE](./LICENSE).
