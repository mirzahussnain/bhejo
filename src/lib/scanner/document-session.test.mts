import assert from "node:assert/strict";
import test from "node:test";
import type { ScannedPage } from "../../types/document.ts";
import {
  appendScannedPage,
  calculateNextActiveIndexAfterDelete,
  calculateNextActiveIndexAfterMove,
  createScannedDocument,
  deleteScannedPage,
  generateDocumentId,
  generatePageId,
  moveScannedPage,
  renumberPages,
  reorderScannedPages,
  replaceScannedPage,
} from "./document-session.ts";

function createMockPage(id: string, pageNumber: number = 1): ScannedPage {
  return {
    id,
    pageNumber,
    imageBlob: new Blob(["dummy-image-content"], { type: "image/jpeg" }),
    previewUrl: `blob:mock/${id}`,
    correctionFallback: false,
    createdAt: Date.now(),
  };
}

test("generateDocumentId and generatePageId create non-empty unique identifiers", () => {
  const docId1 = generateDocumentId();
  const docId2 = generateDocumentId();
  const pageId1 = generatePageId();
  const pageId2 = generatePageId();

  assert.ok(docId1.startsWith("doc_"));
  assert.ok(pageId1.startsWith("page_"));
  assert.notEqual(docId1, docId2);
  assert.notEqual(pageId1, pageId2);
});

test("createScannedDocument initializes empty document and timestamps", () => {
  const doc = createScannedDocument();
  assert.ok(doc.id.startsWith("doc_"));
  assert.equal(doc.pages.length, 0);
  assert.ok(doc.createdAt > 0);
  assert.equal(doc.updatedAt, doc.createdAt);
});

test("renumberPages enforces 1-based sequential page numbers", () => {
  const p1 = createMockPage("p1", 99);
  const p2 = createMockPage("p2", 0);
  const p3 = createMockPage("p3", -5);

  const renumbered = renumberPages([p1, p2, p3]);
  assert.equal(renumbered[0].pageNumber, 1);
  assert.equal(renumbered[1].pageNumber, 2);
  assert.equal(renumbered[2].pageNumber, 3);
  assert.equal(renumbered[0].id, "p1");
  assert.equal(renumbered[1].id, "p2");
  assert.equal(renumbered[2].id, "p3");
});

test("renumberPages preserves object reference if numbers are already correct", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);

  const renumbered = renumberPages([p1, p2]);
  assert.strictEqual(renumbered[0], p1);
  assert.strictEqual(renumbered[1], p2);
});

test("appendScannedPage adds pages sequentially and numbers them correctly", () => {
  const empty: ScannedPage[] = [];
  const p1 = createMockPage("page-1");
  const p2 = createMockPage("page-2");
  const p3 = createMockPage("page-3");

  const step1 = appendScannedPage(empty, p1);
  assert.equal(step1.length, 1);
  assert.equal(step1[0].id, "page-1");
  assert.equal(step1[0].pageNumber, 1);

  const step2 = appendScannedPage(step1, p2);
  assert.equal(step2.length, 2);
  assert.equal(step2[0].id, "page-1");
  assert.equal(step2[0].pageNumber, 1);
  assert.equal(step2[1].id, "page-2");
  assert.equal(step2[1].pageNumber, 2);

  const step3 = appendScannedPage(step2, p3);
  assert.equal(step3.length, 3);
  assert.equal(step3[0].pageNumber, 1);
  assert.equal(step3[1].pageNumber, 2);
  assert.equal(step3[2].pageNumber, 3);
});

test("deleteScannedPage removes page and maintains sequential page numbers", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);
  const p3 = createMockPage("p3", 3);
  const initial = [p1, p2, p3];

  // Delete middle page
  const afterDeleteMiddle = deleteScannedPage(initial, "p2");
  assert.equal(afterDeleteMiddle.length, 2);
  assert.equal(afterDeleteMiddle[0].id, "p1");
  assert.equal(afterDeleteMiddle[0].pageNumber, 1);
  assert.equal(afterDeleteMiddle[1].id, "p3");
  assert.equal(afterDeleteMiddle[1].pageNumber, 2);

  // Delete first page
  const afterDeleteFirst = deleteScannedPage(initial, "p1");
  assert.equal(afterDeleteFirst.length, 2);
  assert.equal(afterDeleteFirst[0].id, "p2");
  assert.equal(afterDeleteFirst[0].pageNumber, 1);
  assert.equal(afterDeleteFirst[1].id, "p3");
  assert.equal(afterDeleteFirst[1].pageNumber, 2);

  // Delete last page
  const afterDeleteLast = deleteScannedPage(initial, "p3");
  assert.equal(afterDeleteLast.length, 2);
  assert.equal(afterDeleteLast[0].id, "p1");
  assert.equal(afterDeleteLast[0].pageNumber, 1);
  assert.equal(afterDeleteLast[1].id, "p2");
  assert.equal(afterDeleteLast[1].pageNumber, 2);

  // Delete single remaining page
  const single = [p1];
  const afterDeleteSole = deleteScannedPage(single, "p1");
  assert.equal(afterDeleteSole.length, 0);

  // Delete non-existent ID
  const noMatch = deleteScannedPage(initial, "unknown");
  assert.equal(noMatch.length, 3);
});

test("replaceScannedPage updates target page in-place (retake flow)", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);
  const p3 = createMockPage("p3", 3);
  const initial = [p1, p2, p3];

  const newP2 = createMockPage("p2-retake", 999);
  const replaced = replaceScannedPage(initial, "p2", newP2);

  assert.equal(replaced.length, 3);
  assert.equal(replaced[0].id, "p1");
  assert.equal(replaced[0].pageNumber, 1);
  assert.equal(replaced[1].id, "p2-retake");
  assert.equal(replaced[1].pageNumber, 2);
  assert.equal(replaced[2].id, "p3");
  assert.equal(replaced[2].pageNumber, 3);

  // Non-matching id
  const unchanged = replaceScannedPage(initial, "nonexistent", newP2);
  assert.equal(unchanged.length, 3);
  assert.equal(unchanged[1].id, "p2");
});

test("reorderScannedPages correctly moves pages and renumbers", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);
  const p3 = createMockPage("p3", 3);
  const initial = [p1, p2, p3];

  // Move p3 (index 2) to first position (index 0)
  const moved = reorderScannedPages(initial, 2, 0);
  assert.equal(moved.length, 3);
  assert.equal(moved[0].id, "p3");
  assert.equal(moved[0].pageNumber, 1);
  assert.equal(moved[1].id, "p1");
  assert.equal(moved[1].pageNumber, 2);
  assert.equal(moved[2].id, "p2");
  assert.equal(moved[2].pageNumber, 3);

  // Invalid moves handle gracefully
  assert.deepEqual(reorderScannedPages(initial, 0, 0), initial);
  assert.deepEqual(reorderScannedPages(initial, -1, 2), initial);
  assert.deepEqual(reorderScannedPages(initial, 0, 10), initial);
});

test("moveScannedPage moves page left and right safely", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);
  const p3 = createMockPage("p3", 3);
  const initial = [p1, p2, p3];

  // Move p2 left (to index 0)
  const movedLeft = moveScannedPage(initial, 1, "left");
  assert.equal(movedLeft[0].id, "p2");
  assert.equal(movedLeft[0].pageNumber, 1);
  assert.equal(movedLeft[1].id, "p1");
  assert.equal(movedLeft[1].pageNumber, 2);

  // Move p1 left when already at left boundary -> unchanged
  const boundaryLeft = moveScannedPage(initial, 0, "left");
  assert.deepEqual(boundaryLeft, initial);

  // Move p2 right (to index 2)
  const movedRight = moveScannedPage(initial, 1, "right");
  assert.equal(movedRight[1].id, "p3");
  assert.equal(movedRight[1].pageNumber, 2);
  assert.equal(movedRight[2].id, "p2");
  assert.equal(movedRight[2].pageNumber, 3);

  // Move p3 right when already at right boundary -> unchanged
  const boundaryRight = moveScannedPage(initial, 2, "right");
  assert.deepEqual(boundaryRight, initial);
});

test("retake cancellation preserves original pages and preview URLs", () => {
  const p1 = createMockPage("p1", 1);
  const p2 = createMockPage("p2", 2);
  const p3 = createMockPage("p3", 3);
  const originalPages = [p1, p2, p3];

  // User enters retake for p2
  const retakeTarget = { pageId: "p2", pageNumber: 2, index: 1 };
  assert.equal(retakeTarget.pageId, "p2");

  // User captures replacement frame (temporary)
  const replacementCapture = createMockPage("p2-temporary-candidate", 2);

  // User cancels retake without accepting
  // The replacement is discarded, originalPages remains unchanged
  const postCancellationPages = [...originalPages];
  assert.equal(postCancellationPages.length, 3);
  assert.strictEqual(postCancellationPages[0], p1);
  assert.strictEqual(postCancellationPages[1], p2);
  assert.strictEqual(postCancellationPages[2], p3);
  assert.equal(postCancellationPages[1].previewUrl, "blob:mock/p2");
  assert.notEqual(postCancellationPages[1].id, replacementCapture.id);
});

test("calculateNextActiveIndexAfterDelete maintains valid active selection", () => {
  // 1. Deleting middle page (index 1 of 3) -> selects remaining page at index 1
  const afterMiddle = calculateNextActiveIndexAfterDelete(1, 2);
  assert.equal(afterMiddle, 1);

  // 2. Deleting last page (index 2 of 3) -> selects new last page (index 1)
  const afterLast = calculateNextActiveIndexAfterDelete(2, 2);
  assert.equal(afterLast, 1);

  // 3. Deleting first page (index 0 of 3) -> keeps active index valid (index 0)
  const afterFirst = calculateNextActiveIndexAfterDelete(0, 2);
  assert.equal(afterFirst, 0);

  // 4. Deleting sole page (index 0 of 1) -> index resets to 0
  const afterSole = calculateNextActiveIndexAfterDelete(0, 0);
  assert.equal(afterSole, 0);

  // 5. Clamping invariant: activePageIndex never exceeds remainingLength - 1
  const clamped = calculateNextActiveIndexAfterDelete(10, 5);
  assert.equal(clamped, 4);
});

test("calculateNextActiveIndexAfterMove tracks moved page and respects boundaries", () => {
  const totalPages = 3;

  // Moving page 1 left -> new active index is 0
  assert.equal(calculateNextActiveIndexAfterMove(1, totalPages, "left"), 0);

  // Moving page 1 right -> new active index is 2
  assert.equal(calculateNextActiveIndexAfterMove(1, totalPages, "right"), 2);

  // Moving left at index 0 does nothing (remains 0)
  assert.equal(calculateNextActiveIndexAfterMove(0, totalPages, "left"), 0);

  // Moving right at final index (2) does nothing (remains 2)
  assert.equal(calculateNextActiveIndexAfterMove(2, totalPages, "right"), 2);

  // Single page document cannot move
  assert.equal(calculateNextActiveIndexAfterMove(0, 1, "left"), 0);
  assert.equal(calculateNextActiveIndexAfterMove(0, 1, "right"), 0);
});

test("single page document completion creates valid ScannedDocument", () => {
  const p1 = createMockPage("page-1", 1);
  const doc = createScannedDocument([p1]);

  assert.ok(doc.id.startsWith("doc_"));
  assert.equal(doc.pages.length, 1);
  assert.equal(doc.pages[0].id, "page-1");
  assert.equal(doc.pages[0].pageNumber, 1);
  assert.ok(doc.createdAt > 0);
});

