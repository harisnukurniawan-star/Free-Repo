#!/usr/bin/env node
/**
 * Read-only OCI connectivity probe for one protected Vercel Preview branch.
 * No writes, no video generation, and no metadata/object names are logged.
 * Explicitly non-blocking: diagnostics must never interrupt deployments.
 */
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";

if (process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "feature/ai-room-oci-native-storage") {
  process.exit(0);
}
const required = [
  "AI_ROOM_OCI_TENANCY_ID","AI_ROOM_OCI_USER_ID",
  "AI_ROOM_OCI_KEY_FINGERPRINT","AI_ROOM_OCI_PRIVATE_KEY",
  "AI_ROOM_OCI_NAMESPACE","AI_ROOM_OCI_BUCKET"
];
const log=(stage,status,extra={})=>
  console.log("AI_ROOM_OCI_PREFLIGHT "+JSON.stringify({stage,status,...extra}));
const classify=(e)=>{
  if(!e || typeof e!=="object")return {category:"unknown",httpStatus:null};
  const raw=typeof e.statusCode==="number"?e.statusCode:e.status;
  const httpStatus=typeof raw==="number"&&Number.isInteger(raw)&&raw>=100&&raw<=599?raw:null;
  const code=typeof e.code==="string"?e.code:"";
  let category="unknown";
  if(httpStatus===401 || httpStatus===403 || code==="NotAuthenticated") category="authentication_or_iam";
  else if(httpStatus===404 || code==="NotFound")category="namespace_bucket_or_permission";
  else if(httpStatus===429)category="rate_limited";
  else if(httpStatus!==null&&httpStatus>=500)category="oci_service";
  else if(["unavailable","ETIMEDOUT","ECONNRESET","ENOTFOUND","EAI_AGAIN"].includes(code))
    category="network_or_local_sdk";
  return {category,httpStatus};
};
if(required.some(k=>!process.env[k])){
  log("configuration","not_ready",{missingCount:required.filter(k=>!process.env[k]).length});
  process.exit(0);
}
const timeout=async(promise,ms)=>{
  let timer;
  try{return await Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:"probe_timeout"}),ms);})
  ]);}finally{clearTimeout(timer);}
};
try{
  // Only the fixed Oracle region endpoint is requested. Any HTTP status means DNS/TLS worked.
  const resp=await fetch("https://objectstorage.ap-batam-1.oraclecloud.com/",{
    redirect:"manual",signal:AbortSignal.timeout(6000)
  });
  await resp.body?.cancel();
  log("dns_tls","reachable",{httpStatus:resp.status});
}catch(e){
  // Never write response messages or transport URLs to logs.
  log("dns_tls","failed",{category:classify(e?.cause || e).category});
}
let client;
try{
  const provider=new common.SimpleAuthenticationDetailsProvider(
    process.env.AI_ROOM_OCI_TENANCY_ID.replace(/[\s\u200b-\u200d\ufeff]/g,""),
    process.env.AI_ROOM_OCI_USER_ID.replace(/[\s\u200b-\u200d\ufeff]/g,""),
    process.env.AI_ROOM_OCI_KEY_FINGERPRINT,
    process.env.AI_ROOM_OCI_PRIVATE_KEY.replace(/\\n/g,"\n"),
    process.env.AI_ROOM_OCI_KEY_PASSPHRASE || null,
    common.Region.AP_BATAM_1
  );
  client=new objectstorage.ObjectStorageClient({authenticationDetailsProvider:provider},{
    retryConfiguration:{terminationStrategy:new common.MaxAttemptsTerminationStrategy(1)}
  });
  client.region=common.Region.AP_BATAM_1;
  let namespaceOk=false;
  try{
    await timeout(client.getNamespace({}),12000);
    namespaceOk=true;
    log("signed_namespace_read","pass");
  }catch(e){log("signed_namespace_read","failed",classify(e));}
  try{
    const result=await timeout(client.listObjects({
      namespaceName:process.env.AI_ROOM_OCI_NAMESPACE,
      bucketName:process.env.AI_ROOM_OCI_BUCKET,
      prefix:"jobs/__preflight_read_only__/",
      limit:1,
      fields:"name"
    }),12000);
    if(!result || !result.listObjects)throw {code:"unexpected_response"};
    log("signed_bucket_list","pass",{namespaceOk});
  }catch(e){log("signed_bucket_list","failed",classify(e));}
}catch(e){log("sdk_setup","failed",classify(e));}
finally{client?.close();}
