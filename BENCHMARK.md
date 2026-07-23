# Benchmark results

Run from a residential connection in Chicago on July 22, 2026. These results
compare the complete deployed stacks, not just Next.js and Vinext in isolation.

## Deployments

| Stack | Versions | Observed route |
| --- | --- | --- |
| Next.js + Vercel | Next.js 16.2.7, React 19.2.8 | CLE edge, IAD function |
| Vinext + Cloudflare | Vinext 1.0.0-beta.3, Vite 8.1.5 | ORD Worker |

Both deployments use the same application source and the same real Shopify
backend: the public Hydrogen Demo Store at
`hydrogen-preview.myshopify.com`. The measured product was The Hydrogen
Snowboard and search used `snowboard`. Product, collection, search, cart, and
checkout all use Shopify's Storefront API rather than mock.shop.

The template does not use Cache Components, `use cache`, ISR, KV, or another
application cache. Every measured response was HTTP 200. Vercel returned `MISS`
with `private, no-cache, no-store`; Cloudflare returned `no-store` without a
cache hit.

## Sequential requests

The harness shuffled requests between platforms and four routes: home,
collections, product, and search. It collected 30 repeated-URL samples and 15
unique-query samples per route and platform, 360 measured requests in total,
after warm-up requests.

The values below average each route's percentile so no single route dominates.

| Pass | Metric | Next/Vercel | Vinext/Cloudflare | Vinext delta |
| --- | ---: | ---: | ---: | ---: |
| Repeated | TTFB p50 | 277.9 ms | 278.4 ms | +0.2% |
| Repeated | TTFB p95 | 423.4 ms | 382.0 ms | -9.8% |
| Repeated | Total p50 | 339.7 ms | 279.6 ms | -17.7% |
| Repeated | Total p95 | 478.4 ms | 384.1 ms | -19.7% |
| Unique query | TTFB p50 | 293.9 ms | 280.3 ms | -4.6% |
| Unique query | TTFB p95 | 416.1 ms | 351.1 ms | -15.6% |
| Unique query | Total p50 | 340.0 ms | 281.0 ms | -17.4% |
| Unique query | Total p95 | 535.0 ms | 352.0 ms | -34.2% |

Median TTFB was effectively tied on repeated URLs and modestly favored Vinext
with unique query strings. Vinext completed the streamed response about 17% to
18% sooner at the median and had materially better tail latency in this run.

Raw data:
[`benchmarks/results/2026-07-22T20-34-25-715Z.json`](./benchmarks/results/2026-07-22T20-34-25-715Z.json)

## Five-client load

Each test used five concurrent connections for ten seconds. There were no
errors, timeouts, or non-2xx responses in the retained runs.

| Route | Stack | Requests/sec | Median latency | p99 latency |
| --- | --- | ---: | ---: | ---: |
| Home | Next/Vercel | 20.9 | 225 ms | 467 ms |
| Home | Vinext/Cloudflare | 24.6 | 185 ms | 309 ms |
| Product | Next/Vercel | 20.7 | 229 ms | 364 ms |
| Product | Vinext/Cloudflare | 26.7 | 177 ms | 287 ms |

Vinext handled about 18% more home requests and 29% more product requests per
second. Its median latency was 18% lower on home and 23% lower on product.

Vercel's custom production domain began serving its automated security
checkpoint during sustained load. The retained Vercel load tests therefore hit
the immutable production deployment URL with a temporary automation-bypass
header. It is the same deployed build and runtime as the production alias. The
bypass was revoked after the run and all challenged samples were discarded.

Raw data:
[`Next home`](./benchmarks/results/load-real-next-home.json),
[`Next product`](./benchmarks/results/load-real-next-product.json),
[`Vinext home`](./benchmarks/results/load-real-vinext-home.json), and
[`Vinext product`](./benchmarks/results/load-real-vinext-product.json).

## Build and client assets

Clean local production builds ran on the same machine, one at a time.

| Metric | Next.js | Vinext |
| --- | ---: | ---: |
| Build wall time | 6.72 s | 2.58 s |
| Maximum resident set | 645 MiB | 754 MiB |
| All emitted JS + CSS, raw | 834 KiB | 613 KiB |
| All emitted JS + CSS, gzip | 245 KiB | 188 KiB |

Vinext built 62% faster and emitted 23% less gzipped JS/CSS across all route
chunks in this checkout. The build systems do different work, so this is useful
developer-experience and output evidence, not a claim of compiler equivalence.

Build logs:
[`Next.js`](./benchmarks/results/build-real-next.txt) and
[`Vinext`](./benchmarks/results/build-real-vinext.txt).

## End-to-end validation

- TypeScript and GraphQL checks pass.
- Clean Next.js and Vinext production builds pass.
- Browser-tested the real product page and add-to-cart on both local builds and
  both live deployments.
- Each live deployment created its own Shopify cart, showed one real line item,
  and produced a valid `checkout.hydrogen.shop` checkout URL.
- Source lint retains 7 errors and 30 warnings from the Shopify template,
  primarily its Standard Actions declarations and a state reset in
  `CollectionBrowse`. The backend adapter introduced no new lint findings.

## Interpretation and limits

- Moving from mock.shop to Shopify's real Storefront API reduced Vinext's load
  advantage from the earlier 38% to 40% range to 18% to 29%. Shared upstream
  Shopify latency now makes up more of every request, leaving less framework and
  platform time to differentiate.
- The deployments ran in different locations. Cloudflare's ORD Worker was much
  closer to the Chicago client than Vercel's IAD function, reached through CLE.
  That placement is part of the deployed-platform result and prevents
  attributing every difference to framework overhead.
- Both apps make the same live Storefront API calls on every render. Shopify may
  cache work within its own infrastructure, but neither application serves a
  cached page.
- This is one point-in-time run against a public Shopify demo store. Repeat from
  multiple geographies and times before generalizing globally.

The earlier mock.shop results remain in `benchmarks/results/` for comparison;
the real-store files use either the timestamp above or the `real` filename
prefix.

## Reproduce

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm build:vinext
pnpm benchmark
```

If Vercel challenges a load client, use a temporary Vercel automation-bypass
secret against the immutable deployment URL. Never commit that secret, and
revoke it immediately after the run.
