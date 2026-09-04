"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Cropper from "cropperjs";
import type { EnhancementPreset } from "@/types/workspace";

export interface DocumentCropperRef {
  readonly rotateCW: () => void;
  readonly rotateCCW: () => void;
  readonly reset: () => void;
  readonly getCroppedCanvas: () => Promise<HTMLCanvasElement | null>;
  readonly hasCropChanged: () => boolean;
}

export interface DocumentCropperProps {
  readonly imageUrl: string;
  readonly initialRotation?: 0 | 90 | 180 | 270;
  readonly preset?: EnhancementPreset;
  readonly onReady?: () => void;
  readonly onTransformChange?: (rotationDelta: number, isCropActive: boolean) => void;
}

const DOCUMENT_CROPPER_TEMPLATE = `
<cropper-canvas style="height: 100%; width: 100%;">
  <cropper-image rotatable scalable translatable initial-fit="contain"></cropper-image>
  <cropper-shade theme-color="rgba(0, 0, 0, 0.65)"></cropper-shade>
  <cropper-handle action="select" plain></cropper-handle>
  <cropper-selection movable resizable style="outline: 2px solid #ffffff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);">
    <cropper-handle action="move" plain></cropper-handle>
    <cropper-handle action="nw-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="ne-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="se-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="sw-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="n-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="e-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="s-resize" theme-color="#ffffff"></cropper-handle>
    <cropper-handle action="w-resize" theme-color="#ffffff"></cropper-handle>
  </cropper-selection>
</cropper-canvas>
`;

export const DocumentCropper = forwardRef<DocumentCropperRef, DocumentCropperProps>(
  function DocumentCropper({ imageUrl, initialRotation = 0, preset = "original", onReady, onTransformChange }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const cropperRef = useRef<Cropper | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const initialSelectionBounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

    const alignSelectionToImage = () => {
      const instance = cropperRef.current;
      if (!instance) return;
      const canvas = instance.getCropperCanvas();
      const cropperImg = instance.getCropperImage();
      const sel = instance.getCropperSelection();
      if (!canvas || !cropperImg || !sel) return;

      const canvasRect = canvas.getBoundingClientRect();
      const imgRect = cropperImg.getBoundingClientRect();
      const imgX = imgRect.left - canvasRect.left;
      const imgY = imgRect.top - canvasRect.top;
      const imgW = imgRect.width;
      const imgH = imgRect.height;

      if (imgW > 0 && imgH > 0 && typeof sel.$change === "function") {
        sel.$change(imgX, imgY, imgW, imgH);
        initialSelectionBounds.current = {
          x: sel.x,
          y: sel.y,
          width: sel.width,
          height: sel.height,
        };
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        rotateCW: () => {
          const img = cropperRef.current?.getCropperImage();
          if (img && typeof img.$rotate === "function") {
            img.$rotate(Math.PI / 2);
            if (typeof img.$center === "function") {
              img.$center("contain");
            }
            setTimeout(() => {
              alignSelectionToImage();
              onTransformChange?.(90, hasCropChangedInternal());
            }, 40);
          }
        },
        rotateCCW: () => {
          const img = cropperRef.current?.getCropperImage();
          if (img && typeof img.$rotate === "function") {
            img.$rotate(-Math.PI / 2);
            if (typeof img.$center === "function") {
              img.$center("contain");
            }
            setTimeout(() => {
              alignSelectionToImage();
              onTransformChange?.(-90, hasCropChangedInternal());
            }, 40);
          }
        },
        reset: () => {
          const img = cropperRef.current?.getCropperImage();
          const sel = cropperRef.current?.getCropperSelection();
          if (img && typeof img.$resetTransform === "function") {
            img.$resetTransform();
            if (typeof img.$center === "function") {
              img.$center("contain");
            }
          }
          if (sel && typeof sel.$reset === "function") {
            sel.$reset();
          }
          setTimeout(() => {
            alignSelectionToImage();
            onTransformChange?.(0, false);
          }, 40);
        },
        getCroppedCanvas: async () => {
          const sel = cropperRef.current?.getCropperSelection();
          const cropperImg = cropperRef.current?.getCropperImage();
          if (sel && cropperImg && typeof sel.$toCanvas === "function") {
            try {
              // Extract native source dimensions to preserve full sensor resolution
              const imgElement = (cropperImg as unknown as { $image?: HTMLImageElement }).$image;
              if (
                imgElement &&
                imgElement.naturalWidth > 0 &&
                imgElement.naturalHeight > 0
              ) {
                const naturalWidth = imgElement.naturalWidth;
                const naturalHeight = imgElement.naturalHeight;
                const imgRect = cropperImg.getBoundingClientRect();

                // Compute scale factor from CSS rendered pixels to native resolution
                const scaleX = naturalWidth / Math.max(1, imgRect.width);
                const scaleY = naturalHeight / Math.max(1, imgRect.height);
                const scale = Math.max(scaleX, scaleY);

                const targetWidth = Math.max(1, Math.round(sel.width * scale));
                const targetHeight = Math.max(1, Math.round(sel.height * scale));

                return await sel.$toCanvas({
                  width: targetWidth,
                  height: targetHeight,
                });
              }

              return await sel.$toCanvas();
            } catch {
              // Fall through to canvas
            }
          }
          const canvas = cropperRef.current?.getCropperCanvas();
          if (canvas && typeof canvas.$toCanvas === "function") {
            try {
              return await canvas.$toCanvas();
            } catch {
              return null;
            }
          }
          return null;
        },
        hasCropChanged: () => hasCropChangedInternal(),
      }),
      [onTransformChange],
    );

    function hasCropChangedInternal(): boolean {
      const sel = cropperRef.current?.getCropperSelection();
      if (!sel || !initialSelectionBounds.current) return false;
      const current = { x: sel.x, y: sel.y, width: sel.width, height: sel.height };
      const init = initialSelectionBounds.current;
      // Allow minor sub-pixel delta
      const delta =
        Math.abs(current.x - init.x) +
        Math.abs(current.y - init.y) +
        Math.abs(current.width - init.width) +
        Math.abs(current.height - init.height);
      return delta > 2;
    }

    useEffect(() => {
      let isCancelled = false;
      setIsLoaded(false);

      if (!imageRef.current) return;

      const imgEl = imageRef.current;
      let instance: Cropper | null = null;

      try {
        instance = new Cropper(imgEl, {
          template: DOCUMENT_CROPPER_TEMPLATE,
          container: containerRef.current || undefined,
        });
        cropperRef.current = instance;

        const cropperImg = instance.getCropperImage();
        if (cropperImg && typeof cropperImg.$ready === "function") {
          void cropperImg.$ready(() => {
            if (isCancelled) return;
            setIsLoaded(true);

            // Apply initial rotation if present
            if (initialRotation !== 0) {
              const rad = (initialRotation * Math.PI) / 180;
              cropperImg.$rotate(rad);
            }

            // Ensure image is centered within canvas
            if (typeof cropperImg.$center === "function") {
              cropperImg.$center("contain");
            }

            // Align the crop selection tightly around the document image
            setTimeout(() => {
              if (isCancelled) return;
              alignSelectionToImage();

              const sel = instance?.getCropperSelection();
              if (sel) {
                // Listen for change events to inform parent of crop activity
                sel.addEventListener("change", () => {
                  onTransformChange?.(0, hasCropChangedInternal());
                });
              }

              onReady?.();
            }, 50);
          });
        }
      } catch {
        // Handle cropper initialization failure gracefully
      }

      return () => {
        isCancelled = true;
        if (instance) {
          try {
            instance.destroy();
          } catch {
            // Ignore teardown error
          }
        }
        cropperRef.current = null;
        initialSelectionBounds.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrl]);

    // Synchronize live visual filter on cropper image when preset changes
    useEffect(() => {
      const cropperImg = cropperRef.current?.getCropperImage();
      if (!cropperImg) return;

      const presetFilterMap: Record<EnhancementPreset, string> = {
        original: "none",
        auto: "contrast(1.12) brightness(1.04) saturate(1.05)",
        document: "contrast(1.35) brightness(1.06)",
        grayscale: "grayscale(100%) contrast(1.2) brightness(1.02)",
      };

      (cropperImg as HTMLElement).style.filter = presetFilterMap[preset];
    }, [preset, isLoaded]);

    return (
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-950/90 select-none touch-none"
      >
        {!isLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-xs">
            <span className="size-8 animate-spin rounded-full border-3 border-slate-400 border-t-white" />
            <span className="mt-3 text-xs font-medium text-slate-200">
              Loading document image…
            </span>
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Document for editing"
          crossOrigin="anonymous"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  },
);
