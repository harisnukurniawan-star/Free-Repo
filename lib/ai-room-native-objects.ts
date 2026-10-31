import "server-only";
import {Readable} from "node:stream";
import {ReadableStream as NodeReadableStream} from "node:stream/web";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";
import {VideoEngineError} from "./video-engine";
import {withPrivateOciLogs} from "./ai-room-oci-safe-logger";

// Native OCI SDK avoids S3 designated-compartment tenancy configuration entirely.
// All methods use the fixed Batam region, one bucket, and OCI request-signing API keys.
export function nativeStorageEnabled():boolean {
  return process.env.AI_ROOM_OCI_DRIVER === "native";
}
// OCI identifiers never contain whitespace/control characters; Vercel values
// pasted with a trailing newline would otherwise poison the signed Authorization header.
export function normalizeOciId(value:string):string {
  return value.replace(/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g,"");
}
export function nativeCredentialsConfigured():boolean {
  const key=(process.env.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  const tenancy=normalizeOciId(process.env.AI_ROOM_OCI_TENANCY_ID||"");
  const user=normalizeOciId(process.env.AI_ROOM_OCI_USER_ID||"");
  return Boolean(
    /^ocid1\.tenancy\.oc1\.[A-Za-z0-9._-]{8,}$/.test(tenancy) &&
    /^ocid1\.user\.oc1\.[A-Za-z0-9._-]{8,}$/.test(user) &&
    /^[0-9a-f]{2}(?::[0-9a-f]{2}){15}$/i.test(process.env.AI_ROOM_OCI_KEY_FINGERPRINT||"") &&
    (key.includes("BEGIN RSA PRIVATE KEY") || key.includes("BEGIN PRIVATE KEY"))
  );
}
export function nativeObjectName(key:string):string {
  if(!/^(jobs|videos|deleted|usage)\/[a-z0-9][a-z0-9_-]{2,39}\/[A-Za-z0-9_:\/.-]{1,240}$/.test(key) || key.includes("..")){
    throw new VideoEngineError("Invalid private object name.",400,false);
  }
  return key;
}
export function privateVideoPath(id:string):string {
  return "/api/ai-room/videos/"+encodeURIComponent(id)+"/stream";
}
function provider(){
  if(!nativeCredentialsConfigured())throw new VideoEngineError("Native OCI API key is not configured.",503,false);
  return new common.SimpleAuthenticationDetailsProvider(
    normalizeOciId(process.env.AI_ROOM_OCI_TENANCY_ID!),
    normalizeOciId(process.env.AI_ROOM_OCI_USER_ID!),
    process.env.AI_ROOM_OCI_KEY_FINGERPRINT!,
    process.env.AI_ROOM_OCI_PRIVATE_KEY!.replace(/\\n/g,"\n"),
    process.env.AI_ROOM_OCI_KEY_PASSPHRASE||null,
    common.Region.AP_BATAM_1
  );
}
function config(){
  const ns=process.env.AI_ROOM_OCI_NAMESPACE||"";
  const bucket=process.env.AI_ROOM_OCI_BUCKET||"";
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(ns) || !/^[A-Za-z0-9._-]{3,255}$/.test(bucket)){
    throw new VideoEngineError("Invalid OCI native Object Storage configuration.",503,false);
  }
  // Defense in depth: reject wrong-bucket calls even outside authenticated routes.
  if(process.env.VERCEL_ENV==="production" && bucket!=="ai-room-private-videos-prod"){
    throw new VideoEngineError("Native OCI Production bucket is not configured.",503,false);
  }
  return {namespaceName:ns,bucketName:bucket};
}
function client(){
  const c=new objectstorage.ObjectStorageClient({authenticationDetailsProvider:provider()}, {
    // Do not stall interactive Gallery requests with the OCI SDK default 8 retries.
    retryConfiguration:{terminationStrategy:new common.MaxAttemptsTerminationStrategy(1)}
  });
  c.region=common.Region.AP_BATAM_1;
  return c;
}
export type NativeFailureCategory =
  "not_found"|"auth_or_policy"|"rate_limited"|"oci_service"|
  "network_or_signing"|"unclassified";
export function classifyNativeFailure(error:unknown):{status:number|null;category:NativeFailureCategory}{
  // Never inspect or log request paths, message strings, authorization headers, or PEM content.
  if(!error || typeof error!=="object")return {status:null,category:"unclassified"};
  const e=error as {statusCode?:unknown;status?:unknown;code?:unknown};
  const raw=typeof e.statusCode==="number"?e.statusCode:e.status;
  const status=typeof raw==="number" && Number.isInteger(raw) && raw>=100 && raw<=599?raw:null;
  const code=typeof e.code==="string"?e.code:"";
  if(status===404 || code==="NotFound")return {status,category:"not_found"};
  if(status===401 || status===403 || code==="NotAuthenticated" || code==="NotAuthorizedOrNotFound")
    return {status,category:"auth_or_policy"};
  if(status===429 || code==="TooManyRequests")return {status,category:"rate_limited"};
  if(status!==null && status>=500)return {status,category:"oci_service"};
  // The SDK can produce code 'unavailable' for several client-side failures.
  // This is NOT evidence that the signing key itself is incorrect.
  if(["unavailable","ECONNRESET","ETIMEDOUT","ENOTFOUND","EAI_AGAIN","ECONNREFUSED"].includes(code))
    return {status,category:"network_or_signing"};
  return {status,category:"unclassified"};
}
export function nativeError(error:unknown,operation:"head"|"get"|"put"|"list"|"delete"|"stream"="get"):never {
  const failure=classifyNativeFailure(error);
  // An absent individual object is normal; a 404 when listing means the
  // bucket, namespace or route is wrong and must never look like an empty gallery.
  if(failure.category==="not_found" && (operation==="head" || operation==="get" || operation==="stream")){
    const notFound=new Error("Native OCI object missing");notFound.name="NotFound";throw notFound;
  }
  // Only fixed labels and numeric HTTP statuses. Never log the SDK error object:
  // it may contain headers, the requested private object key, or signed URLs.
  console.warn("AI_ROOM_OCI_NATIVE_FAILURE",JSON.stringify({operation,...failure}));
  if(operation==="list"){
    // Gallery has an authenticated owner session. Return only fixed, safe
    // failure categories so a production operator can distinguish OCI IAM
    // denial from a missing bucket or transient service outage.
    const messages:Record<NativeFailureCategory,string>={
      not_found:"OCI Gallery could not locate its configured storage bucket or namespace (404).",
      auth_or_policy:"OCI Gallery access was rejected by OCI (401/403). Check the production signing identity and bucket permissions.",
      rate_limited:"OCI Gallery was rate-limited (429). Retry loading later; do not generate again.",
      oci_service:"OCI Object Storage service could not complete the Gallery read (5xx).",
      network_or_signing:"OCI Gallery connection or request signing failed. Check private OCI connectivity and signing configuration.",
      unclassified:"OCI Gallery encountered an unclassified storage error. Check operator diagnostics; do not generate again."
    };
    throw new VideoEngineError(messages[failure.category],503,false);
  }
  throw new VideoEngineError("Private OCI Object Storage operation failed.",503,true);
}
/** One bounded retry is safe only for read-only inventory requests, never paid submission or writes. */
export async function retryTransientOciList<T>(operation:()=>Promise<T>, wait:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,200))):Promise<T>{
  try{return await operation();}
  catch(error){
    const category=classifyNativeFailure(error).category;
    if(category!=="rate_limited" && category!=="oci_service" && category!=="network_or_signing")throw error;
    await wait();
    return operation();
  }
}
export type NativeListItem={Key?:string;LastModified?:Date};
export type NativeList={Contents:NativeListItem[];KeyCount:number;IsTruncated:boolean};
export class NativeObjectStore {
  async head(key:string):Promise<{ContentLength:number}> {
    const c=client();
    try{
      const r=await withPrivateOciLogs(()=>c.headObject({...config(),objectName:nativeObjectName(key)}));
      return {ContentLength:r.contentLength};
    }catch(e){return nativeError(e,"head");}finally{c.close();}
  }
  async put(key:string,body:string|Buffer|Readable,size?:number,type="application/json"):Promise<void>{
    const c=client();
    const b=typeof body==="string"?Buffer.from(body,"utf8"):body;
    const contentLength=size??(Buffer.isBuffer(b)?b.byteLength:undefined);
    if(contentLength===undefined || !Number.isSafeInteger(contentLength) || contentLength<0 || contentLength>250*1024*1024){
      c.close();throw new VideoEngineError("Invalid OCI object size.",502,false);
    }
    try{
      await withPrivateOciLogs(()=>c.putObject({...config(),objectName:nativeObjectName(key),
        putObjectBody:b,contentLength,contentType:type,cacheControl:"private, no-store"}));
    }catch(e){return nativeError(e,"put");}finally{c.close();}
  }
  async getText(key:string):Promise<string>{
    const c=client();
    try{
      const r=await withPrivateOciLogs(()=>c.getObject({...config(),objectName:nativeObjectName(key)}));
      const s=Readable.from(r.value as Readable|NodeReadableStream);
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of s){
        const b=Buffer.from(chunk as Buffer);size+=b.length;
        if(size>16000){s.destroy();throw new VideoEngineError("Oversized OCI metadata.",502,false);}
        chunks.push(b);
      }
      return Buffer.concat(chunks).toString("utf8");
    }catch(e){if(e instanceof VideoEngineError)throw e;return nativeError(e,"get");}finally{c.close();}
  }
  async list(prefix:string,limit:number):Promise<NativeList>{
    try{
      return await retryTransientOciList(async()=>{
        const c=client();
        try{
          const r=await withPrivateOciLogs(()=>c.listObjects({...config(),prefix,limit,fields:"name,timeModified"}));
          const contents=(r.listObjects.objects||[]).map(o=>({Key:o.name,LastModified:o.timeModified}));
          return {Contents:contents,KeyCount:contents.length,IsTruncated:Boolean(r.listObjects.nextStartWith)};
        }finally{c.close();}
      });
    }catch(e){
      return nativeError(e,"list");
    }
  }
  async delete(key:string):Promise<void>{
    const c=client();
    try{await withPrivateOciLogs(()=>c.deleteObject({...config(),objectName:nativeObjectName(key)}));}
    catch(e){return nativeError(e,"delete");}finally{c.close();}
  }
  async getVideo(key:string,range?:{start:number;end:number;total:number}):Promise<{body:Readable;length:number}>{
    const c=client();
    try{
      const request:objectstorage.requests.GetObjectRequest={...config(),objectName:nativeObjectName(key)};
      if(range)request.range=common.Range.parse(range.start+"-"+range.end+"/"+range.total);
      const res=await withPrivateOciLogs(()=>c.getObject(request));
      // OCI returns the response as a readable stream. Keep the SDK client until the stream ends.
      const body=res.value instanceof Readable?res.value:Readable.fromWeb(res.value as NodeReadableStream);
      body.once("close",()=>c.close());
      body.once("error",()=>c.close());
      return {body,length:res.contentLength};
    }catch(e){c.close();return nativeError(e,"stream");}
  }
}
