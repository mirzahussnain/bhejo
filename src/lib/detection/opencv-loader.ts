import type { OpenCV } from "@opencvjs/web";

let openCvPromise: Promise<typeof OpenCV> | null = null;

export function loadOpenCv(): Promise<typeof OpenCV> {
  if (!openCvPromise) {
    openCvPromise = import("@opencvjs/web")
      .then(({ loadOpenCV }) => loadOpenCV())
      .catch((error: unknown) => {
        openCvPromise = null;
        throw error;
      });
  }

  return openCvPromise;
}
