import {NextResponse} from "next/server";
import {privateVideoEnabled,requirePrivateUser,requireSameOrigin} from "@/lib/ai-room-private-auth";
import {privateStatus,privateDelete} from "@/lib/ai-room-private-storage";
import {getVideoEngine,VideoEngineError,videoEngineError} from "@/lib/video-engine";

export const runtime="nodejs";
export const maxDuration=300;
function fail(error:unknown){
  const safe=videoEngineError(error);
  return NextResponse.json({error:safe.message,retryable:safe.retryable},{
    status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const job=privateVideoEnabled()
      ? await privateStatus(requirePrivateUser(request),id)
      : await getVideoEngine().status(id);
    return NextResponse.json({success:true,job},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return fail(error);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    requireSameOrigin(request);
    const owner=requirePrivateUser(request);
    const {id}=await params;
    await privateDelete(owner,id);
    return NextResponse.json({success:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return fail(error);}
}
