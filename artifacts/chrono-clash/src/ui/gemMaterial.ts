/**
 * Per-pixel crystal material grade for the baked gem sprites.
 *
 * The gem artwork already carries facet geometry, but drawn straight it reads
 * as a flat glowing icon at board scale: facet contrast disappears in the
 * downscale and the flat tint/glow layers desaturate it. This pass grades the
 * baked sprite instead of stacking more paint on top of it:
 *
 *   facet unsharp -> tone contrast -> chroma lock -> bevel volume from the
 *   silhouette coverage field -> radial/lower falloff -> internal core
 *
 * It runs once per cached sprite (colour x size x selected), never per frame.
 */

export interface GemMaterialParams {
  /** Target hue 0..1 from the palette colour, used to lock chroma drift. */
  hue: number;
  /** Target saturation 0..1 from the palette colour. */
  sat: number;
  /** Crown facet planes radiating from the table — two per silhouette edge. */
  facets: number;
  /** Radians offset so the crown planes line up with the silhouette corners. */
  facetPhase: number;
  selected: boolean;
}

const LIGHT_X = -0.52;
const LIGHT_Y = -0.855;

export function applyGemMaterial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  params: GemMaterialParams,
): void {
  const canvas = ctx.canvas;
  const x0 = Math.max(0, Math.floor(cx - s * 0.56));
  const y0 = Math.max(0, Math.floor(cy - s * 0.56));
  const x1 = Math.min(canvas.width, Math.ceil(cx + s * 0.56));
  const y1 = Math.min(canvas.height, Math.ceil(cy + s * 0.56));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < 8) return;

  let frame: ImageData;
  try {
    frame = ctx.getImageData(x0, y0, w, h);
  } catch {
    return; // locked canvas — keep the ungraded sprite
  }
  const px = frame.data;
  const n = w * h;
  const cov = new Float32Array(n);
  const val = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = (px[o + 3] ?? 0) / 255;
    cov[i] = a;
    const r = (px[o] ?? 0) / 255;
    const g = (px[o + 1] ?? 0) / 255;
    const b = (px[o + 2] ?? 0) / 255;
    val[i] = Math.max(r, g, b);
  }

  // Coverage field -> silhouette bevel normals (thickness cue).
  const bevelR = Math.max(2, Math.round(s * 0.055));
  const covBlur = blurField(cov, w, h, bevelR, 2);
  // Luminance field -> facet plane separation (unsharp mask).
  const facetR = Math.max(1, Math.round(s * 0.03));
  const valBlur = blurField(val, w, h, facetR, 1);

  const mx = cx - x0;
  const my = cy - y0;
  const rad = s * 0.5;
  const half = params.selected ? 1 : 0;
  const facets = Math.max(0, Math.round(params.facets));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const a = px[o + 3] ?? 0;
      if (a < 3) continue;

      let r = (px[o] ?? 0) / 255;
      let g = (px[o + 1] ?? 0) / 255;
      let b = (px[o + 2] ?? 0) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      let v = max;
      let sat = max > 0.001 ? delta / max : 0;
      let hue = 0;
      if (delta > 0.001) {
        if (max === r) hue = (((g - b) / delta) % 6 + 6) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue /= 6;
      } else {
        hue = params.hue;
      }

      const specular = v > 0.85 && sat < 0.3;

      const u = (x - mx) / rad;
      const wv = (y - my) / rad;
      const dist = Math.hypot(u, wv + 0.04);
      // Table (flat top) versus crown (the ring of angled planes).
      const crown = smoothstep(0.16, 0.66, dist);

      // 1. Facet planes: sharpen the artwork's plane-to-plane light steps over
      //    the crown, and calm its internal veining over the table so the body
      //    reads as one solid crystal volume instead of translucent noise.
      const vb = valBlur[i] ?? v;
      v = vb + (v - vb) * (0.5 + 1.2 * crown);

      // 2. Tone contrast: darks deeper, lit planes brighter.
      v = 0.5 + (v - 0.47) * 1.26;

      // 3. Bevel volume from the silhouette coverage gradient. The outward
      //    normal catches the key light top-left and falls into shadow bottom-right.
      const gx = (covBlur[i + (x + 1 < w ? 1 : 0)] ?? 0) - (covBlur[i - (x > 0 ? 1 : 0)] ?? 0);
      const gy = (covBlur[i + (y + 1 < h ? w : 0)] ?? 0) - (covBlur[i - (y > 0 ? w : 0)] ?? 0);
      const glen = Math.hypot(gx, gy);
      if (glen > 1e-5) {
        const edge = Math.min(1, glen * bevelR * 1.15);
        const lambert = (-gx / glen) * LIGHT_X + (-gy / glen) * LIGHT_Y;
        if (lambert > 0) v *= 1 + 0.46 * lambert * edge;
        else v *= 1 + 0.62 * lambert * edge;
        sat *= 1 - 0.3 * Math.max(0, lambert) * edge;
      }

      // 4. Crown facets: planes radiating from the table, each catching the key
      //    light at its own angle, with a darker crease on the plane boundary.
      if (facets > 0) {
        const span = (Math.PI * 2) / facets;
        const ang = Math.atan2(wv, u) + Math.PI + params.facetPhase;
        const slot = ang / span;
        const index = Math.floor(slot);
        const mid = (index + 0.5) * span - Math.PI - params.facetPhase;
        const planeLam = Math.cos(mid) * LIGHT_X + Math.sin(mid) * LIGHT_Y;
        const alt = index % 2 === 0 ? 1 : -1;
        v *= 1 + (0.22 * planeLam + 0.075 * alt) * crown;
        const crease = Math.abs(slot - index - 0.5) * 2; // 0 mid-plane, 1 on crease
        v *= 1 - 0.17 * smoothstep(0.82, 1, crease) * crown;
      }

      // 5. Outer and lower falloff: the rim stays darker than the interior.
      v *= 1 - 0.27 * smoothstep(0.44, 1.02, dist);
      v *= 1 - 0.17 * Math.pow(clamp01(wv), 1.25);

      // 6. Internal core, centred slightly above middle. Kept coloured — the
      //    crystal hue has to survive it, so this is a lift, not a white blob.
      const coreD = Math.hypot(u / 0.92, (wv + 0.11) / 0.86);
      const core = Math.exp(-((coreD / (0.23 + half * 0.03)) ** 2));
      // Wide inner charge: the body stays lit between the core and the rim, so
      // the hierarchy reads core -> crystal -> facets -> dark edge.
      v += 0.15 * Math.exp(-((coreD / 0.6) ** 2)) * (0.35 + 0.65 * v);
      v += (0.34 + half * 0.1) * core * (0.34 + 0.66 * v);
      sat *= 1 - 0.2 * clamp01((core - 0.62) / 0.38);

      // 7. Exposure: the stacked shading terms are all subtractive, so lift the
      //    lit planes back to reference brightness without flattening the rim.
      v *= 1.12;

      // 8. Saturated crystal body + palette chroma lock.
      sat = sat * 1.34 + 0.05 * params.sat;
      hue = mixHue(hue, params.hue, 0.45);

      if (specular) {
        // Keep the artwork's crisp facet glints from being graded away.
        v = Math.min(1, max * 1.04 + 0.06 * core);
        sat = Math.min(1, sat * 0.85);
      }

      v = clamp01(v);
      sat = clamp01(sat);

      const hs = hue * 6;
      const hi = Math.floor(hs) % 6;
      const f = hs - Math.floor(hs);
      const p = v * (1 - sat);
      const q = v * (1 - f * sat);
      const t = v * (1 - (1 - f) * sat);
      switch (hi) {
        case 0:
          r = v;
          g = t;
          b = p;
          break;
        case 1:
          r = q;
          g = v;
          b = p;
          break;
        case 2:
          r = p;
          g = v;
          b = t;
          break;
        case 3:
          r = p;
          g = q;
          b = v;
          break;
        case 4:
          r = t;
          g = p;
          b = v;
          break;
        default:
          r = v;
          g = p;
          b = q;
          break;
      }

      px[o] = Math.round(r * 255);
      px[o + 1] = Math.round(g * 255);
      px[o + 2] = Math.round(b * 255);
    }
  }

  ctx.putImageData(frame, x0, y0);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function mixHue(a: number, b: number, k: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1;
  else if (d < -0.5) d += 1;
  let h = a + d * k;
  if (h < 0) h += 1;
  else if (h >= 1) h -= 1;
  return h;
}

function blurField(
  src: Float32Array,
  w: number,
  h: number,
  radius: number,
  passes: number,
): Float32Array {
  const cur = Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    blurH(cur, tmp, w, h, radius);
    blurV(tmp, cur, w, h, radius);
  }
  return cur;
}

function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))] ?? 0;
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * norm;
      acc += (src[row + Math.min(w - 1, x + r + 1)] ?? 0) - (src[row + Math.max(0, x - r)] ?? 0);
    }
  }
}

function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const norm = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[Math.min(h - 1, Math.max(0, k)) * w + x] ?? 0;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * norm;
      acc +=
        (src[Math.min(h - 1, y + r + 1) * w + x] ?? 0) - (src[Math.max(0, y - r) * w + x] ?? 0);
    }
  }
}

/**
 * Crown plane layout per gem silhouette: two planes per silhouette edge, with
 * the plane creases landing on the silhouette corners of `jewelPath`.
 */
export function gemFacetSpec(colorIndex: number): { facets: number; facetPhase: number } {
  const spec = (sides: number, rot: number) => ({
    facets: sides * 2,
    facetPhase: -(rot + Math.PI),
  });
  switch (colorIndex) {
    case 1:
      return spec(3, Math.PI / 2);
    case 2:
      return spec(5, -Math.PI / 2);
    case 3:
      return spec(6, Math.PI / 6);
    case 4:
      return spec(4, Math.PI / 4);
    case 5:
      return spec(4, -Math.PI / 2);
    default:
      return spec(6, 0);
  }
}

/** Palette hex -> hue/saturation for the chroma lock. */
export function hexHueSat(hex: string): { hue: number; sat: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0.001) {
    if (max === r) hue = (((g - b) / delta) % 6 + 6) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
  }
  return { hue, sat: max > 0.001 ? delta / max : 0 };
}
