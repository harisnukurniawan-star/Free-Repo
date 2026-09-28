import { NextResponse } from "next/server";
import { databaseMode } from "@/lib/db";
import { getOverview } from "@/lib/database-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mode = databaseMode();
    return NextResponse.json({
      connected: false,
      mode,
      latencyMs: null,
      databaseName: process.env.OCI_DB_NAME || (mode === "snapshot" ? "snapshot-unavailable" : "unavailable"),
      tableCount: 0,
      approximateRows: 0,
      dataBytes: 0,
      indexBytes: 0,
      totalBytes: 0,
      activeConnections: null,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Database unavailable"
    }, { status: 503 });
  }
}
