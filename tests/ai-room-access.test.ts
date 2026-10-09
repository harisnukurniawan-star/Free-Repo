import assert from "node:assert/strict";
import test from "node:test";
import {assertGenerationAccess, generationAccessState} from "../lib/ai-room-access";
import {VideoEngineError} from "../lib/video-engine";

function request(key?:string){
  return new Request("https://example.test/api/ai-room/generate",{
    method:"POST",
    headers:key?{"x-ai-room-access-key":key}:{},
  });
}

test("paid generation is locked when the server access key is missing or weak", t=>{
  const original=process.env.AI_ROOM_GENERATE_ACCESS_KEY;
  t.after(()=>{if(original===undefined)delete process.env.AI_ROOM_GENERATE_ACCESS_KEY;else process.env.AI_ROOM_GENERATE_ACCESS_KEY=original});
  delete process.env.AI_ROOM_GENERATE_ACCESS_KEY;
  assert.deepEqual(generationAccessState(),{generationLocked:true,generationAuthRequired:true});
  assert.throws(()=>assertGenerationAccess(request()), (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===503);
  process.env.AI_ROOM_GENERATE_ACCESS_KEY="short";
  assert.throws(()=>assertGenerationAccess(request("short")), (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===503);
});

test("invalid, missing, or oversized browser access keys cannot authorize a chargeable POST", t=>{
  const original=process.env.AI_ROOM_GENERATE_ACCESS_KEY;
  t.after(()=>{if(original===undefined)delete process.env.AI_ROOM_GENERATE_ACCESS_KEY;else process.env.AI_ROOM_GENERATE_ACCESS_KEY=original});
  process.env.AI_ROOM_GENERATE_ACCESS_KEY="correct-access-key-1234";
  assert.deepEqual(generationAccessState(),{generationLocked:false,generationAuthRequired:true});
  for (const key of [undefined,"wrong-access-key-1234","x".repeat(513)]){
    assert.throws(()=>assertGenerationAccess(request(key)), (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===401);
  }
  assert.doesNotThrow(()=>assertGenerationAccess(request("correct-access-key-1234")));
});

test("unauthorized API POST is rejected before any fal submission",async t=>{
  const original=process.env.AI_ROOM_GENERATE_ACCESS_KEY;
  t.after(()=>{if(original===undefined)delete process.env.AI_ROOM_GENERATE_ACCESS_KEY;else process.env.AI_ROOM_GENERATE_ACCESS_KEY=original});
  process.env.AI_ROOM_GENERATE_ACCESS_KEY="correct-access-key-1234";
  const {POST}=await import("../app/api/ai-room/generate/route");
  const result=await POST(new Request("https://example.test/api/ai-room/generate",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({prompt:"An ocean sunrise",model:"Wan 3.0",mode:"text",duration:"5s",quality:"1080p"}),
  }));
  assert.equal(result.status,401);
  assert.match((await result.json()).error,/access key/i);
});
