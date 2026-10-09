import { NextResponse } from "next/server";
import { getVideoEngine, videoEngineError } from "@/lib/video-engine";
import { updateHistoryJob } from "@/lib/ai-room-history-store";

export const runtime = "nodejs";

const storedStatus = {
  queued: "Queued",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
} as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await getVideoEngine().status(id);
    try {
      await updateHistoryJob(id, {
        status: storedStatus[job.status],
        videoUrl: job.videoUrl,
      });
    } catch {
      console.warn("AI_ROOM history persistence failed during status update");
    }
    return NextResponse.json({ success: true, job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safeError = videoEngineError(error);
    return NextResponse.json({ error: safeError.message, retryable: safeError.retryable }, {
      status: safeError.httpStatus,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
