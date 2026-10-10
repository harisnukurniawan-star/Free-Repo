import assert from "node:assert/strict";
import test from "node:test";
import {Readable} from "node:stream";
import {
  NativeObjectStore,nativeCredentialsConfigured,nativeObjectName,privateVideoPath
} from "../lib/ai-room-native-objects";
import {privateReadNative} from "../lib/ai-room-private-storage";
import {makeSession,SESSION_COOKIE} from "../lib/ai-room-private-auth";
import {VideoEngineError} from "../lib/video-engine";

const id="fast:text:nativevideo_001";
const vars=[
  "AI_ROOM_STORAGE_MODE","AI_ROOM_OCI_DRIVER","AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED",
  "AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET","AI_ROOM_SESSION_SECRET","AI_ROOM_USERS_JSON",
  "AI_ROOM_OCI_TENANCY_ID","AI_ROOM_OCI_USER_ID","AI_ROOM_OCI_KEY_FINGERPRINT","AI_ROOM_OCI_PRIVATE_KEY"
];
function fixture(t:import("node:test").TestContext){
  const previous=new Map(vars.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const [key,v] of previous)if(v===undefined)delete process.env[key];else process.env[key]=v;});
  Object.assign(process.env,{
    AI_ROOM_STORAGE_MODE:"oci",AI_ROOM_OCI_DRIVER:"native",
    AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED:"true",AI_ROOM_OCI_NAMESPACE:"axf1xcjq8gsy",
    AI_ROOM_OCI_BUCKET:"ai-room-private-videos",AI_ROOM_SESSION_SECRET:"q".repeat(64),
    AI_ROOM_USERS_JSON:"[]",
    AI_ROOM_OCI_TENANCY_ID:"ocid1.tenancy.oc1..example",AI_ROOM_OCI_USER_ID:"ocid1.user.oc1..example",
    AI_ROOM_OCI_KEY_FINGERPRINT:Array(16).fill("aa").join(":"),
    AI_ROOM_OCI_PRIVATE_KEY:"-----BEGIN RSA PRIVATE KEY-----\nTEST-ONLY-NOT-A-REAL-KEY\n-----END RSA PRIVATE KEY-----"
  });
}
function fakeNative(t:import("node:test").TestContext){
  const proto=NativeObjectStore.prototype;
  const prev={head:proto.head,getText:proto.getText,getVideo:proto.getVideo};
  const requested:string[]=[];
  proto.head=async(key:string)=>{
    requested.push("head:"+key);
    if(key.startsWith("deleted/")){
      const e=new Error("missing");e.name="NotFound";throw e;
    }
    if(key.startsWith("videos/alice/"))return {ContentLength:10};
    const e=new Error("missing");e.name="NotFound";throw e;
  };
  proto.getText=async(key:string)=>{
    requested.push("text:"+key);
    if(key==="jobs/alice/"+id+".json"){
      return JSON.stringify({id,owner:"alice",status:"completed",prompt:"family video",model:"Wan 2.2 Fast",
        mode:"text",quality:"720p",duration:"5s",aspect:"16:9",createdAt:"2026-10-10T00:00:00Z"});
    }
    const e=new Error("missing");e.name="NotFound";throw e;
  };
  proto.getVideo=async(key:string,range?:{start:number;end:number;total:number})=>{
    requested.push("video:"+key);
    if(key!=="videos/alice/"+id+".mp4")throw Error("Cross-owner byte read");
    const all=Buffer.from("0123456789");
    const content=range?all.subarray(range.start,range.end+1):all;
    return {body:Readable.from([content]),length:content.length};
  };
  t.after(()=>{proto.head=prev.head;proto.getText=prev.getText;proto.getVideo=prev.getVideo;});
  return requested;
}
test("native IAM settings fail closed without API key",t=>{
  fixture(t);
  assert.equal(nativeCredentialsConfigured(),true);
  delete process.env.AI_ROOM_OCI_PRIVATE_KEY;
  assert.equal(nativeCredentialsConfigured(),false);
});
test("native object key cannot escape the owner's prefixes",()=>{
  assert.equal(nativeObjectName("videos/alice/"+id+".mp4"),"videos/alice/"+id+".mp4");
  for(const key of ["../private","videos/alice/../../bob","videos/Alice/x","videos/alice/hello?token=x"]){
    assert.throws(()=>nativeObjectName(key),VideoEngineError);
  }
  assert.equal(privateVideoPath(id),"/api/ai-room/videos/fast%3Atext%3Anativevideo_001/stream");
});
test("native streaming refuses other owners before any bytes are opened",async t=>{
  fixture(t);
  const calls=fakeNative(t);
  await assert.rejects(()=>privateReadNative("bobby",id,"bytes=0-9"),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===404);
  assert.equal(calls.some(row=>row.startsWith("video:")),false);
});
test("owner-only native MP4 stream handles byte ranges and denies invalid ranges",async t=>{
  fixture(t);
  const calls=fakeNative(t);
  const result=await privateReadNative("alice",id,"bytes=2-5");
  assert.equal(result.partial,true);
  assert.equal(result.length,4);
  const chunks:Buffer[]=[];
  for await(const chunk of result.stream)chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString(),"2345");
  assert.deepEqual(calls.filter(x=>x.startsWith("video:")),["video:videos/alice/"+id+".mp4"]);
  await assert.rejects(()=>privateReadNative("alice",id,"bytes=100-120"),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===416);
  await assert.rejects(()=>privateReadNative("alice",id,"bytes=0-1,3-4"),
    (error:unknown)=>error instanceof VideoEngineError&&error.httpStatus===416);
});

test("Gallery API lists only the signed-in owner's records and never borrows another owner",async t=>{
  fixture(t);
  const salt="ab".repeat(16);
  process.env.AI_ROOM_USERS_JSON=JSON.stringify([
    {id:"alice",salt,passwordHash:"cc".repeat(64)},
    {id:"bobby",salt,passwordHash:"dd".repeat(64)}
  ]);
  const proto=NativeObjectStore.prototype;
  const previous={list:proto.list,getText:proto.getText,head:proto.head};
  const calls:string[]=[];
  t.after(()=>{proto.list=previous.list;proto.getText=previous.getText;proto.head=previous.head;});
  proto.list=async(prefix:string)=>{
    calls.push("list:"+prefix);
    if(prefix==="jobs/alice/")return {
      Contents:[{Key:"jobs/alice/"+id+".json",LastModified:new Date("2026-10-10T00:00:00Z")}],
      KeyCount:1,IsTruncated:false
    };
    return {Contents:[],KeyCount:0,IsTruncated:false};
  };
  proto.getText=async(key:string)=>{
    calls.push("get:"+key);
    if(key==="jobs/alice/"+id+".json")return JSON.stringify({
      id,owner:"alice",prompt:"Private test video",model:"Wan 2.2 Fast",
      status:"completed",mode:"text",aspect:"16:9",quality:"720p",
      duration:"5s",createdAt:"2026-10-10T00:00:00Z"
    });
    throw Error("Cross-owner metadata read");
  };
  proto.head=async(key:string)=>{
    calls.push("head:"+key);
    if(key.startsWith("deleted/")){
      const e=new Error("Missing");e.name="NotFound";throw e;
    }
    throw Error("Unexpected owner lookup");
  };
  const {GET}=await import("../app/api/ai-room/jobs/route");
  const request=(user:string)=>new Request("https://site.test/api/ai-room/jobs",{
    headers:{cookie:SESSION_COOKIE+"="+makeSession(user)}
  });
  const alice=await GET(request("alice"));
  assert.equal(alice.status,200);
  const aliceJobs=(await alice.json()).jobs as {id:string;videoUrl:string}[];
  assert.equal(aliceJobs.length,1);
  assert.equal(aliceJobs[0].id,id);
  assert.match(aliceJobs[0].videoUrl,/^\/api\/ai-room\/videos\//);
  const bobby=await GET(request("bobby"));
  assert.equal(bobby.status,200);
  assert.deepEqual((await bobby.json()).jobs,[]);
  assert.ok(calls.includes("list:jobs/alice/"));
  assert.ok(calls.includes("list:jobs/bobby/"));
  assert.equal(calls.some(x=>x==="get:jobs/bobby/"+id+".json"),false);
});

test("Gallery API reports OCI failure instead of pretending the bucket is empty",async t=>{
  fixture(t);
  const salt="ab".repeat(16);
  process.env.AI_ROOM_USERS_JSON=JSON.stringify([{id:"alice",salt,passwordHash:"cc".repeat(64)}]);
  const proto=NativeObjectStore.prototype;
  const previous=proto.list;
  t.after(()=>{proto.list=previous;});
  proto.list=async()=>{throw new VideoEngineError("Unable to list private videos.",503,true);};
  const {GET}=await import("../app/api/ai-room/jobs/route");
  const res=await GET(new Request("https://site.test/api/ai-room/jobs",{
    headers:{cookie:SESSION_COOKIE+"="+makeSession("alice")}
  }));
  assert.equal(res.status,503);
  const result=await res.json();
  assert.equal(Array.isArray(result.jobs),false);
  assert.equal(typeof result.error,"string");
});
