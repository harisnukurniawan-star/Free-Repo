import assert from "node:assert/strict";
import test from "node:test";
import {S3Client} from "@aws-sdk/client-s3";
import {scryptSync} from "node:crypto";
import {privateDelete,privateList,privateStatus} from "../lib/ai-room-private-storage";
import {VideoEngineError} from "../lib/video-engine";

const ID="fast:text:test_request_001";
const USER_A="alice";
const USER_B="bobby";
function fixture(t:import("node:test").TestContext){
  const vars=["AI_ROOM_STORAGE_MODE","AI_ROOM_SESSION_SECRET","AI_ROOM_USERS_JSON",
    "AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET","AI_ROOM_OCI_ACCESS_KEY_ID",
    "AI_ROOM_OCI_SECRET_ACCESS_KEY","AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED"];
  const initial=new Map(vars.map(v=>[v,process.env[v]]));
  t.after(()=>{for(const [k,v] of initial){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  const salt="bb".repeat(16);
  process.env.AI_ROOM_STORAGE_MODE="oci";
  process.env.AI_ROOM_SESSION_SECRET="x".repeat(64);
  process.env.AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED="true";
  process.env.AI_ROOM_USERS_JSON=JSON.stringify([
    {id:USER_A,salt,passwordHash:scryptSync("alice-long-password",salt,64).toString("hex")},
    {id:USER_B,salt,passwordHash:scryptSync("bobby-long-password",salt,64).toString("hex")}
  ]);
  process.env.AI_ROOM_OCI_NAMESPACE="testnamespace";
  process.env.AI_ROOM_OCI_BUCKET="ai-room-private-videos";
  process.env.AI_ROOM_OCI_ACCESS_KEY_ID="fake-id";
  process.env.AI_ROOM_OCI_SECRET_ACCESS_KEY="fake-secret";
}
function fakeStorage(t:import("node:test").TestContext){
  const job={
    id:ID,owner:USER_A,prompt:"A private family video",model:"Wan 2.2 Fast",
    mode:"text",aspect:"16:9",duration:"5s",quality:"720p",
    createdAt:"2026-10-10T00:00:00.000Z",status:"completed",
  };
  const objects=new Map<string,string>([["jobs/"+USER_A+"/"+ID+".json",JSON.stringify(job)],
    ["videos/"+USER_A+"/"+ID+".mp4","binary is not read through this test"]]);
  const calls:string[]=[];
  const obj=S3Client.prototype as unknown as {send:(cmd:unknown)=>Promise<unknown>};
  const old=obj.send;
  obj.send=async(cmd:unknown)=>{
    const request=cmd as {constructor:{name:string};input:Record<string,unknown>};
    const name=request.constructor.name;
    const key=typeof request.input.Key==="string"?request.input.Key:"";
    const prefix=typeof request.input.Prefix==="string"?request.input.Prefix:"";
    calls.push(name+":"+key+prefix);
    if(name==="HeadObjectCommand"){
      if(objects.has(key))return {};
      const error=new Error("Missing object");error.name="NotFound";throw error;
    }
    if(name==="GetObjectCommand"){
      const value=objects.get(key);
      if(value===undefined){const error=new Error("Missing object");error.name="NoSuchKey";throw error;}
      return {Body:{transformToString:async()=>value}};
    }
    if(name==="ListObjectsV2Command"){
      return {Contents:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(Key=>({Key,LastModified:new Date("2026-10-10T00:00:00Z")})),IsTruncated:false};
    }
    if(name==="PutObjectCommand"){objects.set(key,String(request.input.Body));return {};}
    if(name==="DeleteObjectCommand"){objects.delete(key);return {};}
    throw new Error("Unexpected S3 command "+name);
  };
  t.after(()=>{obj.send=old;});
  return {objects,calls};
}
test("private list returns only the logged-in user's video objects",async t=>{
  fixture(t);
  fakeStorage(t);
  const alice=await privateList(USER_A);
  assert.equal(alice.length,1);
  assert.equal(alice[0].id,ID);
  assert.ok(alice[0].videoUrl?.includes("testnamespace.compat.objectstorage.ap-batam-1.oraclecloud.com"));
  assert.ok(alice[0].videoUrl?.includes("videos%2Falice") || alice[0].videoUrl?.includes("videos/alice"));
  assert.ok(!JSON.stringify(alice).includes("A PRIVATE SECRET KEY"));
  assert.deepEqual(await privateList(USER_B),[]);
});
test("knowing another owner's request ID does not authorize read or deletion",async t=>{
  fixture(t);
  const state=fakeStorage(t);
  await assert.rejects(()=>privateStatus(USER_B,ID),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===404);
  await assert.rejects(()=>privateDelete(USER_B,ID),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===404);
  assert.ok(state.objects.has("videos/"+USER_A+"/"+ID+".mp4"));
  assert.ok(!state.calls.some(x=>x.startsWith("DeleteObjectCommand")));
});
test("owner deletion removes bytes and tombstone prevents resurrection",async t=>{
  fixture(t);
  const state=fakeStorage(t);
  await privateDelete(USER_A,ID);
  assert.ok(!state.objects.has("videos/"+USER_A+"/"+ID+".mp4"));
  assert.ok(state.objects.has("deleted/"+USER_A+"/"+ID+".json"));
  await assert.rejects(()=>privateStatus(USER_A,ID),
    (e:unknown)=>e instanceof VideoEngineError&&e.httpStatus===404);
  assert.deepEqual(await privateList(USER_A),[]);
});
