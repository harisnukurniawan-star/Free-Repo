import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes,scryptSync} from "node:crypto";
import {
  generationPinEnabled,generationPinConfigured,createPinSession,readPinSession,
  activateGenerationPin,consumeGenerationQuota,assertGenerationPin,PIN_COOKIE
} from "../lib/ai-room-generation-pin";
import {VideoEngineError} from "../lib/video-engine";

const keys=[
  "AI_ROOM_GENERATION_PIN_ENABLED","AI_ROOM_GENERATION_PIN_HASH",
  "AI_ROOM_GENERATION_PIN_SALT","AI_ROOM_GENERATION_PIN_SESSION_SECRET",
  "AI_ROOM_PIN_REDIS_URL","AI_ROOM_PIN_REDIS_TOKEN",
  "AI_ROOM_PIN_DAILY_LIMIT","AI_ROOM_STORAGE_MODE"
];
function pinEnv(t:import("node:test").TestContext){
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const key of keys){const value=old[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const salt=randomBytes(16).toString("hex");
  process.env.AI_ROOM_GENERATION_PIN_ENABLED="true";
  process.env.AI_ROOM_GENERATION_PIN_HASH=scryptSync("12345678",salt,64,
    {N:16384,r:8,p:1,maxmem:64*1024*1024}).toString("hex");
  process.env.AI_ROOM_GENERATION_PIN_SALT=salt;
  process.env.AI_ROOM_GENERATION_PIN_SESSION_SECRET="strong-test-secret-".repeat(4);
  process.env.AI_ROOM_PIN_REDIS_URL="https://redis.example.test";
  process.env.AI_ROOM_PIN_REDIS_TOKEN="test-token-not-real-12345";
  process.env.AI_ROOM_STORAGE_MODE="browser";
}
function stubRedis(t:import("node:test").TestContext,result=1){
  const original=globalThis.fetch;
  const requests:unknown[][]=[];
  t.after(()=>{globalThis.fetch=original});
  globalThis.fetch=async (_input,_init)=>{
    const init=_init as RequestInit;
    const cmd=JSON.parse(String(init.body)) as unknown[];
    requests.push(cmd);
    return Response.json({result});
  };
  return requests;
}
test("PIN mode off is backwards compatible and secretless",t=>{
  const old=process.env.AI_ROOM_GENERATION_PIN_ENABLED;
  t.after(()=>{if(old===undefined)delete process.env.AI_ROOM_GENERATION_PIN_ENABLED;else process.env.AI_ROOM_GENERATION_PIN_ENABLED=old;});
  delete process.env.AI_ROOM_GENERATION_PIN_ENABLED;
  assert.equal(generationPinEnabled(),false);
  assert.equal(readPinSession("fake"),false);
});
test("PIN mode fails closed without shared Redis limiter",t=>{
  pinEnv(t);
  delete process.env.AI_ROOM_PIN_REDIS_TOKEN;
  assert.equal(generationPinEnabled(),true);
  assert.equal(generationPinConfigured(),false);
  assert.throws(()=>createPinSession(),(e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===503);
});
test("signed, expiring PIN authorization cannot cross private users",t=>{
  pinEnv(t);
  assert.equal(generationPinConfigured(),true);
  const now=Date.now();
  const token=createPinSession("tester_a",now);
  assert.equal(readPinSession(token,"tester_a",now),true);
  assert.equal(readPinSession(token,"tester_b",now),false);
  assert.equal(readPinSession(token+"x","tester_a",now),false);
  assert.equal(readPinSession(token,"tester_a",now+8*60*60*1000+1000),false);
  assert.equal(readPinSession(token,undefined,now),false);
  const request=new Request("https://example.test/api/ai-room/generate",{
    headers:{cookie:PIN_COOKIE+"="+token}
  });
  assert.doesNotThrow(()=>assertGenerationPin(request,"tester_a"));
  assert.throws(()=>assertGenerationPin(request,"tester_b"),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===401);
});
test("PIN activation checks Redis limit before scrypt verification",async t=>{
  pinEnv(t);
  const commands=stubRedis(t);
  const request=new Request("https://example.test/api/ai-room/generation-pin",{
    headers:{"x-vercel-forwarded-for":"203.0.113.10"}
  });
  await assert.rejects(()=>activateGenerationPin(request,"00000000","tester_a"),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===401);
  const token=await activateGenerationPin(request,"12345678","tester_a");
  assert.equal(readPinSession(token,"tester_a"),true);
  assert.equal(commands.length,2);
  assert.equal(commands[0][0],"EVAL");
  assert.equal(JSON.stringify(commands).includes("12345678"),false);
});
test("PIN lockout and quota are fail closed if shared Redis denies or fails",async t=>{
  pinEnv(t);
  stubRedis(t,0);
  const request=new Request("https://example.test/api/ai-room/generation-pin");
  await assert.rejects(()=>activateGenerationPin(request,"12345678"),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===429);
  await assert.rejects(()=>consumeGenerationQuota("tester_a"),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===429);
});
test("PIN route uses server-only signed HttpOnly cookie and blocks old key bypass",async t=>{
  pinEnv(t);
  stubRedis(t);
  const {GET,POST}=await import("../app/api/ai-room/generation-pin/route");
  const {POST:generate}=await import("../app/api/ai-room/generate/route");
  const base="https://example.test/api/ai-room/generation-pin";
  const noCookie=await generate(new Request("https://example.test/api/ai-room/generate",{
    method:"POST",headers:{origin:"https://example.test","x-ai-room-access-key":"long-legacy-key"},
    body:JSON.stringify({prompt:"A simple sunrise",mode:"text"})
  }));
  assert.equal(noCookie.status,401);
  const cross=await POST(new Request(base,{method:"POST",headers:{origin:"https://evil.test"},
    body:JSON.stringify({pin:"12345678"})}));
  assert.equal(cross.status,403);
  const good=await POST(new Request(base,{method:"POST",headers:{origin:"https://example.test"},
    body:JSON.stringify({pin:"12345678"})}));
  assert.equal(good.status,200);
  const cookie=good.headers.get("set-cookie")||"";
  assert.match(cookie,/HttpOnly/i);
  assert.match(cookie,/SameSite=Strict/i);
  assert.doesNotMatch(cookie,/12345678/);
  const status=await GET(new Request(base,{headers:{cookie:cookie.split(";")[0]}}));
  assert.equal((await status.json()).active,true);
});
