import type { OpenCV } from "@opencvjs/web";
import {
  runDocumentDetection,
  type DocumentDetectionRun,
} from "./document-detection.ts";
import {
  calculateBoundingBoxIoU,
  cornersBoundingBox,
  distance,
  orderCorners,
  type DocumentCorners,
} from "./geometry.ts";
import type { AnalysisFrame } from "../camera/frame-sampler.ts";

export type BenchmarkBackground =
  | "pure-black"
  | "white-light-table"
  | "white-pure-low-contrast"
  | "beige"
  | "light-wood-grain"
  | "dark-wood"
  | "grey-surface"
  | "patterned-grid"
  | "textured-noise"
  | "textured-carpet"
  | "patterned-carpet"
  | "wood-floor-seams"
  | "low-contrast-surface"
  | "coloured-surface";

export type BenchmarkDocument =
  | "id1-card"
  | "a4-document"
  | "a5-document"
  | "passport-single-page"
  | "open-passport-spread"
  | "receipt"
  | "certificate";

export interface BenchmarkResultItem {
  readonly background: BenchmarkBackground;
  readonly document: BenchmarkDocument;
  readonly detected: boolean;
  readonly isCorrect: boolean;
  readonly isFalsePositive: boolean;
  readonly selectedStrategy: string | null;
  readonly confidence: number | null;
  readonly candidateCount: number;
  readonly quadrilateralCount: number;
  readonly localizationErrorPx: number;
  readonly iou: number;
  readonly latencyMs: number;
  readonly corners: DocumentCorners | null;
  readonly groundTruthCorners: DocumentCorners;
}

export interface BenchmarkAggregateSummary {
  readonly totalConditions: number;
  readonly totalDetected: number;
  readonly totalCorrect: number;
  readonly totalFalsePositives: number;
  readonly overallRecall: number;
  readonly overallPrecision: number;
  readonly averageLatencyMs: number;
  readonly averageCandidateCount: number;
  readonly recallByBackground: Record<BenchmarkBackground, number>;
  readonly recallByDocument: Record<BenchmarkDocument, number>;
  readonly falsePositivesByBackground: Record<BenchmarkBackground, number>;
}

export interface BenchmarkSuiteReport {
  readonly items: readonly BenchmarkResultItem[];
  readonly summary: BenchmarkAggregateSummary;
}

export const BENCHMARK_BACKGROUNDS: readonly BenchmarkBackground[] = [
  "pure-black",
  "white-light-table",
  "white-pure-low-contrast",
  "beige",
  "light-wood-grain",
  "dark-wood",
  "grey-surface",
  "patterned-grid",
  "textured-noise",
  "textured-carpet",
  "patterned-carpet",
  "wood-floor-seams",
  "low-contrast-surface",
  "coloured-surface",
];

export const BENCHMARK_DOCUMENTS: readonly BenchmarkDocument[] = [
  "id1-card",
  "a4-document",
  "a5-document",
  "passport-single-page",
  "open-passport-spread",
  "receipt",
  "certificate",
];

export interface SyntheticFixture {
  readonly canvas: HTMLCanvasElement;
  readonly frame: AnalysisFrame;
  readonly groundTruthCorners: DocumentCorners;
}

function ensureCanvasPolyfill(): void {
  if (typeof globalThis.HTMLImageElement === "undefined") {
    (globalThis as unknown as { HTMLImageElement: unknown }).HTMLImageElement = class {};
  }
  if (typeof globalThis.HTMLCanvasElement === "undefined") {
    (globalThis as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement = class {
      width: number;
      height: number;
      private _buffer: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this._buffer = new Uint8ClampedArray(w * h * 4);
      }
      getContext() {
        return {
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: this._buffer,
            width: w,
            height: h,
          }),
        };
      }
    };
  }
}

/**
 * Generates background RGB pixel values.
 */
function getBackgroundPixel(
  bg: BenchmarkBackground,
  x: number,
  y: number,
): [number, number, number] {
  switch (bg) {
    case "pure-black":
      return [15, 15, 15];
    case "white-light-table":
      return [215, 215, 215];
    case "white-pure-low-contrast":
      return [248, 248, 248];
    case "beige":
      return [205, 195, 175];
    case "light-wood-grain": {
      const g = Math.max(0, Math.min(255, Math.round(200 + 25 * Math.sin(y / 6 + Math.sin(x / 20) * 2))));
      return [g, Math.round(g * 0.95), Math.round(g * 0.85)];
    }
    case "dark-wood": {
      const g = Math.max(0, Math.min(255, Math.round(55 + 20 * Math.sin(y / 5 + Math.sin(x / 18) * 1.5))));
      return [Math.round(g * 1.1), g, Math.round(g * 0.8)];
    }
    case "grey-surface":
      return [130, 130, 130];
    case "patterned-grid": {
      const onGrid = x % 40 < 2 || y % 40 < 2;
      return onGrid ? [110, 110, 110] : [180, 180, 180];
    }
    case "textured-noise": {
      // Deterministic hash noise
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const frac = n - Math.floor(n);
      const val = Math.round(145 + frac * 30);
      return [val, val, val];
    }
    case "textured-carpet": {
      // Carpet weave with high spatial frequency fiber texture
      const fiber = Math.sin(x * 0.8 + Math.cos(y * 0.6) * 3) * 18 +
                    Math.sin(y * 1.2 + Math.cos(x * 0.9) * 2) * 18;
      const n = Math.sin(x * 37.1 + y * 91.7) * 43758.5453;
      const hash = (n - Math.floor(n)) * 26 - 13;
      const base = Math.max(0, Math.min(255, Math.round(115 + fiber + hash)));
      return [base, Math.round(base * 0.95), Math.round(base * 0.9)];
    }
    case "patterned-carpet": {
      // Oriental/geometric weave rug with repetitive ornamental pattern
      const pattern = Math.sin(x / 8) * Math.cos(y / 8) * 24;
      const n = Math.sin(x * 17.3 + y * 41.9) * 43758.5453;
      const grain = (n - Math.floor(n)) * 20 - 10;
      const base = Math.max(0, Math.min(255, Math.round(120 + pattern + grain)));
      return [Math.round(base * 1.08), base, Math.round(base * 0.88)];
    }
    case "wood-floor-seams": {
      // Hardwood plank flooring with horizontal seams every 60px and subtle grain
      const isSeam = y % 60 < 2 || (x % 180 < 2 && Math.floor(y / 60) % 2 === 0);
      if (isSeam) {
        return [40, 30, 20]; // Dark seam gap
      }
      const grain = Math.sin(y / 4 + Math.sin(x / 30) * 3) * 22;
      const base = Math.max(0, Math.min(255, Math.round(140 + grain)));
      return [Math.round(base * 1.15), base, Math.round(base * 0.75)];
    }
    case "low-contrast-surface":
      return [225, 225, 225];
    case "coloured-surface":
      return [60, 110, 190]; // Blue desk
  }
}

interface DocumentGeometrySpec {
  readonly corners: DocumentCorners;
  readonly substrateColor: [number, number, number];
  readonly renderContent: (
    data: Uint8ClampedArray,
    width: number,
    corners: DocumentCorners,
  ) => void;
}

function getDocumentSpec(
  doc: BenchmarkDocument,
  frameWidth = 640,
  frameHeight = 480,
): DocumentGeometrySpec {
  switch (doc) {
    case "id1-card": {
      // ISO/IEC 7810 ID-1: 85.6mm x 53.98mm => aspect ratio ~1.586
      // Size: 340 x 214
      const w = 340;
      const h = 214;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [242, 242, 245],
        renderContent: (data, stride) => {
          // Photo box on left: 75x95 at (x0+25, y0+30)
          for (let y = y0 + 30; y < y0 + 125; y += 1) {
            for (let x = x0 + 25; x < x0 + 100; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 50;
              data[i + 1] = 55;
              data[i + 2] = 70;
            }
          }
          // Gold chip: 40x30 at (x0+120, y0+45)
          for (let y = y0 + 45; y < y0 + 75; y += 1) {
            for (let x = x0 + 120; x < x0 + 160; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 175;
              data[i + 1] = 150;
              data[i + 2] = 50;
            }
          }
          // Card text lines
          for (let row = 0; row < 4; row += 1) {
            const lineY = y0 + 100 + row * 22;
            for (let x = x0 + 120; x < x0 + 310; x += 1) {
              if (x % 5 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 40;
                data[i + 1] = 40;
                data[i + 2] = 40;
              }
            }
          }
        },
      };
    }
    case "a4-document": {
      // ISO A4: 1.414 aspect ratio in portrait: 280 x 396
      const w = 280;
      const h = 396;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [242, 242, 242],
        renderContent: (data, stride) => {
          // Document title header at top
          for (let y = y0 + 30; y < y0 + 42; y += 1) {
            for (let x = x0 + 30; x < x0 + 220; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 30;
              data[i + 1] = 30;
              data[i + 2] = 30;
            }
          }
          // Regular text paragraph lines
          for (let line = 0; line < 18; line += 1) {
            const lineY = y0 + 65 + line * 17;
            const lineEnd = x0 + w - 30 - (line % 4 === 3 ? 60 : 0);
            for (let x = x0 + 30; x < lineEnd; x += 1) {
              if (x % 6 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 45;
                data[i + 1] = 45;
                data[i + 2] = 45;
              }
            }
          }
        },
      };
    }
    case "a5-document": {
      // ISO A5: 1.414 in landscape: 380 x 269
      const w = 380;
      const h = 269;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [238, 235, 230],
        renderContent: (data, stride) => {
          for (let line = 0; line < 12; line += 1) {
            const lineY = y0 + 40 + line * 18;
            for (let x = x0 + 35; x < x0 + w - 35; x += 1) {
              if (x % 5 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 50;
                data[i + 1] = 50;
                data[i + 2] = 50;
              }
            }
          }
        },
      };
    }
    case "passport-single-page": {
      // Single passport page (B7: 125x88mm => ratio ~1.42): 250 x 355
      const w = 250;
      const h = 355;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [236, 234, 230],
        renderContent: (data, stride) => {
          // Photo box on left
          for (let y = y0 + 50; y < y0 + 155; y += 1) {
            for (let x = x0 + 20; x < x0 + 100; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 60;
              data[i + 1] = 65;
              data[i + 2] = 75;
            }
          }
          // Text lines on right
          for (let row = 0; row < 5; row += 1) {
            const lineY = y0 + 60 + row * 20;
            for (let x = x0 + 115; x < x0 + w - 20; x += 1) {
              if (x % 5 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 45;
                data[i + 1] = 45;
                data[i + 2] = 45;
              }
            }
          }
          // MRZ band at bottom: two lines of dark OCR characters
          for (let mrzLine = 0; mrzLine < 2; mrzLine += 1) {
            const lineY = y0 + h - 45 + mrzLine * 16;
            for (let x = x0 + 15; x < x0 + w - 15; x += 1) {
              if (x % 4 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 30;
                data[i + 1] = 30;
                data[i + 2] = 30;
              }
            }
          }
        },
      };
    }
    case "open-passport-spread": {
      // Two-page open passport spread: 440 x 312
      const w = 440;
      const h = 312;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [236, 234, 230],
        renderContent: (data, stride) => {
          const spineX = x0 + Math.round(w / 2);
          // Central spine line
          for (let y = y0; y < y0 + h; y += 1) {
            const i = (y * stride + spineX) * 4;
            data[i] = 160;
            data[i + 1] = 155;
            data[i + 2] = 150;
          }
          // Left page: printed text & coat of arms
          for (let line = 0; line < 10; line += 1) {
            const lineY = y0 + 40 + line * 22;
            for (let x = x0 + 30; x < spineX - 30; x += 1) {
              if (x % 5 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 45;
                data[i + 1] = 45;
                data[i + 2] = 45;
              }
            }
          }
          // Right page: Photo + MRZ
          for (let y = y0 + 45; y < y0 + 145; y += 1) {
            for (let x = spineX + 25; x < spineX + 105; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 60;
              data[i + 1] = 65;
              data[i + 2] = 75;
            }
          }
          // Right page MRZ
          for (let mrzLine = 0; mrzLine < 2; mrzLine += 1) {
            const lineY = y0 + h - 45 + mrzLine * 16;
            for (let x = spineX + 20; x < x0 + w - 20; x += 1) {
              if (x % 4 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 30;
                data[i + 1] = 30;
                data[i + 2] = 30;
              }
            }
          }
        },
      };
    }
    case "receipt": {
      // Receipt: narrow aspect ratio ~3.0: 140 x 390
      const w = 140;
      const h = 390;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [242, 242, 244],
        renderContent: (data, stride) => {
          // Store header
          for (let y = y0 + 25; y < y0 + 38; y += 1) {
            for (let x = x0 + 20; x < x0 + w - 20; x += 1) {
              const i = (y * stride + x) * 4;
              data[i] = 35;
              data[i + 1] = 35;
              data[i + 2] = 35;
            }
          }
          // Receipt item lines
          for (let line = 0; line < 15; line += 1) {
            const lineY = y0 + 55 + line * 18;
            for (let x = x0 + 15; x < x0 + w - 15; x += 1) {
              if (x % 4 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 45;
                data[i + 1] = 45;
                data[i + 2] = 45;
              }
            }
          }
          // Barcode at bottom
          for (let y = y0 + h - 50; y < y0 + h - 20; y += 1) {
            for (let x = x0 + 15; x < x0 + w - 15; x += 1) {
              if (x % 3 !== 0) {
                const i = (y * stride + x) * 4;
                data[i] = 30;
                data[i + 1] = 30;
                data[i + 2] = 30;
              }
            }
          }
        },
      };
    }
    case "certificate": {
      // Certificate: formal rectangular document with inner border: 420 x 297
      const w = 420;
      const h = 297;
      const x0 = Math.round((frameWidth - w) / 2);
      const y0 = Math.round((frameHeight - h) / 2);
      const corners = orderCorners([
        { x: x0, y: y0 },
        { x: x0 + w, y: y0 },
        { x: x0 + w, y: y0 + h },
        { x: x0, y: y0 + h },
      ]);
      return {
        corners,
        substrateColor: [240, 238, 232],
        renderContent: (data, stride) => {
          // Outer decorative border 8px inside edge
          const bx0 = x0 + 8;
          const by0 = y0 + 8;
          const bx1 = x0 + w - 8;
          const by1 = y0 + h - 8;
          for (let x = bx0; x <= bx1; x += 1) {
            const i1 = (by0 * stride + x) * 4;
            const i2 = (by1 * stride + x) * 4;
            data[i1] = 40; data[i1 + 1] = 50; data[i1 + 2] = 80;
            data[i2] = 40; data[i2 + 1] = 50; data[i2 + 2] = 80;
          }
          for (let y = by0; y <= by1; y += 1) {
            const i1 = (y * stride + bx0) * 4;
            const i2 = (y * stride + bx1) * 4;
            data[i1] = 40; data[i1 + 1] = 50; data[i1 + 2] = 80;
            data[i2] = 40; data[i2 + 1] = 50; data[i2 + 2] = 80;
          }
          // Center title and seal
          for (let line = 0; line < 6; line += 1) {
            const lineY = y0 + 55 + line * 26;
            for (let x = x0 + 60; x < x0 + w - 60; x += 1) {
              if (x % 5 !== 0) {
                const i = (lineY * stride + x) * 4;
                data[i] = 45; data[i + 1] = 45; data[i + 2] = 45;
              }
            }
          }
        },
      };
    }
  }
}

/**
 * Synthesizes a frame containing a document on a specified background.
 */
export function createSyntheticFixture(
  bg: BenchmarkBackground,
  doc: BenchmarkDocument,
  width = 640,
  height = 480,
): SyntheticFixture {
  ensureCanvasPolyfill();

  const spec = getDocumentSpec(doc, width, height);
  const canvas = new (globalThis.HTMLCanvasElement as unknown as new (w: number, h: number) => HTMLCanvasElement)(
    width,
    height,
  );
  const ctx = canvas.getContext("2d");
  const imgData = ctx?.getImageData(0, 0, width, height);
  const data = imgData ? imgData.data : new Uint8ClampedArray(width * height * 4);

  // Fill background
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const [r, g, b] = getBackgroundPixel(bg, x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  // Draw document substrate inside ground truth corners
  const [c0, c1, c2, c3] = spec.corners;
  const minX = Math.min(c0.x, c1.x, c2.x, c3.x);
  const maxX = Math.max(c0.x, c1.x, c2.x, c3.x);
  const minY = Math.min(c0.y, c1.y, c2.y, c3.y);
  const maxY = Math.max(c0.y, c1.y, c2.y, c3.y);

  const [subR, subG, subB] = spec.substrateColor;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = subR;
      data[idx + 1] = subG;
      data[idx + 2] = subB;
      data[idx + 3] = 255;
    }
  }

  // Render internal document features (text, photo, chip, barcode)
  spec.renderContent(data, width, spec.corners);

  const frame: AnalysisFrame = {
    canvas,
    width,
    height,
    timestamp: Date.now(),
  };

  return {
    canvas,
    frame,
    groundTruthCorners: spec.corners,
  };
}

/**
 * Calculates corner localization error between detected corners and ground truth.
 */
export function calculateLocalizationError(
  detected: DocumentCorners,
  groundTruth: DocumentCorners,
): number {
  return (
    (distance(detected[0], groundTruth[0]) +
      distance(detected[1], groundTruth[1]) +
      distance(detected[2], groundTruth[2]) +
      distance(detected[3], groundTruth[3])) /
    4
  );
}

/**
 * Evaluates a single detection run against ground truth.
 */
export function evaluateBenchmarkCondition(
  bg: BenchmarkBackground,
  doc: BenchmarkDocument,
  run: DocumentDetectionRun,
  groundTruth: DocumentCorners,
  latencyMs: number,
): BenchmarkResultItem {
  if (!run.detection) {
    return {
      background: bg,
      document: doc,
      detected: false,
      isCorrect: false,
      isFalsePositive: false,
      selectedStrategy: null,
      confidence: null,
      candidateCount: run.contourCount,
      quadrilateralCount: run.quadrilateralCount,
      localizationErrorPx: Infinity,
      iou: 0,
      latencyMs,
      corners: null,
      groundTruthCorners: groundTruth,
    };
  }

  const detectedCorners = run.detection.corners;
  const detBox = cornersBoundingBox(detectedCorners);
  const gtBox = cornersBoundingBox(groundTruth);
  const iou = calculateBoundingBoxIoU(detBox, gtBox);
  const locErr = calculateLocalizationError(detectedCorners, groundTruth);

  // Correct if IoU >= 0.75 and localization error <= 20px
  const isCorrect = iou >= 0.75 && locErr <= 20;
  // False positive if a detection was made but it is not the real document (IoU < 0.50)
  const isFalsePositive = !isCorrect && iou < 0.50;

  return {
    background: bg,
    document: doc,
    detected: true,
    isCorrect,
    isFalsePositive,
    selectedStrategy: run.strategy,
    confidence: run.detection.confidence,
    candidateCount: run.contourCount,
    quadrilateralCount: run.quadrilateralCount,
    localizationErrorPx: Math.round(locErr * 10) / 10,
    iou: Math.round(iou * 1000) / 1000,
    latencyMs: Math.round(latencyMs * 10) / 10,
    corners: detectedCorners,
    groundTruthCorners: groundTruth,
  };
}

/**
 * Runs the full 10x7 benchmark suite and aggregates results.
 */
export function runBenchmarkSuite(cv: typeof OpenCV): BenchmarkSuiteReport {
  const items: BenchmarkResultItem[] = [];

  const recallByBackground: Record<BenchmarkBackground, number> = {
    "pure-black": 0,
    "white-light-table": 0,
    "white-pure-low-contrast": 0,
    beige: 0,
    "light-wood-grain": 0,
    "dark-wood": 0,
    "grey-surface": 0,
    "patterned-grid": 0,
    "textured-noise": 0,
    "textured-carpet": 0,
    "patterned-carpet": 0,
    "wood-floor-seams": 0,
    "low-contrast-surface": 0,
    "coloured-surface": 0,
  };

  const recallByDocument: Record<BenchmarkDocument, number> = {
    "id1-card": 0,
    "a4-document": 0,
    "a5-document": 0,
    "passport-single-page": 0,
    "open-passport-spread": 0,
    receipt: 0,
    certificate: 0,
  };

  const falsePositivesByBackground: Record<BenchmarkBackground, number> = {
    "pure-black": 0,
    "white-light-table": 0,
    "white-pure-low-contrast": 0,
    beige: 0,
    "light-wood-grain": 0,
    "dark-wood": 0,
    "grey-surface": 0,
    "patterned-grid": 0,
    "textured-noise": 0,
    "textured-carpet": 0,
    "patterned-carpet": 0,
    "wood-floor-seams": 0,
    "low-contrast-surface": 0,
    "coloured-surface": 0,
  };

  let totalLatency = 0;
  let totalCandidates = 0;
  let totalCorrect = 0;
  let totalDetected = 0;
  let totalFalsePositives = 0;

  for (const bg of BENCHMARK_BACKGROUNDS) {
    for (const doc of BENCHMARK_DOCUMENTS) {
      const fixture = createSyntheticFixture(bg, doc);
      const start = performance.now();
      const run = runDocumentDetection(cv, fixture.frame);
      const elapsed = performance.now() - start;

      const result = evaluateBenchmarkCondition(
        bg,
        doc,
        run,
        fixture.groundTruthCorners,
        elapsed,
      );

      items.push(result);

      totalLatency += elapsed;
      totalCandidates += result.quadrilateralCount;
      if (result.detected) totalDetected += 1;
      if (result.isCorrect) {
        totalCorrect += 1;
        recallByBackground[bg] += 1;
        recallByDocument[doc] += 1;
      }
      if (result.isFalsePositive) {
        totalFalsePositives += 1;
        falsePositivesByBackground[bg] += 1;
      }
    }
  }

  const totalConditions = BENCHMARK_BACKGROUNDS.length * BENCHMARK_DOCUMENTS.length;

  return {
    items,
    summary: {
      totalConditions,
      totalDetected,
      totalCorrect,
      totalFalsePositives,
      overallRecall: Math.round((totalCorrect / totalConditions) * 1000) / 10,
      overallPrecision:
        totalDetected > 0
          ? Math.round((totalCorrect / totalDetected) * 1000) / 10
          : 0,
      averageLatencyMs: Math.round((totalLatency / totalConditions) * 10) / 10,
      averageCandidateCount:
        Math.round((totalCandidates / totalConditions) * 10) / 10,
      recallByBackground,
      recallByDocument,
      falsePositivesByBackground,
    },
  };
}

async function main() {
  const { loadOpenCv } = await import("./opencv-loader.ts");
  console.log("Loading OpenCV for benchmark...");
  const cv = await loadOpenCv();
  console.log("Running 10x7 benchmark suite (70 conditions)...");
  const report = runBenchmarkSuite(cv);
  console.log("\n=== BENCHMARK SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));

  console.log("\n=== FAILURE CONDITIONS ===");
  const failures = report.items.filter((item) => !item.isCorrect);
  if (failures.length === 0) {
    console.log("None! All 70 conditions passed!");
  } else {
    for (const f of failures) {
      console.log(
        `FAIL: [${f.background}] [${f.document}] detected=${f.detected} isFP=${f.isFalsePositive} conf=${f.confidence} cands=${f.candidateCount} errPx=${f.localizationErrorPx.toFixed(1)} iou=${f.iou.toFixed(3)} strat=${f.selectedStrategy}`,
      );
    }
  }
}

if (process.argv[1]?.includes("background-benchmark")) {
  main().catch((err) => {
    console.error("Benchmark error:", err);
    process.exit(1);
  });
}

