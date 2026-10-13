#!/usr/bin/env node
/**
 * OCI Native signed-object smoke probe. No fal.ai calls or user object changes.
 *
 * --probe: existing Preview or other non-production testing
 * --production-probe: strictly the dedicated OCI Production bucket + native driver
 *
 * Run from a secure operator terminal with environment variables already loaded.
 * Never pass PEM material in CLI arguments, print SDK errors, or store keys in Git.
 */
import {randomUUID} from "node:crypto";
import {Readable} from "node:stream";
import {buffer} from "node:stream/consumers";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";

const env=process.env;
const args=process.argv.slice(2);
const isProduction=args.length===1&&args[0]==="--production-probe";
const isPreview=args.length===1&&args[0]==="--probe";
const required=["AI_ROOM_OCI_TENANCY_ID","AI_ROOM_OCI_USER_ID","AI_ROOM_OCI_KEY_FINGERPRINT",
  "AI_ROOM_OCI_PRIVATE_KEY","AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET"];
const PROD_BUCKET="ai-room-private-videos-prod";
const PREFIX="usage/nativeprobe/";
const maxBodyBytes=8*1024;
function stop(message) {
  console.error("FAIL: "+message);
  process.exitCode=1;
}
function badConfiguration(){
  if(!isProduction&&!isPreview)return "Choose --probe or --production-probe. No objects changed.";
  if(isProduction && env.AI_ROOM_OCI_BUCKET!==PROD_BUCKET)
    return "Production probe refused a bucket other than the isolated Production bucket.";
  if(isPreview && env.VERCEL_ENV==="production")
    return "Use --production-probe in Production; Preview probe refused.";
  if(isProduction && env.VERCEL_ENV==="preview")
    return "Production probe cannot run with a Preview environment.";
  if(isProduction && env.AI_ROOM_OCI_DRIVER!=="native")
    return "Native OCI driver is required for the Production probe.";
  if(required.some(k=>!env[k]))
    return "OCI API signing and bucket configuration are incomplete.";
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(env.AI_ROOM_OCI_NAMESPACE) ||
     !/^[A-Za-z0-9._-]{3,255}$/.test(env.AI_ROOM_OCI_BUCKET))
    return "Unsafe namespace or bucket identifier.";
  return null;
}
const missing=badConfiguration();
if(missing){stop(missing);}
else{
  // The OCI SDK's retry warnings can contain the private object path. Never
  // echo raw SDK warnings or exceptions from this standalone diagnostic.
  const warn=console.warn;
  console.warn=(...args)=>{
    const first=args[0];
    if(typeof first==="string" && [
      "Request cannot be retried. Not Retrying. Exception occurred :",
      "Request failed with Exception :",
      "All retry attempts have exhausted."
    ].some(prefix=>first.startsWith(prefix)))return;
    warn(...args);
  };
  let client;
  let writeAttempted=false;
  const objectName=PREFIX+new Date().toISOString().slice(0,10)+"/"+randomUUID()+".json";
  const payload=Buffer.from(JSON.stringify({probe:"ai-room-private-storage",nonce:randomUUID()}));
  const params={namespaceName:env.AI_ROOM_OCI_NAMESPACE,
    bucketName:env.AI_ROOM_OCI_BUCKET,objectName};
  // Restrict calls to the region selected for this app. SDK retries are
  // bounded to prevent the verifier hanging on a network/IAM failure.
  const verify=async(promise,ms=15000)=>{
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:"timeout"}),ms);})
      ]);
    } finally {clearTimeout(timer);}
  };
  try {
    const signer=new common.SimpleAuthenticationDetailsProvider(
      env.AI_ROOM_OCI_TENANCY_ID,env.AI_ROOM_OCI_USER_ID,
      env.AI_ROOM_OCI_KEY_FINGERPRINT,
      env.AI_ROOM_OCI_PRIVATE_KEY.replace(/\\n/g,"\n"),
      env.AI_ROOM_OCI_KEY_PASSPHRASE||null,
      common.Region.AP_BATAM_1
    );
    client=new objectstorage.ObjectStorageClient({authenticationDetailsProvider:signer},{
      retryConfiguration:{terminationStrategy:new common.MaxAttemptsTerminationStrategy(1)}
    });
    client.region=common.Region.AP_BATAM_1;
    const result=await verify(client.getBucket({
      namespaceName:params.namespaceName,bucketName:params.bucketName
    }));
    if(result.bucket?.publicAccessType!=="NoPublicAccess" ||
       result.bucket?.versioning!=="Disabled" ||
       result.bucket?.storageTier!=="Standard" ||
       Boolean(result.bucket?.objectLifecyclePolicyEtag) ||
       result.bucket?.replicationEnabled===true ||
       result.bucket?.isReadOnly===true){
      throw Error("bucket_policy");
    }
    console.log("PASS: signed OCI Native access to private Standard bucket.");
    writeAttempted=true;
    await verify(client.putObject({...params,putObjectBody:payload,
      contentLength:payload.length,contentType:"application/json",
      cacheControl:"private, no-store"}));
    console.log("PASS: disposable object write.");
    const response=await verify(client.getObject(params));
    const data=Buffer.from(await buffer(Readable.from(response.value)));
    if(data.length>maxBodyBytes||!data.equals(payload))throw Error("readback");
    console.log("PASS: exact signed readback.");
    const listing=await verify(client.listObjects({
      namespaceName:params.namespaceName,bucketName:params.bucketName,
      prefix:objectName,limit:2,fields:"name"
    }));
    if(!listing.listObjects?.objects?.some(obj=>obj.name===objectName))
      throw Error("list");
    console.log("PASS: signed list.");
    const anonymous="https://objectstorage.ap-batam-1.oraclecloud.com/n/"+
      encodeURIComponent(params.namespaceName)+"/b/"+
      encodeURIComponent(params.bucketName)+"/o/"+encodeURIComponent(params.objectName);
    const anon=await fetch(anonymous,{
      redirect:"manual",signal:AbortSignal.timeout(10000)
    });
    await anon.body?.cancel();
    if(![401,403,404].includes(anon.status))throw Error("public_object_access");
    console.log("PASS: anonymous read denied.");
  } catch {
    // Raw SDK exceptions can contain private key identifiers and object paths.
    stop("OCI signed storage probe failed. Check signing, IAM, policy and Batam network.");
  } finally {
    // Attempt cleanup even after an uncertain write outcome. This never
    // deletes any user object: objectName is a new cryptographic UUID.
    if(client&&writeAttempted){
      try {
        await verify(client.deleteObject(params));
        try{
          await verify(client.headObject(params));
          stop("Disposable object still exists after Delete.");
        }catch(e){
          if(e?.statusCode===404 || e?.code==="NotFound")console.log("PASS: disposable object deletion verified.");
          else stop("Disposable object deletion could not be verified.");
        }
      } catch {
        stop("Disposable object cleanup could not be verified; inspect the nativeprobe prefix in OCI.");
      }
    }
    client?.close();
    console.warn=warn;
  }
}
