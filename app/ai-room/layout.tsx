import type {Metadata} from "next";
import "./ai-room.css";

export const metadata:Metadata={
  title:"AI ROOM | Control Room",
  description:"AI video generation inside Control Room"
};

export default function AiRoomLayout({children}:{children:React.ReactNode}){
  return children;
}
