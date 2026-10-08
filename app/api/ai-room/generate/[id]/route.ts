import { NextResponse } from "next/server";
import { getVideoEngine, videoEngineError } from "@/lib/video-engine";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await getVideoEngine().status(id);
    return NextResponse.json({ success: true, job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeError = videoEngineError(error);
    return NextResponse.json({ error: safeError.message, retryable: safeError.retryable }, {
      status: safeError.httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
