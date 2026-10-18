import DatabaseDashboard from "../DatabaseDashboard";
import { loadHcActivity } from "@/lib/hc-connect-activity";
import { loadHasnariaActivity } from "@/lib/hasnaria-activity";
import { loadHasnariaData } from "@/lib/hasnaria-monitoring";
export const dynamic = "force-dynamic";
export default async function HcConnectPage() {
  const [activity,hasnariaActivity,hasnariaData]=await Promise.all([loadHcActivity(),loadHasnariaActivity(),loadHasnariaData()]);
  return <DatabaseDashboard activity={activity} hasnariaActivity={hasnariaActivity} hasnariaData={hasnariaData}/>;
}
