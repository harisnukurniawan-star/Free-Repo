import {NextResponse} from "next/server";

export async function GET(){
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase()||"development";
  const falConfigured=Boolean(process.env.AI_ROOM_FAL_KEY);
  const ready=provider==="development"||(provider==="fal"&&falConfigured);

  return NextResponse.json({
    success:true,
    application:"ai-room",
    status:ready?"ready":"configuration_required",
    provider,
    falConfigured:provider==="fal"?falConfigured:undefined,
    checkedAt:new Date().toISOString()
  },{status:ready?200:503});
}
