import {NextResponse} from "next/server";
import {makeSession, privateVideoEnabled, privateVideoConfigured, readSession, requireSameOrigin, sessionCookieOptions, SESSION_COOKIE, verifyPassword} from "@/lib/ai-room-private-auth";
import {videoEngineError, VideoEngineError} from "@/lib/video-engine";
import {matureAccountEligible} from "@/lib/ai-room-content-policy";
import {nativeCredentialsConfigured} from "@/lib/ai-room-native-objects";


// Temporary Preview-only diagnostics: log validation booleans, NEVER secret values.
function auditPrivatePreviewConfiguration(){
  if(process.env.VERCEL_ENV!=="preview")return;
  const e=process.env;
  const pem=(e.AI_ROOM_OCI_PRIVATE_KEY||"").replace(/\\n/g,"\n");
  console.warn("AI_ROOM_PREVIEW_CONFIG_CHECK",JSON.stringify({
    sessionSecretValid:Boolean(e.AI_ROOM_SESSION_SECRET&&e.AI_ROOM_SESSION_SECRET.length>=32),
    privacyVerified:e.AI_ROOM_OCI_BUCKET_PRIVACY_VERIFIED==="true",
    usersJsonPresent:Boolean(e.AI_ROOM_USERS_JSON),
    namespacePresent:Boolean(e.AI_ROOM_OCI_NAMESPACE),
    bucketPresent:Boolean(e.AI_ROOM_OCI_BUCKET),
    nativeDriver:e.AI_ROOM_OCI_DRIVER==="native",
    tenancyIdFormatValid:/^ocid1\.tenancy\./.test(e.AI_ROOM_OCI_TENANCY_ID||""),
    userIdFormatValid:/^ocid1\.user\./.test(e.AI_ROOM_OCI_USER_ID||""),
    fingerprintFormatValid:/^[0-9a-f]{2}(?::[0-9a-f]{2}){15}$/i.test(e.AI_ROOM_OCI_KEY_FINGERPRINT||""),
    privateKeyHeaderValid:pem.includes("BEGIN RSA PRIVATE KEY")||pem.includes("BEGIN PRIVATE KEY"),
    nativeCredentialsValid:nativeCredentialsConfigured(),
    falProvider:e.AI_ROOM_VIDEO_PROVIDER==="fal",
    falCredentialPresent:Boolean(e.AI_ROOM_FAL_KEY)
  }));
}

export const runtime="nodejs";
function errorResponse(error:unknown){
  const safe=videoEngineError(error);
  return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});
}
export async function GET(request:Request){
  if(!privateVideoEnabled())return NextResponse.json({enabled:false,authenticated:false},{headers:{"Cache-Control":"no-store"}});
  try{
    if(!privateVideoConfigured()){
      auditPrivatePreviewConfiguration();
      throw new VideoEngineError("Private OCI storage requires server configuration.",503,false);
    }
    const cookie=(request.headers.get("cookie")||"").split(";").map(s=>s.trim())
      .find(s=>s.startsWith(SESSION_COOKIE+"="))?.slice(SESSION_COOKIE.length+1);
    const id=readSession(cookie);
    return NextResponse.json({enabled:true,authenticated:Boolean(id),user:id,matureEligible:matureAccountEligible(id)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function POST(request:Request){
  try{
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    requireSameOrigin(request);
    if(!privateVideoConfigured())throw new VideoEngineError("Private OCI storage requires server configuration.",503,false);
    const body:unknown=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body))throw new VideoEngineError("Invalid login.",400,false);
    const fields=body as Record<string,unknown>;
    const user=verifyPassword(fields.user as string,fields.password as string);
    if(!user)throw new VideoEngineError("Invalid username or password.",401,false);
    const response=NextResponse.json({authenticated:true,user,matureEligible:matureAccountEligible(user)},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(SESSION_COOKIE,makeSession(user),sessionCookieOptions());
    return response;
  }catch(error){return errorResponse(error);}
}
export async function DELETE(request:Request){
  try{
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    requireSameOrigin(request);
    const response=NextResponse.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(SESSION_COOKIE,"",{...sessionCookieOptions(),maxAge:0});
    return response;
  }catch(error){return errorResponse(error);}
}
