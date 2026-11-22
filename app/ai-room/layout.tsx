import type {Metadata} from "next";
import "./ai-room.css";

export const metadata:Metadata={
  title:"AI Video Gen | Control Room",
  description:"AI Video Gen inside Control Room"
};

export default function AiRoomLayout({children}:{children:React.ReactNode}){
  return children;
}
