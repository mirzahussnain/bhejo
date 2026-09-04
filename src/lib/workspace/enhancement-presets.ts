import type { EnhancementPreset } from "../../types/workspace.ts";
import { luminance, type PixelBuffer } from "../capture-processing/enhancement.ts";

export interface PixelBufferMetrics {
  readonly meanLuminance: number;
  readonly stdDevLuminance: number;
  readonly minLuminance: number;
  readonly maxLuminance: number;
  readonly isGrayscale: boolean;
  readonly whitePixelCount: number; // Pixels with luminance >= 240
  readonly blackPixelCount: number; // Pixels with luminance <= 50
}

/**
 * Calculates quantitative pixel statistics across a buffer.
 * Used for development diagnostics, regression testing, and verification.
 */
export function calculateBufferMetrics(buffer: PixelBuffer): PixelBufferMetrics {
  const data = buffer.data;
  const length = data.length;
  const totalPixels = length / 4;

  if (totalPixels === 0) {
    return {
      meanLuminance: 0,
      stdDevLuminance: 0,
      minLuminance: 0,
      maxLuminance: 0,
      isGrayscale: true,
      whitePixelCount: 0,
      blackPixelCount: 0,
    };
  }

  let sum = 0;
  let min = 255;
  let max = 0;
  let isGray = true;
  let whiteCount = 0;
  let blackCount = 0;

  for (let i = 0; i < length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (isGray && (r !== g || g !== b)) {
      isGray = false;
    }

    const lum = luminance(r, g, b);
    sum += lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    if (lum >= 240) whiteCount++;
    if (lum <= 50) blackCount++;
  }

  const mean = sum / totalPixels;

  let varianceSum = 0;
  for (let i = 0; i < length; i += 4) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    varianceSum += (lum - mean) ** 2;
  }
  const stdDev = Math.sqrt(varianceSum / totalPixels);

  return {
    meanLuminance: mean,
    stdDevLuminance: stdDev,
    minLuminance: min,
    maxLuminance: max,
    isGrayscale: isGray,
    whitePixelCount: whiteCount,
    blackPixelCount: blackCount,
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Auto Preset: Document-oriented auto-contrast / levels normalization.
 * Computes luminance distribution and dynamically stretches the dynamic range
 * so the paper background is evenly illuminated and text is crisp.
 */
function applyAutoLevels(buffer: PixelBuffer): void {
  const data = buffer.data;
  const length = data.length;
  const totalPixels = length / 4;
  if (totalPixels === 0) return;

  // Compute 256-bin luminance histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < length; i += 4) {
    const lum = clamp(luminance(data[i], data[i + 1], data[i + 2]));
    hist[lum]++;
  }

  // Find 2nd percentile shadow and 98th percentile highlight
  const lowThreshold = totalPixels * 0.02;
  const highThreshold = totalPixels * 0.98;

  let count = 0;
  let pLow = 0;
  for (let i = 0; i < 256; i++) {
    count += hist[i];
    if (count >= lowThreshold) {
      pLow = i;
      break;
    }
  }

  count = 0;
  let pHigh = 255;
  for (let i = 255; i >= 0; i--) {
    count += hist[i];
    if (count >= totalPixels - highThreshold) {
      pHigh = i;
      break;
    }
  }

  const range = Math.max(20, pHigh - pLow);
  const targetMin = 10;
  const targetMax = 245;

  // Apply contrast stretch
  for (let i = 0; i < length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = data[i + c];
      const normalized = (val - pLow) / range;
      data[i + c] = clamp(targetMin + normalized * (targetMax - targetMin));
    }
  }
}

/**
 * Document Preset: Professional office scanner document mode.
 * 1. Background whitening: Cleans off-white/greyish indoor lighting paper towards clean white.
 * 2. Text deepening: Darkens ink/text below threshold to deep legible black/dark ink.
 * 3. Text edge sharpening: Unsharp masking on luminance.
 */
function applyDocumentScanMode(buffer: PixelBuffer): void {
  const data = buffer.data;
  const { width, height } = buffer;
  const length = data.length;
  if (width <= 0 || height <= 0) return;

  // Step 1: Tone curve for document paper cleanup and text contrast
  // Curve: input in [0..255] -> output
  // Shadows (< 120): pushed darker towards 0
  // Highlights (> 180): pushed lighter towards 255 (clean paper)
  for (let i = 0; i < length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = luminance(r, g, b);

    let newLum: number;
    if (lum > 185) {
      // Background whitening
      newLum = 220 + (lum - 185) * (35 / 70);
    } else if (lum < 110) {
      // Ink darkening
      newLum = lum * (75 / 110);
    } else {
      // Midtone contrast
      newLum = 75 + (lum - 110) * (145 / 75);
    }
    newLum = clamp(newLum);

    // Apply luminance adjustment preserving original chromatic ratios
    if (lum > 0) {
      const scale = newLum / lum;
      data[i] = clamp(r * scale);
      data[i + 1] = clamp(g * scale);
      data[i + 2] = clamp(b * scale);
    } else {
      data[i] = newLum;
      data[i + 1] = newLum;
      data[i + 2] = newLum;
    }
  }

  // Step 2: Gentle 3x3 unsharp mask on luminance for sharp text edges
  if (width >= 3 && height >= 3) {
    const original = new Uint8ClampedArray(data);
    const sharpenAmount = 0.45;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = original[idx + c];
          const neighbors =
            (original[idx - 4 + c] +
              original[idx + 4 + c] +
              original[idx - width * 4 + c] +
              original[idx + width * 4 + c]) /
            4;
          const delta = center - neighbors;
          data[idx + c] = clamp(center + delta * sharpenAmount);
        }
      }
    }
  }
}

/**
 * Grayscale Preset: True document monochrome.
 * Converts RGB to Rec. 709 luminance with document tone curve.
 * Guaranteed: R === G === B for every pixel.
 */
function applyDocumentGrayscale(buffer: PixelBuffer): void {
  const data = buffer.data;
  const length = data.length;

  for (let i = 0; i < length; i += 4) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);

    // Apply document contrast curve: brighten paper, darken ink
    let adjusted: number;
    if (lum > 180) {
      adjusted = 215 + (lum - 180) * (40 / 75);
    } else if (lum < 110) {
      adjusted = lum * (75 / 110);
    } else {
      adjusted = 75 + (lum - 110) * (140 / 70);
    }

    const gray = clamp(adjusted);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
}

/**
 * Applies document-oriented enhancement presets to a raw pixel buffer.
 */
export function applyPresetToPixelBuffer(
  buffer: PixelBuffer,
  preset: EnhancementPreset,
): void {
  if (
    buffer.width <= 0 ||
    buffer.height <= 0 ||
    buffer.data.length !== buffer.width * buffer.height * 4
  ) {
    throw new RangeError("Invalid pixel buffer dimensions.");
  }

  switch (preset) {
    case "original":
      // Pristine pixels - zero modifications
      return;

    case "auto":
      applyAutoLevels(buffer);
      return;

    case "document":
      applyDocumentScanMode(buffer);
      return;

    case "grayscale":
      applyDocumentGrayscale(buffer);
      return;
  }
}

/**
 * In-place enhancement application to an HTMLCanvasElement.
 */
export function applyPresetToCanvas(
  canvas: HTMLCanvasElement,
  preset: EnhancementPreset,
): void {
  if (preset === "original") {
    return;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Unable to obtain 2D canvas context for enhancement.");
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyPresetToPixelBuffer(
    {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data,
    },
    preset,
  );
  ctx.putImageData(imageData, 0, 0);
}
