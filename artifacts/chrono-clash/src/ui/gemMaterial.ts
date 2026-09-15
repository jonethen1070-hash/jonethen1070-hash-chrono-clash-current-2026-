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
        v *= 1 + (0.26 * planeLam + 0.1 * alt) * crown;
        const crease = Math.abs(slot - index - 0.5) * 2; // 0 mid-plane, 1 on crease
        v *= 1 - 0.24 * smoothstep(0.74, 1, crease) * crown;
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

/**
 * Fast-play color identity for the isolated 3×2 atlas.
 *
 * Live path: ATLAS_ARTWORK_FAITHFUL 1:1 blit of this keyed sheet. The first
 * grade mixed BODY pixels only and skipped bright facets, so blue kept
 * violet/magenta glints, purple kept cyan/blue glints, and green kept cyan
 * veins. This pass also retints contaminated highlights toward each gem's
 * identity hue. Neutral white/silver gloss (low sat, high value) is left
 * alone so bezels and sparkles stay metallic.
 *
 * Cell index matches the isolated sheet (same layout as GEM_ORDER):
 *   0 cyan, 1 green, 2 gold, 3 purple, 4 inverted-triangle (now crimson), 5 blue
 */
const ATLAS_CELL_COLOR = [6, 3, 2, 5, 1, 4] as const;
/** Crimson/ruby identity for the inverted-triangle gem (was magenta/pink). */
const CRIMSON_RED_HUE = 0.994; // ~357.8° — deep red, not orange (~20°) and not pink (~330°)
const GEM_BODY_HUE = [
  CRIMSON_RED_HUE, // inverted triangle: magenta/pink → crimson/ruby red
  -1, // gold
  0.375, // green ~135° emerald
  0.622, // blue ~224° rich royal/electric (away from cyan 185° and violet 291°)
  0.808, // purple ~291° violet (away from blue 221° and cyan 185°)
  0.514, // cyan ~185° aqua
] as const;
const GEM_HUE_MIX = [0.94, 0, 0.58, 0.7, 0.52, 0.38] as const;

function extraPull(colorIndex: number, hueDeg: number): number {
  switch (colorIndex) {
    case 1: // triangle: strip remaining magenta/pink/purple; reject orange
      if (hueDeg > 240 && hueDeg < 352) return 0.96;
      if (hueDeg > 8 && hueDeg < 55) return 0.78;
      return 0;
    case 3: // green: cyan/teal/white-cyan highlights must become green
      return hueDeg > 155 && hueDeg < 220 ? 0.72 : 0;
    case 4: // blue: indigo/violet/magenta or too-cyan highlights must become blue
      if (hueDeg > 228 && hueDeg < 345) return 0.88;
      if (hueDeg < 205) return 0.48;
      return 0;
    case 5: // purple: cyan/blue/indigo highlights must become violet
      return hueDeg < 272 ? 0.78 : 0;
    case 6: // cyan: keep aqua, pull green-leaning or royal-blue drift
      if (hueDeg < 168) return 0.42;
      if (hueDeg > 208) return 0.4;
      return 0;
    default:
      return 0;
  }
}

function writeHsv(px: Uint8ClampedArray, o: number, hue: number, sat: number, v: number): void {
  const hs = hue * 6;
  const hi = Math.floor(hs) % 6;
  const f = hs - Math.floor(hs);
  const p = v * (1 - sat);
  const q = v * (1 - f * sat);
  const t = v * (1 - (1 - f) * sat);
  let r = v;
  let g = t;
  let b = p;
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

export function gradeIsolatedAtlasColors(data: ImageData, cell = 256, cols = 3): void {
  const { width, data: px } = data;
  const cells = ATLAS_CELL_COLOR.length;
  for (let idx = 0; idx < cells; idx++) {
    const colorIndex = ATLAS_CELL_COLOR[idx]!;
    const target = GEM_BODY_HUE[colorIndex - 1] ?? -1;
    const mix = GEM_HUE_MIX[colorIndex - 1] ?? 0;
    if (target < 0 || mix <= 0) continue;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x0 = col * cell;
    const y0 = row * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const o = ((y0 + y) * width + (x0 + x)) * 4;
        const a = px[o + 3] ?? 0;
        if (a < 16) continue;
        const r = (px[o] ?? 0) / 255;
        const g = (px[o + 1] ?? 0) / 255;
        const b = (px[o + 2] ?? 0) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const v = max;
        const sat = max > 0.001 ? delta / max : 0;
        if (v < 0.1) continue;

        let hue = 0;
        if (delta > 0.001) {
          if (max === r) hue = (((g - b) / delta) % 6 + 6) % 6;
          else if (max === g) hue = (b - r) / delta + 2;
          else hue = (r - g) / delta + 4;
          hue /= 6;
        }

        const hueDeg = hue * 360;
        const pull = extraPull(colorIndex, hueDeg);
        // Blue square: icy white cores are tinted (sat 0.08–0.45, high value),
        // not metal. Retint those; skip only near-neutral bezel sparkle.
        const blueBloom =
          colorIndex === 4 && v > 0.62 && sat < 0.45 && hueDeg > 185 && hueDeg < 265;
        if (!blueBloom) {
          if (pull <= 0 && (sat < 0.16 || (sat < 0.22 && v > 0.84))) continue;
          if (pull > 0 && sat < 0.08) continue;
        } else if (sat < 0.05) {
          continue;
        }

        const body = smoothstep(0.16, 0.42, sat);
        const k = Math.min(1, mix * body + pull * smoothstep(0.12, 0.4, sat));
        if (k < 0.03 && !blueBloom) continue;
        hue = mixHue(hue, target, blueBloom ? Math.max(k, 0.55) : k);

        let outSat = sat;
        let outV = v;
        if (colorIndex === 1 && sat > 0.18) outSat = Math.min(1, sat * 1.14);
        if (colorIndex === 3 && sat > 0.22) outSat = Math.min(1, sat * 1.08);
        if (colorIndex === 5 && sat > 0.22) outSat = Math.min(1, sat * 1.06);
        if (colorIndex === 4) {
          if (sat > 0.16) outSat = Math.min(1, sat * 1.24);
          if (v > 0.7 && sat < 0.58) {
            const bloom = smoothstep(0.7, 0.96, v) * (1 - smoothstep(0.26, 0.58, sat));
            outV = v * (1 - 0.24 * bloom);
            outSat = Math.min(1, outSat + 0.22 * bloom);
          } else if (sat > 0.28) {
            outV = v * 0.93;
          }
        }
        writeHsv(px, o, hue, outSat, outV);
      }
    }
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
