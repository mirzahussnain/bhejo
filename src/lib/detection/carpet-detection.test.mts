import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOppositeEdgeParallelism,
  calculateSideStraightness,
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
} from "./geometry.ts";
import {
  createBoundaryEvidence,
  measureCandidateEdgeNormalAlignment,
  measureCornerDirectionalEvidence,
  measureInteriorExteriorTextureContrast,
  type EdgeMap,
  type GrayscaleMap,
} from "./candidate-evidence.ts";
import {
  DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  scoreDocumentCandidate,
  verifyTemporalPrior,
} from "./document-detection.ts";
import { loadOpenCv } from "./opencv-loader.ts";

const frameWidth = 640;
const frameHeight = 480;

test("opposite-edge parallelism rewards rectangular documents and perspective convergence", () => {
  // Perfect rectangle
  const rectCorners: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 380 },
    { x: 100, y: 380 },
  ];
  const rectScore = calculateOppositeEdgeParallelism(rectCorners);
  assert.equal(rectScore, 1.0);

  // Natural perspective convergence (~12 degrees convergence between left and right edges)
  const perspectiveCorners: DocumentCorners = [
    { x: 130, y: 100 },
    { x: 470, y: 100 },
    { x: 500, y: 380 },
    { x: 100, y: 380 },
  ];
  const perspectiveScore = calculateOppositeEdgeParallelism(perspectiveCorners);
  assert.equal(perspectiveScore, 1.0, "Natural perspective convergence <= 20 deg should receive 1.0 score");

  // Moderate perspective tilt (~24 degrees convergence)
  const steepCorners: DocumentCorners = [
    { x: 160, y: 80 },
    { x: 440, y: 80 },
    { x: 520, y: 400 },
    { x: 80, y: 400 },
  ];
  const steepScore = calculateOppositeEdgeParallelism(steepCorners);
  assert.ok(steepScore >= 0.75, "Steep perspective should remain well-scored without rejection");

  // Irregular non-affine contour (opposite edges diverge severely > 45 degrees)
  const irregularCorners: DocumentCorners = [
    { x: 100, y: 100 },
    { x: 500, y: 150 },
    { x: 350, y: 420 },
    { x: 200, y: 250 },
  ];
  const irregularScore = calculateOppositeEdgeParallelism(irregularCorners);
  assert.ok(irregularScore <= 0.40, "Irregular non-affine quadrilateral should be heavily penalized");
});

test("side straightness metric evaluates edge linearity", () => {
  // Collinear segment points
  const straightPoints: Point[] = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 400, y: 100 },
  ];
  assert.equal(calculateSideStraightness(straightPoints), 1.0);

  // Slight sub-pixel jitter (< 2.5% deviation)
  const slightJitter: Point[] = [
    { x: 100, y: 100 },
    { x: 200, y: 102 },
    { x: 300, y: 99 },
    { x: 400, y: 100 },
  ];
  assert.equal(calculateSideStraightness(slightJitter), 1.0);

  // Severe zig-zag / texture fragment (> 10% deviation)
  const jaggedPoints: Point[] = [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    { x: 300, y: 60 },
    { x: 400, y: 100 },
  ];
  assert.equal(calculateSideStraightness(jaggedPoints), 0.0);
});

test("contextual texture contrast identifies high-texture backgrounds without penalizing interior detail", () => {
  const width = 200;
  const height = 200;
  const grayBuffer = new Uint8Array(width * height);

  // Fill background with high-variance texture (carpet simulation)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = (x * 37 + y * 91) % 60;
      grayBuffer[y * width + x] = 100 + noise; // Variance ~300
    }
  }

  // Draw document interior with high internal detail (e.g. photo / passport stamp / text)
  for (let y = 40; y <= 160; y += 1) {
    for (let x = 40; x <= 160; x += 1) {
      const internalDetail = (x * 19 + y * 43) % 80;
      grayBuffer[y * width + x] = 180 + internalDetail;
    }
  }

  const grayMap: GrayscaleMap = { data: grayBuffer, width, height };
  const docCorners: DocumentCorners = [
    { x: 40, y: 40 },
    { x: 160, y: 40 },
    { x: 160, y: 160 },
    { x: 40, y: 160 },
  ];

  const textureContext = measureInteriorExteriorTextureContrast(grayMap, docCorners);
  assert.equal(textureContext.isHighTextureBackground, true, "Should identify high exterior variance");
  assert.ok(textureContext.exteriorVariance > 250, "Exterior variance should be high on carpet");
  assert.ok(textureContext.interiorVariance > 200, "Interior variance reflects document print/photo");

  // Contextual rule verification: high-texture background requires higher support multiplier
  assert.equal(textureContext.requiredSupportMultiplier, 1.15);
});

test("edge normal alignment distinguishes clean document boundaries from isotropic texture noise", () => {
  const width = 200;
  const height = 200;

  // 1. Synthetic clean document: dark background (50) and bright interior (220)
  const cleanBuffer = new Uint8Array(width * height).fill(50);
  for (let y = 40; y <= 160; y += 1) {
    for (let x = 40; x <= 160; x += 1) {
      cleanBuffer[y * width + x] = 220;
    }
  }
  const cleanGray: GrayscaleMap = { data: cleanBuffer, width, height };
  const docCorners: DocumentCorners = [
    { x: 40, y: 40 },
    { x: 160, y: 40 },
    { x: 160, y: 160 },
    { x: 40, y: 160 },
  ];

  const cleanAlignment = measureCandidateEdgeNormalAlignment(cleanGray, docCorners);
  assert.ok(
    cleanAlignment.alignmentScore >= 0.85,
    `Clean document edge normal alignment should be high (got ${cleanAlignment.alignmentScore})`,
  );

  // 2. Isotropic random noise buffer
  const noiseBuffer = new Uint8Array(width * height);
  for (let i = 0; i < noiseBuffer.length; i += 1) {
    noiseBuffer[i] = (i * 73 + (i % 11) * 31) % 256;
  }
  const noiseGray: GrayscaleMap = { data: noiseBuffer, width, height };
  const noiseAlignment = measureCandidateEdgeNormalAlignment(noiseGray, docCorners);
  assert.ok(
    noiseAlignment.alignmentScore <= 0.65,
    `Isotropic texture noise should have low normal alignment (got ${noiseAlignment.alignmentScore})`,
  );
});

test("corner directional evidence verifies 2-arm corner transitions", () => {
  const width = 200;
  const height = 200;
  const edgeBuffer = new Uint8Array(width * height).fill(0);

  // Draw 4 complete boundary segments forming a closed rectangle
  for (let x = 40; x <= 160; x += 1) {
    edgeBuffer[40 * width + x] = 255;
    edgeBuffer[160 * width + x] = 255;
  }
  for (let y = 40; y <= 160; y += 1) {
    edgeBuffer[y * width + 40] = 255;
    edgeBuffer[y * width + 160] = 255;
  }

  const edgeMap: EdgeMap = { data: edgeBuffer, width, height };
  const docCorners: DocumentCorners = [
    { x: 40, y: 40 },
    { x: 160, y: 40 },
    { x: 160, y: 160 },
    { x: 40, y: 160 },
  ];

  const score = measureCornerDirectionalEvidence(edgeMap, docCorners);
  assert.equal(score, 1.0, "All 4 corners should have valid 2-arm directional transitions");

  // A quad with disconnected floating corners
  const floatingCorners: DocumentCorners = [
    { x: 10, y: 10 },
    { x: 190, y: 10 },
    { x: 190, y: 190 },
    { x: 10, y: 190 },
  ];
  const floatingScore = measureCornerDirectionalEvidence(edgeMap, floatingCorners);
  assert.equal(floatingScore, 0.0, "Corners far from any edges should score 0.0");
});

test("temporal prior verification accepts intact tracking and rejects stale or moved documents", async () => {
  const cv = await loadOpenCv();

  const width = 320;
  const height = 240;
  const corners: DocumentCorners = [
    { x: 40, y: 30 },
    { x: 280, y: 30 },
    { x: 280, y: 210 },
    { x: 40, y: 210 },
  ];

  const grayscale = new cv.Mat(height, width, cv.CV_8UC1);
  const edges = new cv.Mat(height, width, cv.CV_8UC1);

  // Fill grayscale with background (40) and document interior (230)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isDoc = x >= 40 && x <= 280 && y >= 30 && y <= 210;
      grayscale.data[y * width + x] = isDoc ? 230 : 40;
    }
  }

  // Draw edges on document boundary
  for (let x = 40; x <= 280; x += 1) {
    edges.data[30 * width + x] = 255;
    edges.data[210 * width + x] = 255;
  }
  for (let y = 30; y <= 210; y += 1) {
    edges.data[y * width + 40] = 255;
    edges.data[y * width + 280] = 255;
  }

  const frame = { canvas: {} as HTMLCanvasElement, width, height, timestamp: 1000 };

  try {
    // 1. Intact tracking: previousCorners matches current document edges
    const verified = verifyTemporalPrior(
      cv,
      frame,
      edges,
      grayscale,
      corners,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
      0.88,
    );
    assert.ok(verified !== null, "Temporal prior should verify intact document boundary");
    assert.ok(verified.confidence >= 0.70);

    // 2. Stale tracking: previousCorners points to an area where document no longer exists
    const staleCorners: DocumentCorners = [
      { x: 5, y: 5 },
      { x: 80, y: 5 },
      { x: 80, y: 50 },
      { x: 5, y: 50 },
    ];
    const staleResult = verifyTemporalPrior(
      cv,
      frame,
      edges,
      grayscale,
      staleCorners,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
      0.85,
    );
    assert.equal(staleResult, null, "Temporal prior must reject stale corners where edge support is absent");

    // 3. Low prior confidence (< 0.75) skips temporal prior
    const lowConfResult = verifyTemporalPrior(
      cv,
      frame,
      edges,
      grayscale,
      corners,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
      0.60,
    );
    assert.equal(lowConfResult, null, "Prior with low confidence should not short-circuit");
  } finally {
    edges.delete();
    grayscale.delete();
  }
});

test("regression suite: ID cards, A4, single passport page, open passport spread remain valid", () => {
  // ISO ID-1 Card
  const idCard = validateQuadrilateral(
    [
      { x: 150, y: 133 },
      { x: 490, y: 133 },
      { x: 490, y: 347 },
      { x: 150, y: 347 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.ok(idCard);
  const idScore = scoreDocumentCandidate(idCard, undefined, createBoundaryEvidence([0.85, 0.82, 0.88, 0.86]));
  assert.ok(idScore > 0.65, `ID Card should score well (got ${idScore})`);

  // ISO A4 Sheet
  const a4Doc = validateQuadrilateral(
    [
      { x: 180, y: 42 },
      { x: 460, y: 42 },
      { x: 460, y: 438 },
      { x: 180, y: 438 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.ok(a4Doc);
  const a4Score = scoreDocumentCandidate(a4Doc, undefined, createBoundaryEvidence([0.80, 0.78, 0.82, 0.79]));
  assert.ok(a4Score > 0.65, `A4 document should score well (got ${a4Score})`);

  // Passport Single Page
  const passportPage = validateQuadrilateral(
    [
      { x: 195, y: 62 },
      { x: 445, y: 62 },
      { x: 445, y: 418 },
      { x: 195, y: 418 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.ok(passportPage);
  const passportScore = scoreDocumentCandidate(passportPage, undefined, createBoundaryEvidence([0.78, 0.75, 0.80, 0.76]));
  assert.ok(passportScore > 0.60, `Passport page should score well (got ${passportScore})`);

  // Open Passport Spread
  const openSpread = validateQuadrilateral(
    [
      { x: 100, y: 84 },
      { x: 540, y: 84 },
      { x: 540, y: 396 },
      { x: 100, y: 396 },
    ],
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.ok(openSpread);
  const spreadScore = scoreDocumentCandidate(openSpread, undefined, createBoundaryEvidence([0.82, 0.80, 0.84, 0.81]));
  assert.ok(spreadScore > 0.65, `Open passport spread should score well (got ${spreadScore})`);
});

test("temporal prior verification does not expand corners across consecutive frames on carpet background", async () => {
  const cv = await loadOpenCv();
  const width = 320;
  const height = 240;
  const edges = new cv.Mat(height, width, cv.CV_8UC1);
  const grayscale = new cv.Mat(height, width, cv.CV_8UC1);

  // Document interior (clean paper)
  for (let y = 40; y < 200; y += 1) {
    for (let x = 60; x < 260; x += 1) {
      grayscale.data[y * width + x] = 230;
    }
  }

  // Document boundaries at x in [60, 260], y in [40, 200]
  for (let x = 60; x <= 260; x += 1) {
    edges.data[40 * width + x] = 255;
    edges.data[200 * width + x] = 255;
  }
  for (let y = 40; y <= 200; y += 1) {
    edges.data[y * width + 60] = 255;
    edges.data[y * width + 260] = 255;
  }

  // Add random carpet texture noise edges outside the document
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 4) {
      if (x < 55 || x > 265 || y < 35 || y > 205) {
        edges.data[y * width + x] = 255;
        grayscale.data[y * width + x] = ((x * 17 + y * 31) % 180) + 40;
      }
    }
  }

  const initialCorners: DocumentCorners = [
    { x: 60, y: 40 },
    { x: 260, y: 40 },
    { x: 260, y: 200 },
    { x: 60, y: 200 },
  ];

  const frame = { canvas: {} as HTMLCanvasElement, width, height, timestamp: 1000 };

  try {
    let currentCorners = initialCorners;
    // Simulate 20 consecutive frames of temporal prior verification
    for (let f = 0; f < 20; f += 1) {
      const verified = verifyTemporalPrior(
        cv,
        frame,
        edges,
        grayscale,
        currentCorners,
        DEFAULT_DOCUMENT_DETECTOR_CONFIG,
        0.85,
      );
      assert.ok(verified !== null, `Frame ${f} should verify intact document`);
      currentCorners = verified.corners;
    }

    // After 20 frames, corners must remain strictly unchanged (zero drift/expansion)
    for (let i = 0; i < 4; i += 1) {
      assert.equal(currentCorners[i].x, initialCorners[i].x, `Corner ${i} x expanded`);
      assert.equal(currentCorners[i].y, initialCorners[i].y, `Corner ${i} y expanded`);
    }
  } finally {
    edges.delete();
    grayscale.delete();
  }
});

