import {NextResponse} from "next/server";
import {generationAccessState} from "@/lib/ai-room-access";
import {privateVideoEnabled,privateVideoConfigured} from "@/lib/ai-room-private-auth";

export async function GET(){
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase()||"development";
  const falConfigured=Boolean(process.env.AI_ROOM_FAL_KEY);
  const realGeneration=provider==="fal"&&falConfigured;
  const privateMode=privateVideoEnabled();
  const storageReady=!privateMode||privateVideoConfigured();
  const configurationValid=(provider==="development"||realGeneration)&&storageReady;
  const status=configurationValid?(realGeneration?"ready":"development"):"configuration_required";
  return NextResponse.json({
    success:configurationValid,application:"ai-room",status,provider,realGeneration,
    storageMode:privateMode?"oci":"browser",storageReady,
    falConfigured:provider==="fal"?falConfigured:undefined,
    ...generationAccessState(),checkedAt:new Date().toISOString()
  },{status:configurationValid?200:503,headers:{"Cache-Control":"no-store"}});
}
