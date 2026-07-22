import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const targets = {
  next: "https://hydrogen-next-benchmark.vercel.app",
  vinext: "https://hydrogen-vinext-benchmark.southpolesteve.workers.dev",
};

const routes = [
  { name: "home", path: "/" },
  { name: "collections", path: "/collections" },
  { name: "product", path: "/products/hoodie-old" },
  { name: "search", path: "/search?q=shirt" },
];

const warmSamples = Number(process.env.BENCH_WARM_SAMPLES ?? 25);
const missSamples = Number(process.env.BENCH_MISS_SAMPLES ?? 10);

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

async function request(url) {
  const format = [
    "code=%{http_code}",
    "ttfb=%{time_starttransfer}",
    "total=%{time_total}",
    "bytes=%{size_download}",
    "ip=%{remote_ip}",
    "vercel=%header{x-vercel-cache}",
    "cloudflare=%header{cf-cache-status}",
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
    url,
  ]);

  return Object.fromEntries(
    stdout
      .trim()
      .split("\t")
      .map((field) => field.split(/=(.*)/s).slice(0, 2)),
  );
}

async function runPass(name, samples, cacheBust) {
  const jobs = [];
  for (let sample = 0; sample < samples; sample += 1) {
    for (const [target, origin] of Object.entries(targets)) {
      for (const route of routes) {
        const separator = route.path.includes("?") ? "&" : "?";
        jobs.push({
          pass: name,
          sample,
          target,
          route: route.name,
          url: cacheBust
            ? `${origin}${route.path}${separator}bench=${Date.now()}-${sample}-${target}`
            : `${origin}${route.path}`,
        });
      }
    }
  }

  const results = [];
  for (const job of shuffle(jobs)) {
    const measured = await request(job.url);
    results.push({
      ...job,
      code: Number(measured.code),
      ttfbMs: Number(measured.ttfb) * 1000,
      totalMs: Number(measured.total) * 1000,
      bytes: Number(measured.bytes),
      remoteIp: measured.ip,
      cache: measured.vercel || measured.cloudflare || "",
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

for (const origin of Object.values(targets)) {
  for (const route of routes) {
    await request(`${origin}${route.path}`);
    await request(`${origin}${route.path}`);
  }
}

const startedAt = new Date().toISOString();
const results = [
  ...(await runPass("warm", warmSamples, false)),
  ...(await runPass("cache-busted", missSamples, true)),
];
const summary = summarize(results);
const artifact = {
  startedAt,
  finishedAt: new Date().toISOString(),
  targets,
  warmSamples,
  missSamples,
  summary,
  results,
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
console.log(`Results: ${output.pathname}`);
