import { createHash, timingSafeEqual } from "node:crypto";
import { VideoEngineError } from "./video-engine";

/**
 * Block chargeable requests unless an operator-configured secret is present.
 * A missing/weak configuration fails closed, never public-open.
 */
export function assertGenerationAccess(request: Request): void {
  const secret = process.env.AI_ROOM_GENERATE_ACCESS_KEY;
  if (!secret || secret.length < 16) {
    throw new VideoEngineError("Video generation is locked until an AI ROOM access key is configured.", 503, false);
  }
  const supplied = request.headers.get("x-ai-room-access-key");
  if (!supplied || supplied.length > 512) {
    throw new VideoEngineError("A valid AI ROOM access key is required to generate a video.", 401, false);
  }
  const known = createHash("sha256").update(secret, "utf8").digest();
  const actual = createHash("sha256").update(supplied, "utf8").digest();
  if (!timingSafeEqual(known, actual)) {
    throw new VideoEngineError("Invalid AI ROOM access key.", 401, false);
  }
}

export function generationAccessState(): {generationLocked: boolean; generationAuthRequired: true} {
  return {
    generationLocked: !process.env.AI_ROOM_GENERATE_ACCESS_KEY || process.env.AI_ROOM_GENERATE_ACCESS_KEY.length < 16,
    generationAuthRequired: true,
  };
}
