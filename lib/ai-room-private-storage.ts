import "server-only";
import {Readable} from "node:stream";
import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand} from "@aws-sdk/client-s3";
import {Upload} from "@aws-sdk/lib-storage";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {getVideoEngine, parseVideoRequest, VideoEngineError, type VideoJob} from "./video-engine";
import {privateVideoConfigured} from "./ai-room-private-auth";

const REGION="ap-batam-1";
const JOB_ID=/^(?:fast|a14b|v27|v3|v3prime):(text|image):[A-Za-z0-9_-]{1,128}$/;
const VIDEO_LIMIT=250*1024*1024; // fail closed for unexpected outputs
const URL_TTL=300;
type RecordStatus="queued"|"processing"|"completed"|"failed"|"deleted";
export type PrivateRecord = {
  id:string;owner:string;prompt:string;model:string;mode:string;aspect:string;quality:string;
  duration:string;createdAt:string;status:RecordStatus;videoWidth?:number;videoHeight?:number;
  error?:string;
};
type ClientJob=Omit<PrivateRecord,"owner"> & {videoUrl?:string;downloadUrl?:string};

function settings(){
  if(!privateVideoConfigured())throw new VideoEngineError("OCI private storage is not configured.",503,false);
  const namespace=process.env.AI_ROOM_OCI_NAMESPACE!;
  const bucket=process.env.AI_ROOM_OCI_BUCKET!;
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(namespace) || !/^[a-zA-Z0-9._-]{3,255}$/.test(bucket)){
    throw new VideoEngineError("Invalid OCI storage configuration.",503,false);
  }
  return {namespace,bucket};
}
function client(){
  const {namespace}=settings();
  return new S3Client({
    region:REGION,
    endpoint:"https://"+namespace+".compat.objectstorage."+REGION+".oraclecloud.com",
    forcePathStyle:true,
    credentials:{accessKeyId:process.env.AI_ROOM_OCI_ACCESS_KEY_ID!,secretAccessKey:process.env.AI_ROOM_OCI_SECRET_ACCESS_KEY!},
    maxAttempts:2
  });
}
function key(owner:string,id:string):string{
  if(!JOB_ID.test(id))throw new VideoEngineError("Invalid private video job ID.",400,false);
  return "jobs/"+owner+"/"+id+".json";
}
function videoKey(owner:string,id:string):string {
  if(!JOB_ID.test(id))throw new VideoEngineError("Invalid private video job ID.",400,false);
  return "videos/"+owner+"/"+id+".mp4";
}
async function readBody(stream:unknown):Promise<string>{
  if(!stream || typeof stream!=="object" || !("transformToString" in stream) || typeof stream.transformToString!=="function"){
    throw new VideoEngineError("Invalid OCI video metadata.",502,true);
  }
  const data=await stream.transformToString();
  if(data.length>16000)throw new VideoEngineError("Oversized OCI video metadata.",502,false);
  return data;
}
async function getRecord(owner:string,id:string):Promise<PrivateRecord>{
  const c=client(),{bucket}=settings();
  try{
    const result=await c.send(new GetObjectCommand({Bucket:bucket,Key:key(owner,id)}));
    const parsed:unknown=JSON.parse(await readBody(result.Body));
    if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))throw new Error("invalid record");
    const value=parsed as PrivateRecord;
    if(value.owner!==owner || value.id!==id ||
      !["queued","processing","completed","failed","deleted"].includes(value.status)){
      throw new Error("invalid ownership/status");
    }
    return value;
  }catch(error){
    const code=(error as {name?:string})?.name;
    if(code==="NoSuchKey" || code==="NotFound") throw new VideoEngineError("Private video not found.",404,false);
    if(error instanceof VideoEngineError)throw error;
    throw new VideoEngineError("Private video metadata is unavailable.",503,true);
  }finally{c.destroy();}
}
async function putRecord(job:PrivateRecord):Promise<void>{
  const c=client(),{bucket}=settings();
  try{
    await c.send(new PutObjectCommand({Bucket:bucket,Key:key(job.owner,job.id),
      ContentType:"application/json",CacheControl:"no-store",Body:JSON.stringify(job)}));
  }catch{
    throw new VideoEngineError("Unable to save private video metadata in OCI.",503,true);
  }finally{c.destroy();}
}
function publicRecord(job:PrivateRecord):ClientJob {
  const {owner,...safe}=job;
  return safe;
}
async function signedRecord(job:PrivateRecord):Promise<ClientJob>{
  const safe=publicRecord(job);
  if(job.status!=="completed")return safe;
  const c=client(),{bucket}=settings();
  try{
    const object=videoKey(job.owner,job.id);
    const videoUrl=await getSignedUrl(c,new GetObjectCommand({Bucket:bucket,Key:object}),{expiresIn:URL_TTL});
    const downloadUrl=await getSignedUrl(c,new GetObjectCommand({Bucket:bucket,Key:object,
      ResponseContentDisposition:'attachment; filename="ai-room-video.mp4"'}),{expiresIn:URL_TTL});
    return {...safe,videoUrl,downloadUrl};
  }finally{c.destroy();}
}
function maxDailyJobs():number {
  const raw=Number(process.env.AI_ROOM_DAILY_JOB_LIMIT||"5");
  return Number.isInteger(raw) && raw>=1 && raw<=30?raw:5;
}
async function assertQuota(owner:string):Promise<void>{
  const c=client(),{bucket}=settings();
  const day=new Date().toISOString().slice(0,10);
  try{
    const result=await c.send(new ListObjectsV2Command({
      Bucket:bucket,Prefix:"usage/"+owner+"/"+day+"/",MaxKeys:31
    }));
    if((result.KeyCount||0)>=maxDailyJobs()){
      throw new VideoEngineError("Daily AI ROOM generation limit reached.",429,false);
    }
  }catch(error){
    if(error instanceof VideoEngineError)throw error;
    throw new VideoEngineError("Cannot verify usage limits in OCI.",503,true);
  }finally{c.destroy();}
}
async function markUsage(owner:string,id:string):Promise<void>{
  const c=client(),{bucket}=settings();
  const day=new Date().toISOString().slice(0,10);
  try {
    await c.send(new PutObjectCommand({Bucket:bucket,
      Key:"usage/"+owner+"/"+day+"/"+id+".json",Body:JSON.stringify({id,at:new Date().toISOString()}),
      ContentType:"application/json"}));
  }catch{
    throw new VideoEngineError("Generation was submitted, but usage tracking failed. Contact the operator before retrying.",503,false);
  }finally{c.destroy();}
}
export async function privateSubmit(owner:string,body:unknown):Promise<ClientJob>{
  settings();
  const input=parseVideoRequest(body);
  await assertQuota(owner);
  const created=await getVideoEngine().submit(input);
  const record:PrivateRecord={
    id:created.id,owner,prompt:input.prompt,model:input.model,mode:input.mode,aspect:input.aspect,
    quality:input.quality,duration:input.duration,createdAt:created.createdAt,status:"queued",
  };
  // A successful provider request is chargeable; never retry submission after a persistence error.
  await markUsage(owner,record.id);
  await putRecord(record);
  return publicRecord(record);
}
function assertFalMediaUrl(raw:string):URL{
  let u:URL;
  try{u=new URL(raw);}catch{throw new VideoEngineError("Provider video URL is invalid.",502,false);}
  if(u.protocol!=="https:" || u.username || u.password || u.port ||
    !(/(^|\\.)fal\\.media$/).test(u.hostname) || u.hostname==="fal.media" && u.pathname==="/"){
    throw new VideoEngineError("Untrusted provider media host.",502,false);
  }
  return u;
}
async function importVideo(owner:string,id:string,source:string):Promise<void>{
  const url=assertFalMediaUrl(source);
  const c=client(),{bucket}=settings(),dst=videoKey(owner,id);
  try{
    try{
      await c.send(new HeadObjectCommand({Bucket:bucket,Key:dst}));
      return; // recover safely after metadata-write failures
    }catch(error){
      if(!["NotFound","NoSuchKey"].includes((error as {name?:string})?.name||""))throw error;
    }
    const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(120000),cache:"no-store"});
    if(!response.ok || !response.body)throw new VideoEngineError("Provider video cannot be fetched.",502,true);
    const size=Number(response.headers.get("content-length"));
    if(!Number.isSafeInteger(size) || size<=0 || size>VIDEO_LIMIT) {
      await response.body.cancel();
      throw new VideoEngineError("Provider video exceeds the safe transfer limit or has unknown size.",502,false);
    }
    const type=response.headers.get("content-type")||"";
    if(!type.startsWith("video/") && type!=="application/octet-stream") {
      await response.body.cancel();
      throw new VideoEngineError("Provider returned a non-video file.",502,false);
    }
    await new Upload({client:c,params:{Bucket:bucket,Key:dst,
      Body:Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      ContentType:"video/mp4",ContentLength:size,CacheControl:"private, no-store"},
      queueSize:2,partSize:8*1024*1024,leavePartsOnError:false}).done();
  }catch(error){
    if(error instanceof VideoEngineError)throw error;
    throw new VideoEngineError("Video transfer to private OCI storage failed. Retry status later.",503,true);
  }finally{c.destroy();}
}
export async function privateStatus(owner:string,id:string):Promise<ClientJob>{
  let record=await getRecord(owner,id);
  if(record.status==="deleted")throw new VideoEngineError("Private video was deleted.",404,false);
  if(record.status==="completed" || record.status==="failed")return signedRecord(record);
  const state:VideoJob=await getVideoEngine().status(id);
  if(state.status==="queued" || state.status==="processing"){
    if(record.status!==state.status){record={...record,status:state.status};await putRecord(record);}
  }else if(state.status==="failed"){
    record={...record,status:"failed",error:"Provider could not generate this video."};
    await putRecord(record);
  }else if(state.status==="completed" && state.videoUrl){
    await importVideo(owner,id,state.videoUrl);
    record={...record,status:"completed",videoWidth:state.videoWidth,videoHeight:state.videoHeight};
    await putRecord(record);
  }else throw new VideoEngineError("Provider video result is incomplete.",502,true);
  return signedRecord(record);
}
export async function privateList(owner:string):Promise<ClientJob[]>{
  const c=client(),{bucket}=settings();
  let objects:{Key?:string;LastModified?:Date}[]=[];
  try{
    const result=await c.send(new ListObjectsV2Command({Bucket:bucket,Prefix:"jobs/"+owner+"/",MaxKeys:1000}));
    if(result.IsTruncated)throw new VideoEngineError("Too many private jobs. Contact operator for pagination.",503,false);
    objects=(result.Contents||[]).sort((a,b)=>(b.LastModified?.getTime()||0)-(a.LastModified?.getTime()||0)).slice(0,50);
  }catch(error){
    if(error instanceof VideoEngineError)throw error;
    throw new VideoEngineError("Unable to list private videos.",503,true);
  }finally{c.destroy();}
  const jobs=await Promise.all(objects.map(async row=>{
    const id=row.Key?.slice(("jobs/"+owner+"/").length).replace(/\\.json$/,"");
    if(!id || !JOB_ID.test(id))return null;
    try{
      const record=await getRecord(owner,id);
      return record.status==="deleted"?null:await signedRecord(record);
    }catch{return null;}
  }));
  return jobs.filter((job):job is ClientJob=>job!==null);
}
export async function privateDelete(owner:string,id:string):Promise<void>{
  const record=await getRecord(owner,id);
  // Tombstone first so concurrent status polling cannot expose the video again.
  if(record.status!=="deleted"){
    await putRecord({id,owner,prompt:"",model:"",mode:"",aspect:"",quality:"",duration:"",
      createdAt:record.createdAt,status:"deleted"});
  }
  const c=client(),{bucket}=settings();
  try{
    await c.send(new DeleteObjectCommand({Bucket:bucket,Key:videoKey(owner,id)}));
  }catch{
    throw new VideoEngineError("Could not remove video bytes. Retry Delete; metadata tombstone is retained.",503,true);
  }finally{c.destroy();}
}
