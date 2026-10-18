import HasnariaTerrace from "./HasnariaTerrace";
import { loadHasnariaData } from "@/lib/hasnaria-monitoring";
import { loadHasnariaActivity } from "@/lib/hasnaria-activity";
import { loadHcActivity } from "@/lib/hc-connect-activity";
export const dynamic = "force-dynamic";
export default async function HasnariaTerracePage() {
  const [data, activity, hcActivity] = await Promise.all([loadHasnariaData(), loadHasnariaActivity(), loadHcActivity()]);
  return <HasnariaTerrace data={data} activity={activity} hcActivity={hcActivity} />;
}
