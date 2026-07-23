import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const targets = {
  next: process.env.NEXT_BENCHMARK_URL ?? "https://hydrogen-next-benchmark.vercel.app",
  vinext:
    process.env.VINEXT_BENCHMARK_URL ??
    "https://hydrogen-vinext-benchmark.southpolesteve.workers.dev",
};

const routes = [
  { name: "home", path: "/" },
  { name: "collections", path: "/collections" },
  { name: "product", path: "/products/v2-snowboard" },
  { name: "search", path: "/search?q=snowboard" },
];

const warmSamples = Number(process.env.BENCH_WARM_SAMPLES ?? 30);
const uniqueSamples = Number(process.env.BENCH_UNIQUE_SAMPLES ?? 15);
const shopifySamples = Number(process.env.BENCH_SHOPIFY_SAMPLES ?? 10);

// Both deployments render against the same Shopify Storefront API. This
// baseline queries that API directly from the benchmark client so every run
// records the shared upstream floor — Shopify's self-reported processing time
// (its `server-timing` header) plus the wire cost of reaching it — measured at
// the same time and from the same vantage as the page samples.
const shopifyDomain = process.env.PUBLIC_STORE_DOMAIN ?? "hydrogen-preview.myshopify.com";
const shopifyToken =
  process.env.PUBLIC_STOREFRONT_API_TOKEN ??
  (shopifyDomain === "hydrogen-preview.myshopify.com"
    ? "33ad0f277e864013b8e3c21d19432501"
    : null);
const shopifyEndpoint = `https://${shopifyDomain}/api/2026-04/graphql.json`;
const shopifyQueries = [
  { name: "shop", query: "{ shop { name } }" },
  {
    name: "product",
    query:
      '{ product(handle: "v2-snowboard") { id title variants(first: 1) { nodes { id } } } }',
  },
];

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

async function request(url, target) {
  const format = [
    "code=%{http_code}",
    "ttfb=%{time_starttransfer}",
    "total=%{time_total}",
    "bytes=%{size_download}",
    "ip=%{remote_ip}",
    "vercel=%header{x-vercel-cache}",
    "cloudflare=%header{cf-cache-status}",
    "cacheControl=%header{cache-control}",
    "vercelId=%header{x-vercel-id}",
    "cfRay=%header{cf-ray}",
  ].join("\\t");
  const args = [
    "--compressed",
    "--http2",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "--write-out",
    format,
  ];
  if (target === "next" && process.env.VERCEL_PROTECTION_BYPASS) {
    args.push(
      "--header",
      `x-vercel-protection-bypass: ${process.env.VERCEL_PROTECTION_BYPASS}`,
    );
  }
  args.push(url);
  const { stdout } = await execFileAsync("curl", args);

  return Object.fromEntries(
    stdout
      .trim()
      .split("\t")
      .map((field) => field.split(/=(.*)/s).slice(0, 2)),
  );
}

// server-timing looks like: processing;dur=18;desc="gc:1", db;dur=5, edge;desc="ORD", ...
function parseServerTiming(header) {
  const timing = {};
  for (const part of (header ?? "").split(",")) {
    const [name, ...attributes] = part.trim().split(";");
    for (const attribute of attributes) {
      const [key, value] = attribute.split("=");
      if (key === "dur") timing[`${name}Ms`] = Number(value);
      if (key === "desc" && name === "edge") timing.edge = value.replaceAll('"', "");
    }
  }
  return timing;
}

async function shopifyRequest(query) {
  const format = [
    "code=%{http_code}",
    "ttfb=%{time_starttransfer}",
    "total=%{time_total}",
    "serverTiming=%header{server-timing}",
    "dc=%header{x-dc}",
  ].join("\\t");
  const { stdout } = await execFileAsync("curl", [
    "--compressed",
    "--http2",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "--write-out",
    format,
    "--request",
    "POST",
    "--header",
    "Content-Type: application/json",
    "--header",
    `X-Shopify-Storefront-Access-Token: ${shopifyToken}`,
    "--data",
    JSON.stringify({ query }),
    shopifyEndpoint,
  ]);
  return Object.fromEntries(
    stdout
      .trim()
      .split("\t")
      .map((field) => field.split(/=(.*)/s).slice(0, 2)),
  );
}

async function runShopifyBaseline() {
  for (const { query } of shopifyQueries) await shopifyRequest(query);
  const results = [];
  for (let sample = 0; sample < shopifySamples; sample += 1) {
    for (const { name, query } of shopifyQueries) {
      const measured = await shopifyRequest(query);
      if (measured.code !== "200") {
        throw new Error(`Invalid Shopify baseline response for ${name}: ${JSON.stringify(measured)}`);
      }
      const timing = parseServerTiming(measured.serverTiming);
      results.push({
        query: name,
        ttfbMs: Number(measured.ttfb) * 1000,
        totalMs: Number(measured.total) * 1000,
        processingMs: timing.processingMs ?? null,
        dbMs: timing.dbMs ?? null,
        edge: timing.edge ?? "",
        dc: measured.dc ?? "",
      });
    }
  }
  return results;
}

function summarizeShopify(results) {
  const groups = Map.groupBy(results, (result) => result.query);
  return [...groups.entries()].map(([query, group]) => {
    const processing = group.map((result) => result.processingMs).filter((n) => n != null);
    const wire = group
      .filter((result) => result.processingMs != null)
      .map((result) => result.ttfbMs - result.processingMs);
    return {
      query,
      samples: group.length,
      edge: [...new Set(group.map((result) => result.edge).filter(Boolean))].join(","),
      dc: [...new Set(group.map((result) => result.dc).filter(Boolean))].join(","),
      ttfbP50: percentile(group.map((result) => result.ttfbMs), 0.5),
      ttfbP95: percentile(group.map((result) => result.ttfbMs), 0.95),
      processingP50: processing.length ? percentile(processing, 0.5) : null,
      wireP50: wire.length ? percentile(wire, 0.5) : null,
    };
  });
}

async function runPass(name, samples, uniqueQuery) {
  const jobs = [];
  const passId = Date.now();
  for (let sample = 0; sample < samples; sample += 1) {
    for (const [target, origin] of Object.entries(targets)) {
      for (const route of routes) {
        const separator = route.path.includes("?") ? "&" : "?";
        jobs.push({
          pass: name,
          sample,
          target,
          route: route.name,
          url: uniqueQuery
            ? `${origin}${route.path}${separator}bench=${passId}-${sample}-${target}`
            : `${origin}${route.path}`,
        });
      }
    }
  }

  const results = [];
  for (const job of shuffle(jobs)) {
    const measured = await request(job.url, job.target);
    if (measured.code !== "200" || !Number.isFinite(Number(measured.ttfb))) {
      throw new Error(`Invalid benchmark response for ${job.url}: ${JSON.stringify(measured)}`);
    }
    results.push({
      ...job,
      code: Number(measured.code),
      ttfbMs: Number(measured.ttfb) * 1000,
      totalMs: Number(measured.total) * 1000,
      bytes: Number(measured.bytes),
      remoteIp: measured.ip,
      cache: measured.vercel || measured.cloudflare || "",
      cacheControl: measured.cacheControl,
      region: measured.vercelId || measured.cfRay || "",
    });
  }
  return results;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarize(results) {
  const groups = Map.groupBy(
    results,
    (result) => `${result.pass}:${result.route}:${result.target}`,
  );
  return [...groups.entries()].map(([key, group]) => {
    const [pass, route, target] = key.split(":");
    const ttfb = group.map((result) => result.ttfbMs);
    const total = group.map((result) => result.totalMs);
    return {
      pass,
      route,
      target,
      samples: group.length,
      status: [...new Set(group.map((result) => result.code))].join(","),
      cache: [...new Set(group.map((result) => result.cache).filter(Boolean))].join(","),
      cacheControl: [
        ...new Set(group.map((result) => result.cacheControl).filter(Boolean)),
      ].join(","),
      ttfbP50: percentile(ttfb, 0.5),
      ttfbP95: percentile(ttfb, 0.95),
      totalP50: percentile(total, 0.5),
      totalP95: percentile(total, 0.95),
      bytesP50: percentile(
        group.map((result) => result.bytes),
        0.5,
      ),
    };
  });
}

for (const [target, origin] of Object.entries(targets)) {
  for (const route of routes) {
    await request(`${origin}${route.path}`, target);
    await request(`${origin}${route.path}`, target);
  }
}

const startedAt = new Date().toISOString();
const results = [
  ...(await runPass("repeated", warmSamples, false)),
  ...(await runPass("unique-query", uniqueSamples, true)),
];
const summary = summarize(results);
const shopifyResults = shopifyToken ? await runShopifyBaseline() : [];
const shopifySummary = summarizeShopify(shopifyResults);
if (!shopifyToken) {
  console.warn(
    "Skipping Shopify baseline: set PUBLIC_STOREFRONT_API_TOKEN when PUBLIC_STORE_DOMAIN overrides the Hydrogen Preview store.",
  );
}
const artifact = {
  startedAt,
  finishedAt: new Date().toISOString(),
  backend: shopifyDomain,
  targets,
  warmSamples,
  uniqueSamples,
  summary,
  results,
  shopifyBaseline: {
    endpoint: shopifyEndpoint,
    samplesPerQuery: shopifySamples,
    summary: shopifySummary,
    results: shopifyResults,
  },
};

await mkdir(new URL("./results/", import.meta.url), { recursive: true });
const stamp = startedAt.replaceAll(":", "-").replaceAll(".", "-");
const output = new URL(`./results/${stamp}.json`, import.meta.url);
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);

console.table(
  summary.map((row) => ({
    pass: row.pass,
    route: row.route,
    target: row.target,
    cache: row.cache,
    "TTFB p50": row.ttfbP50.toFixed(1),
    "TTFB p95": row.ttfbP95.toFixed(1),
    "total p50": row.totalP50.toFixed(1),
    "total p95": row.totalP95.toFixed(1),
    bytes: row.bytesP50,
  })),
);
if (shopifySummary.length) {
  console.table(
    shopifySummary.map((row) => ({
      query: row.query,
      edge: row.edge,
      dc: row.dc,
      "TTFB p50": row.ttfbP50.toFixed(1),
      "TTFB p95": row.ttfbP95.toFixed(1),
      "Shopify processing p50": row.processingP50?.toFixed(1) ?? "n/a",
      "wire p50": row.wireP50?.toFixed(1) ?? "n/a",
    })),
  );
}
console.log(`Results: ${output.pathname}`);
