import type { OpenCV } from "@opencvjs/web";

export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type ScanQualityProfile = "photo-document" | "document";

export interface ScanEnhancementConfig {
  readonly profile: ScanQualityProfile;
  readonly claheClipLimit: number;
  readonly claheGridSize: number;
  readonly sharpeningAmount: number;
  readonly sharpeningRadius: number;
  readonly brightnessAdjustment: number;
  readonly contrast: number;
  readonly targetLuminance?: number;
  readonly brightnessStrength?: number;
  readonly maximumBrightnessAdjustment?: number;
}

export type EnhancementConfig = ScanEnhancementConfig;

export const DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG: ScanEnhancementConfig = {
  profile: "photo-document",
  claheClipLimit: 1.5,
  claheGridSize: 8,
  sharpeningAmount: 0.35,
  sharpeningRadius: 1.0,
  brightnessAdjustment: 0,
  contrast: 1.0,
  targetLuminance: 145,
  brightnessStrength: 0.18,
  maximumBrightnessAdjustment: 10,
};

export const DEFAULT_DOCUMENT_ENHANCEMENT_CONFIG: ScanEnhancementConfig = {
  profile: "document",
  claheClipLimit: 2.2,
  claheGridSize: 8,
  sharpeningAmount: 0.65,
  sharpeningRadius: 1.2,
  brightnessAdjustment: 0,
  contrast: 1.0,
  targetLuminance: 155,
  brightnessStrength: 0.22,
  maximumBrightnessAdjustment: 15,
};

export const DEFAULT_SCAN_ENHANCEMENT_CONFIG: ScanEnhancementConfig =
  DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG;

export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig =
  DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG;

export function resolveEnhancementConfig(
  config?: Partial<ScanEnhancementConfig>,
  defaultProfile: ScanQualityProfile = "photo-document",
): ScanEnhancementConfig {
  const profile = config?.profile ?? defaultProfile;
  const base =
    profile === "document"
      ? DEFAULT_DOCUMENT_ENHANCEMENT_CONFIG
      : DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG;

  return {
    profile,
    claheClipLimit:
      typeof config?.claheClipLimit === "number" && Number.isFinite(config.claheClipLimit)
        ? Math.max(0, config.claheClipLimit)
        : base.claheClipLimit,
    claheGridSize:
      typeof config?.claheGridSize === "number" && Number.isFinite(config.claheGridSize)
        ? Math.max(1, Math.round(config.claheGridSize))
        : base.claheGridSize,
    sharpeningAmount:
      typeof config?.sharpeningAmount === "number" &&
      Number.isFinite(config.sharpeningAmount)
        ? Math.max(0, config.sharpeningAmount)
        : base.sharpeningAmount,
    sharpeningRadius:
      typeof config?.sharpeningRadius === "number" &&
      Number.isFinite(config.sharpeningRadius)
        ? Math.max(0.1, config.sharpeningRadius)
        : base.sharpeningRadius,
    brightnessAdjustment:
      typeof config?.brightnessAdjustment === "number" &&
      Number.isFinite(config.brightnessAdjustment)
        ? config.brightnessAdjustment
        : base.brightnessAdjustment,
    contrast:
      typeof config?.contrast === "number" && Number.isFinite(config.contrast)
        ? Math.max(0, config.contrast)
        : base.contrast,
    targetLuminance:
      typeof config?.targetLuminance === "number" &&
      Number.isFinite(config.targetLuminance)
        ? config.targetLuminance
        : base.targetLuminance,
    brightnessStrength:
      typeof config?.brightnessStrength === "number" &&
      Number.isFinite(config.brightnessStrength)
        ? config.brightnessStrength
        : base.brightnessStrength,
    maximumBrightnessAdjustment:
      typeof config?.maximumBrightnessAdjustment === "number" &&
      Number.isFinite(config.maximumBrightnessAdjustment)
        ? config.maximumBrightnessAdjustment
        : base.maximumBrightnessAdjustment,
  };
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function luminance(red: number, green: number, blue: number): number {
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
    ScanEnhancementConfig,
    "targetLuminance" | "brightnessStrength" | "maximumBrightnessAdjustment"
  > = DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG,
): number {
  if (!Number.isFinite(averageLuminance)) {
    return 0;
  }

  const targetLuminance =
    config.targetLuminance ?? DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.targetLuminance!;
  const brightnessStrength =
    config.brightnessStrength ??
    DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.brightnessStrength!;
  const maxAdjustment =
    config.maximumBrightnessAdjustment ??
    DEFAULT_PHOTO_DOCUMENT_ENHANCEMENT_CONFIG.maximumBrightnessAdjustment!;

  const adjustment = (targetLuminance - averageLuminance) * brightnessStrength;
  return Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
}

function adjustedChannel(
  value: number,
  brightnessAdjustment: number,
  contrast: number,
): number {
  return clampChannel((value - 128) * contrast + 128 + brightnessAdjustment);
}

export function enhancePixelBuffer(
  buffer: PixelBuffer,
  config?: Partial<ScanEnhancementConfig>,
): void {
  if (
    buffer.width <= 0 ||
    buffer.height <= 0 ||
    buffer.data.length !== buffer.width * buffer.height * 4
  ) {
    throw new RangeError("The image data is not usable for enhancement.");
  }

  const resolved = resolveEnhancementConfig(config);
  const brightnessAdjustment =
    resolved.brightnessAdjustment !== 0
      ? resolved.brightnessAdjustment
      : calculateBrightnessAdjustment(
          calculateAverageLuminance(buffer.data),
          resolved,
        );
  const original = new Uint8ClampedArray(buffer.data);

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = (y * buffer.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = adjustedChannel(
          original[index + channel],
          brightnessAdjustment,
          resolved.contrast,
        );

        if (
          resolved.sharpeningAmount > 0 &&
          x > 0 &&
          x < buffer.width - 1 &&
          y > 0 &&
          y < buffer.height - 1
        ) {
          const neighbourAverage =
            (original[index - 4 + channel] +
              original[index + 4 + channel] +
              original[index - buffer.width * 4 + channel] +
              original[index + buffer.width * 4 + channel]) /
            4;
          value = clampChannel(
            value +
              (original[index + channel] - neighbourAverage) *
                resolved.sharpeningAmount,
          );
        }

        buffer.data[index + channel] = value;
      }
      buffer.data[index + 3] = original[index + 3];
    }
  }
}

export function enhanceMatWithOpenCv(
  cv: typeof OpenCV,
  mat: InstanceType<typeof cv.Mat>,
  options?: Partial<ScanEnhancementConfig>,
): void {
  const config = resolveEnhancementConfig(options);

  const rgb = new cv.Mat();
  const lab = new cv.Mat();
  const labChannels = new cv.MatVector();
  let lChannel: InstanceType<typeof cv.Mat> | null = null;
  let aChannel: InstanceType<typeof cv.Mat> | null = null;
  let bChannel: InstanceType<typeof cv.Mat> | null = null;
  let claheObj: {
    apply: (
      src: InstanceType<typeof cv.Mat>,
      dst: InstanceType<typeof cv.Mat>,
    ) => void;
    delete?: () => void;
  } | null = null;
  let claheL: InstanceType<typeof cv.Mat> | null = null;
  let blurredL: InstanceType<typeof cv.Mat> | null = null;
  let sharpenedL: InstanceType<typeof cv.Mat> | null = null;
  let enhancedChannels: InstanceType<typeof cv.MatVector> | null = null;
  let enhancedLab: InstanceType<typeof cv.Mat> | null = null;
  let enhancedRgb: InstanceType<typeof cv.Mat> | null = null;

  try {
    cv.cvtColor(mat, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

    cv.split(lab, labChannels);
    lChannel = labChannels.get(0);
    aChannel = labChannels.get(1);
    bChannel = labChannels.get(2);

    let activeL = lChannel;

    if (config.claheClipLimit > 0) {
      const openCvWithClahe = cv as unknown as {
        createCLAHE?: (
          clipLimit: number,
          tileGridSize: InstanceType<typeof cv.Size>,
        ) => {
          apply: (
            src: InstanceType<typeof cv.Mat>,
            dst: InstanceType<typeof cv.Mat>,
          ) => void;
          delete?: () => void;
        };
        CLAHE?: new (
          clipLimit: number,
          tileGridSize: InstanceType<typeof cv.Size>,
        ) => {
          apply: (
            src: InstanceType<typeof cv.Mat>,
            dst: InstanceType<typeof cv.Mat>,
          ) => void;
          delete?: () => void;
        };
      };

      if (typeof openCvWithClahe.createCLAHE === "function") {
        claheObj = openCvWithClahe.createCLAHE(
          config.claheClipLimit,
          new cv.Size(config.claheGridSize, config.claheGridSize),
        );
      } else if (typeof openCvWithClahe.CLAHE === "function") {
        claheObj = new openCvWithClahe.CLAHE(
          config.claheClipLimit,
          new cv.Size(config.claheGridSize, config.claheGridSize),
        );
      }

      if (claheObj) {
        claheL = new cv.Mat();
        claheObj.apply(activeL, claheL);
        activeL = claheL;
      }
    }

    if (config.sharpeningAmount > 0) {
      blurredL = new cv.Mat();
      cv.GaussianBlur(
        activeL,
        blurredL,
        new cv.Size(0, 0),
        config.sharpeningRadius,
        config.sharpeningRadius,
        cv.BORDER_DEFAULT,
      );
      sharpenedL = new cv.Mat();
      cv.addWeighted(
        activeL,
        1 + config.sharpeningAmount,
        blurredL,
        -config.sharpeningAmount,
        0,
        sharpenedL,
      );
      activeL = sharpenedL;
    }

    enhancedChannels = new cv.MatVector();
    enhancedChannels.push_back(activeL);
    enhancedChannels.push_back(aChannel);
    enhancedChannels.push_back(bChannel);

    enhancedLab = new cv.Mat();
    cv.merge(enhancedChannels, enhancedLab);

    enhancedRgb = new cv.Mat();
    cv.cvtColor(enhancedLab, enhancedRgb, cv.COLOR_Lab2RGB);
    cv.cvtColor(enhancedRgb, mat, cv.COLOR_RGB2RGBA);
  } finally {
    rgb.delete();
    lab.delete();
    labChannels.delete();
    if (lChannel) lChannel.delete();
    if (aChannel) aChannel.delete();
    if (bChannel) bChannel.delete();
    if (claheObj && typeof claheObj.delete === "function") claheObj.delete();
    if (claheL) claheL.delete();
    if (blurredL) blurredL.delete();
    if (sharpenedL) sharpenedL.delete();
    if (enhancedChannels) enhancedChannels.delete();
    if (enhancedLab) enhancedLab.delete();
    if (enhancedRgb) enhancedRgb.delete();
  }
}

export function enhanceCanvasWithOpenCv(
  cv: typeof OpenCV,
  canvas: HTMLCanvasElement,
  options?: Partial<ScanEnhancementConfig>,
): void {
  const mat = cv.imread(canvas);
  try {
    enhanceMatWithOpenCv(cv, mat, options);
    cv.imshow(canvas, mat);
  } finally {
    mat.delete();
  }
}

export function enhanceCanvas(
  canvas: HTMLCanvasElement,
  config?: Partial<ScanEnhancementConfig>,
): void {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("The image cannot be enhanced on this device.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  enhancePixelBuffer(imageData, config);
  context.putImageData(imageData, 0, 0);
}
