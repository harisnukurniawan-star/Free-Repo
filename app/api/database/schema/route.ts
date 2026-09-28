import { NextResponse } from "next/server";
import { getSchema } from "@/lib/database-queries";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await getSchema(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ tables: [], relations: [], error: error instanceof Error ? error.message : "Schema unavailable" }, { status: 503 }); } }
