import assert from "node:assert/strict";
import test from "node:test";
import {Readable} from "node:stream";
import {boundedVideoStream} from "../lib/ai-room-private-storage";
import {VideoEngineError} from "../lib/video-engine";

async function consume(source:Readable,declared:number){
  const buffers:Buffer[]=[];
  for await(const chunk of boundedVideoStream(source,declared)){
    buffers.push(Buffer.from(chunk));
  }
  return Buffer.concat(buffers);
}
test("matching provider length succeeds without truncating video bytes",async()=>{
  const value=await consume(Readable.from([Buffer.from("hello"),Buffer.from("world")]),10);
  assert.equal(value.toString("utf8"),"helloworld");
});
test("oversized streamed bytes are rejected even if the HTTP length lies",async()=>{
  await assert.rejects(()=>consume(Readable.from([Buffer.alloc(8),Buffer.alloc(8)]),10),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===502);
});
test("incomplete upstream transfer is rejected rather than stored as a successful video",async()=>{
  await assert.rejects(()=>consume(Readable.from([Buffer.alloc(2)]),10),
    (e:unknown)=>e instanceof VideoEngineError&&e.retryable);
});
test("unbounded or implausible length is rejected before stream is read",()=>{
  for(const declared of [0,-1,Number.NaN,300*1024*1024]){
    assert.throws(()=>boundedVideoStream(Readable.from([]),declared),VideoEngineError);
  }
});
