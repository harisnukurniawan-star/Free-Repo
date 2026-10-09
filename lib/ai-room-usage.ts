export type WanUsageInput = {
  model: string;
  mode: "text" | "image";
  duration: string;
  quality: string;
};

const A14B_RATE_PER_SECOND: Record<string, number> = {
  "580p": 0.06,
  "720p": 0.08,
};

function frameCount(duration: string) {
  if (duration === "5s") return 81;
  if (duration === "10s") return 161;
  return null;
}

export function estimateWanCost(input: WanUsageInput): number | null {
  if (input.model === "Wan 2.2 Fast") {
    if (input.duration !== "5s") return null;
    return input.mode === "image" ? 0.15 : 0.08;
  }

  if (input.model === "Wan 2.2 14B") {
    const frames = frameCount(input.duration);
    const rate = A14B_RATE_PER_SECOND[input.quality];
    if (!frames || !rate) return null;
    return (frames / 16) * rate;
  }

  return null;
}

export function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
