/**
 * Bounded rolling buffer of recent high-quality video frames.
 * Used for instant, zero-latency fallback if ImageCapture fails the quality gate or times out.
 * Strictly limits memory by retaining at most 2 candidate frames and releasing canvas buffers eagerly.
 */

export interface BufferedVideoFrame {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
  readonly confidence: number;
  readonly sharpness: number;
}

export class RecentFrameBuffer {
  private readonly maxFrames: number;
  private frames: BufferedVideoFrame[] = [];

  constructor(maxFrames: number = 2) {
    this.maxFrames = Math.max(1, maxFrames);
  }

  /**
   * Records a candidate video frame if it passes minimum confidence.
   * Keeps only the best 2 frames, immediately freeing any replaced canvas.
   */
  recordFrame(
    video: HTMLVideoElement,
    confidence: number,
    timestamp: number,
  ): void {
    if (!video.videoWidth || !video.videoHeight || confidence < 0.35) {
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    // Fast sharpness estimate using center patch
    const patchW = Math.min(240, width);
    const patchH = Math.min(240, height);
    const startX = Math.round((width - patchW) / 2);
    const startY = Math.round((height - patchH) / 2);
    const imgData = ctx.getImageData(startX, startY, patchW, patchH);
    const d = imgData.data;

    let lapSumSq = 0;
    let lapCount = 0;
    for (let y = 1; y < patchH - 1; y += 2) {
      for (let x = 1; x < patchW - 1; x += 2) {
        const c = d[(y * patchW + x) * 4];
        const l = d[(y * patchW + x - 1) * 4];
        const r = d[(y * patchW + x + 1) * 4];
        const u = d[((y - 1) * patchW + x) * 4];
        const b = d[((y + 1) * patchW + x) * 4];
        const lap = l + r + u + b - 4 * c;
        lapSumSq += lap * lap;
        lapCount++;
      }
    }
    const sharpness = lapCount > 0 ? lapSumSq / lapCount : 0;

    const newCandidate: BufferedVideoFrame = {
      canvas,
      width,
      height,
      timestamp,
      confidence,
      sharpness,
    };

    if (this.frames.length < this.maxFrames) {
      this.frames.push(newCandidate);
      return;
    }

    // Evaluate existing frames vs new candidate: score = confidence * 0.5 + Math.log(sharpness + 1) * 0.5
    const scoreCandidate = (f: BufferedVideoFrame) =>
      f.confidence * 50 + Math.min(50, Math.sqrt(f.sharpness) * 2);

    let lowestIdx = 0;
    let lowestScore = scoreCandidate(this.frames[0]);

    for (let i = 1; i < this.frames.length; i++) {
      const s = scoreCandidate(this.frames[i]);
      if (s < lowestScore) {
        lowestScore = s;
        lowestIdx = i;
      }
    }

    const newScore = scoreCandidate(newCandidate);
    if (newScore > lowestScore) {
      // Free old canvas memory immediately
      const discarded = this.frames[lowestIdx];
      discarded.canvas.width = 0;
      discarded.canvas.height = 0;
      this.frames[lowestIdx] = newCandidate;
    } else {
      // Discard new candidate
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  /**
   * Retrieves the best recent video frame, if any.
   */
  getBestFrame(): BufferedVideoFrame | null {
    if (this.frames.length === 0) {
      return null;
    }

    const scoreCandidate = (f: BufferedVideoFrame) =>
      f.confidence * 50 + Math.min(50, Math.sqrt(f.sharpness) * 2);

    return this.frames.reduce((best, cur) =>
      scoreCandidate(cur) > scoreCandidate(best) ? cur : best,
    );
  }

  /**
   * Releases all stored canvas memory immediately.
   */
  releaseAll(): void {
    for (const f of this.frames) {
      f.canvas.width = 0;
      f.canvas.height = 0;
    }
    this.frames = [];
  }
}
