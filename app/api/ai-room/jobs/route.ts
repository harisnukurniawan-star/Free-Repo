import {NextResponse} from "next/server";
import {privateVideoEnabled, requirePrivateUser} from "@/lib/ai-room-private-auth";
import {privateList} from "@/lib/ai-room-private-storage";
import {VideoEngineError,videoEngineError} from "@/lib/video-engine";
export const runtime="nodejs";
export async function GET(request:Request){
  try {
    if(!privateVideoEnabled())throw new VideoEngineError("Private video mode is disabled.",404,false);
    const owner=requirePrivateUser(request);
    const jobs=await privateList(owner);
    return NextResponse.json({jobs},{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){const safe=videoEngineError(e);return NextResponse.json({error:safe.message},{status:safe.httpStatus,headers:{"Cache-Control":"no-store"}});}
}
