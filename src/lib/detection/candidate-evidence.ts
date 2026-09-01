import { distance, type DocumentCorners, type Point } from "./geometry.ts";

export interface EdgeMap {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface CandidateBoundaryEvidence {
  readonly sideSupport: readonly [number, number, number, number];
  readonly averageSupport: number;
  readonly weakestSideSupport: number;
  readonly strongSideCount: number;
}

export interface CandidateEvidenceConfig {
  readonly samplesPerSide: number;
  readonly edgeSearchRadiusPx: number;
  readonly minimumSideSupport: number;
  readonly minimumAverageSupport: number;
  readonly strongSideSupport: number;
  readonly minimumStrongSideCount: number;
}

export const DEFAULT_CANDIDATE_EVIDENCE_CONFIG: CandidateEvidenceConfig = {
  samplesPerSide: 18,
  edgeSearchRadiusPx: 2,
  minimumSideSupport: 0.12,
  minimumAverageSupport: 0.38,
  strongSideSupport: 0.32,
  minimumStrongSideCount: 3,
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

export function calculateCandidateBoundaryEvidence(
  edgeMap: EdgeMap,
  corners: DocumentCorners,
  config: CandidateEvidenceConfig = DEFAULT_CANDIDATE_EVIDENCE_CONFIG,
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

  return {
    sideSupport,
    averageSupport,
    weakestSideSupport: Math.min(...sideSupport),
    strongSideCount: sideSupport.filter(
      (support) => support >= config.strongSideSupport,
    ).length,
  };
}

export function hasBalancedBoundaryEvidence(
  evidence: CandidateBoundaryEvidence,
  config: Pick<
    CandidateEvidenceConfig,
    | "minimumSideSupport"
    | "minimumAverageSupport"
    | "minimumStrongSideCount"
  > = DEFAULT_CANDIDATE_EVIDENCE_CONFIG,
): boolean {
  return (
    evidence.weakestSideSupport >= config.minimumSideSupport &&
    evidence.averageSupport >= config.minimumAverageSupport &&
    evidence.strongSideCount >= config.minimumStrongSideCount
  );
}

export function createBoundaryEvidence(
  sideSupport: readonly [number, number, number, number],
  strongSideSupport = DEFAULT_CANDIDATE_EVIDENCE_CONFIG.strongSideSupport,
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
  };
}
