// Finds the applicant's portrait among the images in a CV (or on a scanned page), telling it apart
// from logos, signatures, QR codes and page scans using only pixels, so it works without AI.

export interface ImageCandidate {
  canvas: HTMLCanvasElement;
  page: number;
  /** Share of the page this image's pixels would cover if drawn at full page size, 0-1. */
  pageCoverage?: number;
}

interface PixelStats {
  skin: number;
  white: number;
  deviation: number;
  isGrey: boolean;
}

function measure(source: CanvasImageSource, width: number, height: number): PixelStats {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  context.drawImage(source, 0, 0, width, height, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);

  let skin = 0;
  let white = 0;
  let sum = 0;
  let squares = 0;
  let saturation = 0;
  const count = size * size;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    if (cb > 77 && cb < 127 && cr > 133 && cr < 173 && r > 60 && r > b) skin += 1;
    if (luma > 240) white += 1;
    sum += luma;
    squares += luma * luma;
    saturation += Math.max(r, g, b) - Math.min(r, g, b);
  }
  const mean = sum / count;
  return {
    skin: skin / count,
    white: white / count,
    deviation: Math.sqrt(Math.max(0, squares / count - mean * mean)),
    isGrey: saturation / count < 12,
  };
}

async function hasFace(canvas: HTMLCanvasElement): Promise<boolean | null> {
  const Detector = (window as unknown as { FaceDetector?: new (o?: object) => { detect(c: unknown): Promise<unknown[]> } }).FaceDetector;
  if (!Detector) return null;
  try {
    const faces = await new Detector({ maxDetectedFaces: 2, fastMode: true }).detect(canvas);
    return faces.length > 0;
  } catch {
    return null;
  }
}

function looksPhotographic(stats: PixelStats): boolean {
  if (stats.white > 0.75 && stats.skin < 0.1) return false;
  if (stats.isGrey) return stats.deviation > 30 && stats.white < 0.7;
  return stats.skin >= 0.04 && stats.deviation > 15;
}

export async function pickBestPhoto(images: ImageCandidate[]): Promise<HTMLCanvasElement | null> {
  let best: { canvas: HTMLCanvasElement; score: number } | null = null;

  for (const image of images) {
    const { width, height } = image.canvas;
    if (width < 64 || height < 64) continue;
    const aspect = height / width;
    if (aspect < 0.55 || aspect > 2.2) continue;
    if ((image.pageCoverage ?? 0) > 0.6) continue;

    const stats = measure(image.canvas, width, height);
    const face = await hasFace(image.canvas);
    if (face === false) continue;
    if (face === null && !looksPhotographic(stats)) continue;

    const aspectFit = 1 - Math.min(1, Math.abs(aspect - 1.25) / 1.25);
    const score =
      (face ? 3 : 0) +
      stats.skin * 2 +
      aspectFit * 0.5 +
      Math.min(1, (width * height) / 250_000) * 0.3 +
      (image.page === 1 ? 0.6 : 0);
    if (!best || score > best.score) best = { canvas: image.canvas, score };
  }
  return best?.canvas ?? null;
}

/** For scanned pages: finds a solid, portrait-shaped block of image among the text. */
export function findPhotoOnPage(page: HTMLCanvasElement): HTMLCanvasElement | null {
  const gridWidth = 120;
  const scale = gridWidth / page.width;
  const gridHeight = Math.max(1, Math.round(page.height * scale));
  const small = document.createElement('canvas');
  small.width = gridWidth;
  small.height = gridHeight;
  const context = small.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(page, 0, 0, gridWidth, gridHeight);
  const { data } = context.getImageData(0, 0, gridWidth, gridHeight);

  const solid = new Uint8Array(gridWidth * gridHeight);
  for (let i = 0; i < solid.length; i += 1) {
    const luma = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    solid[i] = luma < 225 ? 1 : 0;
  }

  // Thin text never survives this: a cell counts only when its whole neighbourhood is filled.
  const dense = new Uint8Array(solid.length);
  for (let y = 1; y < gridHeight - 1; y += 1) {
    for (let x = 1; x < gridWidth - 1; x += 1) {
      let filled = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) filled += solid[(y + dy) * gridWidth + x + dx];
      }
      if (filled >= 8) dense[y * gridWidth + x] = 1;
    }
  }

  const seen = new Uint8Array(dense.length);
  const totalCells = gridWidth * gridHeight;
  let best: { x0: number; y0: number; x1: number; y1: number; score: number } | null = null;

  for (let start = 0; start < dense.length; start += 1) {
    if (!dense[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let area = 0;
    let x0 = gridWidth, x1 = 0, y0 = gridHeight, y1 = 0;
    while (stack.length > 0) {
      const index = stack.pop()!;
      area += 1;
      const x = index % gridWidth;
      const y = Math.floor(index / gridWidth);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const next of [index - 1, index + 1, index - gridWidth, index + gridWidth]) {
        if (next >= 0 && next < dense.length && dense[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const boxArea = width * height;
    const aspect = height / width;
    if (boxArea / totalCells < 0.004 || boxArea / totalCells > 0.2) continue;
    // A cut-out portrait (round frame, light backdrop) fills less of its box than a square photo,
    // so a looser shape is accepted below, but only when a face's skin tone is in it.
    if (aspect < 0.7 || aspect > 1.8 || area / boxArea < 0.45) continue;

    const px = Math.floor((x0 - 1) / scale);
    const py = Math.floor((y0 - 1) / scale);
    const pw = Math.ceil((width + 2) / scale);
    const ph = Math.ceil((height + 2) / scale);
    const crop = document.createElement('canvas');
    crop.width = pw;
    crop.height = ph;
    crop.getContext('2d')!.drawImage(page, px, py, pw, ph, 0, 0, pw, ph);
    const stats = measure(crop, pw, ph);
    if (!looksPhotographic(stats)) continue;
    if (area / boxArea < 0.65 && stats.skin < 0.04) continue;

    const score = boxArea + stats.skin * totalCells * 0.05 + (y0 < gridHeight / 2 ? totalCells * 0.01 : 0);
    if (!best || score > best.score) best = { x0, y0, x1, y1, score };
  }

  if (!best) return null;
  return cropFraction(page, {
    left: Math.max(0, (best.x0 - 1) / gridWidth),
    top: Math.max(0, (best.y0 - 1) / gridHeight),
    right: Math.min(1, (best.x1 + 2) / gridWidth),
    bottom: Math.min(1, (best.y1 + 2) / gridHeight),
  });
}

export function cropFraction(
  source: HTMLCanvasElement,
  box: { left: number; top: number; right: number; bottom: number },
): HTMLCanvasElement {
  const x = Math.round(box.left * source.width);
  const y = Math.round(box.top * source.height);
  const width = Math.max(1, Math.round((box.right - box.left) * source.width));
  const height = Math.max(1, Math.round((box.bottom - box.top) * source.height));
  const crop = document.createElement('canvas');
  crop.width = width;
  crop.height = height;
  crop.getContext('2d')!.drawImage(source, x, y, width, height, 0, 0, width, height);
  return crop;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, maxSide = 640): Promise<Blob | null> {
  const ratio = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * ratio));
  out.height = Math.max(1, Math.round(canvas.height * ratio));
  const context = out.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(canvas, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.88));
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}
