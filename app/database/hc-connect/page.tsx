import DatabaseDashboard from "../DatabaseDashboard";
import { loadHcActivity } from "@/lib/hc-connect-activity";
import { loadOciControllerEvidence } from "@/lib/oci-controller-activity";

export const dynamic = "force-dynamic";
export default async function HcConnectPage() {
  const [activity, controller] = await Promise.all([
    loadHcActivity(),
    loadOciControllerEvidence(),
  ]);
  return <DatabaseDashboard activity={activity} controller={controller} />;
}
