#!/usr/bin/env node
// OCI Native REST signer probe. This uses the same API key as Vercel Preview.
// Run ONLY in a secure shell; never paste PEM into Git, CLI arguments or chat.
import {randomUUID} from "node:crypto";
import {Readable} from "node:stream";
import {buffer} from "node:stream/consumers";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";

const env=process.env;
const required=["AI_ROOM_OCI_TENANCY_ID","AI_ROOM_OCI_USER_ID","AI_ROOM_OCI_KEY_FINGERPRINT",
  "AI_ROOM_OCI_PRIVATE_KEY","AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET"];
const abort=message=>{console.error("FAIL: "+message);process.exitCode=1;};
if(process.argv.length!==3 || process.argv[2]!=="--probe"){
  abort("Pass explicit --probe to test OCI; no objects were changed.");
}else if(required.some(k=>!env[k])){
  abort("Missing OCI Native API key or storage configuration.");
}else{
  const namespaceName=env.AI_ROOM_OCI_NAMESPACE;
  const bucketName=env.AI_ROOM_OCI_BUCKET;
  const provider=new common.SimpleAuthenticationDetailsProvider(
    env.AI_ROOM_OCI_TENANCY_ID,env.AI_ROOM_OCI_USER_ID,env.AI_ROOM_OCI_KEY_FINGERPRINT,
    env.AI_ROOM_OCI_PRIVATE_KEY.replace(/\\n/g,"\n"),env.AI_ROOM_OCI_KEY_PASSPHRASE||null,
    common.Region.AP_BATAM_1);
  const client=new objectstorage.ObjectStorageClient({authenticationDetailsProvider:provider});
  client.region=common.Region.AP_BATAM_1;
  const objectName="usage/nativeprobe/"+new Date().toISOString().slice(0,10)+"/"+randomUUID()+".json";
  const payload=Buffer.from(JSON.stringify({probe:"ai-room-oci-native",nonce:randomUUID()}));
  const config={namespaceName,bucketName,objectName};
  let wrote=false;
  try{
    const details=await client.getBucket({namespaceName,bucketName});
    if(details.bucket.publicAccessType!=="NoPublicAccess" || details.bucket.versioning!=="Disabled" ||
      details.bucket.storageTier!=="Standard"){
      throw Error("Bucket privacy, tier or versioning was not as expected");
    }
    console.log("PASS: OCI Native API key can inspect a private Standard bucket.");
    await client.putObject({...config,putObjectBody:payload,contentLength:payload.length,
      contentType:"application/json",cacheControl:"private, no-store"});
    wrote=true;
    const read=await client.getObject(config);
    const incoming=Buffer.from(await buffer(Readable.from(read.value)));
    if(!incoming.equals(payload))throw Error("Readback mismatch");
    console.log("PASS: Signed OCI Native upload and exact readback.");
    const objects=await client.listObjects({namespaceName,bucketName,prefix:objectName,limit:10});
    if(!objects.listObjects.objects?.some(x=>x.name===objectName))throw Error("Object absent from owner-scoped list");
    console.log("PASS: OCI Native list.");
    const direct="https://objectstorage.ap-batam-1.oraclecloud.com/n/"+
      encodeURIComponent(namespaceName)+"/b/"+encodeURIComponent(bucketName)+"/o/"+
      encodeURIComponent(objectName);
    const anon=await fetch(direct,{redirect:"manual",signal:AbortSignal.timeout(15000)});
    await anon.body?.cancel();
    if(![401,403,404].includes(anon.status))throw Error("Anonymous object access not denied");
    console.log("PASS: Anonymous GET denied.");
  }catch(error){
    abort("Native API preflight failed; check permissions and privacy. "+(error?.statusCode||error?.code||""));
  }finally{
    if(wrote){
      try {
        await client.deleteObject(config);
        try{
          await client.headObject(config);
          abort("Deleted preflight object was still readable.");
        }catch(error) {
          if(error?.statusCode===404 || error?.code==="NotFound")console.log("PASS: Disposable probe deletion verified.");
          else abort("Could not verify probe deletion.");
        }
      }catch{abort("Probe cleanup failed: inspect usage/nativeprobe/ for orphaned object.");}
    }
    client.close();
  }
}
