import "server-only";
import {Readable} from "node:stream";
import {ReadableStream as NodeReadableStream} from "node:stream/web";
import * as common from "oci-common";
import * as objectstorage from "oci-objectstorage";
import {VideoEngineError} from "./video-engine";

// Native OCI SDK avoids S3 designated-compartment tenancy configuration entirely.
// All methods use the fixed Batam region, one bucket, and OCI request-signing API keys.
export function nativeStorageEnabled():boolean {
  return process.env.AI_ROOM_OCI_DRIVER === "native";
}
export function nativeCredentialsConfigured():boolean {
  return Boolean(
    /^ocid1\.tenancy\./.test(process.env.AI_ROOM_OCI_TENANCY_ID||"") &&
    /^ocid1\.user\./.test(process.env.AI_ROOM_OCI_USER_ID||"") &&
    /^[0-9a-f]{2}(?::[0-9a-f]{2}){15}$/i.test(process.env.AI_ROOM_OCI_KEY_FINGERPRINT||"") &&
    (process.env.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\n/g,"\n").includes("BEGIN RSA PRIVATE KEY") ||
    // OCI can issue PEM files with PKCS#8 BEGIN PRIVATE KEY headers.
    (Boolean(process.env.AI_ROOM_OCI_TENANCY_ID?.startsWith("ocid1.tenancy.")) &&
     Boolean(process.env.AI_ROOM_OCI_USER_ID?.startsWith("ocid1.user.")) &&
     /^[0-9a-f]{2}(?::[0-9a-f]{2}){15}$/i.test(process.env.AI_ROOM_OCI_KEY_FINGERPRINT||"") &&
     (process.env.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\n/g,"\n").includes("BEGIN PRIVATE KEY"))
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
    process.env.AI_ROOM_OCI_TENANCY_ID!,
    process.env.AI_ROOM_OCI_USER_ID!,
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
  return {namespaceName:ns,bucketName:bucket};
}
function client(){
  const c=new objectstorage.ObjectStorageClient({authenticationDetailsProvider:provider()});
  c.region=common.Region.AP_BATAM_1;
  return c;
}
export function nativeError(error:unknown):never {
  const e=error as {statusCode?:number;code?:string};
  if(e?.statusCode===404 || e?.code==="NotFound") {
    const notFound=new Error("Native OCI object missing");notFound.name="NotFound";throw notFound;
  }
  // Never expose signed request, source URL, or OCI authentication data to clients.
  throw new VideoEngineError("Private OCI Object Storage operation failed.",503,true);
}
export type NativeListItem={Key?:string;LastModified?:Date};
export type NativeList={Contents:NativeListItem[];KeyCount:number;IsTruncated:boolean};
export class NativeObjectStore {
  async head(key:string):Promise<{ContentLength:number}> {
    const c=client();
    try{
      const r=await c.headObject({...config(),objectName:nativeObjectName(key)});
      return {ContentLength:r.contentLength};
    }catch(e){return nativeError(e);}finally{c.close();}
  }
  async put(key:string,body:string|Buffer|Readable,size?:number,type="application/json"):Promise<void>{
    const c=client();
    const b=typeof body==="string"?Buffer.from(body,"utf8"):body;
    const contentLength=size??(Buffer.isBuffer(b)?b.byteLength:undefined);
    if(contentLength===undefined || !Number.isSafeInteger(contentLength) || contentLength<0 || contentLength>250*1024*1024){
      c.close();throw new VideoEngineError("Invalid OCI object size.",502,false);
    }
    try{
      await c.putObject({...config(),objectName:nativeObjectName(key),
        putObjectBody:b,contentLength,contentType:type,cacheControl:"private, no-store"});
    }catch(e){return nativeError(e);}finally{c.close();}
  }
  async getText(key:string):Promise<string>{
    const c=client();
    try{
      const r=await c.getObject({...config(),objectName:nativeObjectName(key)});
      const s=Readable.from(r.value as Readable|NodeReadableStream);
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of s){
        const b=Buffer.from(chunk as Buffer);size+=b.length;
        if(size>16000){s.destroy();throw new VideoEngineError("Oversized OCI metadata.",502,false);}
        chunks.push(b);
      }
      return Buffer.concat(chunks).toString("utf8");
    }catch(e){if(e instanceof VideoEngineError)throw e;return nativeError(e);}finally{c.close();}
  }
  async list(prefix:string,limit:number):Promise<NativeList>{
    const c=client();
    try{
      const r=await c.listObjects({...config(),prefix,limit,fields:"name,timeModified"});
      const contents=(r.listObjects.objects||[]).map(o=>({Key:o.name,LastModified:o.timeModified}));
      return {Contents:contents,KeyCount:contents.length,IsTruncated:Boolean(r.listObjects.nextStartWith)};
    }catch(e){return nativeError(e);}finally{c.close();}
  }
  async delete(key:string):Promise<void>{
    const c=client();
    try{await c.deleteObject({...config(),objectName:nativeObjectName(key)});}
    catch(e){return nativeError(e);}finally{c.close();}
  }
  async getVideo(key:string,range?:{start:number;end:number;total:number}):Promise<{body:Readable;length:number}>{
    const c=client();
    try{
      const request:objectstorage.requests.GetObjectRequest={...config(),objectName:nativeObjectName(key)};
      if(range)request.range=common.Range.parse(range.start+"-"+range.end+"/"+range.total);
      const res=await c.getObject(request);
      // OCI returns the response as a readable stream. Keep the SDK client until the stream ends.
      const body=res.value instanceof Readable?res.value:Readable.fromWeb(res.value as NodeReadableStream);
      body.once("close",()=>c.close());
      body.once("error",()=>c.close());
      return {body,length:res.contentLength};
    }catch(e){c.close();return nativeError(e);}
  }
}
