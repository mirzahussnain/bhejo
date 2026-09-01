export interface CaptureEligibility {
  readonly documentDetected: boolean;
  readonly qualityAcceptable: boolean;
  readonly stable: boolean;
}

export interface CaptureControllerConfig {
  readonly cooldownMs: number;
}

export const DEFAULT_CAPTURE_CONTROLLER_CONFIG: CaptureControllerConfig = {
  cooldownMs: 1_000,
};

export type CaptureControllerState =
  | "idle"
  | "scheduled"
  | "capturing"
  | "cooldown"
  | "awaiting-reset";

export interface CaptureDecision {
  readonly shouldSchedule: boolean;
  readonly shouldCancel: boolean;
}

export class CaptureController {
  private state: CaptureControllerState = "idle";
  private cooldownEndsAt: number | null = null;
  private readonly config: CaptureControllerConfig;

  constructor(config: CaptureControllerConfig = DEFAULT_CAPTURE_CONTROLLER_CONFIG) {
    this.config = config;
  }

  getState(): CaptureControllerState {
    return this.state;
  }

  observe(eligibility: CaptureEligibility, now: number): CaptureDecision {
    if (this.state === "cooldown" && this.cooldownEndsAt !== null && now >= this.cooldownEndsAt) {
      this.state = "awaiting-reset";
    }

    const canCapture =
      eligibility.documentDetected &&
      eligibility.qualityAcceptable &&
      eligibility.stable;

    if (!canCapture && this.state === "scheduled") {
      this.state = "idle";
      return { shouldSchedule: false, shouldCancel: true };
    }

    if (canCapture && this.state === "idle") {
      this.state = "scheduled";
      return { shouldSchedule: true, shouldCancel: false };
    }

    return { shouldSchedule: false, shouldCancel: false };
  }

  beginScheduledCapture(): boolean {
    if (this.state !== "scheduled") {
      return false;
    }

    this.state = "capturing";
    return true;
  }

  beginManualCapture(): boolean {
    if (this.state !== "idle") {
      return false;
    }

    this.state = "capturing";
    return true;
  }

  completeCapture(now: number): void {
    if (this.state !== "capturing") {
      return;
    }

    this.state = "cooldown";
    this.cooldownEndsAt = now + this.config.cooldownMs;
  }

  failCapture(): void {
    if (this.state === "capturing") {
      this.state = "idle";
      this.cooldownEndsAt = null;
    }
  }

  reset(): void {
    this.state = "idle";
    this.cooldownEndsAt = null;
  }
}
