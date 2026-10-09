import { NextResponse } from "next/server";
import { getVideoEngine, parseVideoRequest, VideoEngineError, videoEngineError } from "@/lib/video-engine";
import { estimateWanCostUsd } from "@/lib/ai-room-jobs";
import { saveHistoryJob } from "@/lib/ai-room-history-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new VideoEngineError("Invalid JSON generation request.", 400, false);
    }
    const input = parseVideoRequest(body);
    const job = await getVideoEngine().submit(input);
    try {
      await saveHistoryJob({
        id: job.id,
        prompt: input.prompt,
        model: input.model,
        status: "Queued",
        createdAt: job.createdAt,
        mode: input.mode,
        duration: input.duration,
        aspect: input.aspect,
        quality: input.quality,
        estimatedCostUsd: estimateWanCostUsd({
          model: input.model,
          mode: input.mode,
          duration: input.duration,
          quality: input.quality,
        }) ?? undefined,
      });
    } catch {
      console.warn("AI_ROOM history persistence failed after submit");
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
