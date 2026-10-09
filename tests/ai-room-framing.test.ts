import test from "node:test";
import assert from "node:assert/strict";
import {ASPECTS, aspectValue, referenceFrameLayout, matchesAspect} from "../lib/ai-room-framing";

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
    assert.equal(v.fittedWidth/v.fittedHeight,800/1200);
    assert.equal(v.width/v.height,ASPECTS[aspect]);
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
