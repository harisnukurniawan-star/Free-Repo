import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI ROOM — Video Studio", description: "Private multi-engine AI video generation studio" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
