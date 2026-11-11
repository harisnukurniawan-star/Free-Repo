import {createHmac,scryptSync,timingSafeEqual} from "node:crypto";
import {VideoEngineError} from "./video-engine";

// The PIN is never a provider credential. All chargeable requests are gated here.
export const PIN_COOKIE="ai_room_generation_unlock";
const LIFETIME_SECONDS=8*60*60;
const HASH=/^[a-f0-9]{128}$/i;
const SALT=/^[a-f0-9]{32,128}$/i;
const LIMIT_WINDOW=15*60;
const RATE_SCRIPT=`
local global=redis.call("INCR",KEYS[1])
if global==1 then redis.call("EXPIRE",KEYS[1],ARGV[1]) end
local localCount=redis.call("INCR",KEYS[2])
if localCount==1 then redis.call("EXPIRE",KEYS[2],ARGV[1]) end
if global>tonumber(ARGV[2]) or localCount>tonumber(ARGV[3]) then return 0 end
return 1
`;
const QUOTA_SCRIPT=`
local count=redis.call("INCR",KEYS[1])
if count==1 then redis.call("EXPIRE",KEYS[1],90000) end
if count>tonumber(ARGV[1]) then return 0 end
return 1
`;

export function generationPinEnabled():boolean{
  return process.env.AI_ROOM_GENERATION_PIN_ENABLED==="true";
}
export function generationPinConfigured():boolean{
  const url=process.env.AI_ROOM_PIN_REDIS_URL||"";
  let redisUrl:URL;
  try{redisUrl=new URL(url);}catch{return false;}
  return Boolean(
    HASH.test(process.env.AI_ROOM_GENERATION_PIN_HASH||"") &&
    SALT.test(process.env.AI_ROOM_GENERATION_PIN_SALT||"") &&
    (process.env.AI_ROOM_GENERATION_PIN_SESSION_SECRET||"").length>=32 &&
    redisUrl.protocol==="https:" && !redisUrl.username && !redisUrl.password &&
    (process.env.AI_ROOM_PIN_REDIS_TOKEN||"").length>=16
  );
}
export function generationPinState(){
  return {generationPinEnabled:generationPinEnabled(),
    generationPinReady:!generationPinEnabled()||generationPinConfigured()};
}
function configured():void{
  if(!generationPinEnabled()||!generationPinConfigured()){
    throw new VideoEngineError("Generation PIN is not configured securely.",503,false);
  }
}
function secret():string{
  configured();
  return process.env.AI_ROOM_GENERATION_PIN_SESSION_SECRET!;
}
function ownerScope(owner?:string):string{
  return owner?"owner:"+owner:"browser";
}
function mac(payload:string):string{
  return createHmac("sha256",secret()).update(payload).digest("base64url");
}
function hashKey(value:string):string{
  return createHmac("sha256",secret()).update(value).digest("hex").slice(0,48);
}
function equals(expected:string,actual:string):boolean{
  const a=Buffer.from(expected,"utf8"),b=Buffer.from(actual,"utf8");
  return a.length===b.length && timingSafeEqual(a,b);
}
export function createPinSession(owner?:string,now=Date.now()):string{
  const payload=Buffer.from(JSON.stringify({
    sub:ownerScope(owner),exp:Math.floor(now/1000)+LIFETIME_SECONDS
  })).toString("base64url");
  return payload+"."+mac(payload);
}
export function readPinSession(token:string|undefined,owner?:string,now=Date.now()):boolean{
  if(!generationPinEnabled()||!generationPinConfigured()||!token||token.length>2048)return false;
  const parts=token.split(".");
  if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return false;
  if(!equals(mac(parts[0]),parts[1]))return false;
  try{
    const data:unknown=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if(!data||typeof data!=="object"||Array.isArray(data))return false;
    const v=data as {sub?:unknown;exp?:unknown};
    return v.sub===ownerScope(owner)&&typeof v.exp==="number"&&
      Number.isInteger(v.exp)&&v.exp>Math.floor(now/1000)&&v.exp<=Math.floor(now/1000)+LIFETIME_SECONDS;
  }catch{return false;}
}
function cookieFrom(request:Request):string|undefined{
  const row=(request.headers.get("cookie")||"").split(";").map(s=>s.trim())
    .find(s=>s.startsWith(PIN_COOKIE+"="));
  if(!row)return;
  try{return decodeURIComponent(row.slice(PIN_COOKIE.length+1));}catch{return;}
}
export function pinSessionActive(request:Request,owner?:string):boolean{
  return generationPinEnabled()&&readPinSession(cookieFrom(request),owner);
}
export function assertGenerationPin(request:Request,owner?:string):void{
  configured();
  if(!pinSessionActive(request,owner)){
    throw new VideoEngineError("Activate paid video generation with your PIN first.",401,false);
  }
}
export function pinCookieOptions(){
  return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict" as const,
    path:"/api/ai-room",maxAge:LIFETIME_SECONDS};
}
async function redisEval(script:string,keys:string[],argv:string[]):Promise<number>{
  configured();
  const url=process.env.AI_ROOM_PIN_REDIS_URL!;
  try{
    const response=await fetch(url,{
      method:"POST",
      headers:{"Authorization":"Bearer "+process.env.AI_ROOM_PIN_REDIS_TOKEN,
        "Content-Type":"application/json"},
      body:JSON.stringify(["EVAL",script,String(keys.length),...keys,...argv]),
      signal:AbortSignal.timeout(5000),
      cache:"no-store"
    });
    if(!response.ok)throw new Error("Redis unavailable");
    const data:unknown=await response.json();
    const result=(data as {result?:unknown})?.result;
    if(result!==0 && result!==1)throw new Error("Unexpected Redis response");
    return result;
  }catch{
    // Never bypass an unavailable distributed limiter.
    throw new VideoEngineError("Generation access checks are temporarily unavailable.",503,true);
  }
}
async function limitAttempts(request:Request,owner?:string):Promise<void>{
  const address=(request.headers.get("x-vercel-forwarded-for")||
    request.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,120);
  const scope=hashKey(ownerScope(owner));
  const slot=Math.floor(Date.now()/(LIMIT_WINDOW*1000));
  const keys=["airoom:pin:global:"+slot,
    "airoom:pin:local:"+slot+":"+scope+":"+hashKey(address)];
  const permitted=await redisEval(RATE_SCRIPT,keys,
    [String(LIMIT_WINDOW+60),"60","5"]);
  if(!permitted)throw new VideoEngineError("Too many PIN attempts. Wait 15 minutes.",429,false);
}
export async function activateGenerationPin(request:Request,pin:unknown,owner?:string):Promise<string>{
  configured();
  await limitAttempts(request,owner);
  if(typeof pin!=="string"||!/^[0-9]{8,12}$/.test(pin)){
    throw new VideoEngineError("Invalid generation PIN.",401,false);
  }
  const known=Buffer.from(process.env.AI_ROOM_GENERATION_PIN_HASH!,"hex");
  const actual=scryptSync(pin,process.env.AI_ROOM_GENERATION_PIN_SALT!,64,
    {N:16384,r:8,p:1,maxmem:64*1024*1024});
  if(!timingSafeEqual(known,actual)){
    throw new VideoEngineError("Invalid generation PIN.",401,false);
  }
  return createPinSession(owner);
}
export async function consumeGenerationQuota(owner?:string):Promise<void>{
  configured();
  const raw=process.env.AI_ROOM_PIN_DAILY_LIMIT||"5";
  const limit=/^[0-9]{1,2}$/.test(raw)?Number(raw):5;
  const safeLimit=Math.max(1,Math.min(30,limit));
  const day=new Date().toISOString().slice(0,10);
  const key="airoom:pin:usage:"+day+":"+hashKey(ownerScope(owner));
  const allowed=await redisEval(QUOTA_SCRIPT,[key],[String(safeLimit)]);
  if(!allowed)throw new VideoEngineError("Daily paid generation limit reached.",429,false);
}
