import { NextResponse } from "next/server";
import { getVideoEngine, parseVideoRequest, VideoEngineError, videoEngineError } from "@/lib/video-engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new VideoEngineError("Invalid JSON generation request.", 400, false);
    }
    const job = await getVideoEngine().submit(parseVideoRequest(body));
    return NextResponse.json({ success: true, job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeError = videoEngineError(error);
    return NextResponse.json({ error: safeError.message, retryable: safeError.retryable }, {
      status: safeError.httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
