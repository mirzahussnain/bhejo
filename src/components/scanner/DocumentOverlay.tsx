"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import type { DocumentCorners } from "@/lib/detection/geometry";
import {
  mapAnalysisCornersToOverlay,
  type Dimensions,
} from "@/lib/overlay/video-coordinate-mapping";
import type { ScannerState } from "@/lib/scanner/scanner-state";

interface DocumentOverlayProps {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly corners: DocumentCorners | null;
  readonly analysisDimensions: Dimensions | null;
  readonly scannerState: ScannerState;
}

const overlayClassNames: Record<
  Exclude<ScannerState, "capturing" | "preview" | "error" | "searching">,
  string
> = {
  "document-detected": "stroke-sky-200",
  "quality-problem": "stroke-amber-200",
  "hold-still": "stroke-sky-100",
  ready: "stroke-emerald-200",
};

function useOverlayDimensions(videoRef: RefObject<HTMLVideoElement | null>) {
  const [displayDimensions, setDisplayDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const video = videoRef.current;
    const container = video?.parentElement;
    if (!container) {
      return;
    }

    const updateDimensions = () => {
      const { width, height } = container.getBoundingClientRect();
      setDisplayDimensions({ width, height });
    };

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    updateDimensions();

    return () => observer.disconnect();
  }, [videoRef]);

  return displayDimensions;
}

function useVideoDimensions(videoRef: RefObject<HTMLVideoElement | null>) {
  const [videoDimensions, setVideoDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateDimensions = () => {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.addEventListener("loadedmetadata", updateDimensions);
    video.addEventListener("resize", updateDimensions);
    updateDimensions();

    return () => {
      video.removeEventListener("loadedmetadata", updateDimensions);
      video.removeEventListener("resize", updateDimensions);
    };
  }, [videoRef]);

  return videoDimensions;
}

export function DocumentOverlay({
  videoRef,
  corners,
  analysisDimensions,
  scannerState,
}: DocumentOverlayProps) {
  const displayDimensions = useOverlayDimensions(videoRef);
  const videoDimensions = useVideoDimensions(videoRef);
  const mappedCorners = useMemo(() => {
    if (!corners || !analysisDimensions) {
      return null;
    }

    return mapAnalysisCornersToOverlay(
      corners,
      analysisDimensions,
      videoDimensions,
      displayDimensions,
    );
  }, [analysisDimensions, corners, displayDimensions, videoDimensions]);

  if (!mappedCorners || scannerState === "searching") {
    return null;
  }

  const className =
    scannerState === "ready"
      ? overlayClassNames.ready
      : scannerState === "hold-still"
        ? overlayClassNames["hold-still"]
        : scannerState === "quality-problem"
          ? overlayClassNames["quality-problem"]
          : overlayClassNames["document-detected"];
  const points = mappedCorners.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-hidden"
      viewBox={`0 0 ${displayDimensions.width} ${displayDimensions.height}`}
      preserveAspectRatio="none"
    >
      <polygon
        points={points}
        className={`fill-none stroke-[3] [stroke-linejoin:round] ${className}`}
        strokeDasharray={scannerState === "quality-problem" ? "10 7" : undefined}
      />
      {mappedCorners.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={scannerState === "ready" ? 6 : 5}
          className={`fill-slate-950 stroke-[3] ${className}`}
        />
      ))}
    </svg>
  );
}
