import assert from "node:assert/strict";
import test from "node:test";
import {Readable} from "node:stream";
import {NativeObjectStore} from "../lib/ai-room-native-objects";
import {privateList,privateStatus,privateSubmit} from "../lib/ai-room-private-storage";
import {privateVideoSurfaces} from "../lib/ai-room-private-views";

const PROVIDER_VIDEO=Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,0]);
const id1="fast:image:mock-image-001",id2="fast:image:mock-image-002";

test("Mature non-explicit Image→Video integrates queue→OCI→private Gallery, and failed jobs cannot replace Preview",async t=>{
  const names=[
    "AI_ROOM_VIDEO_PROVIDER","AI_ROOM_FAL_KEY","AI_ROOM_STORAGE_MODE","AI_ROOM_OCI_DRIVER",
    "AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET","AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED",
    "AI_ROOM_OCI_TENANCY_ID","AI_ROOM_OCI_USER_ID","AI_ROOM_OCI_KEY_FINGERPRINT",
    "AI_ROOM_OCI_PRIVATE_KEY","AI_ROOM_SESSION_SECRET","AI_ROOM_USERS_JSON",
    "AI_ROOM_ENABLE_MATURE_MODE","AI_ROOM_MATURE_USER_ALLOWLIST","VERCEL_ENV",
  ];
  const old=new Map(names.map(name=>[name,process.env[name]]));
  t.after(()=>{for(const [name,value] of old)if(value===undefined)delete process.env[name];else process.env[name]=value;});
  Object.assign(process.env,{
    AI_ROOM_VIDEO_PROVIDER:"fal",AI_ROOM_FAL_KEY:"mock-not-a-real-key",
    AI_ROOM_STORAGE_MODE:"oci",AI_ROOM_OCI_DRIVER:"native",
    AI_ROOM_OCI_NAMESPACE:"mocknamespace",AI_ROOM_OCI_BUCKET:"private-mock-bucket",
    AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED:"true",
    AI_ROOM_OCI_TENANCY_ID:"ocid1.tenancy.oc1..mockidentity123",
    AI_ROOM_OCI_USER_ID:"ocid1.user.oc1..mockidentity123",
    AI_ROOM_OCI_KEY_FINGERPRINT:Array(16).fill("aa").join(":"),
    AI_ROOM_OCI_PRIVATE_KEY:"-----BEGIN RSA PRIVATE KEY-----\nMOCK-NOT-REAL\n-----END RSA PRIVATE KEY-----",
    AI_ROOM_SESSION_SECRET:"x".repeat(64),
    AI_ROOM_USERS_JSON:JSON.stringify([
      {id:"alice",salt:"aa".repeat(16),passwordHash:"bb".repeat(64)},
      {id:"bobby",salt:"aa".repeat(16),passwordHash:"cc".repeat(64)},
    ]),
    AI_ROOM_ENABLE_MATURE_MODE:"true",
    AI_ROOM_MATURE_USER_ALLOWLIST:"alice",
    VERCEL_ENV:"test",
  });

  const objects=new Map<string,Buffer>();
  const proto=NativeObjectStore.prototype;
  const saved={
    list:proto.list,head:proto.head,getText:proto.getText,
    put:proto.put,delete:proto.delete,
  };
  const notFound=()=>{const e=new Error("not found");e.name="NotFound";return e;};
  proto.list=async(prefix,limit)=>{
    const keys=[...objects.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit);
    return {Contents:keys.map(Key=>({Key,LastModified:new Date()})),KeyCount:keys.length,IsTruncated:false};
  };
  proto.head=async key=>{
    const obj=objects.get(key);if(!obj)throw notFound();
    return {ContentLength:obj.length};
  };
  proto.getText=async key=>{
    const obj=objects.get(key);if(!obj)throw notFound();
    return obj.toString("utf8");
  };
  proto.put=async(key,body)=>{
    const data=typeof body==="string"?Buffer.from(body):
      Buffer.isBuffer(body)?body:Buffer.concat(await (async()=>{
        const chunks:Buffer[]=[];
        for await(const piece of body as Readable)chunks.push(Buffer.from(piece));
        return chunks;
      })());
    objects.set(key,data);
  };
  proto.delete=async key=>{objects.delete(key);};
  t.after(()=>{
    proto.list=saved.list;proto.head=saved.head;proto.getText=saved.getText;
    proto.put=saved.put;proto.delete=saved.delete;
  });

  const actualFetch=globalThis.fetch;
  let posts=0;
  globalThis.fetch=(async(input,init)=>{
    const url=String(input);
    if(init?.method==="POST" && url.includes("queue.fal.run/")){
      posts++;
      const body=JSON.parse(String(init.body)) as Record<string,unknown>;
      assert.equal(body.image_url,"data:image/png;base64,AAAA");
      assert.equal(body.resolution,"720p");
      return new Response(JSON.stringify({request_id:posts===1?"mock-image-001":"mock-image-002"}),{
        status:200,headers:{"content-type":"application/json"},
      });
    }
    if(url.includes("/status?")){
      const failed=url.includes("mock-image-002");
      return Response.json(failed
        ? {status:"FAILED",request_id:"mock-image-002",error_type:"CONTENT_POLICY"}
        : {status:"COMPLETED",request_id:"mock-image-001"});
    }
    if(url.includes("queue.fal.run/") && url.includes("mock-image-001")){
      return Response.json({video:{
        url:"https://storage.googleapis.com/falserverless/mock_image_output.mp4",
        width:720,height:1280,
      }});
    }
    if(url==="https://storage.googleapis.com/falserverless/mock_image_output.mp4"){
      return new Response(new Uint8Array(PROVIDER_VIDEO),{status:200,headers:{
        "content-type":"video/mp4","content-length":String(PROVIDER_VIDEO.length),
      }});
    }
    throw new Error("Unexpected external provider request: "+url.split("?")[0]);
  }) as typeof fetch;
  t.after(()=>{globalThis.fetch=actualFetch;});

  const request={
    prompt:"An adult portrait with gentle blinking and natural movement",
    mode:"image",model:"Wan 2.2 Fast",duration:"5s",aspect:"9:16",quality:"720p",
    imageUrl:"data:image/png;base64,AAAA",contentMode:"mature",
    adultConfirmed:true,imageConsentConfirmed:true,preserveFace:false,
  };
  const initial=await privateSubmit("alice",request);
  assert.equal(initial.id,id1);
  assert.equal(initial.status,"queued");
  assert.equal(posts,1,"only one billable mock submit");
  const done=await privateStatus("alice",id1);
  assert.equal(done.status,"completed");
  assert.equal(done.videoUrl,"/api/ai-room/videos/fast%3Aimage%3Amock-image-001/stream");
  assert.ok(!done.videoUrl?.includes("falserverless"));
  assert.deepEqual(objects.get("videos/alice/"+id1+".mp4"),PROVIDER_VIDEO);
  assert.deepEqual(await privateList("bobby"),[],"another user must not see the video");

  const second=await privateSubmit("alice",request);
  assert.equal(second.id,id2);
  const blocked=await privateStatus("alice",id2);
  assert.equal(blocked.status,"failed");
  assert.match(blocked.error||"",/content safety policy/);
  assert.equal(posts,2,"provider-rejected result never causes a second POST");
  assert.equal(objects.has("videos/alice/"+id2+".mp4"),false);
  const inventory=await privateList("alice");
  const views=privateVideoSurfaces(inventory);
  assert.deepEqual(views.gallery.map(job=>job.id),[id1]);
  assert.deepEqual(views.recent.map(job=>job.id),[id1]);
  assert.equal(views.preview?.id,id1);
  assert.ok(views.history.some(job=>job.id===id2 && job.status==="failed"));
});
