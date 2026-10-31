import assert from "node:assert/strict";
import test from "node:test";
import {verifyPrivateVideoBytes} from "../lib/ai-room-video-check";

const SAMPLE=new Uint8Array(32).map((_,i)=>i);
function mockResponse(bytes= SAMPLE,status=206,total=128){
  return new Response(bytes,{status,headers:{
    "Content-Type":"video/mp4",
    "Content-Length":String(bytes.length),
    "Content-Range":"bytes 0-31/"+total
  }});
}
test("read-only OCI self-check compares matching stream and download ranges",async()=>{
  const calls:string[]=[];
  const fake=(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input);calls.push(url);
    assert.equal(init?.method,"GET");
    assert.equal(init?.headers && (init.headers as {Range:string}).Range,"bytes=0-31");
    return mockResponse();
  }) as typeof fetch;
  const result=await verifyPrivateVideoBytes("fast:text:video_123",fake);
  assert.deepEqual(result,{bytesChecked:32,totalBytes:128});
  assert.equal(calls.length,2);
  assert.match(calls[0],/\/stream$/);
  assert.match(calls[1],/\/download$/);
});
test("OCI self-check fails closed on denied download or byte mismatch",async()=>{
  let count=0;
  const denied=(async()=>++count===1?mockResponse():new Response("Denied",{status:403})) as typeof fetch;
  await assert.rejects(()=>verifyPrivateVideoBytes("test:id",denied),/HTTP 403/);
  assert.equal(count,2);
  count=0;
  const mismatched=(async()=>mockResponse(++count===1?SAMPLE:
    new Uint8Array(32).fill(7))) as typeof fetch;
  await assert.rejects(()=>verifyPrivateVideoBytes("test:id",mismatched),/different video bytes/);
});
test("OCI self-check cannot be used to inject arbitrary URLs or send requests",async()=>{
  let invoked=0;
  const fake=(async()=>{invoked++;return mockResponse();}) as typeof fetch;
  await assert.rejects(()=>verifyPrivateVideoBytes("../accounts",fake),/Invalid saved video/);
  assert.equal(invoked,0);
});
