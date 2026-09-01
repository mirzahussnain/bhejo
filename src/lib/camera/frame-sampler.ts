export const DEFAULT_FRAME_SAMPLER_CONFIG = {
  analysisWidth: 640,
  analysisFps: 10,
} as const;

export interface FrameSamplerConfig {
  readonly analysisWidth: number;
  readonly analysisFps: number;
}

export interface AnalysisDimensions {
  readonly width: number;
  readonly height: number;
}

export interface AnalysisFrame {
  readonly canvas: HTMLCanvasElement;
  width: number;
  height: number;
  timestamp: number;
}

export interface FrameSamplerDiagnostics {
  readonly active: boolean;
  readonly sampleCount: number;
  readonly width: number;
  readonly height: number;
  readonly lastSampleTimestamp: number | null;
}

export interface FrameSampler {
  start: () => void;
  stop: () => void;
  getDiagnostics: () => FrameSamplerDiagnostics;
}

type AnalysisFrameCallback = (frame: AnalysisFrame) => void;

export function resolveFrameSamplerConfig(
  config: Partial<FrameSamplerConfig> = {},
): FrameSamplerConfig {
  const resolved = {
    ...DEFAULT_FRAME_SAMPLER_CONFIG,
    ...config,
  };

  if (!Number.isFinite(resolved.analysisWidth) || resolved.analysisWidth <= 0) {
    throw new RangeError("Analysis width must be a positive number.");
  }

  if (!Number.isFinite(resolved.analysisFps) || resolved.analysisFps <= 0) {
    throw new RangeError("Analysis FPS must be a positive number.");
  }

  return {
    analysisWidth: Math.max(1, Math.round(resolved.analysisWidth)),
    analysisFps: resolved.analysisFps,
  };
}

export function calculateAnalysisDimensions(
  videoWidth: number,
  videoHeight: number,
  analysisWidth: number,
): AnalysisDimensions | null {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    !Number.isFinite(analysisWidth) ||
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    analysisWidth <= 0
  ) {
    return null;
  }

  const width = Math.max(1, Math.round(Math.min(videoWidth, analysisWidth)));
  const height = Math.max(1, Math.round((width * videoHeight) / videoWidth));

  return { width, height };
}

export function createFrameSampler(
  video: HTMLVideoElement,
  onFrame: AnalysisFrameCallback,
  config?: Partial<FrameSamplerConfig>,
): FrameSampler {
  const { analysisWidth, analysisFps } = resolveFrameSamplerConfig(config);
  const sampleInterval = 1_000 / analysisFps;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("The analysis canvas is not available.");
  }

  const frame: AnalysisFrame = {
    canvas,
    width: 0,
    height: 0,
    timestamp: 0,
  };

  let animationFrameId: number | null = null;
  let lastSampleTimestamp = Number.NEGATIVE_INFINITY;
  let lastSampleTimestampForDiagnostics: number | null = null;
  let sampleCount = 0;
  let active = false;
  let sourceVideoWidth = 0;
  let sourceVideoHeight = 0;

  const updateAnalysisDimensions = () => {
    if (
      sourceVideoWidth === video.videoWidth &&
      sourceVideoHeight === video.videoHeight
    ) {
      return frame.width > 0 && frame.height > 0;
    }

    sourceVideoWidth = video.videoWidth;
    sourceVideoHeight = video.videoHeight;
    const dimensions = calculateAnalysisDimensions(
      sourceVideoWidth,
      sourceVideoHeight,
      analysisWidth,
    );

    if (!dimensions) {
      return false;
    }

    if (
      canvas.width !== dimensions.width ||
      canvas.height !== dimensions.height
    ) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      frame.width = dimensions.width;
      frame.height = dimensions.height;
    }

    return true;
  };

  const scheduleNextFrame = () => {
    animationFrameId = requestAnimationFrame(sampleFrame);
  };

  const sampleFrame = (timestamp: number) => {
    animationFrameId = null;

    if (!active) {
      return;
    }

    scheduleNextFrame();

    if (
      timestamp - lastSampleTimestamp >= sampleInterval &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      if (updateAnalysisDimensions()) {
        context.drawImage(video, 0, 0, frame.width, frame.height);
        frame.timestamp = timestamp;
        lastSampleTimestamp = timestamp;
        lastSampleTimestampForDiagnostics = timestamp;
        sampleCount += 1;
        onFrame(frame);
      }
    }
  };

  return {
    start() {
      if (active) {
        return;
      }

      active = true;
      lastSampleTimestamp = Number.NEGATIVE_INFINITY;
      scheduleNextFrame();
    },
    stop() {
      active = false;

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    getDiagnostics() {
      return {
        active,
        sampleCount,
        width: frame.width,
        height: frame.height,
        lastSampleTimestamp: lastSampleTimestampForDiagnostics,
      };
    },
  };
}
