/**
 * Conservative capture-quality validation for high-resolution still frames and video fallbacks.
 *
 * Rejects obviously defective captures (severe blur, extreme camera motion, total underexposure/black,
 * or complete saturation) without rejecting valid document photos taken in imperfect lighting.
 */

export interface CaptureQualityConfig {
  readonly minLaplacianVarianceStill: number;
  readonly minLaplacianVarianceVideo: number;
  readonly maxUnderexposedRatio: number;
  readonly maxOverexposedRatio: number;
  readonly maxMotionAnisotropy: number;
  readonly sampleGridStep: number;
}

export const DEFAULT_CAPTURE_QUALITY_CONFIG: CaptureQualityConfig = {
  // Conservative thresholds: only catch severe degradation
  minLaplacianVarianceStill: 35,
  minLaplacianVarianceVideo: 20,
  maxUnderexposedRatio: 0.85,
  maxOverexposedRatio: 0.80,
  maxMotionAnisotropy: 4.5,
  sampleGridStep: 2, // Sample every 2nd pixel for speed on 4K/12MP canvases
};

export interface CaptureQualityEvaluation {
  readonly isAcceptable: boolean;
  readonly sharpness: number;
  readonly isBlurry: boolean;
  readonly isUnderexposed: boolean;
  readonly isOverexposed: boolean;
  readonly meanLuminance: number;
  readonly underexposedRatio: number;
  readonly overexposedRatio: number;
  readonly motionAnisotropy: number;
  readonly rejectionReason?:
    | "severe-blur"
    | "severe-motion"
    | "severe-underexposure"
    | "severe-overexposure";
}

/**
 * Extracts grayscale luminance and computes exposure & sharpness metrics on a canvas.
 * Designed for low memory footprint and high throughput on full-resolution frames.
 */
export function evaluateCaptureQuality(
  canvas: HTMLCanvasElement,
  method: "image-capture" | "video-frame" = "image-capture",
  config: CaptureQualityConfig = DEFAULT_CAPTURE_QUALITY_CONFIG,
): CaptureQualityEvaluation {
  const width = canvas.width;
  const height = canvas.height;

  if (width < 32 || height < 32) {
    return {
      isAcceptable: false,
      sharpness: 0,
      isBlurry: true,
      isUnderexposed: false,
      isOverexposed: false,
      meanLuminance: 0,
      underexposedRatio: 1,
      overexposedRatio: 0,
      motionAnisotropy: 1,
      rejectionReason: "severe-blur",
    };
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    // If context cannot be acquired, don't block capture
    return {
      isAcceptable: true,
      sharpness: 100,
      isBlurry: false,
      isUnderexposed: false,
      isOverexposed: false,
      meanLuminance: 128,
      underexposedRatio: 0,
      overexposedRatio: 0,
      motionAnisotropy: 1,
    };
  }

  // To maintain fast performance on 12MP (4032x3024) still images, sample a representative central
  // analysis patch (80% of width/height) or downsample the inspection grid.
  const marginX = Math.round(width * 0.08);
  const marginY = Math.round(height * 0.08);
  const patchW = width - 2 * marginX;
  const patchH = height - 2 * marginY;

  const imageData = context.getImageData(marginX, marginY, patchW, patchH);
  const data = imageData.data;

  const step = config.sampleGridStep;
  const sampledW = Math.floor(patchW / step);
  const sampledH = Math.floor(patchH / step);

  if (sampledW < 10 || sampledH < 10) {
    return {
      isAcceptable: true,
      sharpness: 100,
      isBlurry: false,
      isUnderexposed: false,
      isOverexposed: false,
      meanLuminance: 128,
      underexposedRatio: 0,
      overexposedRatio: 0,
      motionAnisotropy: 1,
    };
  }

  // Build 2D luminance grid for Laplacian and directional derivatives
  const lum = new Float32Array(sampledW * sampledH);
  let lumSum = 0;
  let underexposedCount = 0;
  let overexposedCount = 0;
  const totalPixels = sampledW * sampledH;

  for (let sy = 0; sy < sampledH; sy++) {
    const origY = sy * step;
    for (let sx = 0; sx < sampledW; sx++) {
      const origX = sx * step;
      const idx = (origY * patchW + origX) * 4;
      // Standard Rec. 601 luminance
      const yVal = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      lum[sy * sampledW + sx] = yVal;
      lumSum += yVal;

      if (yVal < 14) {
        underexposedCount++;
      } else if (yVal > 248) {
        overexposedCount++;
      }
    }
  }

  const meanLuminance = lumSum / totalPixels;
  const underexposedRatio = underexposedCount / totalPixels;
  const overexposedRatio = overexposedCount / totalPixels;

  // 1. Exposure Check (Conservative)
  const isUnderexposed = underexposedRatio >= config.maxUnderexposedRatio;
  const isOverexposed = overexposedRatio >= config.maxOverexposedRatio;

  if (isUnderexposed) {
    return {
      isAcceptable: false,
      sharpness: 0,
      isBlurry: false,
      isUnderexposed: true,
      isOverexposed: false,
      meanLuminance,
      underexposedRatio,
      overexposedRatio,
      motionAnisotropy: 1,
      rejectionReason: "severe-underexposure",
    };
  }

  if (isOverexposed) {
    return {
      isAcceptable: false,
      sharpness: 0,
      isBlurry: false,
      isUnderexposed: false,
      isOverexposed: true,
      meanLuminance,
      underexposedRatio,
      overexposedRatio,
      motionAnisotropy: 1,
      rejectionReason: "severe-overexposure",
    };
  }

  // 2. Sharpness via Discrete Laplacian Variance & Directional Derivatives
  // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;

  let dxSumSq = 0;
  let dySumSq = 0;

  for (let y = 1; y < sampledH - 1; y++) {
    const rowIdx = y * sampledW;
    const rowAbove = (y - 1) * sampledW;
    const rowBelow = (y + 1) * sampledW;

    for (let x = 1; x < sampledW - 1; x++) {
      const center = lum[rowIdx + x];
      const left = lum[rowIdx + x - 1];
      const right = lum[rowIdx + x + 1];
      const up = lum[rowAbove + x];
      const down = lum[rowBelow + x];

      const lap = left + right + up + down - 4 * center;
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount++;

      const dx = right - left;
      const dy = down - up;
      dxSumSq += dx * dx;
      dySumSq += dy * dy;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const lapVar = lapCount > 0 ? lapSumSq / lapCount - lapMean * lapMean : 0;
  const sharpness = Math.max(0, lapVar);

  // Directional motion blur detection:
  // When motion blur occurs in a specific direction (e.g. horizontal camera shake),
  // gradients in the motion direction are smeared out while orthogonal gradients remain.
  const minGrad = Math.min(dxSumSq, dySumSq);
  const maxGrad = Math.max(dxSumSq, dySumSq);
  const motionAnisotropy = maxGrad > 0 ? maxGrad / Math.max(1.0, minGrad) : 1.0;

  const minSharpness =
    method === "image-capture"
      ? config.minLaplacianVarianceStill
      : config.minLaplacianVarianceVideo;

  const isBlurry = sharpness < minSharpness;
  // Severe motion blur: sharpness dropped significantly AND one direction has 4.5x more gradient
  const isSevereMotion =
    sharpness < minSharpness * 1.5 && motionAnisotropy > config.maxMotionAnisotropy;

  let rejectionReason: CaptureQualityEvaluation["rejectionReason"] = undefined;
  if (isBlurry) {
    rejectionReason = "severe-blur";
  } else if (isSevereMotion) {
    rejectionReason = "severe-motion";
  }

  const isAcceptable = !isBlurry && !isSevereMotion;

  return {
    isAcceptable,
    sharpness,
    isBlurry,
    isUnderexposed,
    isOverexposed,
    meanLuminance,
    underexposedRatio,
    overexposedRatio,
    motionAnisotropy,
    rejectionReason,
  };
}
