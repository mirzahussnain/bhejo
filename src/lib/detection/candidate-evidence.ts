import { distance, type DocumentCorners, type Point } from "./geometry.ts";

export interface EdgeMap {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface GrayscaleMap {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface SideRegionContrast {
  readonly insideMean: number;
  readonly outsideMean: number;
  readonly stepMagnitude: number;
  readonly polarity: number; // +1 if inside is brighter, -1 if outside is brighter, 0 if flat
}

export interface CandidateRegionContrast {
  readonly sideContrast: readonly [
    SideRegionContrast,
    SideRegionContrast,
    SideRegionContrast,
    SideRegionContrast,
  ];
  readonly averageStep: number;
  readonly weakestStep: number;
  readonly polarityConsistency: number; // 0.0 to 1.0
  readonly regionContrastScore: number; // 0.0 to 1.0
}

export interface CandidateBoundaryEvidence {
  readonly sideSupport: readonly [number, number, number, number];
  readonly averageSupport: number;
  readonly weakestSideSupport: number;
  readonly strongSideCount: number;
  readonly regionContrast?: CandidateRegionContrast;
}

export interface CandidateEvidenceConfig {
  readonly samplesPerSide: number;
  readonly edgeSearchRadiusPx: number;
  readonly minimumSideSupport: number;
  readonly minimumAverageSupport: number;
  readonly strongSideSupport: number;
  readonly minimumStrongSideCount: number;
}

export interface RegionContrastConfig {
  readonly samplesPerSide: number;
  readonly normalOffsetMinPx: number;
  readonly normalOffsetMaxPx: number;
  readonly cornerMarginRatio: number;
  readonly minimumSignificantStep: number;
}

export const DEFAULT_CANDIDATE_EVIDENCE_CONFIG: CandidateEvidenceConfig = {
  samplesPerSide: 18,
  edgeSearchRadiusPx: 3,
  minimumSideSupport: 0.12,
  minimumAverageSupport: 0.38,
  strongSideSupport: 0.32,
  minimumStrongSideCount: 3,
};

export const DEFAULT_REGION_CONTRAST_CONFIG: RegionContrastConfig = {
  samplesPerSide: 14,
  normalOffsetMinPx: 3,
  normalOffsetMaxPx: 6,
  cornerMarginRatio: 0.10,
  minimumSignificantStep: 6,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hasNearbyEdge(
  edgeMap: EdgeMap,
  point: Point,
  radius: number,
): boolean {
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    const y = centerY + offsetY;
    if (y < 0 || y >= edgeMap.height) {
      continue;
    }

    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const x = centerX + offsetX;
      if (x < 0 || x >= edgeMap.width) {
        continue;
      }

      if (edgeMap.data[y * edgeMap.width + x] > 0) {
        return true;
      }
    }
  }

  return false;
}

function measureSideSupport(
  edgeMap: EdgeMap,
  start: Point,
  end: Point,
  config: CandidateEvidenceConfig,
): number {
  if (distance(start, end) === 0 || config.samplesPerSide < 1) {
    return 0;
  }

  let supportedSamples = 0;
  for (let index = 0; index < config.samplesPerSide; index += 1) {
    // Excluding the exact corners prevents one strong corner from supporting two sides.
    const progress = (index + 1) / (config.samplesPerSide + 1);
    const point = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    if (hasNearbyEdge(edgeMap, point, config.edgeSearchRadiusPx)) {
      supportedSamples += 1;
    }
  }

  return supportedSamples / config.samplesPerSide;
}

/**
 * Measures normal-profile region contrast across a single side of a candidate.
 * Evaluates the step difference between inside pixels and outside pixels.
 */
function measureSideRegionContrast(
  grayMap: GrayscaleMap,
  start: Point,
  end: Point,
  centroid: Point,
  config: RegionContrastConfig,
): SideRegionContrast {
  const sideLength = distance(start, end);
  if (sideLength < 5 || config.samplesPerSide < 1) {
    return { insideMean: 0, outsideMean: 0, stepMagnitude: 0, polarity: 0 };
  }

  const u = {
    x: (end.x - start.x) / sideLength,
    y: (end.y - start.y) / sideLength,
  };

  // Normal vector pointing outward (away from centroid)
  const n0 = { x: -u.y, y: u.x };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const outward = { x: mid.x - centroid.x, y: mid.y - centroid.y };
  const dot = n0.x * outward.x + n0.y * outward.y;
  const n = dot < 0 ? { x: -n0.x, y: -n0.y } : n0;

  const margin = sideLength * config.cornerMarginRatio;
  const span = Math.max(1, sideLength - 2 * margin);

  const sampleSteps: number[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let sampleCount = 0;

  for (let s = 0; s < config.samplesPerSide; s += 1) {
    const t = margin + ((s + 0.5) / config.samplesPerSide) * span;
    const px = start.x + t * u.x;
    const py = start.y + t * u.y;

    let inSum = 0;
    let outSum = 0;
    let validOffsets = 0;

    for (let d = config.normalOffsetMinPx; d <= config.normalOffsetMaxPx; d += 1) {
      // Inside point: step away from outward normal (-n)
      const inX = Math.round(px - d * n.x);
      const inY = Math.round(py - d * n.y);
      // Outside point: step along outward normal (+n)
      const outX = Math.round(px + d * n.x);
      const outY = Math.round(py + d * n.y);

      if (
        inX >= 0 &&
        inX < grayMap.width &&
        inY >= 0 &&
        inY < grayMap.height &&
        outX >= 0 &&
        outX < grayMap.width &&
        outY >= 0 &&
        outY < grayMap.height
      ) {
        inSum += grayMap.data[inY * grayMap.width + inX];
        outSum += grayMap.data[outY * grayMap.width + outX];
        validOffsets += 1;
      }
    }

    if (validOffsets > 0) {
      const avgIn = inSum / validOffsets;
      const avgOut = outSum / validOffsets;
      sampleSteps.push(avgIn - avgOut);
      totalIn += avgIn;
      totalOut += avgOut;
      sampleCount += 1;
    }
  }

  if (sampleSteps.length === 0) {
    return { insideMean: 0, outsideMean: 0, stepMagnitude: 0, polarity: 0 };
  }

  // Robust aggregation: trimmed mean (discard top and bottom 15% to ignore wood grain streaks / text spikes)
  sampleSteps.sort((a, b) => a - b);
  const trimCount = Math.floor(sampleSteps.length * 0.15);
  let trimmedSum = 0;
  let trimmedCount = 0;
  for (let i = trimCount; i < sampleSteps.length - trimCount; i += 1) {
    trimmedSum += sampleSteps[i];
    trimmedCount += 1;
  }
  const robustStep = trimmedCount > 0 ? trimmedSum / trimmedCount : sampleSteps[Math.floor(sampleSteps.length / 2)];
  const stepMagnitude = Math.abs(robustStep);

  const polarity =
    stepMagnitude >= config.minimumSignificantStep
      ? robustStep > 0
        ? 1
        : -1
      : 0;

  return {
    insideMean: totalIn / sampleCount,
    outsideMean: totalOut / sampleCount,
    stepMagnitude,
    polarity,
  };
}

/**
 * Evaluates normal-profile region contrast across all 4 sides of a candidate quadrilateral.
 * Pure and independently testable.
 */
export function measureCandidateRegionContrast(
  grayMap: GrayscaleMap,
  corners: DocumentCorners,
  config: RegionContrastConfig = DEFAULT_REGION_CONTRAST_CONFIG,
): CandidateRegionContrast {
  const centroid = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  };

  const sideContrast: [SideRegionContrast, SideRegionContrast, SideRegionContrast, SideRegionContrast] = [
    measureSideRegionContrast(grayMap, corners[0], corners[1], centroid, config),
    measureSideRegionContrast(grayMap, corners[1], corners[2], centroid, config),
    measureSideRegionContrast(grayMap, corners[2], corners[3], centroid, config),
    measureSideRegionContrast(grayMap, corners[3], corners[0], centroid, config),
  ];

  const steps = sideContrast.map((s) => s.stepMagnitude);
  const averageStep = steps.reduce((sum, s) => sum + s, 0) / 4;
  const weakestStep = Math.min(...steps);

  // Measure polarity consistency as supporting evidence (not an absolute gate)
  let posCount = 0;
  let negCount = 0;
  for (const s of sideContrast) {
    if (s.polarity > 0) posCount += 1;
    else if (s.polarity < 0) negCount += 1;
  }
  const dominantCount = Math.max(posCount, negCount);
  const polarityConsistency = dominantCount / 4;

  // Region contrast score: combination of average step, weakest step, and polarity agreement
  const normalizedAvgStep = clamp(averageStep / 28.0, 0, 1);
  const normalizedWeakStep = clamp(weakestStep / 18.0, 0, 1);
  const regionContrastScore = clamp(
    normalizedAvgStep * 0.50 +
      normalizedWeakStep * 0.35 +
      polarityConsistency * 0.15,
    0,
    1,
  );

  return {
    sideContrast,
    averageStep,
    weakestStep,
    polarityConsistency,
    regionContrastScore,
  };
}

export function calculateCandidateBoundaryEvidence(
  edgeMap: EdgeMap,
  corners: DocumentCorners,
  config: CandidateEvidenceConfig = DEFAULT_CANDIDATE_EVIDENCE_CONFIG,
  grayMap?: GrayscaleMap,
  regionConfig?: RegionContrastConfig,
): CandidateBoundaryEvidence {
  const sideSupport: CandidateBoundaryEvidence["sideSupport"] = [
    measureSideSupport(edgeMap, corners[0], corners[1], config),
    measureSideSupport(edgeMap, corners[1], corners[2], config),
    measureSideSupport(edgeMap, corners[2], corners[3], config),
    measureSideSupport(edgeMap, corners[3], corners[0], config),
  ];
  const averageSupport =
    sideSupport.reduce((total, support) => total + support, 0) /
    sideSupport.length;

  const regionContrast = grayMap
    ? measureCandidateRegionContrast(grayMap, corners, regionConfig)
    : undefined;

  return {
    sideSupport,
    averageSupport,
    weakestSideSupport: Math.min(...sideSupport),
    strongSideCount: sideSupport.filter(
      (support) => support >= config.strongSideSupport,
    ).length,
    regionContrast,
  };
}

export function hasBalancedBoundaryEvidence(
  evidence: CandidateBoundaryEvidence,
  config: Pick<
    CandidateEvidenceConfig,
    | "minimumSideSupport"
    | "minimumAverageSupport"
    | "minimumStrongSideCount"
    | "strongSideSupport"
  > = DEFAULT_CANDIDATE_EVIDENCE_CONFIG,
): boolean {
  // If region contrast is available, use additive evidence fusion:
  // A side with soft shadow or low binary Canny edges can be supported if it exhibits
  // verified physical region contrast step across the boundary.
  if (evidence.regionContrast) {
    const rc = evidence.regionContrast;
    const strongThreshold = config.strongSideSupport ?? DEFAULT_CANDIDATE_EVIDENCE_CONFIG.strongSideSupport;

    const effectiveSupport = evidence.sideSupport.map((cannySupp, idx) => {
      const step = rc.sideContrast[idx].stepMagnitude;
      // Additive bonus: up to +0.45 support if physical region step is strong (>= 15)
      const rcBonus = clamp(step / 30.0, 0, 0.45);
      return Math.max(cannySupp, rcBonus);
    });

    const effectiveWeakest = Math.min(...effectiveSupport);
    const effectiveAverage =
      effectiveSupport.reduce((sum, s) => sum + s, 0) / 4;
    const effectiveStrongCount = effectiveSupport.filter(
      (s) => s >= strongThreshold,
    ).length;

    return (
      effectiveWeakest >= config.minimumSideSupport &&
      effectiveAverage >= config.minimumAverageSupport &&
      effectiveStrongCount >= config.minimumStrongSideCount
    );
  }

  return (
    evidence.weakestSideSupport >= config.minimumSideSupport &&
    evidence.averageSupport >= config.minimumAverageSupport &&
    evidence.strongSideCount >= config.minimumStrongSideCount
  );
}

export function createBoundaryEvidence(
  sideSupport: readonly [number, number, number, number],
  strongSideSupport = DEFAULT_CANDIDATE_EVIDENCE_CONFIG.strongSideSupport,
  regionContrast?: CandidateRegionContrast,
): CandidateBoundaryEvidence {
  const normalized: CandidateBoundaryEvidence["sideSupport"] = [
    clamp(sideSupport[0], 0, 1),
    clamp(sideSupport[1], 0, 1),
    clamp(sideSupport[2], 0, 1),
    clamp(sideSupport[3], 0, 1),
  ];
  return {
    sideSupport: normalized,
    averageSupport:
      normalized.reduce((total, support) => total + support, 0) /
      normalized.length,
    weakestSideSupport: Math.min(...normalized),
    strongSideCount: normalized.filter((support) => support >= strongSideSupport)
      .length,
    regionContrast,
  };
}

