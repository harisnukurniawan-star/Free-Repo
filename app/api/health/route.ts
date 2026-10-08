import {NextResponse} from "next/server";

export async function GET(){
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase()||"development";
  const falConfigured=Boolean(process.env.AI_ROOM_FAL_KEY);
  const realGeneration=provider==="fal"&&falConfigured;
  const configurationValid=provider==="development"||realGeneration;
  const status=realGeneration?"ready":provider==="development"?"development":"configuration_required";

  return NextResponse.json({
    success:configurationValid,
    application:"ai-room",
    status,
    provider,
    realGeneration,
    falConfigured:provider==="fal"?falConfigured:undefined,
    checkedAt:new Date().toISOString()
  },{status:configurationValid?200:503});
}
