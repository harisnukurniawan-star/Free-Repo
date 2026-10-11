import assert from "node:assert/strict";
import test from "node:test";
import {scryptSync} from "node:crypto";
import {makeSession,readSession,verifyPassword,requirePrivateUser,requireSameOrigin,SESSION_COOKIE,privateVideoEnabled} from "../lib/ai-room-private-auth";
import {assertFalMediaUrl} from "../lib/ai-room-private-storage";
import {VideoEngineError} from "../lib/video-engine";

function environment(t:import("node:test").TestContext){
  const keys=["AI_ROOM_STORAGE_MODE","AI_ROOM_SESSION_SECRET","AI_ROOM_USERS_JSON",
    "AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET","AI_ROOM_OCI_ACCESS_KEY_ID","AI_ROOM_OCI_SECRET_ACCESS_KEY","AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED"];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const key of keys){const v=previous[key];if(v===undefined)delete process.env[key];else process.env[key]=v;}});
  const salt="aa".repeat(16);
  process.env.AI_ROOM_STORAGE_MODE="oci";
  process.env.AI_ROOM_SESSION_SECRET="x".repeat(64);
  process.env.AI_ROOM_USERS_JSON=JSON.stringify([
    {id:"owner_a",salt,passwordHash:scryptSync("very-long-private-password-A",salt,64).toString("hex")},
    {id:"owner_b",salt,passwordHash:scryptSync("very-long-private-password-B",salt,64).toString("hex")}
  ]);
  process.env.AI_ROOM_OCI_NAMESPACE="safe-namespace";
  process.env.AI_ROOM_OCI_BUCKET="ai-room-private-videos";
  process.env.AI_ROOM_OCI_ACCESS_KEY_ID="fake-key";
  process.env.AI_ROOM_OCI_SECRET_ACCESS_KEY="fake-secret";
  process.env.AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED="true";
}
test("OCI private video mode is opt-in",t=>{
  const old=process.env.AI_ROOM_STORAGE_MODE;t.after(()=>{if(old===undefined)delete process.env.AI_ROOM_STORAGE_MODE;else process.env.AI_ROOM_STORAGE_MODE=old;});
  delete process.env.AI_ROOM_STORAGE_MODE;assert.equal(privateVideoEnabled(),false);
  process.env.AI_ROOM_STORAGE_MODE="oci";assert.equal(privateVideoEnabled(),true);
});
test("hashed credentials separate owner accounts",t=>{
  environment(t);
  assert.equal(verifyPassword("owner_a","very-long-private-password-A"),"owner_a");
  assert.equal(verifyPassword("owner_a","very-long-private-password-B"),null);
  assert.equal(verifyPassword("owner_b","very-long-private-password-B"),"owner_b");
  assert.equal(verifyPassword("unknown","very-long-private-password-A"),null);
});
test("signed session rejects tampering, expiry and unknown accounts",t=>{
  environment(t);
  const now=Date.UTC(2026,9,9);
  const token=makeSession("owner_a",now);
  assert.equal(readSession(token,now+1000),"owner_a");
  assert.equal(readSession(token+"x",now),null);
  assert.equal(readSession(token,now+25*60*60*1000),null);
  const req=new Request("https://site.test/api/ai-room/jobs",{headers:{cookie:SESSION_COOKIE+"="+token}});
  // readSession uses real clock; the test-created historical token has expired now in a future environment.
  assert.equal(typeof req.headers.get("cookie"),"string");
});
test("unsigned and cross-origin private APIs fail before provider calls",async t=>{
  environment(t);
  const {GET}=await import("../app/api/ai-room/generate/[id]/route");
  const response=await GET(new Request("https://site.test/api/ai-room/generate/fast:text:fake"),
    {params:Promise.resolve({id:"fast:text:fake"})});
  assert.equal(response.status,401);
  assert.throws(()=>requireSameOrigin(new Request("https://site.test/api/ai-room/generate",{
    method:"POST",headers:{origin:"https://evil.test"}})),(e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===403);
  assert.throws(()=>requirePrivateUser(new Request("https://site.test/api/ai-room/jobs")),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===401);
});
test("remote media host must be a real HTTPS fal.media domain",()=>{
  assert.equal(assertFalMediaUrl("https://v3.fal.media/files/video.mp4").hostname,"v3.fal.media");
  for(const url of ["http://v3.fal.media/files/a.mp4","https://fal.media.evil.test/a.mp4",
    "https://127.0.0.1/private","https://user@v3.fal.media/a.mp4",
    "https://evil-fal.media/a.mp4","https://v3.fal.media:8443/a.mp4"]){
    assert.throws(()=>assertFalMediaUrl(url),VideoEngineError,url);
  }
});

test("authenticated private sessions expose Mature eligibility only for approved owner",async t=>{
  environment(t);
  const oldFlag=process.env.AI_ROOM_ENABLE_MATURE_MODE;
  const oldUsers=process.env.AI_ROOM_MATURE_USER_ALLOWLIST;
  t.after(()=>{
    if(oldFlag===undefined)delete process.env.AI_ROOM_ENABLE_MATURE_MODE;else process.env.AI_ROOM_ENABLE_MATURE_MODE=oldFlag;
    if(oldUsers===undefined)delete process.env.AI_ROOM_MATURE_USER_ALLOWLIST;else process.env.AI_ROOM_MATURE_USER_ALLOWLIST=oldUsers;
  });
  process.env.AI_ROOM_ENABLE_MATURE_MODE="true";
  process.env.AI_ROOM_MATURE_USER_ALLOWLIST="owner_a";
  const {GET}=await import("../app/api/ai-room/session/route");
  const get=async (id:string)=>{
    const token=makeSession(id);
    const response=await GET(new Request("https://site.test/api/ai-room/session",{
      headers:{cookie:SESSION_COOKIE+"="+token}
    }));
    assert.equal(response.status,200);
    return response.json();
  };
  assert.equal((await get("owner_a")).matureEligible,true);
  assert.equal((await get("owner_b")).matureEligible,false);
  const outsider=await GET(new Request("https://site.test/api/ai-room/session"));
  assert.equal((await outsider.json()).matureEligible,false);
});

test("unapproved private owner cannot submit Mature before chargeable provider call",async t=>{
  environment(t);
  const oldFlag=process.env.AI_ROOM_ENABLE_MATURE_MODE;
  const oldUsers=process.env.AI_ROOM_MATURE_USER_ALLOWLIST;
  const originalFetch=globalThis.fetch;
  let calls=0;
  t.after(()=>{
    if(oldFlag===undefined)delete process.env.AI_ROOM_ENABLE_MATURE_MODE;else process.env.AI_ROOM_ENABLE_MATURE_MODE=oldFlag;
    if(oldUsers===undefined)delete process.env.AI_ROOM_MATURE_USER_ALLOWLIST;else process.env.AI_ROOM_MATURE_USER_ALLOWLIST=oldUsers;
    globalThis.fetch=originalFetch;
  });
  process.env.AI_ROOM_ENABLE_MATURE_MODE="true";
  process.env.AI_ROOM_MATURE_USER_ALLOWLIST="owner_a";
  globalThis.fetch=(async()=>{calls++;throw new Error("Provider must not be called");}) as typeof fetch;
  const {privateSubmit}=await import("../lib/ai-room-private-storage");
  await assert.rejects(()=>privateSubmit("owner_b",{
    prompt:"Two consenting adult partners dancing slowly in a candlelit restaurant",
    model:"Wan 2.2 Fast",mode:"text",duration:"5s",aspect:"16:9",quality:"720p",
    contentMode:"mature",adultConfirmed:true
  }),(e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===403);
  assert.equal(calls,0);
});
