import assert from "node:assert/strict";
import test from "node:test";
import { loadHasnariaData } from "../lib/hasnaria-monitoring";

const githubUrl = "https://api.github.com/repos/ekariashoesanti-alt/Hasnaria-ice-cream/pulls";
const envKeys = [
  "HASNARIA_GITHUB_TOKEN",
  "HASNARIA_VERCEL_TOKEN",
  "HASNARIA_SUPABASE_MANAGEMENT_TOKEN",
] as const;

async function withMockedFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
  assertResult: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  try {
    await assertResult();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
}

test("Hasnaria reads only the GitHub PR API without server monitoring tokens", async () => {
  const requests: string[] = [];
  await withMockedFetch((url, init) => {
    requests.push(url);
    assert.equal(url.startsWith(githubUrl), true);
    assert.equal(init?.cache, "no-store");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, undefined);
    return new Response(JSON.stringify([
      { number: 42, title: "Review purchase lineage", html_url: "https://github.com/ekariashoesanti-alt/Hasnaria-ice-cream/pull/42", updated_at: "2026-10-18T05:00:00Z" },
      { number: 43, title: "Untrusted URL excluded", html_url: "https://example.com/phishing", updated_at: "2026-10-18T05:00:00Z" },
    ]), { status: 200 });
  }, async () => {
    const result = await loadHasnariaData();
    assert.equal(result.githubSource, "live");
    assert.deepEqual(result.openPrs.map((pr) => pr.number), [42]);
    assert.equal(result.vercel.source, "snapshot");
    assert.equal(result.production.source, "snapshot");
    assert.equal(result.staging.source, "snapshot");
    assert.equal(result.production.value, "ACTIVE_HEALTHY");
  });
  assert.equal(requests.length, 1);
});

test("GitHub upstream failure uses explicitly labelled dated snapshot", async () => {
  await withMockedFetch((_url) => new Response("Rate limited", { status: 403 }), async () => {
    const result = await loadHasnariaData();
    assert.equal(result.githubSource, "snapshot");
    assert.match(result.githubNote, /snapshot 18 Oktober 2026/);
    assert.deepEqual(result.openPrs.map((pr) => pr.number), [88, 83]);
    assert.equal(result.vercel.source, "snapshot");
    assert.ok(result.vercel.checkedAt.startsWith("2026-10-18"));
  });
});
