"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DistributionBias } from "@/lib/airtable/types";

interface FrequencyPreviewProps {
  durationDays: number;
  bias: DistributionBias;
}

/**
 * Generate a weekly frequency distribution for a campaign.
 * Returns an array of relative post weights per week (0-1 scale).
 */
function generateDistribution(
  durationDays: number,
  bias: DistributionBias
): number[] {
  const weeks = Math.max(1, Math.ceil(durationDays / 7));
  const weights: number[] = [];

  for (let w = 0; w < weeks; w++) {
    const t = w / Math.max(1, weeks - 1); // 0..1 normalized position

    let weight: number;
    switch (bias) {
      case "Front-loaded":
        // Exponential decay — heavy early, tapering off
        weight = Math.exp(-3 * t);
        break;
      case "Back-loaded":
        // Inverse — builds toward the end
        weight = Math.exp(-3 * (1 - t));
        break;
      case "Balanced":
      default:
        // Slight bell curve centered around 40% mark (mimics natural promotion)
        weight = 0.3 + 0.7 * Math.exp(-8 * Math.pow(t - 0.35, 2));
        break;
    }
    weights.push(weight);
  }

  // Normalize to 0-1
  const max = Math.max(...weights);
  return weights.map((w) => w / max);
}

/**
 * Estimate total posts based on duration and platform mix.
 * Rough heuristic: ~3 posts/week at peak, scaling with duration.
 */
function estimatePostCount(durationDays: number): {
  total: number;
  peakPerWeek: number;
  avgPerWeek: number;
} {
  const weeks = Math.ceil(durationDays / 7);

  // Scale peak posts based on duration
  let peakPerWeek: number;
  if (durationDays <= 14) peakPerWeek = 5; // Sprint: aggressive
  else if (durationDays <= 90) peakPerWeek = 4;
  else if (durationDays <= 180) peakPerWeek = 3;
  else peakPerWeek = 2; // Marathon: slower burn

  // Total ~ integral of the curve
  const total = Math.round(peakPerWeek * weeks * 0.45);
  const avgPerWeek = +(total / weeks).toFixed(1);

  return { total, peakPerWeek, avgPerWeek };
}

/**
 * Group weeks into labeled buckets for the chart axis.
 */
function getWeekLabel(weekIndex: number, totalWeeks: number): string | null {
  if (totalWeeks <= 4) return `W${weekIndex + 1}`;
  if (totalWeeks <= 12) {
    // Show every other week
    return weekIndex % 2 === 0 ? `W${weekIndex + 1}` : null;
  }
  if (totalWeeks <= 26) {
    // Show monthly
    return weekIndex % 4 === 0
      ? `M${Math.floor(weekIndex / 4) + 1}`
      : null;
  }
  // Show quarterly
  return weekIndex % 13 === 0
    ? `Q${Math.floor(weekIndex / 13) + 1}`
    : null;
}

export function FrequencyPreview({
  durationDays,
  bias,
}: FrequencyPreviewProps) {
  const distribution = useMemo(
    () => generateDistribution(durationDays, bias),
    [durationDays, bias]
  );

  const stats = useMemo(
    () => estimatePostCount(durationDays),
    [durationDays]
  );

  const weeks = distribution.length;

  // For very long campaigns, bucket the bars to keep the chart readable
  const maxBars = 26;
  const bucketSize = weeks > maxBars ? Math.ceil(weeks / maxBars) : 1;
  const bars: { weight: number; label: string | null }[] = [];

  for (let i = 0; i < weeks; i += bucketSize) {
    const slice = distribution.slice(i, i + bucketSize);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    const label = getWeekLabel(i, weeks);
    bars.push({ weight: avg, label });
  }

  return (
    <div className="space-y-3">
      {/* Bar chart */}
      <div className="flex items-end gap-px h-16">
        {bars.map((bar, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end h-full"
          >
            <div
              className={cn(
                "rounded-t-sm transition-all duration-300",
                bias === "Front-loaded"
                  ? "bg-orange-400/80"
                  : bias === "Back-loaded"
                    ? "bg-blue-400/80"
                    : "bg-emerald-400/80"
              )}
              style={{
                height: `${Math.max(4, bar.weight * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>

      {/* Axis labels */}
      <div className="flex gap-px">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 text-center">
            {bar.label && (
              <span className="text-[9px] text-muted-foreground/60">
                {bar.label}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <span>
          ~<strong className="text-foreground">{stats.total}</strong> posts
          total
        </span>
        <span className="text-border">|</span>
        <span>
          ~<strong className="text-foreground">{stats.avgPerWeek}</strong>/week
          avg
        </span>
        <span className="text-border">|</span>
        <span>
          <strong className="text-foreground">{stats.peakPerWeek}</strong>/week
          peak
        </span>
      </div>
    </div>
  );
}
