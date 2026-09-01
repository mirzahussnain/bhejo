import { distance, type DocumentCorners } from "../detection/geometry.ts";

export interface DocumentStabilityConfig {
  readonly maxAverageCornerMovementPx: number;
  readonly requiredStableFrames: number;
  readonly requiredStableDurationMs: number;
}

export const DEFAULT_DOCUMENT_STABILITY_CONFIG: DocumentStabilityConfig = {
  maxAverageCornerMovementPx: 8,
  requiredStableFrames: 6,
  requiredStableDurationMs: 750,
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
}

const RESET_STABILITY: DocumentStability = {
  isStable: false,
  isReady: false,
  stableFrameCount: 0,
  stableDurationMs: 0,
  averageCornerMovementPx: null,
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

export class DocumentStabilityTracker {
  private previousCorners: DocumentCorners | null = null;
  private stableSince: number | null = null;
  private stableFrameCount = 0;
  private readonly config: DocumentStabilityConfig;

  constructor(config: DocumentStabilityConfig = DEFAULT_DOCUMENT_STABILITY_CONFIG) {
    this.config = config;
  }

  reset(): DocumentStability {
    this.previousCorners = null;
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
      this.stableSince = observation.timestamp;
      this.stableFrameCount = 1;
      return {
        ...RESET_STABILITY,
        stableFrameCount: 1,
      };
    }

    const averageCornerMovementPx = calculateAverageCornerMovement(
      this.previousCorners,
      observation.corners,
    );
    this.previousCorners = observation.corners;

    if (averageCornerMovementPx > this.config.maxAverageCornerMovementPx) {
      this.stableSince = observation.timestamp;
      this.stableFrameCount = 1;
      return {
        ...RESET_STABILITY,
        stableFrameCount: 1,
        averageCornerMovementPx,
      };
    }

    this.stableFrameCount += 1;
    const stableDurationMs = Math.max(0, observation.timestamp - this.stableSince);
    const isStable = this.stableFrameCount >= this.config.requiredStableFrames;
    return {
      isStable,
      isReady:
        isStable && stableDurationMs >= this.config.requiredStableDurationMs,
      stableFrameCount: this.stableFrameCount,
      stableDurationMs,
      averageCornerMovementPx,
    };
  }
}
