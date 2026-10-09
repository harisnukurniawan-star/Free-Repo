/**
 * Geometry helpers shared by the preview and reference-image formatter.
 * Framing uses "contain", not a face-cropping cover transform.
 */
export type AiRoomAspect = "16:9" | "9:16" | "1:1";

export const ASPECTS: Record<AiRoomAspect, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

export function aspectValue(value: string | undefined): number | undefined {
  return value && Object.prototype.hasOwnProperty.call(ASPECTS, value)
    ? ASPECTS[value as AiRoomAspect]
    : undefined;
}

export function matchesAspect(width: number, height: number, aspect: string | undefined): boolean | undefined {
  const expected = aspectValue(aspect);
  if (!expected || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return Math.abs((width / height) / expected - 1) < 0.035;
}

export function referenceFrameLayout(width: number, height: number, aspect: AiRoomAspect) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid reference image dimensions.");
  }
  const size = aspect === "16:9" ? {width:1280, height:720}
    : aspect === "9:16" ? {width:720, height:1280}
    : {width:1024, height:1024};
  const scale = Math.min(size.width / width, size.height / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    ...size,
    fittedWidth,
    fittedHeight,
    x: (size.width - fittedWidth) / 2,
    y: (size.height - fittedHeight) / 2,
    needsFraming: Math.abs(width / height / ASPECTS[aspect] - 1) >= 0.015,
  };
}

/** Keep the original photograph completely visible in the selected canvas ratio.
 * Build before paid submission; never submit if conversion fails.
 */
export async function frameReferenceImage(dataUrl: string, aspect: AiRoomAspect): Promise<string> {
  const photo = new Image();
  photo.src = dataUrl;
  await photo.decode();
  const frame = referenceFrameLayout(photo.naturalWidth, photo.naturalHeight, aspect);
  if (!frame.needsFraming) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot prepare the image for the selected aspect ratio.");

  // Blurred edge extension keeps the entire source, avoiding face cuts and black bars.
  const cover = Math.max(frame.width / photo.naturalWidth, frame.height / photo.naturalHeight);
  ctx.save();
  ctx.filter = "blur(32px)";
  ctx.drawImage(photo, (frame.width - photo.naturalWidth * cover) / 2,
    (frame.height - photo.naturalHeight * cover) / 2,
    photo.naturalWidth * cover, photo.naturalHeight * cover);
  ctx.restore();
  ctx.drawImage(photo, frame.x, frame.y, frame.fittedWidth, frame.fittedHeight);

  for (const quality of [0.9, 0.78, 0.65]) {
    const framed = canvas.toDataURL("image/jpeg", quality);
    if (framed.length <= 3_500_000) return framed;
  }
  throw new Error("The framed reference image is too large. Use a smaller reference photo.");
}
