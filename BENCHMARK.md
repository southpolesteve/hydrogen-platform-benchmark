# Hydrogen on Next/Vercel and Vinext/Workers

This repository runs Shopify's current Hydrogen developer-preview Next.js
storefront unchanged through two production paths:

- **Next.js 16.2.11 + Vercel:** <https://hydrogen-next-benchmark.vercel.app>
- **Vinext 1.0.0-beta.3 + Cloudflare Workers:**
  <https://hydrogen-vinext-benchmark.southpolesteve.workers.dev>

Both deployments use the same App Router source in `examples/nextjs`. The
Vinext path adds only the Vite and Wrangler configuration needed to compile
that application for Workers.

## Run locally

Install and build the workspace packages from the repository root:

```sh
corepack enable
pnpm install
pnpm run build:pkgs
```

Run either development server:

```sh
pnpm --filter @shopify/hydrogen-example-nextjs dev
pnpm --filter @shopify/hydrogen-example-nextjs dev:vinext
```

No Shopify secrets are required; the example falls back to `mock.shop`.

## Production builds and deployment

```sh
# Next.js production build
pnpm --filter @shopify/hydrogen-example-nextjs build

# Vinext production build
pnpm --filter @shopify/hydrogen-example-nextjs build:vinext

# Deploy the Vinext build to the configured Cloudflare account
pnpm --filter @shopify/hydrogen-example-nextjs deploy:vinext
```

The Vercel project root is `examples/nextjs`. A collaborator deploying the
Worker under another Cloudflare account must replace the KV namespace ID in
`examples/nextjs/wrangler.jsonc`.

## Benchmark

The benchmark alternates requests between the live deployments and measures
four routes over HTTP/2. Run it from the repository root:

```sh
node benchmarks/platform.mjs
```

The primary result is
`benchmarks/results/2026-07-22T19-19-08-209Z.json` (25 warm and 10
cache-busted samples per route and target, collected from Chicago).

| Route | Target | Warm TTFB p50 | Warm response p50 | Cache state |
| --- | --- | ---: | ---: | --- |
| Home | Next/Vercel | 170.7 ms | 540.5 ms | HIT/STALE |
| Home | Vinext/Workers | 139.1 ms | 293.6 ms | BYPASS |
| Collections | Next/Vercel | 170.5 ms | 540.1 ms | HIT |
| Collections | Vinext/Workers | 138.6 ms | 304.4 ms | BYPASS |
| Search | Next/Vercel | 166.1 ms | 530.3 ms | HIT |
| Search | Vinext/Workers | 151.1 ms | 307.0 ms | BYPASS |
| Product | Next/Vercel | 170.9 ms | 556.2 ms | HIT |
| Product | Vinext/Workers | 147.2 ms | 584.5 ms | BYPASS |

In this regional test, Vinext delivered lower warm median TTFB on every route
and completed the home, collections, and search streams substantially sooner.
The product stream was effectively a tie, with Next finishing 28 ms sooner.

A five-connection, ten-second home-page load test produced 19.3 requests per
second on Vinext and 10.6 on Next. Product throughput was close: 9.9 requests
per second on Next and 8.9-9.2 on Vinext. Repeated load testing eventually
triggered Vercel's security challenge for the benchmark client, so challenged
responses were excluded.

## Important caveat: the cache models differ

These numbers are not an equal full-page-cache comparison. Next serves a
Partial Prerendering shell (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`)
while streaming request-specific cart and analytics content. The Vinext
deployment currently responds with `Cache-Control: no-store` and
`cf-cache-status: BYPASS`, rendering the document on each request.

Vinext is configured with its Workers Cache CDN adapter and KV data-cache
adapter, but the configured KV namespace remained empty after the benchmark.
That means the current Vinext result should not be interpreted as proof that
its persistent `use cache` implementation matches Next's. Unique query strings
also leave Vercel's prerendered shell cached while causing real data misses on
the Vinext product and search paths.

Other directional measurements from the same checkout:

- Production build: 6.34 seconds for Next, 2.72 seconds for Vinext. Next also
  type-checks and prerenders routes during its build.
- Client assets (gzip): 238 KB for Next, 186 KB for Vinext.
- `vinext check`: 94% compatible, with Cache Components and App Router strict
  mode reported as partially supported.

## Portability changes

The storefront mostly ran unchanged. One runtime fix was required: the shared
Hydrogen Storefront client is now initialized lazily from a request because
Cloudflare Workers prohibit the random generation it performs during module
evaluation. The Vercel monorepo build also needed explicit Turbopack and output
tracing roots. Current Next.js and React patch releases no longer need the
example's previous `--debug-prerender` build workaround.

The source baseline is Shopify Hydrogen preview commit
`f21658105fb68f0dda795142494ebce8f7325e90` from July 10, 2026.
