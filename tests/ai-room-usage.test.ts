import assert from "node:assert/strict";
import test from "node:test";
import {estimateWanCost, formatUsd} from "../lib/ai-room-usage";

test("Fast text uses the current flat per-video estimate", () => {
  assert.equal(estimateWanCost({model:"Wan 2.2 Fast",mode:"text",duration:"5s",quality:"720p"}), 0.08);
});

test("Fast image uses the current flat per-video estimate", () => {
  assert.equal(estimateWanCost({model:"Wan 2.2 Fast",mode:"image",duration:"5s",quality:"720p"}), 0.15);
});

test("A14B 5s 720p uses frame-based video seconds", () => {
  assert.equal(estimateWanCost({model:"Wan 2.2 14B",mode:"text",duration:"5s",quality:"720p"}), 0.405);
});

test("A14B 10s 580p uses frame-based video seconds", () => {
  assert.equal(estimateWanCost({model:"Wan 2.2 14B",mode:"image",duration:"10s",quality:"580p"}), 0.60375);
});

test("unsupported combinations do not invent a cost", () => {
  assert.equal(estimateWanCost({model:"Premium",mode:"text",duration:"5s",quality:"720p"}), null);
  assert.equal(estimateWanCost({model:"Wan 2.2 Fast",mode:"text",duration:"10s",quality:"720p"}), null);
});

test("USD formatting is compact and handles missing estimates", () => {
  assert.equal(formatUsd(0.405), "$0.41");
  assert.equal(formatUsd(undefined), "—");
});
