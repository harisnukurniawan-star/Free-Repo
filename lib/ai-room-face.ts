// An experimental prompt aid for image-to-video, not an identity lock.
// The image is still only the provider's first frame and results may drift.
export const FACE_PRESERVATION_GUIDANCE =
  "Use the supplied reference image as the authoritative first frame. " +
  "Animate the SAME person throughout the clip. Preserve the reference person's " +
  "recognizable facial identity, eye shape and spacing, nose, mouth, jawline, " +
  "facial proportions, hairstyle, skin tone and natural expression. " +
  "Do not reinterpret, beautify, replace, or morph the face. " +
  "Prefer subtle natural movements, stable framing, minimal head rotation, " +
  "and a continuous shot. Only animate the following action: ";

export const FACE_PRESERVATION_NEGATIVE =
  "different person, face replacement, face morphing, identity change, " +
  "altered eyes, changed nose, changed mouth, altered jawline, altered skin tone, " +
  "beauty retouching, changed age, inconsistent face across frames, " +
  "strong head turn, sudden camera rotation, face distortion, scene cut";

export function imageMotionPrompt(prompt: string, mode: "text" | "image", preserveFace: boolean): string {
  return mode === "image" && preserveFace ? FACE_PRESERVATION_GUIDANCE + prompt : prompt;
}
