/**
 * Baseline prompt guard for the operator-only mature-content preview.
 * This is NOT a complete moderation or age-verification solution.
 * Provider safety policies and future dedicated moderation remain authoritative.
 */
export type AiRoomContentMode = "standard" | "mature";

export function matureContentModeEnabled(): boolean {
  return process.env.AI_ROOM_ENABLE_MATURE_MODE === "true";
}

const PROHIBITED_PROMPTS: readonly RegExp[] = [
  // Explicit sexual acts, explicit nude imagery, sexual coercion and NCII.
  /\b(?:porn(?:ography|ographic)?|hardcore|xxx|explicit sex|sexual intercourse|penetrat(?:ion|ing)|masturbat(?:e|ion|ing)|oral sex|genital(?:s|ia)?|fetish porn)\b/i,
  /\b(?:nude|nudity|naked|topless|fully undressed|uncensored breasts)\b/i,
  /\b(?:rape|raping|sexual assault|molest(?:ation|ing)?|forced sex|without (?:her|his|their) consent|non[- ]?consensual|revenge porn|deepfake nudes?|undress (?:her|him|them)|remove (?:her|his|their) clothes)\b/i,
  // Sexualized minors: reject even if described as fictional or rendered.
  /\b(?:child pornography|child sexual abuse|underage sex|minor(?:s)? in (?:sexual|erotic) scenes?|sexualized (?:child|teen)|schoolgirl porn)\b/i,
  /\b(?:sexual|erotic|sensual|lingerie|nude|naked|sex)\b.{0,48}\b(?:minor|underage|child|kid|preteen|schoolgirl|schoolboy|13[- ]year[- ]old|14[- ]year[- ]old|15[- ]year[- ]old|16[- ]year[- ]old|17[- ]year[- ]old)\b/i,
  /\b(?:minor|underage|child|kid|preteen|schoolgirl|schoolboy|13[- ]year[- ]old|14[- ]year[- ]old|15[- ]year[- ]old|16[- ]year[- ]old|17[- ]year[- ]old)\b.{0,48}\b(?:sexual|erotic|sensual|lingerie|nude|naked|sex)\b/i,
];

export function contentPolicyRejection(prompt: string): string | null {
  return PROHIBITED_PROMPTS.some(rule => rule.test(prompt))
    ? "This request cannot be generated: explicit sexual content, sexualized minors, or non-consensual intimate content is not supported."
    : null;
}
