import HasnariaTerrace from "./HasnariaTerrace";
import { loadHasnariaData } from "@/lib/hasnaria-monitoring";
export const dynamic = "force-dynamic";
export default async function HasnariaTerracePage() { const data = await loadHasnariaData(); return <HasnariaTerrace data={data} />; }
