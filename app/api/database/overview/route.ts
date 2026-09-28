import { NextResponse } from "next/server";
import { getOverview } from "@/lib/database-queries";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await getOverview(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return NextResponse.json({ connected: false, mode: process.env.CONTROL_ROOM_DB_MODE === "direct" ? "direct" : "demo", latencyMs: null, databaseName: process.env.OCI_DB_NAME || "unavailable", tableCount: 0, approximateRows: 0, dataBytes: 0, indexBytes: 0, totalBytes: 0, activeConnections: null, checkedAt: new Date().toISOString(), message: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 }); } }
