import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateQuadrilateralAspectRatio,
  orderCorners,
  validateQuadrilateral,
  type DocumentCorners,
  type Point,
} from "./geometry.ts";
import {
  DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  scoreDocumentCandidate,
  selectBestCandidate,
} from "./document-detection.ts";
import { createBoundaryEvidence } from "./candidate-evidence.ts";
import {
  createFullFrameCoordinateMapping,
  mapAnalysisPointToCapture,
} from "../capture-processing/coordinate-mapping.ts";
import {
  clampCornersToSourceDimensions,
  isValidPerspectiveQuadrilateral,
} from "../capture-processing/perspective-transform.ts";
import {
  calculateSafeCaptureDimensions,
  MAX_CAPTURE_CANVAS_DIMENSION,
} from "../camera/camera.ts";
import {
  appendScannedPage,
  calculateNextActiveIndexAfterDelete,
  createScannedDocument,
  deleteScannedPage,
  generatePageId,
  replaceScannedPage,
} from "../scanner/document-session.ts";
import type { ScannedPage } from "@/types/document";
import { applyPresetToCanvas } from "../workspace/enhancement-presets.ts";

const frameWidth = 640;
const frameHeight = 480;

function makeCandidate(
  corners: DocumentCorners,
  areaRatio: number,
  averageSupport: number,
  sideSupport: [number, number, number, number],
  strategy: "standard-edge-contour" | "weak-edge-reconstruction" = "standard-edge-contour",
) {
  const boundaryEvidence = createBoundaryEvidence(sideSupport);
  return {
    strategy,
    boundaryEvidence,
    detection: {
      corners,
      confidence: scoreDocumentCandidate(
        {
          corners,
          metrics: {
            area: areaRatio * frameWidth * frameHeight,
            areaRatio,
            angleScore: 0.95,
            edgeConsistency: 0.9,
            boundaryScore: 0.9,
          },
        },
        DEFAULT_DOCUMENT_DETECTOR_CONFIG.targetAreaRatio,
        boundaryEvidence,
      ),
      areaRatio,
      edgeSupport: averageSupport,
      geometryScore: 0.92,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. REPEATED SESSION LIFECYCLE & OBJECT URL CLEANUP
// ---------------------------------------------------------------------------

test("repeated cycle: capture → edit → save → retake → delete → capture maintains state & URL integrity", () => {
  // Simulate tracked active URLs set (as implemented in useDocumentSession)
  const activeUrls = new Set<string>();
  const createMockUrl = (name: string) => {
    const url = `blob:http://localhost:3000/${name}_${Date.now()}_${Math.random()}`;
    activeUrls.add(url);
    return url;
  };
  const revokeMockUrl = (url: string) => {
    activeUrls.delete(url);
  };

  let document = createScannedDocument();
  assert.equal(document.pages.length, 0);

  // Step 1: Capture Page 1
  const page1Url = createMockUrl("p1");
  const page1: ScannedPage = {
    id: generatePageId(),
    pageNumber: 1,
    imageBlob: new Blob(["p1"], { type: "image/jpeg" }),
    previewUrl: page1Url,
    correctionFallback: false,
    createdAt: Date.now(),
  };
  document = { ...document, pages: appendScannedPage(document.pages, page1) };
  assert.equal(document.pages.length, 1);
  assert.equal(activeUrls.size, 1);
  assert.equal(document.pages[0].pageNumber, 1);

  // Step 2: Capture Page 2
  const page2Url = createMockUrl("p2");
  const page2: ScannedPage = {
    id: generatePageId(),
    pageNumber: 2,
    imageBlob: new Blob(["p2"], { type: "image/jpeg" }),
    previewUrl: page2Url,
    correctionFallback: false,
    createdAt: Date.now(),
  };
  document = { ...document, pages: appendScannedPage(document.pages, page2) };
  assert.equal(document.pages.length, 2);
  assert.equal(activeUrls.size, 2);
  assert.equal(document.pages[1].pageNumber, 2);

  // Step 3: Retake Page 2 (Replace with new scan)
  revokeMockUrl(document.pages[1].previewUrl); // old page 2 revoked
  const page2ReplacementUrl = createMockUrl("p2_replacement");
  const page2Replaced: ScannedPage = {
    id: page2.id,
    pageNumber: 2,
    imageBlob: new Blob(["p2_replacement"], { type: "image/jpeg" }),
    previewUrl: page2ReplacementUrl,
    correctionFallback: false,
    createdAt: Date.now(),
  };
  document = {
    ...document,
    pages: replaceScannedPage(document.pages, page2.id, page2Replaced),
  };
  assert.equal(document.pages.length, 2);
  assert.equal(activeUrls.size, 2); // 1 for p1, 1 for p2 replacement
  assert.equal(activeUrls.has(page2Url), false); // old URL revoked!
  assert.equal(activeUrls.has(page2ReplacementUrl), true);

  // Step 4: Delete Page 1
  const pageToDelete = document.pages[0];
  revokeMockUrl(pageToDelete.previewUrl);
  document = {
    ...document,
    pages: deleteScannedPage(document.pages, pageToDelete.id),
  };
  assert.equal(document.pages.length, 1);
  assert.equal(activeUrls.size, 1);
  assert.equal(activeUrls.has(page1Url), false); // p1 URL revoked!
  assert.equal(document.pages[0].pageNumber, 1); // remaining page renumbered to 1!

  // Next active index after deleting first of 2 pages
  const nextIdx = calculateNextActiveIndexAfterDelete(0, document.pages.length);
  assert.equal(nextIdx, 0);

  // Step 5: Capture Page 3 (which becomes page 2)
  const page3Url = createMockUrl("p3");
  const page3: ScannedPage = {
    id: generatePageId(),
    pageNumber: document.pages.length + 1,
    imageBlob: new Blob(["p3"], { type: "image/jpeg" }),
    previewUrl: page3Url,
    correctionFallback: false,
    createdAt: Date.now(),
  };
  document = { ...document, pages: appendScannedPage(document.pages, page3) };
  assert.equal(document.pages.length, 2);
  assert.equal(document.pages[0].pageNumber, 1);
  assert.equal(document.pages[1].pageNumber, 2);
  assert.equal(activeUrls.size, 2);

  // Step 6: Session Reset (revokes all remaining URLs)
  activeUrls.forEach((url) => revokeMockUrl(url));
  assert.equal(activeUrls.size, 0);
});

// ---------------------------------------------------------------------------
// 2. DOCUMENT DETECTION: PASSPORT & OPEN SPREAD ROBUSTNESS
// ---------------------------------------------------------------------------

test("open passport spread enclosing internal MRZ and photo: open spread wins", () => {
  // Full open passport spread covering 45% of frame
  const openSpreadCorners: DocumentCorners = orderCorners([
    { x: 100, y: 80 },
    { x: 540, y: 80 },
    { x: 540, y: 400 },
    { x: 100, y: 400 },
  ]);

  // Internal MRZ strip on right page (aspect ratio 4:1)
  const mrzCorners: DocumentCorners = orderCorners([
    { x: 330, y: 340 },
    { x: 525, y: 340 },
    { x: 525, y: 390 },
    { x: 330, y: 390 },
  ]);

  // Internal photo on right page
  const photoCorners: DocumentCorners = orderCorners([
    { x: 340, y: 120 },
    { x: 440, y: 120 },
    { x: 440, y: 250 },
    { x: 340, y: 250 },
  ]);

  const openSpreadCandidate = makeCandidate(
    openSpreadCorners,
    0.45,
    0.58,
    [0.60, 0.58, 0.55, 0.52],
    "weak-edge-reconstruction",
  );
  const mrzCandidate = makeCandidate(
    mrzCorners,
    0.03,
    0.85,
    [0.92, 0.90, 0.88, 0.88],
  );
  const photoCandidate = makeCandidate(
    photoCorners,
    0.06,
    0.82,
    [0.88, 0.85, 0.82, 0.82],
  );

  const winner = selectBestCandidate([
    mrzCandidate,
    photoCandidate,
    openSpreadCandidate,
  ]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, openSpreadCorners);
});

test("single passport page with internal MRZ: single page wins", () => {
  const singlePassportPage: DocumentCorners = orderCorners([
    { x: 320, y: 80 },
    { x: 530, y: 85 },
    { x: 525, y: 410 },
    { x: 315, y: 405 },
  ]);

  const mrzBlock: DocumentCorners = orderCorners([
    { x: 335, y: 345 },
    { x: 515, y: 345 },
    { x: 515, y: 395 },
    { x: 335, y: 395 },
  ]);

  const outerPage = makeCandidate(
    singlePassportPage,
    0.21,
    0.62,
    [0.62, 0.60, 0.58, 0.54],
  );
  const innerMrz = makeCandidate(
    mrzBlock,
    0.03,
    0.88,
    [0.95, 0.92, 0.90, 0.90],
  );

  const winner = selectBestCandidate([innerMrz, outerPage]);
  assert.ok(winner);
  assert.deepEqual(winner.detection.corners, singlePassportPage);
});

// ---------------------------------------------------------------------------
// 3. BARCODE & EXTREME ASPECT RATIO FILTERING
// ---------------------------------------------------------------------------

test("calculates quadrilateral aspect ratio accurately", () => {
  // A4 ratio (1.414:1)
  const a4Ratio = calculateQuadrilateralAspectRatio([297, 210, 297, 210]);
  assert.ok(Math.abs(a4Ratio - 1.414) < 0.01);

  // Credit card ratio (1.586:1)
  const cardRatio = calculateQuadrilateralAspectRatio([85.6, 53.98, 85.6, 53.98]);
  assert.ok(Math.abs(cardRatio - 1.586) < 0.01);

  // Long receipt ratio (3.0:1)
  const receiptRatio = calculateQuadrilateralAspectRatio([300, 100, 300, 100]);
  assert.equal(receiptRatio, 3.0);

  // Barcode / MRZ strip ratio (6.0:1)
  const barcodeRatio = calculateQuadrilateralAspectRatio([300, 50, 300, 50]);
  assert.equal(barcodeRatio, 6.0);
});

test("rejects standalone extreme aspect ratio quads (> 4.5:1) typical of barcodes", () => {
  // Construct a thin 300px × 40px rectangle (7.5:1 aspect ratio)
  const barcodeQuad: Point[] = [
    { x: 100, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 240 },
    { x: 100, y: 240 },
  ];

  const result = validateQuadrilateral(
    barcodeQuad,
    frameWidth,
    frameHeight,
    DEFAULT_DOCUMENT_DETECTOR_CONFIG,
  );
  assert.equal(result, null);
});

test("preserves valid documents: cards, passports, A4, receipts", () => {
  // ID-1 Card (approx 340 × 215 in 640×480 frame, ~1.58:1)
  const idCard: Point[] = [
    { x: 150, y: 130 },
    { x: 490, y: 130 },
    { x: 490, y: 345 },
    { x: 150, y: 345 },
  ];
  assert.ok(
    validateQuadrilateral(
      idCard,
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
  );

  // Passport page (approx 240 × 340, ~1.42:1)
  const passportPage: Point[] = [
    { x: 200, y: 70 },
    { x: 440, y: 70 },
    { x: 440, y: 410 },
    { x: 200, y: 410 },
  ];
  assert.ok(
    validateQuadrilateral(
      passportPage,
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
  );

  // Moderate receipt (approx 100 × 320, ~3.2:1)
  const receipt: Point[] = [
    { x: 270, y: 80 },
    { x: 370, y: 80 },
    { x: 370, y: 400 },
    { x: 270, y: 400 },
  ];
  assert.ok(
    validateQuadrilateral(
      receipt,
      frameWidth,
      frameHeight,
      DEFAULT_DOCUMENT_DETECTOR_CONFIG,
    ),
  );
});

// ---------------------------------------------------------------------------
// 4. COORDINATE MAPPING & PERSPECTIVE SAFETY
// ---------------------------------------------------------------------------

test("mapAnalysisPointToCapture safely handles micro-epsilon floating point values", () => {
  const mapping = createFullFrameCoordinateMapping(
    { width: 640, height: 480 },
    { width: 1920, height: 1440 },
    { width: 1920, height: 1440 },
  );

  // Slightly negative micro-epsilon float from sub-pixel refinement
  const microNegative = mapAnalysisPointToCapture(
    { x: -0.00005, y: 100 },
    mapping,
  );
  assert.ok(microNegative);
  assert.equal(microNegative.x, 0); // clamped to 0

  // Grossly out of bounds point
  const wayNegative = mapAnalysisPointToCapture({ x: -5, y: 100 }, mapping);
  assert.equal(wayNegative, null);

  const wayPastMax = mapAnalysisPointToCapture({ x: 650, y: 100 }, mapping);
  assert.equal(wayPastMax, null);
});

test("isValidPerspectiveQuadrilateral safely clamps near-boundary corners", () => {
  const source = { width: 1920, height: 1080 };
  const corners: DocumentCorners = [
    { x: -0.00005, y: 0 },
    { x: 1920.00005, y: 0 },
    { x: 1920, y: 1080 },
    { x: 0, y: 1080 },
  ];

  assert.equal(isValidPerspectiveQuadrilateral(corners, source), true);
  const clamped = clampCornersToSourceDimensions(corners, source);
  assert.equal(clamped[0].x, 0);
  assert.equal(clamped[1].x, 1920);
});

// ---------------------------------------------------------------------------
// 5. IMAGE PROCESSING & MOBILE MEMORY CEILING
// ---------------------------------------------------------------------------

test("calculateSafeCaptureDimensions scales down 4K mobile cameras to 2560px ceiling", () => {
  // 4K Ultra HD video stream (3840 × 2160)
  const safe4k = calculateSafeCaptureDimensions(3840, 2160, MAX_CAPTURE_CANVAS_DIMENSION);
  assert.equal(Math.max(safe4k.width, safe4k.height), MAX_CAPTURE_CANVAS_DIMENSION);
  assert.equal(safe4k.width, 2560);
  assert.equal(safe4k.height, 1440);

  // Standard 1080p stream (1920 × 1080) stays unchanged
  const safe1080p = calculateSafeCaptureDimensions(1920, 1080, MAX_CAPTURE_CANVAS_DIMENSION);
  assert.equal(safe1080p.width, 1920);
  assert.equal(safe1080p.height, 1080);
});

test("applyPresetToCanvas gracefully ignores zero-dimension canvas", () => {
  // Construct a dummy canvas with 0 dimensions
  const dummyCanvas = {
    width: 0,
    height: 0,
    getContext: () => null,
  } as unknown as HTMLCanvasElement;

  // Should not throw RangeError or TypeError
  assert.doesNotThrow(() => {
    applyPresetToCanvas(dummyCanvas, "document");
  });
});
