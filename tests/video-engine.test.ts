import assert from "node:assert/strict";
import test from "node:test";
import {
  getVideoEngine,
  parseVideoRequest,
  VideoEngineError,
  wanEndpointFor,
} from "../lib/video-engine";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {"content-type": "application/json"},
  });

function useFal(t: test.TestContext) {
  const originalFetch = globalThis.fetch;
  const originalProvider = process.env.AI_ROOM_VIDEO_PROVIDER;
  const originalKey = process.env.AI_ROOM_FAL_KEY;
  process.env.AI_ROOM_VIDEO_PROVIDER = "fal";
  process.env.AI_ROOM_FAL_KEY = "test-key";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalProvider === undefined) delete process.env.AI_ROOM_VIDEO_PROVIDER;
    else process.env.AI_ROOM_VIDEO_PROVIDER = originalProvider;
    if (originalKey === undefined) delete process.env.AI_ROOM_FAL_KEY;
    else process.env.AI_ROOM_FAL_KEY = originalKey;
  });
}

test("Wan endpoint mapping covers all four supported model/mode combinations", () => {
  assert.equal(wanEndpointFor("Wan 2.2 Fast", "text"), "fal-ai/wan/v2.2-5b/text-to-video/distill");
  assert.equal(wanEndpointFor("Wan 2.2 Fast", "image"), "fal-ai/wan/v2.2-5b/image-to-video");
  assert.equal(wanEndpointFor("Wan 2.2 14B", "text"), "fal-ai/wan/v2.2-a14b/text-to-video");
  assert.equal(wanEndpointFor("Wan 2.2 14B", "image"), "fal-ai/wan/v2.2-a14b/image-to-video");
});

test("Fast text submit uses the full model endpoint and expected default payload", async t => {
  useFal(t);
  const requests: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return json({request_id: "req-fast"});
  }) as typeof fetch;

  const job = await getVideoEngine().submit(parseVideoRequest({
    prompt: "A calm cinematic sunrise over the ocean",
    mode: "text",
    model: "Wan 2.2 Fast",
    duration: "5s",
    aspect: "16:9",
    quality: "720p",
  }));

  assert.equal(job.id, "fast:text:req-fast");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, "https://queue.fal.run/fal-ai/wan/v2.2-5b/text-to-video/distill");
  assert.deepEqual(JSON.parse(requests[0].body!), {
    prompt: "A calm cinematic sunrise over the ocean",
    resolution: "720p",
    aspect_ratio: "16:9",
    frames_per_second: 24,
    num_frames: 121,
  });
});

test("official fal SDK normalizes status/result URLs and completes the lifecycle", async t => {
  useFal(t);
  const seen: Array<{url: string; method: string}> = [];
  const states = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    seen.push({url, method: init?.method ?? "GET"});
    if (url.includes("/status")) return json({status: states.shift(), request_id: "abc123"});
    if (url === "https://queue.fal.run/fal-ai/wan/requests/abc123") {
      return json({video: {url: "https://cdn.example.com/video.mp4"}});
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const engine = getVideoEngine();
  assert.equal((await engine.status("fast:text:abc123")).status, "queued");
  assert.equal((await engine.status("fast:text:abc123")).status, "processing");
  const completed = await engine.status("fast:text:abc123");

  assert.equal(completed.status, "completed");
  assert.equal(completed.videoUrl, "https://cdn.example.com/video.mp4");
  assert.equal(seen[0].url, "https://queue.fal.run/fal-ai/wan/requests/abc123/status?logs=0");
  assert.equal(seen[1].url, "https://queue.fal.run/fal-ai/wan/requests/abc123/status?logs=0");
  assert.equal(seen[2].url, "https://queue.fal.run/fal-ai/wan/requests/abc123/status?logs=0");
  assert.equal(seen[3].url, "https://queue.fal.run/fal-ai/wan/requests/abc123");
  assert.ok(seen.every(item => item.method === "GET"));
});

test("legacy raw request IDs remain compatible with the default Fast text queue", async t => {
  useFal(t);
  let requested = "";
  globalThis.fetch = (async input => {
    requested = String(input);
    return json({status: "IN_QUEUE", request_id: "legacy_123"});
  }) as typeof fetch;

  const job = await getVideoEngine().status("legacy_123");
  assert.equal(job.status, "queued");
  assert.equal(requested, "https://queue.fal.run/fal-ai/wan/requests/legacy_123/status?logs=0");
});

test("failed paid submit is never replayed by the SDK wrapper", async t => {
  useFal(t);
  let posts = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") posts += 1;
    return new Response("", {status: 503});
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().submit(parseVideoRequest({
      prompt: "A simple test scene",
      mode: "text",
      model: "Wan 2.2 Fast",
      duration: "5s",
      aspect: "16:9",
      quality: "720p",
    })),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.equal(error.retryable, true);
      assert.match(error.message, /Submission was not retried/);
      return true;
    },
  );
  assert.equal(posts, 1, "a failed paid submission must issue only one POST");
});

test("completed provider result without a safe video URL is rejected", async t => {
  useFal(t);
  globalThis.fetch = (async input => {
    const url = String(input);
    if (url.includes("/status")) return json({status: "COMPLETED", request_id: "missingvideo"});
    return json({video: {}});
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().status("fast:text:missingvideo"),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.equal(error.retryable, false);
      assert.match(error.message, /valid video URL/);
      return true;
    },
  );
});
