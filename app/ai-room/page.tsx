import AiRoomClient from "./AiRoomClient";

export const dynamic = "force-dynamic";

export default function AiRoomPage(){
  const provider=process.env.AI_ROOM_VIDEO_PROVIDER?.toLowerCase()||"development";
  const falConfigured=Boolean(process.env.AI_ROOM_FAL_KEY);
  const realGeneration=provider==="fal"&&falConfigured;

  return <AiRoomClient initialProviderState={{
    checked:true,
    provider,
    realGeneration
  }} />;
}
