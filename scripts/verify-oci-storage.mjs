#!/usr/bin/env node
/**
 * Disposable OCI S3-compatible object upload/read/delete probe.
 * Operator-only. Not used by production video generation.
 * Usage: node scripts/verify-oci-storage.mjs --probe
 * Never paste an OCI Customer Secret Key in the command line.
 */
import { randomUUID } from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const REGION = "ap-batam-1";
const required = [
  "AI_ROOM_OCI_NAMESPACE", "AI_ROOM_OCI_BUCKET",
  "AI_ROOM_OCI_ACCESS_KEY_ID", "AI_ROOM_OCI_SECRET_ACCESS_KEY",
];

function fail(message, code=1) {
  console.error("FAILED: " + message);
  process.exitCode=code;
}
function errorKind(error) {
  const status=error?.$metadata?.httpStatusCode;
  if(status===401 || status===403)return "OCI authentication/permissions rejected the request.";
  if(status===404)return "OCI bucket or object not found in ap-batam-1.";
  if(error?.name==="AbortError" || error?.name==="TimeoutError")return "OCI request timed out.";
  return "OCI operation failed. Review bucket region, policy, network and customer secret key.";
}

if(process.argv.slice(2).join(" ") !== "--probe") {
  fail("Explicit --probe is required. No bucket operations were performed.",2);
} else if(process.env.AI_ROOM_STORAGE_MODE!=="oci") {
  fail("AI_ROOM_STORAGE_MODE must explicitly be oci.",2);
} else if(required.some(key=>!process.env[key])) {
  fail("OCI configuration incomplete: namespace, bucket and dedicated Customer Secret Key are required.",2);
} else {
  const namespace=process.env.AI_ROOM_OCI_NAMESPACE;
  const bucket=process.env.AI_ROOM_OCI_BUCKET;
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(namespace) || !/^[a-zA-Z0-9._-]{3,255}$/.test(bucket)){
    fail("OCI namespace/bucket name is invalid.",2);
  } else {
    const client=new S3Client({
      region:REGION,
      endpoint:"https://"+namespace+".compat.objectstorage."+REGION+".oraclecloud.com",
      forcePathStyle:true,
      maxAttempts:1,
      credentials:{
        accessKeyId:process.env.AI_ROOM_OCI_ACCESS_KEY_ID,
        secretAccessKey:process.env.AI_ROOM_OCI_SECRET_ACCESS_KEY
      }
    });
    const key="healthchecks/connection-"+randomUUID()+".txt";
    const body=Buffer.from("ai-room-preflight:"+randomUUID(),"utf8");
    let uploaded=false,cleaned=false;
    try {
      await client.send(new PutObjectCommand({
        Bucket:bucket,Key:key,Body:body,ContentType:"text/plain",CacheControl:"private,no-store"
      }),{abortSignal:AbortSignal.timeout(15000)});
      uploaded=true;
      const result=await client.send(new GetObjectCommand({
        Bucket:bucket,Key:key
      }),{abortSignal:AbortSignal.timeout(15000)});
      const output=await result.Body?.transformToByteArray();
      if(!output || !Buffer.from(output).equals(body))throw Error("Readback mismatch");
      console.log("PASS: Authenticated OCI upload and byte-for-byte read.");
      const anonUrl="https://"+namespace+".compat.objectstorage."+REGION+".oraclecloud.com/"+encodeURIComponent(bucket)+"/"+key.split("/").map(encodeURIComponent).join("/");
      const anonymous=await fetch(anonUrl,{
        redirect:"manual",signal:AbortSignal.timeout(15000),cache:"no-store"
      });
      await anonymous.body?.cancel();
      if(![401,403,404].includes(anonymous.status))throw Error("Public or unverifiable object access");
      console.log("PASS: Anonymous direct object access is denied.");
      await client.send(new DeleteObjectCommand({
        Bucket:bucket,Key:key
      }),{abortSignal:AbortSignal.timeout(15000)});
      try{
        await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{
          abortSignal:AbortSignal.timeout(15000)
        });
        throw Error("Object still exists after deletion");
      }catch(error){
        const status=error?.$metadata?.httpStatusCode;
        if(status!==404 && error?.name!=="NotFound" && error?.name!=="NoSuchKey")throw error;
      }
      cleaned=true;
      console.log("PASS: OCI delete confirmed. Preview storage connection verified.");
    } catch(error) {
      fail(errorKind(error));
    } finally {
      if(uploaded&&!cleaned){
        try {
          await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{
            abortSignal:AbortSignal.timeout(15000)
          });
          console.log("Cleanup: best-effort deletion completed.");
        }catch{
          console.error("WARNING: probe cleanup could not be verified. Review healthchecks/ prefix in OCI.");
        }
      }
      client.destroy();
    }
  }
}
