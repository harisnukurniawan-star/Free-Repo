import { NextResponse } from "next/server";
import { getTables } from "@/lib/database-queries";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json({ tables: await getTables() }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ tables: [], error: error instanceof Error ? error.message : "Tables unavailable" }, { status: 503 }); } }
