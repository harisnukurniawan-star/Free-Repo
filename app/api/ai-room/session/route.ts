import {NextResponse} from "next/server";
import {makeSession, privateVideoEnabled, privateVideoConfigured, readSession, requireSameOrigin, sessionCookieOptions, SESSION_COOKIE, verifyPassword} from "@/lib/ai-room-private-auth";
import {videoEngineError, VideoEngineError} from "@/lib/video-engine";

export const runtime="nodejs";
function errorResponse(error:unknown){
  const safe=videoEngineError(error);
  return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});
}
export async function GET(request:Request){
  if(!privateVideoEnabled())return NextResponse.json({enabled:false,authenticated:false},{headers:{"Cache-Control":"no-store"}});
  try{
    if(!privateVideoConfigured())throw new VideoEngineError("Private OCI storage requires server configuration.",503,false);
    const cookie=(request.headers.get("cookie")||"").split(";").map(s=>s.trim())
      .find(s=>s.startsWith(SESSION_COOKIE+"="))?.slice(SESSION_COOKIE.length+1);
    const id=readSession(cookie);
    return NextResponse.json({enabled:true,authenticated:Boolean(id),user:id},{headers:{"Cache-Control":"no-store"}});
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
    const response=NextResponse.json({authenticated:true,user},{headers:{"Cache-Control":"no-store"}});
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
