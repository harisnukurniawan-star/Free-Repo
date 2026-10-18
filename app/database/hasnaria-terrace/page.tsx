import HasnariaTerrace from "./HasnariaTerrace";
import { loadHasnariaData } from "@/lib/hasnaria-monitoring";
import { loadHasnariaActivity } from "@/lib/hasnaria-activity";
export const dynamic = "force-dynamic";
export default async function HasnariaTerracePage() {
  const [data, activity] = await Promise.all([loadHasnariaData(), loadHasnariaActivity()]);
  return <HasnariaTerrace data={data} activity={activity} />;
}
