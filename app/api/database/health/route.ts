import { NextResponse } from "next/server";
import { getHealth } from "@/lib/database-queries";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await getHealth(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ connected: false, uptimeSeconds: 0, metrics: [], checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Health unavailable" }, { status: 503 }); } }
