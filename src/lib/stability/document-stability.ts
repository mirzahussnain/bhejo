import { distance, type DocumentCorners } from "../detection/geometry.ts";

export interface DocumentStabilityConfig {
  readonly maxAverageCornerMovementPx: number;
  readonly requiredStableFrames: number;
  readonly requiredStableDurationMs: number;
  readonly cornerSmoothingAlpha: number;
}

export const DEFAULT_DOCUMENT_STABILITY_CONFIG: DocumentStabilityConfig = {
  maxAverageCornerMovementPx: 8,
  requiredStableFrames: 6,
  requiredStableDurationMs: 750,
  cornerSmoothingAlpha: 0.35,
};

export interface StabilityObservation {
  readonly corners: DocumentCorners | null;
  readonly qualityAcceptable: boolean;
  readonly timestamp: number;
}

export interface DocumentStability {
  readonly isStable: boolean;
  readonly isReady: boolean;
  readonly stableFrameCount: number;
  readonly stableDurationMs: number;
  readonly averageCornerMovementPx: number | null;
  readonly smoothedCorners: DocumentCorners | null;
}

const RESET_STABILITY: DocumentStability = {
  isStable: false,
  isReady: false,
  stableFrameCount: 0,
  stableDurationMs: 0,
  averageCornerMovementPx: null,
  smoothedCorners: null,
};

export function calculateAverageCornerMovement(
  previous: DocumentCorners,
  current: DocumentCorners,
): number {
  return (
    previous.reduce(
      (total, corner, index) => total + distance(corner, current[index]),
      0,
    ) / previous.length
  );
}

function blendCorners(
  current: DocumentCorners,
  previous: DocumentCorners,
  alpha: number,
): DocumentCorners {
  return [
    {
      x: alpha * current[0].x + (1 - alpha) * previous[0].x,
      y: alpha * current[0].y + (1 - alpha) * previous[0].y,
    },
    {
      x: alpha * current[1].x + (1 - alpha) * previous[1].x,
      y: alpha * current[1].y + (1 - alpha) * previous[1].y,
    },
    {
      x: alpha * current[2].x + (1 - alpha) * previous[2].x,
      y: alpha * current[2].y + (1 - alpha) * previous[2].y,
    },
    {
      x: alpha * current[3].x + (1 - alpha) * previous[3].x,
      y: alpha * current[3].y + (1 - alpha) * previous[3].y,
    },
  ];
}

export class DocumentStabilityTracker {
  private previousCorners: DocumentCorners | null = null;
  private smoothedCorners: DocumentCorners | null = null;
  private stableSince: number | null = null;
  private stableFrameCount = 0;
  private readonly config: DocumentStabilityConfig;

  constructor(config: DocumentStabilityConfig = DEFAULT_DOCUMENT_STABILITY_CONFIG) {
    this.config = config;
  }

  reset(): DocumentStability {
    this.previousCorners = null;
    this.smoothedCorners = null;
    this.stableSince = null;
    this.stableFrameCount = 0;
    return RESET_STABILITY;
  }

  observe(observation: StabilityObservation): DocumentStability {
    if (!observation.corners || !observation.qualityAcceptable) {
      return this.reset();
    }

    if (!this.previousCorners || this.stableSince === null) {
      this.previousCorners = observation.corners;
      this.smoothedCorners = null;
      this.stableSince = observation.timestamp;
      this.stableFrameCount = 1;
      return {
        ...RESET_STABILITY,
        stableFrameCount: 1,
      };
    }

    // Use raw corners for stability measurement to avoid a feedback loop.
    const averageCornerMovementPx = calculateAverageCornerMovement(
      this.previousCorners,
      observation.corners,
    );
    this.previousCorners = observation.corners;

    if (averageCornerMovementPx > this.config.maxAverageCornerMovementPx) {
      this.stableSince = observation.timestamp;
      this.stableFrameCount = 1;
      this.smoothedCorners = null;
      return {
        ...RESET_STABILITY,
        stableFrameCount: 1,
        averageCornerMovementPx,
      };
    }

    this.stableFrameCount += 1;
    const stableDurationMs = Math.max(0, observation.timestamp - this.stableSince);
    const isStable = this.stableFrameCount >= this.config.requiredStableFrames;

    // Apply exponential moving average when stable.
    if (isStable) {
      this.smoothedCorners = this.smoothedCorners
        ? blendCorners(observation.corners, this.smoothedCorners, this.config.cornerSmoothingAlpha)
        : observation.corners;
    } else {
      this.smoothedCorners = null;
    }

    return {
      isStable,
      isReady:
        isStable && stableDurationMs >= this.config.requiredStableDurationMs,
      stableFrameCount: this.stableFrameCount,
      stableDurationMs,
      averageCornerMovementPx,
      smoothedCorners: this.smoothedCorners,
    };
  }
}
