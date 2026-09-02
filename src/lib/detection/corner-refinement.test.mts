import assert from "node:assert/strict";
import test from "node:test";
import {
  collectEdgePixelsAlongSide,
  intersectLines,
  DEFAULT_CORNER_REFINEMENT_CONFIG,
} from "./corner-refinement.ts";
import type { EdgeMap } from "./candidate-evidence.ts";
import type { Point } from "./geometry.ts";

// --- collectEdgePixelsAlongSide ---

function createEdgeMap(width: number, height: number, edgePixels: Point[]): EdgeMap {
  const data = new Uint8Array(width * height);
  for (const pixel of edgePixels) {
    const x = Math.round(pixel.x);
    const y = Math.round(pixel.y);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      data[y * width + x] = 255;
    }
  }
  return { data, width, height };
}

test("collectEdgePixelsAlongSide finds pixels along a horizontal edge", () => {
  const edgePixels: Point[] = [];
  // Horizontal line at y=10 from x=5 to x=45
  for (let x = 5; x <= 45; x += 1) {
    edgePixels.push({ x, y: 10 });
  }
  const edgeMap = createEdgeMap(50, 20, edgePixels);

  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 5, y: 10 },
    { x: 45, y: 10 },
    3,
  );

  // Should find most pixels (excluding those near corners due to marginRatio).
  assert.ok(collected.length >= 20, `Expected >=20 pixels, got ${collected.length}`);
});

test("collectEdgePixelsAlongSide excludes pixels far from the corridor", () => {
  const edgePixels: Point[] = [];
  // Line at y=10
  for (let x = 5; x <= 45; x += 1) {
    edgePixels.push({ x, y: 10 });
  }
  // Noise far away at y=0
  for (let x = 5; x <= 45; x += 1) {
    edgePixels.push({ x, y: 0 });
  }
  const edgeMap = createEdgeMap(50, 20, edgePixels);

  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 5, y: 10 },
    { x: 45, y: 10 },
    2,
  );

  // All collected pixels should be within corridor of y=10
  assert.ok(collected.every((p) => Math.abs(p.y - 10) <= 2));
});

test("collectEdgePixelsAlongSide returns empty for insufficient corridor", () => {
  const edgeMap = createEdgeMap(50, 20, []);

  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 5, y: 10 },
    { x: 45, y: 10 },
    3,
  );

  assert.equal(collected.length, 0);
});

test("collectEdgePixelsAlongSide works with diagonal sides", () => {
  const edgePixels: Point[] = [];
  // Diagonal from (5,5) to (25,25)
  for (let i = 0; i <= 20; i += 1) {
    edgePixels.push({ x: 5 + i, y: 5 + i });
  }
  const edgeMap = createEdgeMap(40, 40, edgePixels);

  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 5, y: 5 },
    { x: 25, y: 25 },
    3,
  );

  assert.ok(collected.length >= 10, `Expected >=10 pixels, got ${collected.length}`);
});

// --- intersectLines ---

test("intersects two perpendicular lines at the correct point", () => {
  // Horizontal line through y=5
  const horizontal = { vx: 1, vy: 0, x0: 0, y0: 5 };
  // Vertical line through x=10
  const vertical = { vx: 0, vy: 1, x0: 10, y0: 0 };

  const result = intersectLines(horizontal, vertical);
  assert.ok(result);
  assert.ok(Math.abs(result.x - 10) < 0.001);
  assert.ok(Math.abs(result.y - 5) < 0.001);
});

test("intersects two angled lines correctly", () => {
  // Line from origin with slope 1: y = x
  const lineA = { vx: 1, vy: 1, x0: 0, y0: 0 };
  // Line from (10, 0) with slope -1: y = -(x-10) = -x + 10
  const lineB = { vx: 1, vy: -1, x0: 10, y0: 0 };

  const result = intersectLines(lineA, lineB);
  assert.ok(result);
  assert.ok(Math.abs(result.x - 5) < 0.001);
  assert.ok(Math.abs(result.y - 5) < 0.001);
});

test("returns null for parallel lines", () => {
  const lineA = { vx: 1, vy: 0, x0: 0, y0: 5 };
  const lineB = { vx: 1, vy: 0, x0: 0, y0: 10 };

  assert.equal(intersectLines(lineA, lineB), null);
});

test("returns null for identical lines", () => {
  const line = { vx: 1, vy: 1, x0: 0, y0: 0 };
  assert.equal(intersectLines(line, line), null);
});

// --- refineCorners integration (tested via geometry validation outcomes) ---

test("refinement config has conservative defaults", () => {
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.corridorWidthPx, 8);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.minEdgePixels, 10);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.maxCornerDisplacementPx, 14);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.maxAreaChangeRatio, 0.25);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.subPixelWindowSize, 5);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.subPixelMaxIterations, 30);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.subPixelEpsilon, 0.01);
  assert.equal(DEFAULT_CORNER_REFINEMENT_CONFIG.subPixelMaxDisplacementPx, 4);
});

// --- Edge pixel collection with bounding box ---

test("collectEdgePixelsAlongSide excludes corner-adjacent pixels", () => {
  const edgePixels: Point[] = [];
  // Full line from (10,15) to (90,15). Corner-adjacent pixels at t<0.08 and t>0.92
  // should be excluded.
  for (let x = 10; x <= 90; x += 1) {
    edgePixels.push({ x, y: 15 });
  }
  const edgeMap = createEdgeMap(100, 30, edgePixels);

  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 10, y: 15 },
    { x: 90, y: 15 },
    2,
  );

  // Pixels very close to (10,15) and (90,15) should be excluded.
  const nearStart = collected.filter((p) => p.x < 17);
  const nearEnd = collected.filter((p) => p.x > 83);
  assert.equal(nearStart.length, 0, "Should exclude pixels near start corner");
  assert.equal(nearEnd.length, 0, "Should exclude pixels near end corner");
});

test("collectEdgePixelsAlongSide handles zero-length side", () => {
  const edgeMap = createEdgeMap(50, 50, [{ x: 25, y: 25 }]);
  const collected = collectEdgePixelsAlongSide(
    edgeMap,
    { x: 25, y: 25 },
    { x: 25, y: 25 },
    5,
  );
  assert.equal(collected.length, 0);
});

// --- Comprehensive Corner Refinement Tests ---

import type { OpenCV } from "@opencvjs/web";
import { refineCorners } from "./corner-refinement.ts";
import {
  distance,
  isConvexQuadrilateral,
  polygonArea,
  type DocumentCorners,
} from "./geometry.ts";
import { DEFAULT_DOCUMENT_DETECTOR_CONFIG } from "./document-detection.ts";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisCornersToCapture,
} from "../capture-processing/coordinate-mapping.ts";
import { calculatePerspectiveOutputDimensions } from "../capture-processing/perspective-transform.ts";

const mockCv = {} as unknown as typeof OpenCV;

function drawEdgeLine(
  data: Uint8Array,
  width: number,
  height: number,
  start: Point,
  end: Point,
  step = 1,
) {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len === 0) return;
  const numSteps = Math.floor(len / step);
  for (let i = 0; i <= numSteps; i += 1) {
    const t = i / numSteps;
    const x = Math.round(start.x + (end.x - start.x) * t);
    const y = Math.round(start.y + (end.y - start.y) * t);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      data[y * width + x] = 255;
    }
  }
}

test("1. Perfect rectangular card: refineCorners achieves sub-pixel alignment", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Exact physical card at (100, 100) -> (500, 350)
  drawEdgeLine(data, width, height, { x: 100, y: 100 }, { x: 500, y: 100 });
  drawEdgeLine(data, width, height, { x: 500, y: 100 }, { x: 500, y: 350 });
  drawEdgeLine(data, width, height, { x: 500, y: 350 }, { x: 100, y: 350 });
  drawEdgeLine(data, width, height, { x: 100, y: 350 }, { x: 100, y: 100 });

  const edgeMap: EdgeMap = { data, width, height };

  // Slightly jittered candidate corners from approxPolyDP
  const candidateCorners: DocumentCorners = [
    { x: 102, y: 103 },
    { x: 497, y: 98 },
    { x: 503, y: 348 },
    { x: 98, y: 352 },
  ];

  const refined = refineCorners(
    mockCv,
    candidateCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(Math.abs(refined[0].x - 100) <= 0.5, `TL x: ${refined[0].x}`);
  assert.ok(Math.abs(refined[0].y - 100) <= 0.5, `TL y: ${refined[0].y}`);
  assert.ok(Math.abs(refined[1].x - 500) <= 0.5, `TR x: ${refined[1].x}`);
  assert.ok(Math.abs(refined[1].y - 100) <= 0.5, `TR y: ${refined[1].y}`);
  assert.ok(Math.abs(refined[2].x - 500) <= 0.5, `BR x: ${refined[2].x}`);
  assert.ok(Math.abs(refined[2].y - 350) <= 0.5, `BR y: ${refined[2].y}`);
  assert.ok(Math.abs(refined[3].x - 100) <= 0.5, `BL x: ${refined[3].x}`);
  assert.ok(Math.abs(refined[3].y - 350) <= 0.5, `BL y: ${refined[3].y}`);
});

test("2. Perspective-skewed card: refineCorners handles trapezoidal geometry", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  const physical: DocumentCorners = [
    { x: 150, y: 80 },
    { x: 490, y: 110 },
    { x: 520, y: 400 },
    { x: 110, y: 370 },
  ];

  drawEdgeLine(data, width, height, physical[0], physical[1]);
  drawEdgeLine(data, width, height, physical[1], physical[2]);
  drawEdgeLine(data, width, height, physical[2], physical[3]);
  drawEdgeLine(data, width, height, physical[3], physical[0]);

  const edgeMap: EdgeMap = { data, width, height };

  const initialCorners: DocumentCorners = [
    { x: 153, y: 82 },
    { x: 487, y: 112 },
    { x: 517, y: 397 },
    { x: 113, y: 368 },
  ];

  const refined = refineCorners(
    mockCv,
    initialCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  for (let i = 0; i < 4; i += 1) {
    assert.ok(
      distance(refined[i], physical[i]) <= 1.0,
      `Corner ${i} distance: ${distance(refined[i], physical[i])}`,
    );
  }
});

test("3. Slightly rounded card corners: recovers physical outer corner intersections", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Physical card bounds: (100, 100) to (500, 350).
  // Straight segments exclude the rounded corner arcs (margin 15px at each end)
  drawEdgeLine(data, width, height, { x: 115, y: 100 }, { x: 485, y: 100 });
  drawEdgeLine(data, width, height, { x: 500, y: 115 }, { x: 500, y: 335 });
  drawEdgeLine(data, width, height, { x: 485, y: 350 }, { x: 115, y: 350 });
  drawEdgeLine(data, width, height, { x: 100, y: 335 }, { x: 100, y: 115 });

  const edgeMap: EdgeMap = { data, width, height };

  // approxPolyDP on a rounded card cuts the corners inward (e.g. 6px diagonal offset)
  const cutCorners: DocumentCorners = [
    { x: 107, y: 105 },
    { x: 493, y: 105 },
    { x: 493, y: 345 },
    { x: 107, y: 345 },
  ];

  const refined = refineCorners(
    mockCv,
    cutCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  // Should recover the sharp virtual intersection corners (100, 100), (500, 100), etc.
  assert.ok(Math.abs(refined[0].x - 100) <= 0.5, `TL: ${refined[0].x}, ${refined[0].y}`);
  assert.ok(Math.abs(refined[0].y - 100) <= 0.5, `TL: ${refined[0].x}, ${refined[0].y}`);
  assert.ok(Math.abs(refined[1].x - 500) <= 0.5, `TR: ${refined[1].x}, ${refined[1].y}`);
  assert.ok(Math.abs(refined[1].y - 100) <= 0.5, `TR: ${refined[1].x}, ${refined[1].y}`);
  assert.ok(Math.abs(refined[2].x - 500) <= 0.5, `BR: ${refined[2].x}, ${refined[2].y}`);
  assert.ok(Math.abs(refined[2].y - 350) <= 0.5, `BR: ${refined[2].y}, ${refined[2].y}`);
  assert.ok(Math.abs(refined[3].x - 100) <= 0.5, `BL: ${refined[3].x}, ${refined[3].y}`);
  assert.ok(Math.abs(refined[3].y - 350) <= 0.5, `BL: ${refined[3].x}, ${refined[3].y}`);
});

test("4. Weak outer boundary + strong internal chip: ignores chip and locks to outer boundary", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Outer boundary: moderate/sparse edge lines
  drawEdgeLine(data, width, height, { x: 100, y: 100 }, { x: 500, y: 100 }, 3);
  drawEdgeLine(data, width, height, { x: 500, y: 100 }, { x: 500, y: 350 }, 2);
  drawEdgeLine(data, width, height, { x: 500, y: 350 }, { x: 100, y: 350 }, 2);
  drawEdgeLine(data, width, height, { x: 100, y: 350 }, { x: 100, y: 100 }, 3);

  // Dense internal chip 4px below top edge from x=120 to x=170
  drawEdgeLine(data, width, height, { x: 120, y: 104 }, { x: 170, y: 104 }, 1);
  drawEdgeLine(data, width, height, { x: 120, y: 104 }, { x: 120, y: 140 }, 1);

  const edgeMap: EdgeMap = { data, width, height };

  const candidateCorners: DocumentCorners = [
    { x: 103, y: 102 },
    { x: 498, y: 101 },
    { x: 501, y: 349 },
    { x: 99, y: 351 },
  ];

  const refined = refineCorners(
    mockCv,
    candidateCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  // Top edge must remain at y=100, not pulled down to y=104 by the chip
  assert.ok(Math.abs(refined[0].y - 100) <= 0.8, `TL y: ${refined[0].y}`);
  assert.ok(Math.abs(refined[1].y - 100) <= 0.8, `TR y: ${refined[1].y}`);
});

test("5. Card with barcode: ignores dense barcode edges near bottom edge", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Outer boundary at y=100..350, x=100..500
  drawEdgeLine(data, width, height, { x: 100, y: 100 }, { x: 500, y: 100 });
  drawEdgeLine(data, width, height, { x: 500, y: 100 }, { x: 500, y: 350 });
  drawEdgeLine(data, width, height, { x: 500, y: 350 }, { x: 100, y: 350 }, 2);
  drawEdgeLine(data, width, height, { x: 100, y: 350 }, { x: 100, y: 100 });

  // Dense vertical barcode lines 4px above the bottom edge (y=344 to y=348)
  for (let bx = 300; bx <= 450; bx += 2) {
    drawEdgeLine(data, width, height, { x: bx, y: 344 }, { x: bx, y: 348 });
  }

  const edgeMap: EdgeMap = { data, width, height };

  const candidateCorners: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 502, y: 348 },
    { x: 98, y: 349 },
  ];

  const refined = refineCorners(
    mockCv,
    candidateCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  // Bottom edge should lock to y=350, not pulled into the barcode
  assert.ok(Math.abs(refined[2].y - 350) <= 0.8, `BR y: ${refined[2].y}`);
  assert.ok(Math.abs(refined[3].y - 350) <= 0.8, `BL y: ${refined[3].y}`);
});

test("6. Shadow along one edge: refines 3 clear sides and falls back safely for shadowed side", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Top, Right, Bottom have clear edges
  drawEdgeLine(data, width, height, { x: 100, y: 100 }, { x: 500, y: 100 });
  drawEdgeLine(data, width, height, { x: 500, y: 100 }, { x: 500, y: 350 });
  drawEdgeLine(data, width, height, { x: 500, y: 350 }, { x: 100, y: 350 });
  // Left edge has shadow (no edge pixels)

  const edgeMap: EdgeMap = { data, width, height };

  const candidateCorners: DocumentCorners = [
    { x: 104, y: 102 },
    { x: 497, y: 99 },
    { x: 503, y: 349 },
    { x: 103, y: 348 },
  ];

  const refined = refineCorners(
    mockCv,
    candidateCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  // Refined quad must be convex and pass validation
  assert.ok(isConvexQuadrilateral(refined));
  assert.ok(Math.abs(refined[1].x - 500) <= 0.8, `TR x: ${refined[1].x}`);
  assert.ok(Math.abs(refined[2].x - 500) <= 0.8, `BR x: ${refined[2].x}`);
});

test("7. Slightly rotated card: accurately fits rotated physical boundary lines", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  // Card rotated by ~10 degrees
  const physical: DocumentCorners = [
    { x: 180, y: 120 },
    { x: 480, y: 170 },
    { x: 440, y: 390 },
    { x: 140, y: 340 },
  ];

  drawEdgeLine(data, width, height, physical[0], physical[1]);
  drawEdgeLine(data, width, height, physical[1], physical[2]);
  drawEdgeLine(data, width, height, physical[2], physical[3]);
  drawEdgeLine(data, width, height, physical[3], physical[0]);

  const edgeMap: EdgeMap = { data, width, height };

  const initialCorners: DocumentCorners = [
    { x: 183, y: 122 },
    { x: 477, y: 172 },
    { x: 437, y: 388 },
    { x: 143, y: 338 },
  ];

  const refined = refineCorners(
    mockCv,
    initialCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  for (let i = 0; i < 4; i += 1) {
    assert.ok(
      distance(refined[i], physical[i]) <= 1.0,
      `Rotated corner ${i} distance: ${distance(refined[i], physical[i])}`,
    );
  }
});

test("8. Corners near analysis-frame boundaries: stays safely within frame bounds", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);

  drawEdgeLine(data, width, height, { x: 5, y: 5 }, { x: 635, y: 5 });
  drawEdgeLine(data, width, height, { x: 635, y: 5 }, { x: 635, y: 475 });
  drawEdgeLine(data, width, height, { x: 635, y: 475 }, { x: 5, y: 475 });
  drawEdgeLine(data, width, height, { x: 5, y: 475 }, { x: 5, y: 5 });

  const edgeMap: EdgeMap = { data, width, height };

  const nearBorderCorners: DocumentCorners = [
    { x: 8, y: 8 },
    { x: 632, y: 8 },
    { x: 632, y: 472 },
    { x: 8, y: 472 },
  ];

  const refined = refineCorners(
    mockCv,
    nearBorderCorners,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  for (const corner of refined) {
    assert.ok(corner.x >= 0 && corner.x <= width, `x in bounds: ${corner.x}`);
    assert.ok(corner.y >= 0 && corner.y <= height, `y in bounds: ${corner.y}`);
  }
});

test("9. Safety checks: prevents unreasonable expansion, shrinkage, or non-convexity", () => {
  const width = 640;
  const height = 480;
  const data = new Uint8Array(width * height);
  // Random noise everywhere
  for (let i = 0; i < 100; i += 1) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    data[ry * width + rx] = 255;
  }

  const edgeMap: EdgeMap = { data, width, height };

  const initial: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 350 },
    { x: 100, y: 350 },
  ];
  const initialArea = polygonArea(initial);

  const refined = refineCorners(
    mockCv,
    initial,
    edgeMap,
    width,
    height,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );

  assert.ok(isConvexQuadrilateral(refined), "Must remain convex");
  const refinedArea = polygonArea(refined);
  const areaChange = Math.abs(refinedArea - initialArea) / initialArea;
  assert.ok(
    areaChange <= DEFAULT_CORNER_REFINEMENT_CONFIG.maxAreaChangeRatio,
    `Area change ${areaChange} within safety limits`,
  );
});

test("10. Synthetic coordinate mapping & perspective crop verification", () => {
  // Analysis frame: 640x360 (16:9)
  // Capture frame: 1920x1080 (16:9, scale factor = 3.0)
  const analysisDim = { width: 640, height: 360 };
  const sourceDim = { width: 1920, height: 1080 };
  const captureDim = { width: 1920, height: 1080 };

  const analysisCorners: DocumentCorners = [
    { x: 100, y: 50 },
    { x: 540, y: 50 },
    { x: 540, y: 310 },
    { x: 100, y: 310 },
  ];

  const mapping = createFullFrameCoordinateMapping(analysisDim, sourceDim, captureDim);
  const captureCorners = mapAnalysisCornersToCapture(analysisCorners, mapping);

  assert.ok(captureCorners);
  // Expected coordinates: exactly 3x scaled
  assert.deepEqual(captureCorners, [
    { x: 300, y: 150 },
    { x: 1620, y: 150 },
    { x: 1620, y: 930 },
    { x: 300, y: 930 },
  ]);

  // Output dimensions calculation for perspective warp
  const outputDim = calculatePerspectiveOutputDimensions(captureCorners);
  assert.ok(outputDim);
  assert.equal(outputDim.width, 1320); // 1620 - 300
  assert.equal(outputDim.height, 780); // 930 - 150
});

