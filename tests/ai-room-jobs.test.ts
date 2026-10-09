test("cost preview covers Standard and Wan 2.6 premium resolutions", () => {
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Standard",mode:"text",duration:"5s",quality:"720p"}),0.15);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Standard",mode:"image",duration:"5s",quality:"720p"}),0.15);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Standard",mode:"text",duration:"10s",quality:"720p"}),null);
  assert.equal(estimateWanCostUsd({model:"Wan 2.6",mode:"text",duration:"5s",quality:"720p"}),0.5);
  assert.equal(estimateWanCostUsd({model:"Wan 2.6",mode:"image",duration:"5s",quality:"1080p"}),0.75);
  assert.equal(estimateWanCostUsd({model:"Wan 2.6",mode:"text",duration:"10s",quality:"1080p"}),1.5);
  assert.equal(estimateWanCostUsd({model:"Wan 2.6",mode:"text",duration:"5s",quality:"580p"}),null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateWanCostUsd,
  formatElapsed,
  normalizeStoredJob,
  summarizeUsage,
  type StoredAiRoomJob,
} from "../lib/ai-room-jobs";

test("Wan Fast text and image costs use fixed per-video estimates", () => {
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Fast",mode:"text",duration:"5s",quality:"720p"}),0.08);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Fast",mode:"image",duration:"5s",quality:"720p"}),0.15);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 Fast",mode:"text",duration:"10s",quality:"720p"}),null);
});

test("Wan 14B costs scale with duration and resolution", () => {
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 14B",mode:"text",duration:"5s",quality:"720p"}),0.4);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 14B",mode:"image",duration:"10s",quality:"720p"}),0.8);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 14B",mode:"text",duration:"5s",quality:"580p"}),0.3);
  assert.equal(estimateWanCostUsd({model:"Wan 2.2 14B",mode:"image",duration:"10s",quality:"580p"}),0.6);
});

test("legacy browser jobs are normalized without losing compatibility", () => {
  const normalized=normalizeStoredJob({
    id:"fast:text:legacy",
    prompt:"Old prompt",
    model:"Wan 2.2 Fast",
    status:"Ready",
    created:"07:30",
    videoUrl:"https://example.com/video.mp4",
  });
  assert.ok(normalized);
  assert.equal(normalized.mode,"text");
  assert.equal(normalized.estimatedCostUsd,0.08);
  assert.equal(normalized.created,"07:30");
});

test("image mode is inferred from encoded job IDs", () => {
  const normalized=normalizeStoredJob({
    id:"a14b:image:abc",
    prompt:"Animate image",
    model:"Wan 2.2 14B",
    status:"Processing",
    duration:"10s",
    quality:"720p",
  });
  assert.ok(normalized);
  assert.equal(normalized.mode,"image");
  assert.equal(normalized.estimatedCostUsd,0.8);
});

test("usage summary counts statuses and sums only known estimates", () => {
  const jobs: StoredAiRoomJob[]=[
    {id:"1",prompt:"A",model:"Wan 2.2 Fast",status:"Ready",estimatedCostUsd:0.08},
    {id:"2",prompt:"B",model:"Wan 2.2 Fast",status:"Failed",estimatedCostUsd:0.15},
    {id:"3",prompt:"C",model:"Unknown",status:"Processing"},
  ];
  assert.deepEqual(summarizeUsage(jobs),{jobs:3,ready:1,failed:1,estimatedTotalUsd:0.23});
});

test("elapsed formatter handles seconds, minutes, and invalid timestamps", () => {
  const now=Date.parse("2026-10-09T01:02:03.000Z");
  assert.equal(formatElapsed("2026-10-09T01:01:58.000Z",now),"5s");
  assert.equal(formatElapsed("2026-10-09T01:00:00.000Z",now),"2m 3s");
  assert.equal(formatElapsed("invalid",now),"");
  assert.equal(formatElapsed(undefined,now),"");
});
