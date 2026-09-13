/** GameUI 3×2 gem sheet. Presentation only — does not change COLORS or match rules. */

export const GEM_ATLAS_URL = "/assets/chrono-clash-gems.png";
export const GEM_ORDER = [4, 2, 1, 5, 3, 0] as const;
export const GEM_CELL = 256;
export const GEM_COLS = 3;
export const GEM_ATLAS_SIZE = 768;

let atlas: HTMLCanvasElement | null = null;
let loading = false;
let failed = false;

export function prefetchGemAtlas(): void {
  void gemAtlasCanvas();
}

export function gemAtlasCanvas(): HTMLCanvasElement | null {
  if (atlas) return atlas;
  if (!failed && !loading) beginLoad();
  return atlas;
}

export function gemCellOrigin(colorIndex: number): { sx: number; sy: number } {
  const cell = GEM_ORDER[colorIndex - 1] ?? 0;
  return { sx: (cell % GEM_COLS) * GEM_CELL, sy: Math.floor(cell / GEM_COLS) * GEM_CELL };
}

function beginLoad(): void {
  if (typeof Image === "undefined") {
    failed = true;
    return;
  }
  loading = true;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (img.naturalWidth !== GEM_ATLAS_SIZE || img.naturalHeight !== GEM_ATLAS_SIZE) {
      failed = true;
      loading = false;
      return;
    }
    const keyed = applyBlackKey(img);
    if (!keyed) failed = true;
    else atlas = keyed;
    loading = false;
  };
  img.onerror = () => {
    failed = true;
    loading = false;
  };
  img.src = GEM_ATLAS_URL;
}

function applyBlackKey(img: HTMLImageElement): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = GEM_ATLAS_SIZE;
  canvas.height = GEM_ATLAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  try {
    const data = ctx.getImageData(0, 0, GEM_ATLAS_SIZE, GEM_ATLAS_SIZE);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] ?? 0;
      const g = px[i + 1] ?? 0;
      const b = px[i + 2] ?? 0;
      const a = px[i + 3] ?? 0;
      const lum = (r + g + b) / 3;
      if (lum < 18) px[i + 3] = 0;
      else if (lum < 36) px[i + 3] = Math.round(a * ((lum - 18) / 18));
    }
    isolateAtlasGems(data);
    ctx.putImageData(data, 0, 0);
  } catch {
    // Android/WebView can reject getImageData; keep the unkeyed sheet so gems still draw.
  }
  return canvas;
}

/**
 * The approved 768 sheet packs six gems that straddle the naive 256-row split.
 * Bottom-row 256 crops therefore contain the gem above plus the intended gem.
 * Keep the six largest keyed blobs and place exactly one, centered, in each cell.
 */
function isolateAtlasGems(data: ImageData): void {
  const { width, height, data: px } = data;
  const n = width * height;
  const seen = new Uint8Array(n);
  const isGem = (i: number): boolean => (px[i * 4 + 3] ?? 0) > 16;
  const comps: { pixels: number[]; sx: number; sy: number }[] = [];

  for (let i = 0; i < n; i++) {
    if (seen[i] || !isGem(i)) continue;
    const pixels: number[] = [];
    let sx = 0;
    let sy = 0;
    const q = [i];
    seen[i] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const p = q[qi]!;
      const x = p % width;
      const y = (p - x) / width;
      pixels.push(p);
      sx += x;
      sy += y;
      if (x > 0 && !seen[p - 1] && isGem(p - 1)) {
        seen[p - 1] = 1;
        q.push(p - 1);
      }
      if (x + 1 < width && !seen[p + 1] && isGem(p + 1)) {
        seen[p + 1] = 1;
        q.push(p + 1);
      }
      if (y > 0 && !seen[p - width] && isGem(p - width)) {
        seen[p - width] = 1;
        q.push(p - width);
      }
      if (y + 1 < height && !seen[p + width] && isGem(p + width)) {
        seen[p + width] = 1;
        q.push(p + width);
      }
    }
    if (pixels.length >= 8000) {
      comps.push({ pixels, sx: sx / pixels.length, sy: sy / pixels.length });
    }
  }

  comps.sort((a, b) => b.pixels.length - a.pixels.length);
  const gems = comps.slice(0, 6);
  if (gems.length < 6) return;
  gems.sort((a, b) => a.sy - b.sy || a.sx - b.sx);
  const top = gems.slice(0, 3).sort((a, b) => a.sx - b.sx);
  const bot = gems.slice(3, 6).sort((a, b) => a.sx - b.sx);
  const ordered = [...top, ...bot];

  const copy = new Uint8ClampedArray(px);
  px.fill(0);

  // Scale each isolated gem to fill most of its 256 cell so crystals read at
  // match-3 size on the board. Same source artwork — presentation crop/fit only.
  const fit = GEM_CELL * 0.995;
  const scratch =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const scratchCtx = scratch?.getContext("2d");

  for (let idx = 0; idx < 6; idx++) {
    const gem = ordered[idx]!;
    const col = idx % GEM_COLS;
    const row = Math.floor(idx / GEM_COLS);
    const x0 = col * GEM_CELL;
    const y0 = row * GEM_CELL;
    const x1 = x0 + GEM_CELL;
    const y1 = y0 + GEM_CELL;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (const p of gem.pixels) {
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const bw = Math.max(1, maxX - minX + 1);
    const bh = Math.max(1, maxY - minY + 1);
    const scale = Math.min(fit / bw, fit / bh);
    const dw = Math.max(1, Math.round(bw * scale));
    const dh = Math.max(1, Math.round(bh * scale));
    const dx = x0 + Math.round((GEM_CELL - dw) / 2);
    const dy = y0 + Math.round((GEM_CELL - dh) / 2);

    if (scratch && scratchCtx) {
      scratch.width = bw;
      scratch.height = bh;
      const src = scratchCtx.createImageData(bw, bh);
      const sp = src.data;
      for (const p of gem.pixels) {
        const x = p % width;
        const y = (p - x) / width;
        const lx = x - minX;
        const ly = y - minY;
        const di = (ly * bw + lx) * 4;
        const si = p * 4;
        sp[di] = copy[si]!;
        sp[di + 1] = copy[si + 1]!;
        sp[di + 2] = copy[si + 2]!;
        sp[di + 3] = copy[si + 3]!;
      }
      scratchCtx.putImageData(src, 0, 0);

      const cellCanvas = document.createElement("canvas");
      cellCanvas.width = GEM_CELL;
      cellCanvas.height = GEM_CELL;
      const cellCtx = cellCanvas.getContext("2d");
      if (!cellCtx) continue;
      cellCtx.imageSmoothingEnabled = true;
      cellCtx.imageSmoothingQuality = "high";
      cellCtx.clearRect(0, 0, GEM_CELL, GEM_CELL);
      cellCtx.drawImage(scratch, 0, 0, bw, bh, dx - x0, dy - y0, dw, dh);
      const out = cellCtx.getImageData(0, 0, GEM_CELL, GEM_CELL).data;
      for (let ly = 0; ly < GEM_CELL; ly++) {
        for (let lx = 0; lx < GEM_CELL; lx++) {
          const si = (ly * GEM_CELL + lx) * 4;
          if ((out[si + 3] ?? 0) < 1) continue;
          const di = ((y0 + ly) * width + (x0 + lx)) * 4;
          px[di] = out[si]!;
          px[di + 1] = out[si + 1]!;
          px[di + 2] = out[si + 2]!;
          px[di + 3] = out[si + 3]!;
        }
      }
      continue;
    }

    // Fallback without DOM canvas: nearest-neighbor scale into the cell.
    const srcCx = (minX + maxX) / 2;
    const srcCy = (minY + maxY) / 2;
    const destCx = x0 + GEM_CELL / 2;
    const destCy = y0 + GEM_CELL / 2;
    for (const p of gem.pixels) {
      const x = p % width;
      const y = (p - x) / width;
      const nx = Math.round(destCx + (x - srcCx) * scale);
      const ny = Math.round(destCy + (y - srcCy) * scale);
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      const di = (ny * width + nx) * 4;
      const si = p * 4;
      px[di] = copy[si]!;
      px[di + 1] = copy[si + 1]!;
      px[di + 2] = copy[si + 2]!;
      px[di + 3] = copy[si + 3]!;
    }
  }
}
