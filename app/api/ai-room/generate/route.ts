import {NextResponse} from "next/server";
import {assertGenerationAccess} from "@/lib/ai-room-access";
import {assertGenerationPin,consumeGenerationQuota,generationPinEnabled} from "@/lib/ai-room-generation-pin";
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
    }
    if(generationPinEnabled()){
      // Never trust client-side unlock state for a chargeable operation.
      requireSameOrigin(request);
      assertGenerationPin(request,owner);
    }else if(!owner){
      // Rollback-compatible legacy access key remains until PIN mode is enabled.
      assertGenerationAccess(request);
    }
    let body:unknown;
    try{body=await request.json();}catch{throw new VideoEngineError("Invalid JSON generation request.",400,false);}
    const parsed=parseVideoRequest(body);
    if(generationPinEnabled())await consumeGenerationQuota(owner);
    const job=owner ? await privateSubmit(owner,body) : await getVideoEngine().submit(parsed);
    return NextResponse.json({success:true,job},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const safe=videoEngineError(error);
    return NextResponse.json({error:safe.message,retryable:safe.retryable},{
      status:safe.httpStatus,headers:{"Cache-Control":"no-store"}
    });
  }
}
