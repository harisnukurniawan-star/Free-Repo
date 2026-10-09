import {NextResponse} from "next/server";
import {assertGenerationAccess} from "@/lib/ai-room-access";
import {privateVideoEnabled, requirePrivateUser, requireSameOrigin} from "@/lib/ai-room-private-auth";
import {privateSubmit} from "@/lib/ai-room-private-storage";
import {getVideoEngine, parseVideoRequest, VideoEngineError, videoEngineError} from "@/lib/video-engine";

export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
  try{
    let owner:string|undefined;
    if(privateVideoEnabled()){
      requireSameOrigin(request);
      owner=requirePrivateUser(request);
    }else assertGenerationAccess(request);
    let body:unknown;
    try{body=await request.json();}catch{throw new VideoEngineError("Invalid JSON generation request.",400,false);}
    const job=owner ? await privateSubmit(owner,body) : await getVideoEngine().submit(parseVideoRequest(body));
    return NextResponse.json({success:true,job},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const safe=videoEngineError(error);
    return NextResponse.json({error:safe.message,retryable:safe.retryable},{
      status:safe.httpStatus,headers:{"Cache-Control":"no-store"}
    });
  }
}
