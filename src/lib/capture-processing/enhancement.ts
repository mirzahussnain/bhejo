export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface EnhancementConfig {
  readonly targetLuminance: number;
  readonly brightnessStrength: number;
  readonly maximumBrightnessAdjustment: number;
  readonly contrast: number;
  readonly sharpeningAmount: number;
}

export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  targetLuminance: 145,
  brightnessStrength: 0.18,
  maximumBrightnessAdjustment: 10,
  contrast: 1.03,
  sharpeningAmount: 0.08,
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function calculateAverageLuminance(data: Uint8ClampedArray): number {
  if (data.length === 0 || data.length % 4 !== 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += luminance(data[index], data[index + 1], data[index + 2]);
  }
  return total / (data.length / 4);
}

export function calculateBrightnessAdjustment(
  averageLuminance: number,
  config: Pick<
    EnhancementConfig,
    "targetLuminance" | "brightnessStrength" | "maximumBrightnessAdjustment"
  > = DEFAULT_ENHANCEMENT_CONFIG,
): number {
  if (!Number.isFinite(averageLuminance)) {
    return 0;
  }

  const adjustment =
    (config.targetLuminance - averageLuminance) * config.brightnessStrength;
  return Math.max(
    -config.maximumBrightnessAdjustment,
    Math.min(config.maximumBrightnessAdjustment, adjustment),
  );
}

function adjustedChannel(value: number, brightnessAdjustment: number, contrast: number) {
  return clampChannel((value - 128) * contrast + 128 + brightnessAdjustment);
}

export function enhancePixelBuffer(
  buffer: PixelBuffer,
  config: EnhancementConfig = DEFAULT_ENHANCEMENT_CONFIG,
): void {
  if (
    buffer.width <= 0 ||
    buffer.height <= 0 ||
    buffer.data.length !== buffer.width * buffer.height * 4
  ) {
    throw new RangeError("The image data is not usable for enhancement.");
  }

  const brightnessAdjustment = calculateBrightnessAdjustment(
    calculateAverageLuminance(buffer.data),
    config,
  );
  const original = new Uint8ClampedArray(buffer.data);

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = (y * buffer.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = adjustedChannel(
          original[index + channel],
          brightnessAdjustment,
          config.contrast,
        );

        if (x > 0 && x < buffer.width - 1 && y > 0 && y < buffer.height - 1) {
          const neighbourAverage =
            (original[index - 4 + channel] +
              original[index + 4 + channel] +
              original[index - buffer.width * 4 + channel] +
              original[index + buffer.width * 4 + channel]) /
            4;
          value = clampChannel(
            value +
              (original[index + channel] - neighbourAverage) *
                config.sharpeningAmount,
          );
        }

        buffer.data[index + channel] = value;
      }
      buffer.data[index + 3] = original[index + 3];
    }
  }
}

export function enhanceCanvas(
  canvas: HTMLCanvasElement,
  config: EnhancementConfig = DEFAULT_ENHANCEMENT_CONFIG,
): void {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("The image cannot be enhanced on this device.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  enhancePixelBuffer(imageData, config);
  context.putImageData(imageData, 0, 0);
}
