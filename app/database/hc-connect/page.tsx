import DatabaseDashboard from "../DatabaseDashboard";
import { loadHcActivity } from "@/lib/hc-connect-activity";
export const dynamic = "force-dynamic";
export default async function HcConnectPage() { const activity = await loadHcActivity(); return <DatabaseDashboard activity={activity} />; }
