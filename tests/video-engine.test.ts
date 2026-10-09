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


test("Fast image submit uses image endpoint and reference payload", async t => {
  useFal(t);
  const requests: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined});
    return json({request_id: "req-fast-image"});
  }) as typeof fetch;

  const job = await getVideoEngine().submit(parseVideoRequest({
    prompt: "Animate this reference image gently",
    mode: "image",
    model: "Wan 2.2 Fast",
    duration: "5s",
    aspect: "9:16",
    quality: "580p",
    imageUrl: "data:image/png;base64,AAAA",
  }));

  assert.equal(job.id, "fast:image:req-fast-image");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://queue.fal.run/fal-ai/wan/v2.2-5b/image-to-video");
  assert.deepEqual(JSON.parse(requests[0].body!), {
    prompt: "Animate this reference image gently",
    resolution: "580p",
    aspect_ratio: "9:16",
    frames_per_second: 24,
    num_frames: 121,
    image_url: "data:image/png;base64,AAAA",
  });
});

test("14B text 5s submit uses 16 fps and 81 frames", async t => {
  useFal(t);
  let body = "";
  let url = "";
  globalThis.fetch = (async (input, init) => {
    url = String(input);
    body = typeof init?.body === "string" ? init.body : "";
    return json({request_id: "req-14b-5"});
  }) as typeof fetch;

  const job = await getVideoEngine().submit(parseVideoRequest({
    prompt: "A cinematic mountain landscape",
    mode: "text",
    model: "Wan 2.2 14B",
    duration: "5s",
    aspect: "16:9",
    quality: "720p",
  }));

  assert.equal(job.id, "a14b:text:req-14b-5");
  assert.equal(url, "https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video");
  assert.deepEqual(JSON.parse(body), {
    prompt: "A cinematic mountain landscape",
    resolution: "720p",
    aspect_ratio: "16:9",
    frames_per_second: 16,
    num_frames: 81,
  });
});

test("14B text 10s submit uses 161 frames", async t => {
  useFal(t);
  let body = "";
  globalThis.fetch = (async (_input, init) => {
    body = typeof init?.body === "string" ? init.body : "";
    return json({request_id: "req-14b-10"});
  }) as typeof fetch;

  const job = await getVideoEngine().submit(parseVideoRequest({
    prompt: "A slow tracking shot through a forest",
    mode: "text",
    model: "Wan 2.2 14B",
    duration: "10s",
    aspect: "1:1",
    quality: "580p",
  }));

  assert.equal(job.id, "a14b:text:req-14b-10");
  assert.equal(JSON.parse(body).frames_per_second, 16);
  assert.equal(JSON.parse(body).num_frames, 161);
});

test("14B image 10s submit uses image endpoint with 161 frames", async t => {
  useFal(t);
  let url = "";
  let body = "";
  globalThis.fetch = (async (input, init) => {
    url = String(input);
    body = typeof init?.body === "string" ? init.body : "";
    return json({request_id: "req-14b-image"});
  }) as typeof fetch;

  const job = await getVideoEngine().submit(parseVideoRequest({
    prompt: "Subtle camera push and natural motion",
    mode: "image",
    model: "Wan 2.2 14B",
    duration: "10s",
    aspect: "16:9",
    quality: "720p",
    imageUrl: "data:image/jpeg;base64,AAAA",
  }));

  assert.equal(job.id, "a14b:image:req-14b-image");
  assert.equal(url, "https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video");
  const payload = JSON.parse(body);
  assert.equal(payload.frames_per_second, 16);
  assert.equal(payload.num_frames, 161);
  assert.equal(payload.image_url, "data:image/jpeg;base64,AAAA");
});

test("malformed successful submit response is not replayed", async t => {
  useFal(t);
  let posts = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") posts += 1;
    return new Response('{"request_id":', {status: 200, headers: {"content-type": "application/json"}});
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().submit(parseVideoRequest({
      prompt: "A paid request with a broken response",
      mode: "text",
      model: "Wan 2.2 Fast",
      duration: "5s",
      aspect: "16:9",
      quality: "720p",
    })),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.match(error.message, /unreadable response/i);
      assert.match(error.message, /Submission was not retried/);
      return true;
    },
  );
  assert.equal(posts, 1, "a malformed 2xx submit response must never replay the paid POST");
});

test("network failure during paid submit is not replayed", async t => {
  useFal(t);
  let posts = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") posts += 1;
    throw new TypeError("connection reset after write");
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().submit(parseVideoRequest({
      prompt: "A paid request with a lost response",
      mode: "text",
      model: "Wan 2.2 Fast",
      duration: "5s",
      aspect: "16:9",
      quality: "720p",
    })),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.match(error.message, /Submission was not retried/);
      return true;
    },
  );
  assert.equal(posts, 1, "a network failure must not cause the SDK to replay the paid POST");
});

test("missing provider job maps to a permanent not-found error", async t => {
  useFal(t);
  let gets = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") gets += 1;
    return new Response("", {status: 404});
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().status("fast:text:missing123"),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.equal(error.httpStatus, 404);
      assert.equal(error.retryable, false);
      assert.match(error.message, /not found|expired/i);
      return true;
    },
  );
  assert.equal(gets, 1);
});

test("temporary provider status failure is retryable without SDK replay", async t => {
  useFal(t);
  let gets = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "GET") gets += 1;
    return new Response("", {status: 503});
  }) as typeof fetch;

  await assert.rejects(
    () => getVideoEngine().status("fast:text:temporary123"),
    (error: unknown) => {
      assert.ok(error instanceof VideoEngineError);
      assert.equal(error.retryable, true);
      assert.match(error.message, /temporarily unavailable/i);
      return true;
    },
  );
  assert.equal(gets, 1, "read-only UI polling owns retries, not the SDK request wrapper");
});

test("provider-reported completed error becomes a failed job without fetching result", async t => {
  useFal(t);
  const seen: string[] = [];
  globalThis.fetch = (async input => {
    seen.push(String(input));
    return json({status: "COMPLETED", request_id: "failed123", error: "generation failed"});
  }) as typeof fetch;

  const job = await getVideoEngine().status("fast:text:failed123");
  assert.equal(job.status, "failed");
  assert.equal(seen.length, 1);
  assert.match(seen[0], /\/status\?logs=0$/);
});
