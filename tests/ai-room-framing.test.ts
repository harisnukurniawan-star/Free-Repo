import test from "node:test";
import assert from "node:assert/strict";
import {ASPECTS, aspectValue, referenceFrameLayout, referenceNeedsNormalization, matchesAspect} from "../lib/ai-room-framing";

test("all three ratio buttons map to correct native dimensions",()=>{
  assert.equal(ASPECTS["16:9"],16/9);
  assert.equal(ASPECTS["9:16"],9/16);
  assert.equal(ASPECTS["1:1"],1);
  assert.equal(aspectValue("unknown"),undefined);
});

test("a portrait is never cropped when framed to 16:9, 9:16 or 1:1",()=>{
  for(const aspect of ["16:9","9:16","1:1"] as const){
    const v=referenceFrameLayout(800,1200,aspect);
    assert.ok(v.x>=0&&v.y>=0);
    assert.ok(v.x+v.fittedWidth<=v.width+0.01);
    assert.ok(v.y+v.fittedHeight<=v.height+0.01);
    assert.ok(Math.abs(v.fittedWidth/v.fittedHeight-800/1200)<1e-9);
    assert.ok(Math.abs(v.width/v.height-ASPECTS[aspect])<1e-9);
  }
});

test("matching source images are preserved without re-encoding",()=>{
  assert.equal(referenceFrameLayout(1920,1080,"16:9").needsFraming,false);
  assert.equal(referenceFrameLayout(1080,1920,"9:16").needsFraming,false);
  assert.equal(referenceFrameLayout(1024,1024,"1:1").needsFraming,false);
  assert.equal(referenceFrameLayout(1080,1920,"16:9").needsFraming,true);
});

test("actual provider video dimensions are distinguished from requested ratio",()=>{
  assert.equal(matchesAspect(1080,1920,"9:16"),true);
  assert.equal(matchesAspect(1920,1080,"9:16"),false);
  assert.equal(matchesAspect(1024,1024,"1:1"),true);
  assert.equal(matchesAspect(1080,1920,"1:1"),false);
  assert.equal(matchesAspect(1920,1080,undefined),undefined);
  assert.equal(matchesAspect(0,720,"16:9"),undefined);
});

test("oversized image is normalized even when the source aspect already matches",()=>{
  const portrait=referenceFrameLayout(4320,7680,"9:16");
  assert.equal(portrait.needsFraming,false);
  assert.equal(portrait.needsResize,true);
  assert.equal(portrait.width,720);
  assert.equal(portrait.height,1280);
  const landscape=referenceFrameLayout(7680,4320,"16:9");
  assert.equal(landscape.needsFraming,false);
  assert.equal(landscape.needsResize,true);
  assert.equal(landscape.width,1280);
  assert.equal(landscape.height,720);
  assert.equal(referenceFrameLayout(1280,720,"16:9").needsResize,false);
  assert.equal(referenceFrameLayout(1024,1024,"1:1").needsResize,false);
});

test("normalizing oversized photos preserves contained geometry without cropping",()=>{
  for (const aspect of ["16:9","9:16","1:1"] as const){
    const frame=referenceFrameLayout(7000,4600,aspect);
    assert.equal(frame.needsResize,true);
    assert.ok(frame.fittedWidth<=frame.width);
    assert.ok(frame.fittedHeight<=frame.height);
    assert.ok(frame.x>=0 && frame.y>=0);
    assert.ok(frame.x+frame.fittedWidth<=frame.width+0.01);
    assert.ok(frame.y+frame.fittedHeight<=frame.height+0.01);
  }
});

test("large inline reference is optimized even if ratio and dimensions already match",()=>{
  const matching=referenceFrameLayout(1280,720,"16:9");
  assert.equal(matching.needsFraming,false);
  assert.equal(matching.needsResize,false);
  assert.equal(referenceNeedsNormalization(matching,800_000),false);
  assert.equal(referenceNeedsNormalization(matching,900_001),true);
  assert.equal(referenceNeedsNormalization(referenceFrameLayout(720,1280,"16:9"),40_000),true);
  assert.equal(referenceNeedsNormalization(referenceFrameLayout(4320,7680,"9:16"),40_000),true);
});
