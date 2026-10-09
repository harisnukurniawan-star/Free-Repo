// Shared, non-secret Wan catalog for the browser and the server.
// Prices are estimates in USD from fal.ai's published model pages (Oct 2026).
// Billing is performed by fal.ai; these figures are not account balances.
export const WAN_MODEL_NAMES = [
  "Wan 2.2 Fast",
  "Wan 2.2 14B",
  "Wan 2.7",
  "Wan 3.0",
  "Wan 3.0 Prime",
] as const;
export type WanModel = (typeof WAN_MODEL_NAMES)[number];
export type WanMode = "text" | "image";
export type WanQuality = "580p" | "720p" | "1080p";
export type WanDuration = "5s" | "10s";

export const WAN_CATALOG: Record<WanModel, {
  tier: "fast" | "a14b" | "v27" | "v3" | "v3prime";
  text: string;
  image: string;
  qualities: readonly WanQuality[];
  durations: readonly WanDuration[];
  // USD per video for fixed-price options, otherwise USD per second.
  pricing: Partial<Record<WanMode, Partial<Record<WanQuality, { perVideo?: number; perSecond?: number }>>>>;
}> = {
  "Wan 2.2 Fast": {
    tier: "fast",
    text: "fal-ai/wan/v2.2-5b/text-to-video/distill",
    image: "fal-ai/wan/v2.2-5b/image-to-video",
    qualities: ["580p", "720p"],
    durations: ["5s"],
    pricing: {
      text: { "580p": { perVideo: 0.08 }, "720p": { perVideo: 0.08 } },
      image: { "580p": { perVideo: 0.15 }, "720p": { perVideo: 0.15 } },
    },
  },
  "Wan 2.2 14B": {
    tier: "a14b",
    text: "fal-ai/wan/v2.2-a14b/text-to-video",
    image: "fal-ai/wan/v2.2-a14b/image-to-video",
    qualities: ["580p", "720p"],
    durations: ["5s", "10s"],
    pricing: {
      text: { "580p": { perSecond: 0.06 }, "720p": { perSecond: 0.08 } },
      image: { "580p": { perSecond: 0.06 }, "720p": { perSecond: 0.08 } },
    },
  },
  "Wan 2.7": {
    tier: "v27",
    text: "fal-ai/wan/v2.7/text-to-video",
    image: "fal-ai/wan/v2.7/image-to-video",
    qualities: ["720p", "1080p"],
    durations: ["5s", "10s"],
    pricing: {
      text: { "720p": { perSecond: 0.1 }, "1080p": { perSecond: 0.15 } },
      image: { "720p": { perSecond: 0.1 }, "1080p": { perSecond: 0.15 } },
    },
  },
  "Wan 3.0": {
    tier: "v3",
    text: "alibaba/wan-3.0/text-to-video",
    image: "alibaba/wan-3.0/image-to-video",
    qualities: ["720p", "1080p"],
    durations: ["5s", "10s"],
    pricing: {
      text: { "720p": { perSecond: 0.1 }, "1080p": { perSecond: 0.2 } },
      image: { "720p": { perSecond: 0.1 }, "1080p": { perSecond: 0.2 } },
    },
  },
  "Wan 3.0 Prime": {
    tier: "v3prime",
    text: "alibaba/wan-3.0-prime/text-to-video",
    image: "alibaba/wan-3.0-prime/image-to-video",
    qualities: ["720p", "1080p"],
    durations: ["5s", "10s"],
    pricing: {
      text: { "720p": { perSecond: 0.14 }, "1080p": { perSecond: 0.28 } },
      image: { "720p": { perSecond: 0.14 }, "1080p": { perSecond: 0.28 } },
    },
  },
};

export function isWanModel(value: unknown): value is WanModel {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WAN_CATALOG, value);
}

export function wanEndpointFor(model: WanModel, mode: WanMode): string {
  return WAN_CATALOG[model][mode];
}

export function estimateWanCost(model: WanModel, mode: WanMode, duration: WanDuration, quality: WanQuality): number | null {
  const rate = WAN_CATALOG[model].pricing[mode]?.[quality];
  if (!rate || !WAN_CATALOG[model].durations.includes(duration) || !WAN_CATALOG[model].qualities.includes(quality)) return null;
  return rate.perVideo ?? (rate.perSecond === undefined ? null : Number(duration.slice(0, -1)) * rate.perSecond);
}
