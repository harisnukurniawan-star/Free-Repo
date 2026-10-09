import assert from "node:assert/strict";
import test from "node:test";
import { FACE_PRESERVATION_NEGATIVE, imageMotionPrompt } from "../lib/ai-room-face";
import { getVideoEngine, parseVideoRequest } from "../lib/video-engine";

const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200, headers: {"content-type": "application/json"},
});

function useMockFal(t: test.TestContext) {
  const originalFetch = globalThis.fetch;
  const provider = process.env.AI_ROOM_VIDEO_PROVIDER;
  const key = process.env.AI_ROOM_FAL_KEY;
  process.env.AI_ROOM_VIDEO_PROVIDER = "fal";
  process.env.AI_ROOM_FAL_KEY = "test-only";
  const calls: Array<{url:string;payload:Record<string,unknown>}> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({url: String(input),payload: JSON.parse(String(init?.body))});
    return json({request_id:"face-request"});
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (provider === undefined) delete process.env.AI_ROOM_VIDEO_PROVIDER;
    else process.env.AI_ROOM_VIDEO_PROVIDER = provider;
    if (key === undefined) delete process.env.AI_ROOM_FAL_KEY;
    else process.env.AI_ROOM_FAL_KEY = key;
  });
  return calls;
}

const photo = "data:image/png;base64,AAAA";

test("face preference is valid only for image mode and rejects invalid types", () => {
  assert.equal(parseVideoRequest({prompt:"Animate", mode:"image", imageUrl:photo, preserveFace:true}).preserveFace, true);
  assert.equal(parseVideoRequest({prompt:"Animate", mode:"image", imageUrl:photo}).preserveFace, false);
  assert.equal(parseVideoRequest({prompt:"Animate", mode:"text", preserveFace:true}).preserveFace, false);
  assert.throws(() => parseVideoRequest({prompt:"Animate", mode:"image", imageUrl:photo, preserveFace:"true"}), /face consistency/);
});

test("identity guidance adds face constraints only when opted into Image to Video", () => {
  const motion="A soft smile";
  const detailed=imageMotionPrompt(motion,"image",true);
  assert.ok(detailed.includes("reference image"));
  assert.ok(detailed.includes("eye shape"));
  assert.ok(detailed.endsWith(motion));
  assert.equal(imageMotionPrompt(motion,"image",false),motion);
  assert.equal(imageMotionPrompt(motion,"text",true),motion);
  assert.ok(FACE_PRESERVATION_NEGATIVE.length<500);
});

test("Wan 2.7 image requests prioritize the reference without changing its bytes", async t => {
  const calls=useMockFal(t);
  const job=await getVideoEngine().submit(parseVideoRequest({
    prompt:"She smiles gently",mode:"image",model:"Wan 2.7",
    duration:"5s",aspect:"9:16",quality:"1080p",imageUrl:photo,preserveFace:true,
  }));
  assert.equal(job.id,"v27:image:face-request");
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://queue.fal.run/fal-ai/wan/v2.7/image-to-video");
  assert.equal(calls[0].payload.image_url,photo);
  assert.equal(calls[0].payload.enable_prompt_expansion,false);
  assert.equal(calls[0].payload.negative_prompt,FACE_PRESERVATION_NEGATIVE);
  assert.match(String(calls[0].payload.prompt),/same person/i);
});

test("Wan 3.0 Prime disables rewriting but does not pass unsupported negative_prompt", async t => {
  const calls=useMockFal(t);
  const result=await getVideoEngine().submit(parseVideoRequest({
    prompt:"Blink once",mode:"image",model:"Wan 3.0 Prime",
    duration:"5s",aspect:"9:16",quality:"1080p",imageUrl:photo,preserveFace:true,
  }));
  assert.equal(result.id,"v3prime:image:face-request");
  const payload=calls[0].payload;
  assert.equal(payload.start_image_url,photo);
  assert.equal(payload.enable_prompt_expansion,false);
  assert.equal(payload.negative_prompt,undefined);
  assert.match(String(payload.prompt),/facial identity/);
});

test("Wan 2.2 image path supports optional face constraints", async t => {
  const calls=useMockFal(t);
  await getVideoEngine().submit(parseVideoRequest({
    prompt:"A calm expression",mode:"image",model:"Wan 2.2 14B",
    duration:"5s",aspect:"1:1",quality:"720p",imageUrl:photo,preserveFace:true,
  }));
  assert.equal(calls[0].payload.image_url,photo);
  assert.equal(calls[0].payload.negative_prompt,FACE_PRESERVATION_NEGATIVE);
  assert.equal(calls[0].payload.enable_prompt_expansion,false);
});

test("opted-out image and all text video calls preserve existing payload shape", async t => {
  const calls=useMockFal(t);
  await getVideoEngine().submit(parseVideoRequest({
    prompt:"She smiles",mode:"image",model:"Wan 3.0",
    duration:"5s",aspect:"16:9",quality:"720p",imageUrl:photo,preserveFace:false,
  }));
  await getVideoEngine().submit(parseVideoRequest({
    prompt:"A garden",mode:"text",model:"Wan 2.7",
    duration:"5s",aspect:"16:9",quality:"720p",preserveFace:true,
  }));
  assert.equal(calls.length,2);
  assert.equal(calls[0].payload.enable_prompt_expansion,true);
  assert.equal(calls[0].payload.prompt,"She smiles");
  assert.equal(calls[1].payload.prompt,"A garden");
  assert.equal(calls[1].payload.negative_prompt,undefined);
  assert.equal(calls[1].payload.enable_prompt_expansion,undefined);
});
