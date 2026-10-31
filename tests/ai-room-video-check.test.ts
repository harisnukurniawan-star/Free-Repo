import assert from "node:assert/strict";
import test from "node:test";
import {verifyPrivateVideoBytes} from "../lib/ai-room-video-check";

const sample=(start:number,end:number,offset=0)=>new Uint8Array(end-start+1)
  .map((_,i)=>(start+i+offset)%256);
function rangeResponse(start:number,end:number,total=128,offset=0){
  const bytes=sample(start,end,offset);
  return new Response(bytes,{status:206,headers:{
    "Content-Type":"video/mp4",
    "Cache-Control":"private, no-store",
    "Content-Length":String(bytes.length),
    "Content-Range":"bytes "+start+"-"+end+"/"+total
  }});
}
function noSession(){
  return new Response(JSON.stringify({error:"Sign-in required."}),{status:401,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}
test("live OCI probe matches first and last bytes and proves anonymous access denied",async()=>{
  const calls:{route:string;range:string;credentials:RequestCredentials}[]=[];
  const fake=(async(input:string|URL|Request,init?:RequestInit)=>{
    const path=String(input),range=(init?.headers as {Range:string}).Range;
    calls.push({route:path,range,credentials:init?.credentials||"same-origin"});
    assert.equal(init?.method,"GET");
    const match=/^bytes=(\d+)-(\d+)$/.exec(range);
    assert.ok(match);
    if(init?.credentials==="omit")return noSession();
    return rangeResponse(Number(match[1]),Number(match[2]));
  }) as typeof fetch;
  const result=await verifyPrivateVideoBytes("v3prime:text:video_123",fake);
  assert.deepEqual(result,{bytesChecked:128,totalBytes:128,anonymousDenied:true});
  assert.equal(calls.length,6);
  assert.deepEqual(calls.map(c=>c.credentials),
    ["same-origin","same-origin","same-origin","same-origin","omit","omit"]);
  assert.deepEqual(calls.map(c=>c.range),
    ["bytes=0-31","bytes=0-31","bytes=96-127","bytes=96-127","bytes=0-31","bytes=0-31"]);
  assert.ok(calls.every(c=>c.route.startsWith("/api/ai-room/videos/")));
});
test("probe stops before anonymous checks if the private bytes disagree",async()=>{
  let i=0;
  const fake=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
    i++;
    const match=/bytes=(\d+)-(\d+)/.exec((init?.headers as {Range:string}).Range);
    assert.ok(match);
    return rangeResponse(Number(match[1]),Number(match[2]),128,i===2?1:0);
  }) as typeof fetch;
  await assert.rejects(()=>verifyPrivateVideoBytes("fast:text:example",fake),/different opening video bytes/);
  assert.equal(i,2);
});
test("probe fails closed when signed-out request receives video or wrong denial",async()=>{
  for(const bad of [rangeResponse(0,31),new Response("Denied",{status:403}),
    new Response("login",{status:401,headers:{"Content-Type":"text/html"}})]){
    let count=0;
    const fake=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      count++;
      if(init?.credentials==="omit")return bad.clone();
      const match=/bytes=(\d+)-(\d+)/.exec((init?.headers as {Range:string}).Range);
      assert.ok(match);
      return rangeResponse(Number(match[1]),Number(match[2]));
    }) as typeof fetch;
    await assert.rejects(()=>verifyPrivateVideoBytes("fast:text:example",fake),/not safely denied/);
    assert.equal(count,5);
  }
});
test("probe never accepts an arbitrary path or sends a paid request",async()=>{
  let invoked=0;
  const fake=(async()=>{invoked++;return noSession();}) as typeof fetch;
  await assert.rejects(()=>verifyPrivateVideoBytes("../users",fake),/Invalid saved video/);
  assert.equal(invoked,0);
});
