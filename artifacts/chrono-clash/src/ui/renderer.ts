import { COLORS, COLS, Coord, Intensity, Piece, PieceKind, ROWS } from "../engine/types";
import { DragState, FxEvent, GameSnapshot } from "../engine/session";
import { feelMul, particleBudget } from "./feel";
import { GEM_CELL, gemAtlasCanvas, gemCellOrigin } from "./gemAtlas";
import {
  easeCrystalDie,
  gemDieDuration,
  gemFallDelay,
  gemTravelDuration,
  gemTravelEase,
  liveGemDrawOrigin,
  type GemMoveKind,
} from "./gemMotion";

export const BOARD_GAP = 1.5;
export const BOARD_FRAME = 6;
export { LIVE_GEM_MAX_IN_CELL_DROP, liveGemDrawOrigin } from "./gemMotion";
const GAP = BOARD_GAP;
const FRAME = BOARD_FRAME;
const MATCH_IMPACT_MS = 80;
const GEM_VISUAL_SCALE = 1.06;
const MATCH_STAGGER_MIN_MS = 10;
const MATCH_STAGGER_STEP_MS = 7;
const MATCH_STAGGER_MAX_MS = MATCH_STAGGER_MIN_MS + MATCH_STAGGER_STEP_MS * 2;
const DRAG_FOLLOW = 0.985;
const DRAG_NEIGHBOR_PUSH = 0.18;

export interface RenderFx {
  quality: Intensity;
  animation: Intensity;
  showCombo: boolean;
  tileTheme: string;
  boardTheme: string;
  vfxTheme: string;
  reducedMotion: boolean;
}

interface VisualTile {
  id: number;
  color: number;
  kind: PieceKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  alpha: number;
  dying: boolean;
  flash: number;
  r: number;
  c: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveAge: number;
  moveDur: number;
  moveHold: number;
  moveKind: GemMoveKind | "idle";
  dieAge: number;
  glow: number;
  burstEmitted: boolean;
  breakStrength: number;
  fractureSeed: number;
  dieStaggerMs: number;
  settleAge: number;
  settleDur: number;
  settleX: number;
  settleY: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g?: number;
}

interface Shockwave {
  x: number;
  y: number;
  born: number;
  life: number;
  radius: number;
  color: string;
  width: number;
}

interface CrystalShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface SocketPulse {
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  born: number;
  color: string;
  size: number;
  rise: number;
  life: number;
}

interface Bolt {
  born: number;
  dur: number;
  fromPlayer: boolean;
  combo: number;
  text: string;
  impacted: boolean;
}

export interface RenderTileInspection {
  id: number;
  r: number;
  c: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveAge: number;
  moveDur: number;
  moveKind: GemMoveKind | "idle";
  dying: boolean;
  alpha: number;
  settleAge: number;
  settleDur: number;
}

export interface BoardRenderInspection {
  cell: number;
  tiles: RenderTileInspection[];
  moving: RenderTileInspection[];
  dying: RenderTileInspection[];
  visibleEmptySockets: Coord[];
}

class BoardView {
  tiles = new Map<number, VisualTile>();
  pendingSwapIds = new Set<number>();
  pendingSwapTargets = new Map<number, { x: number; y: number }>();
  pendingSwap: { from: Coord; to: Coord; dx: number; dy: number } | null = null;
  live = new Set<number>();
  particles: Particle[] = [];
  shards: CrystalShard[] = [];
  shockwaves: Shockwave[] = [];
  socketPulses: SocketPulse[] = [];
  floats: FloatText[] = [];
  seenFx = new Set<number>();
  shake = 0;
  flash = 0;

  reset(): void {
    this.tiles.clear();
    this.pendingSwapIds.clear();
    this.pendingSwapTargets.clear();
    this.pendingSwap = null;
    this.live.clear();
    this.particles = [];
    this.shards = [];
    this.shockwaves = [];
    this.socketPulses = [];
    this.floats = [];
    this.seenFx.clear();
    this.shake = 0;
    this.flash = 0;
  }
}

export class BoardRenderer {
  private playerView = new BoardView();
  private oppView = new BoardView();
  private lastScreen = "";
  private invalidUntil = 0;
  private invalidA: Coord | null = null;
  private invalidB: Coord | null = null;
  private bolts: Bolt[] = [];
  private combatFloats: FloatText[] = [];
  private wellCache = new Map<string, HTMLCanvasElement>();
  private gemSprites = new Map<string, HTMLCanvasElement>();
  private particlePool: Particle[] = [];
  private tileScratch: VisualTile[] = [];
  private hintBits = new Uint8Array(ROWS * COLS);
  private lastDpr = 0;
  private lastAnimAt = 0;
  private animDt = 1 / 60;
  private lastPlayerCell = 32;
  private parentLeft = 0;
  private parentTop = 0;
  private playerLayer: CanvasRenderingContext2D | null = null;
  private oppLayer: CanvasRenderingContext2D | null = null;
  private landingImpacts = 0;
  private fx: RenderFx = {
    quality: "high",
    animation: "high",
    showCombo: true,
    tileTheme: "lumen",
    boardTheme: "void",
    vfxTheme: "core",
    reducedMotion: false,
  };

  constructor(private ctx: CanvasRenderingContext2D) {}

  setFx(fx: RenderFx): void {
    if (this.fx.quality !== fx.quality) {
      this.gemSprites.clear();
    }
    this.fx = fx;
  }

  setBoardLayers(player: CanvasRenderingContext2D | null, opp: CanvasRenderingContext2D | null): void {
    this.playerLayer = player;
    this.oppLayer = opp;
    this.invalidateLayout();
  }

  invalidateLayout(): void {
    this.wellCache.clear();
    this.gemSprites.clear();
  }

  flashInvalid(a: Coord, b: Coord, now: number): void {
    this.invalidA = a;
    this.invalidB = b;
    this.invalidUntil = now + 220;
    this.playerView.shake = Math.max(this.playerView.shake, 5);
  }

  flashSelect(at: Coord, now: number): void {
    const tile = [...this.playerView.tiles.values()].find((t) => t.r === at.r && t.c === at.c && !t.dying);
    if (!tile) return;
    const cell = this.lastPlayerCell;
    tile.flash = Math.max(tile.flash, 0.72);
    tile.glow = Math.max(tile.glow, 0.82);
    this.playerView.shake = Math.max(this.playerView.shake, 0.8);
    this.addShockwave(
      this.playerView,
      tile.x + cell / 2,
      tile.y + cell / 2,
      cell * 0.16,
      "#7CF5FF",
      260,
      1.7,
    );
    this.impactSpark(this.playerView, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell);
    void now;
  }

  primeSwapPose(from: Coord, to: Coord, dx: number, dy: number, now: number): void {
    this.playerView.pendingSwap = { from, to, dx, dy };
    const source = [...this.playerView.tiles.values()].find((t) => t.r === from.r && t.c === from.c && !t.dying);
    const destination = [...this.playerView.tiles.values()].find((t) => t.r === to.r && t.c === to.c && !t.dying);
    const sourceRest = source ? { x: source.toX, y: source.toY } : null;
    const destinationRest = destination ? { x: destination.toX, y: destination.toY } : null;
    if (source && destinationRest) {
      this.playerView.pendingSwapIds.add(source.id);
      this.playerView.pendingSwapTargets.set(source.id, destinationRest);
    }
    if (destination && sourceRest) {
      this.playerView.pendingSwapIds.add(destination.id);
      this.playerView.pendingSwapTargets.set(destination.id, sourceRest);
    }
    const tile = source;
    if (!tile) return;
    tile.x = tile.toX + dx * DRAG_FOLLOW;
    tile.y = tile.toY + dy * DRAG_FOLLOW;
    tile.fromX = tile.x;
    tile.fromY = tile.y;
    tile.toX = tile.x;
    tile.toY = tile.y;
    tile.moveKind = "idle";
    tile.moveAge = 0;
    tile.moveDur = 0;
    tile.moveHold = 0;
    tile.scale = Math.max(tile.scale, 1.035);
    tile.flash = Math.max(tile.flash, 0.55);
    tile.glow = Math.max(tile.glow, 0.4);
    void now;
  }

  flashSwap(a: Coord, b: Coord, now: number): void {
    this.playerView.flash = Math.max(this.playerView.flash, this.fx.reducedMotion ? 0.04 : 0.08);
    const pending = this.playerView.pendingSwap;
    if (!pending || pending.from.r !== a.r || pending.from.c !== a.c || pending.to.r !== b.r || pending.to.c !== b.c) {
      this.playerView.pendingSwap = { from: a, to: b, dx: 0, dy: 0 };
    }
    for (const at of [a, b]) {
      const tile = [...this.playerView.tiles.values()].find((t) => t.r === at.r && t.c === at.c);
      if (tile) this.playerView.pendingSwapIds.add(tile.id);
    }
    const source = [...this.playerView.tiles.values()].find((t) => t.r === a.r && t.c === a.c);
    const destination = [...this.playerView.tiles.values()].find((t) => t.r === b.r && t.c === b.c);
    if (source && destination) {
      this.playerView.pendingSwapTargets.set(source.id, { x: destination.toX, y: destination.toY });
      this.playerView.pendingSwapTargets.set(destination.id, { x: source.toX, y: source.toY });
      const swapDur = gemTravelDuration(this.lastPlayerCell, this.lastPlayerCell, "swap", this.fx.quality, this.fx.reducedMotion);
      for (const [tile, target] of [
        [source, { x: destination.toX, y: destination.toY }],
        [destination, { x: source.toX, y: source.toY }],
      ] as const) {
        if (!tile.dying || tile.moveKind === "swap") continue;
        tile.fromX = tile.x;
        tile.fromY = tile.y;
        tile.toX = target.x;
        tile.toY = target.y;
        tile.moveAge = 0;
        tile.moveDur = swapDur;
        tile.moveKind = "swap";
      }
    }
    const mul = feelMul(this.fx.quality, this.fx.reducedMotion);
    if (mul < 0.2) return;
    const cell = this.lastPlayerCell;
    for (const at of [a, b]) {
      const tile = [...this.playerView.tiles.values()].find((t) => t.r === at.r && t.c === at.c);
      if (!tile) continue;
      tile.flash = Math.max(tile.flash, 0.55);
      tile.glow = Math.max(tile.glow, 0.4);
      if (at === a) tile.scale = Math.max(tile.scale, 1.035);
      if (at === b) {
        this.playerView.socketPulses.push({
          x: tile.x + cell / 2,
          y: tile.y + cell / 2,
          born: now,
          life: 64,
          color: "#7CF5FF",
        });
      }
      this.impactSpark(this.playerView, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell);
    }
    if (this.playerView.socketPulses.length > 12) {
      this.playerView.socketPulses.splice(0, this.playerView.socketPulses.length - 12);
    }
  }

  takeLandingImpacts(): number {
    const count = this.landingImpacts;
    this.landingImpacts = 0;
    return count;
  }

  inspectPlayer(): BoardRenderInspection {
    const { tiles } = this.playerView;
    const inspected = [...tiles.values()].map<RenderTileInspection>((tile) => ({
      id: tile.id,
      r: tile.r,
      c: tile.c,
      x: tile.x,
      y: tile.y,
      fromX: tile.fromX,
      fromY: tile.fromY,
      toX: tile.toX,
      toY: tile.toY,
      moveAge: tile.moveAge,
      moveDur: tile.moveDur,
      moveKind: tile.moveKind,
      dying: tile.dying,
      alpha: tile.alpha,
      settleAge: tile.settleAge,
      settleDur: tile.settleDur,
    }));
    const cell = this.lastPlayerCell;
    const empty: Coord[] = [];
    if (cell > 2) {
      const covered = new Set(
        inspected
          .filter(
            (tile) =>
              !tile.dying &&
              Math.hypot(tile.x - tile.toX, tile.y - tile.toY) < cell * 0.44,
          )
          .map((tile) => `${tile.r},${tile.c}`),
      );
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!covered.has(`${r},${c}`)) empty.push({ r, c });
        }
      }
    }
    return {
      cell,
      tiles: inspected,
      moving: inspected.filter((tile) => !tile.dying && tile.moveKind !== "idle"),
      dying: inspected.filter((tile) => tile.dying),
      visibleEmptySockets: empty,
    };
  }

  draw(
    snap: GameSnapshot,
    playerRect: DOMRect,
    opponentRect: DOMRect,
    now: number,
    boardAlpha = 1,
  ): void {
    const canvas = this.ctx.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      this.wellCache.clear();
      this.gemSprites.clear();
      this.lastDpr = 0;
    }
    if (this.lastDpr !== dpr) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lastDpr = dpr;
    }
    this.ctx.clearRect(0, 0, w, h);
    gemAtlasCanvas();
    if (this.lastAnimAt) {
      this.animDt = Math.min(0.033, Math.max(0.008, (now - this.lastAnimAt) / 1000));
    } else {
      this.animDt = 1 / 60;
    }
    this.lastAnimAt = now;

    if (snap.screen !== this.lastScreen) {
      if (snap.screen === "match") {
        this.playerView.reset();
        this.oppView.reset();
        this.bolts = [];
        this.combatFloats = [];
        this.landingImpacts = 0;
        this.wellCache.clear();
      }
      this.lastScreen = snap.screen;
    }

    const parent = this.canvasOrigin();
    this.ctx.save();
    this.ctx.globalAlpha = boardAlpha;
    const playerDrag = snap.drag ?? (snap.bounce ? { from: snap.bounce.from, dx: snap.bounce.dx, dy: snap.bounce.dy } : null);
    this.paintBoardLayer(
      this.oppLayer,
      this.oppView,
      snap.opponent.board,
      opponentRect,
      parent,
      null,
      [],
      now,
      snap.timeshiftUntil > now && snap.freezeUntil <= now,
      snap.freezeUntil > now,
      Math.max(0, snap.freezeUntil - now),
      snap.fx,
      false,
      null,
      snap.timeshiftUntil > now && snap.freezeUntil <= now ? Math.max(0, snap.timeshiftUntil - now) : 0,
      0,
      boardAlpha,
    );
    this.paintBoardLayer(
      this.playerLayer,
      this.playerView,
      snap.player.board,
      playerRect,
      parent,
      snap.selected ?? playerDrag?.from ?? null,
      snap.hint,
      now,
      snap.scoreBoostRemainingMs > 0 || (snap.mode === "time" && snap.timeshiftUntil > now),
      false,
      0,
      snap.fx,
      true,
      playerDrag,
      0,
      snap.playerLockedRemainingMs,
      boardAlpha,
    );
    this.consumeAttacks(snap, now);
    if (snap.freezeUntil > now) {
      this.combatFloats = this.combatFloats.filter((f) => f.color !== "#E9D5FF");
    }
    this.drawBolts(
      opponentRect.left - parent.left + opponentRect.width / 2,
      opponentRect.top - parent.top + opponentRect.height / 2,
      playerRect.left - parent.left + playerRect.width / 2,
      playerRect.top - parent.top + playerRect.height / 2,
      now,
      snap.freezeUntil > now,
    );
    this.drawCombatFloats(now);
    if (w >= 2 && h >= 2 && snap.screen === "match" && snap.phase === "playing") {
      this.drawAtmosphere(w, h, snap.last10, snap.danger, now);
    }
    this.ctx.restore();
  }

  clear(): void {
    const canvas = this.ctx.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      this.lastDpr = 0;
    }
    if (this.lastDpr !== dpr) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lastDpr = dpr;
    }
    this.ctx.clearRect(0, 0, w, h);
    this.wipeLayer(this.playerLayer);
    this.wipeLayer(this.oppLayer);
  }

  private canvasOrigin(): { left: number; top: number } {
    const parent = this.ctx.canvas.getBoundingClientRect();
    this.parentLeft = parent.left;
    this.parentTop = parent.top;
    return { left: this.parentLeft, top: this.parentTop };
  }

  private wipeLayer(ctx: CanvasRenderingContext2D | null): void {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  private prepareLayer(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): boolean {
    if (!(cssW > 8 && cssH > 8 && Number.isFinite(cssW) && Number.isFinite(cssH))) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = ctx.canvas;
    const bw = Math.max(1, Math.floor(cssW * dpr));
    const bh = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      this.wellCache.clear();
      this.gemSprites.clear();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return canvas.width > 0 && canvas.height > 0;
  }

  private paintBoardLayer(
    layer: CanvasRenderingContext2D | null,
    view: BoardView,
    board: (Piece | null)[][],
    rect: DOMRect,
    parent: { left: number; top: number },
    selected: Coord | null,
    hints: Coord[],
    now: number,
    boosted: boolean,
    frozen: boolean,
    freezeLeftMs: number,
    fx: FxEvent[],
    isPlayer: boolean,
    drag: DragState | null,
    shiftLeftMs: number,
    lockLeftMs: number,
    boardAlpha: number,
  ): void {
    const local = layer ? this.prepareLayer(layer, rect.width, rect.height) : false;
    const target = local && layer ? layer : this.ctx;
    const x = local ? 0 : rect.left - parent.left;
    const y = local ? 0 : rect.top - parent.top;
    const prev = this.ctx;
    this.ctx = target;
    target.save();
    target.globalAlpha = boardAlpha;
    this.paintBoard(
      view,
      board,
      x,
      y,
      rect.width,
      rect.height,
      selected,
      hints,
      now,
      boosted,
      frozen,
      freezeLeftMs,
      fx,
      isPlayer,
      drag,
      shiftLeftMs,
      lockLeftMs,
    );
    target.restore();
    this.ctx = prev;
  }

  cellAt(rect: DOMRect, canvasRect: DOMRect, x: number, y: number): Coord | null {
    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const layout = boardLayout(left, top, rect.width, rect.height);
    const lx = x - canvasRect.left - layout.ix;
    const ly = y - canvasRect.top - layout.iy;
    const c = Math.floor((lx - GAP) / (layout.cell + GAP));
    const r = Math.floor((ly - GAP) / (layout.cell + GAP));
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return { r, c };
  }

  private paintBoard(
    view: BoardView,
    board: (Piece | null)[][],
    x: number,
    y: number,
    w: number,
    h: number,
    selected: Coord | null,
    hints: Coord[],
    now: number,
    boosted: boolean,
    frozen: boolean,
    freezeLeftMs: number,
    fx: FxEvent[],
    isPlayer: boolean,
    drag: DragState | null,
    shiftLeftMs = 0,
    lockLeftMs = 0,
  ): void {
    const layout = boardLayout(x, y, w, h);
    const { size, ox, oy, cell, ix, iy } = layout;
    if (!(size > 8 && cell > 2 && Number.isFinite(cell))) return;
    if (isPlayer) this.lastPlayerCell = cell;
    const ctx = this.ctx;

    view.shake *= 0.78;
    view.flash *= 0.86;
    const mul = feelMul(this.fx.quality, this.fx.reducedMotion);
    const shakeAmt = view.shake * mul;
    const sx = shakeAmt > 0.05 ? (Math.random() - 0.5) * Math.min(shakeAmt, 5) : 0;
    const sy = shakeAmt > 0.05 ? (Math.random() - 0.5) * Math.min(shakeAmt, 5) * 0.6 : 0;

    ctx.save();
    ctx.translate(sx, sy);

    const slabEdge = isPlayer ? "#007A9E" : "#8E1740";
    const slabFace = isPlayer ? "#062B39" : "#32101C";
    ctx.save();
    if (isPlayer) chamferedRect(ctx, ox + 7, oy + 10, size, 14);
    else roundRect(ctx, ox + 7, oy + 10, size, size, 22);
    ctx.fillStyle = "rgba(0, 2, 8, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    if (isPlayer) chamferedRect(ctx, ox + 3, oy + 5, size, 14);
    else roundRect(ctx, ox + 3, oy + 5, size, size, 22);
    ctx.fillStyle = slabFace;
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(slabEdge, 0.62);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    this.blitWells(ctx, ox, oy, size, cell, isPlayer);
    this.drawSocketPulses(view, now);

    ctx.save();
    if (isPlayer) chamferedRect(ctx, ox + FRAME, oy + FRAME, size - FRAME * 2, 8);
    else roundRect(ctx, ox + FRAME, oy + FRAME, size - FRAME * 2, size - FRAME * 2, 14);
    ctx.clip();
    const cavity = ctx.createLinearGradient(ox + FRAME, oy + FRAME, ox + size - FRAME, oy + size - FRAME);
    cavity.addColorStop(0, "rgba(0, 2, 8, 0.1)");
    cavity.addColorStop(0.55, "rgba(0, 2, 8, 0.2)");
    cavity.addColorStop(1, "rgba(0, 2, 8, 0.42)");
    ctx.fillStyle = cavity;
    ctx.fillRect(ox + FRAME, oy + FRAME, size - FRAME * 2, size - FRAME * 2);
    ctx.restore();

    this.drawBoardEnergy(ctx, ox, oy, size, isPlayer, boosted, frozen, now);

    ctx.save();
    if (isPlayer) chamferedRect(ctx, ox + 1, oy + 1, size - 2, 13);
    else roundRect(ctx, ox + 1, oy + 1, size - 2, size - 2, 21);
    ctx.clip();
    const plane = ctx.createLinearGradient(ox, oy, ox + size, oy + size);
    plane.addColorStop(0, isPlayer ? "#B9F8FF0D" : "#FFD6E20B");
    plane.addColorStop(0.3, "#FFFFFF03");
    plane.addColorStop(0.7, "#0000000A");
    plane.addColorStop(1, "#01050A8F");
    ctx.fillStyle = plane;
    ctx.fillRect(ox, oy, size, size);
    ctx.restore();

    if (isPlayer) {
      this.paintPlayerFrameLighting(ctx, ox, oy, size, boosted, frozen);
    } else {
      const bevel = ctx.createLinearGradient(ox, oy, ox + size, oy + size);
      bevel.addColorStop(0, "#FFE1EA4A");
      bevel.addColorStop(0.16, "#FF6B9120");
      bevel.addColorStop(0.52, "#FFFFFF00");
      bevel.addColorStop(0.84, "#01050A18");
      bevel.addColorStop(1, "#01050AC4");
      roundRect(ctx, ox + 2, oy + 2, size - 4, size - 4, 20);
      ctx.strokeStyle = bevel;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const rim = frozen ? "#FF174F8C" : "#FF174FC7";
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = "#FFD6E22E";
      ctx.lineWidth = 1;
      roundRect(ctx, ox + 3, oy + 3, size - 6, size - 6, 18);
      ctx.stroke();
    }

    const live = view.live;
    live.clear();
    const dt = this.animDt;
    const anim = this.fx.animation ?? this.fx.quality;
    const reduced = this.fx.reducedMotion;
    const fxSide = isPlayer ? "player" : "opponent";
    let recentClearBorn = -Infinity;
    let recentClearCombo = 1;
    let recentClearSize = 3;
    for (let i = fx.length - 1; i >= 0; i--) {
      const fxEvent = fx[i]!;
      if (
        fxEvent.kind === "clear" &&
        (!fxEvent.side || fxEvent.side === fxSide) &&
        fxEvent.born <= now &&
        now - fxEvent.born <= 240
      ) {
        recentClearBorn = fxEvent.born;
        recentClearCombo = Math.max(1, fxEvent.combo ?? 1);
        recentClearSize = Math.max(3, Math.min(8, fxEvent.cells?.length ?? 3));
        break;
      }
    }
    const swapRemainingMs = [...view.tiles.values()].reduce((max, tile) => {
      if (tile.moveKind !== "swap" || tile.moveDur <= 0) return max;
      return Math.max(max, (tile.moveDur - tile.moveAge) * 1000);
    }, 0);
    if (isPlayer && view.pendingSwap) {
      const pending = view.pendingSwap;
      const source = [...view.tiles.values()].find((t) => t.r === pending.from.r && t.c === pending.from.c && !t.dying);
      const destination = [...view.tiles.values()].find((t) => t.r === pending.to.r && t.c === pending.to.c && !t.dying);
      if (source && destination) {
        view.pendingSwapIds.add(source.id);
        view.pendingSwapIds.add(destination.id);
        view.pendingSwapTargets.set(source.id, { x: destination.toX, y: destination.toY });
        view.pendingSwapTargets.set(destination.id, { x: source.toX, y: source.toY });
        source.x = source.toX + pending.dx;
        source.y = source.toY + pending.dy;
        source.fromX = source.x;
        source.fromY = source.y;
        source.toX = source.x;
        source.toY = source.y;
        source.moveKind = "idle";
        source.moveAge = 0;
        source.moveDur = 0;
        source.moveHold = 0;
        source.scale = Math.max(source.scale, 1.035);
        view.pendingSwap = null;
      }
    }
    const pendingSwapMs = view.pendingSwapIds.size
      ? gemTravelDuration(cell, cell, "swap", anim, reduced) * 1000
      : 0;
    const hadPendingSwap = view.pendingSwapIds.size > 0;
    const hasMatchPresentation = Number.isFinite(recentClearBorn) || hadPendingSwap;
    const swapWindowMs = Math.max(swapRemainingMs, pendingSwapMs);
    const recognitionMs = reduced ? 20 : MATCH_IMPACT_MS;
    const breakMs = gemDieDuration(anim, reduced) * 1000;
    const clearAgeMs = Number.isFinite(recentClearBorn) ? Math.max(0, now - recentClearBorn) : 0;
    const cascadeHold = hasMatchPresentation
      ? Math.max(0, swapWindowMs + recognitionMs + breakMs + MATCH_STAGGER_MAX_MS - clearAgeMs) / 1000
      : 0;
    const populated = view.tiles.size > 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = board[r]![c];
        if (!piece) continue;
        live.add(piece.id);
        const tx = ix + GAP + c * (cell + GAP);
        const ty = iy + GAP + r * (cell + GAP);
        let tile = view.tiles.get(piece.id);
        if (!tile) {
            const startY = populated ? ty - cell * (r + 1.15) : ty;
          tile = {
            id: piece.id,
            color: piece.color,
            kind: piece.kind,
            x: tx,
            y: startY,
            vx: 0,
            vy: 0,
            scale: populated ? 0.94 : 1,
            alpha: 1,
            dying: false,
            flash: populated ? 0.18 : 0.08,
            r,
            c,
            fromX: tx,
            fromY: startY,
            toX: tx,
            toY: ty,
            moveAge: 0,
            moveDur: populated ? gemTravelDuration(Math.abs(ty - startY), cell, "fall", anim, reduced) : 0,
            moveHold: populated ? gemFallDelay(c, Math.max(1, r), anim, reduced) + cascadeHold : 0,
            moveKind: populated ? "fall" : "idle",
            dieAge: 0,
            glow: populated ? 0.16 : 0,
            burstEmitted: false,
            breakStrength: 1,
            fractureSeed: ((piece.id * 37 + r * 11 + c * 17) % 628) / 100,
            dieStaggerMs: 0,
            settleAge: 1,
            settleDur: 0,
            settleX: 0,
            settleY: 0,
          };
          view.tiles.set(piece.id, tile);
          if (populated && tile.moveKind === "fall") {
            this.impactSpark(view, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell);
          }
        }
        const prevR = tile.r;
        const prevC = tile.c;
        const moved = prevR !== r || prevC !== c;
        tile.color = piece.color;
        tile.kind = piece.kind;
        tile.r = r;
        tile.c = c;
        const selectedHere = selected?.r === r && selected?.c === c && drag;
        if (selectedHere && drag) {
          tile.x = tx + drag.dx * DRAG_FOLLOW;
          tile.y = ty + drag.dy * DRAG_FOLLOW;
          tile.toX = tx;
          tile.toY = ty;
          tile.fromX = tile.x;
          tile.fromY = tile.y;
          tile.moveKind = "idle";
          tile.moveHold = 0;
          tile.vx = 0;
          tile.vy = 0;
          tile.settleAge = 1;
          tile.settleDur = 0;
          tile.settleX = 0;
          tile.settleY = 0;
        } else if (moved) {
          const dist = Math.hypot(tx - tile.x, ty - tile.y);
          const kind: GemMoveKind = this.playerView.pendingSwapIds.has(piece.id) ? "swap" : "fall";
          tile.fromX = tile.x;
          tile.fromY = tile.y;
          tile.toX = tx;
          tile.toY = ty;
          tile.moveAge = 0;
          tile.moveKind = kind;
          tile.moveDur = gemTravelDuration(dist, cell, kind, anim, reduced);
          tile.moveHold =
            kind === "fall"
              ? gemFallDelay(c, Math.abs(r - prevR), anim, reduced) + cascadeHold
              : 0;
          tile.glow = Math.max(tile.glow, kind === "swap" ? 0.28 : 0.12);
          tile.settleAge = 1;
          tile.settleDur = 0;
          tile.settleX = 0;
          tile.settleY = 0;
          if (kind === "swap") {
            this.playerView.pendingSwapIds.delete(piece.id);
            this.playerView.pendingSwapTargets.delete(piece.id);
          }
        } else if (
          tile.moveKind === "idle" &&
          drag &&
          isPlayer &&
          selected &&
          Math.abs(r - selected.r) + Math.abs(c - selected.c) === 1
        ) {
          const pushX = c === selected.c ? 0 : drag.dx * DRAG_NEIGHBOR_PUSH;
          const pushY = r === selected.r ? 0 : drag.dy * DRAG_NEIGHBOR_PUSH;
          if ((pushX || pushY) && drag.dx * (c - selected.c) + drag.dy * (r - selected.r) > 0) {
            tile.x = tx + pushX;
            tile.y = ty + pushY;
            tile.fromX = tile.x;
            tile.fromY = tile.y;
            tile.toX = tx;
            tile.toY = ty;
            tile.vx = 0;
            tile.vy = 0;
          } else {
            tile.x = tx;
            tile.y = ty;
            tile.vx = 0;
            tile.vy = 0;
          }
        } else if (tile.moveKind === "idle") {
          tile.toX = tx;
          tile.toY = ty;
        }

        if (tile.moveKind !== "idle") {
          if (tile.moveHold > 0) {
            tile.moveHold -= dt;
            tile.vx = 0;
            tile.vy = 0;
          } else {
            tile.moveAge += dt;
            const t = tile.moveDur <= 0 ? 1 : Math.min(1, tile.moveAge / tile.moveDur);
            const e = gemTravelEase(tile.moveKind, t);
            const nx = tile.fromX + (tile.toX - tile.fromX) * e;
            const ny = tile.fromY + (tile.toY - tile.fromY) * e;
            tile.vx = (nx - tile.x) / dt;
            tile.vy = (ny - tile.y) / dt;
            tile.x = nx;
            tile.y = ny;
            if (t >= 1) {
              const completedKind = tile.moveKind;
              tile.x = tile.toX;
              tile.y = tile.toY;
              tile.moveKind = "idle";
              tile.vx = 0;
              tile.vy = 0;
              if (!reduced) {
                if (completedKind === "swap") {
                  const moveX = tile.toX - tile.fromX;
                  const moveY = tile.toY - tile.fromY;
                  const moveDistance = Math.hypot(moveX, moveY) || 1;
                  const settle = Math.min(3.2, Math.max(2, moveDistance * 0.055));
                  tile.settleAge = 0;
                  tile.settleDur = 0.052;
                  tile.settleX = (moveX / moveDistance) * settle;
                  tile.settleY = (moveY / moveDistance) * settle;
                  tile.scale = 0.985;
                  if (isPlayer) {
                    this.landingImpacts += 1;
                    view.socketPulses.push({
                      x: tile.toX + cell / 2,
                      y: tile.toY + cell / 2,
                      born: now,
                      life: 64,
                      color: "#7CF5FF",
                    });
                    if (view.socketPulses.length > 12) {
                      view.socketPulses.splice(0, view.socketPulses.length - 12);
                    }
                  }
                } else if (completedKind === "fall" && anim !== "low" && Math.abs(tile.fromY - tile.toY) > cell * 0.4) {
                  const direction = Math.sign(tile.toY - tile.fromY) || 1;
                  tile.settleAge = 0;
                  tile.settleDur = 0.06;
                  tile.settleX = 0;
                  tile.settleY = direction * Math.min(2, Math.max(1, Math.abs(tile.toY - tile.fromY) * 0.012));
                  tile.scale = 1.015;
                }
              }
              if (Math.abs(tile.fromY - tile.toY) > cell * 0.4) {
                this.impactSpark(view, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell);
                this.addShockwave(view, tile.x + cell / 2, tile.y + cell / 2, cell * 0.12, isPlayer ? "#00D9FF" : "#FF174F", 220, 1.2);
              }
            }
          }
        } else if (!selectedHere) {
          const dx = tx - tile.x;
          const dy = ty - tile.y;
          if (Math.abs(dx) > 0.35 || Math.abs(dy) > 0.35) {
            const catchUp = reduced ? 0.62 : 0.38;
            tile.x += dx * catchUp;
            tile.y += dy * catchUp;
            tile.vx = dx * catchUp / dt;
            tile.vy = dy * catchUp / dt;
          } else {
            tile.x = tx;
            tile.y = ty;
            tile.vx = 0;
            tile.vy = 0;
          }
        }
        if (tile.settleAge < tile.settleDur) tile.settleAge += dt;
        tile.scale += (1 - tile.scale) * Math.min(1, dt * 20);
        if (Math.abs(tile.scale - 1) < 0.0015) tile.scale = 1;
        tile.glow *= 0.86;
        tile.flash *= 0.9;
        tile.alpha = 1;
      }
    }
    for (const id of this.playerView.pendingSwapIds) {
      if (!live.has(id)) this.playerView.pendingSwapIds.delete(id);
    }
    this.capParticles(view);

    const impactDelay = this.fx.reducedMotion
      ? 20
      : Math.max(MATCH_IMPACT_MS, swapWindowMs + MATCH_IMPACT_MS);
    for (const [id, tile] of view.tiles) {
      if (live.has(id) || tile.dying) continue;
      tile.dying = true;
      const swapTarget = view.pendingSwapTargets.get(id);
      if (swapTarget) {
        tile.fromX = tile.x;
        tile.fromY = tile.y;
        tile.toX = swapTarget.x;
        tile.toY = swapTarget.y;
        tile.moveAge = 0;
        tile.moveDur = gemTravelDuration(cell, cell, "swap", anim, reduced);
        tile.moveHold = 0;
        tile.moveKind = "swap";
        view.pendingSwapTargets.delete(id);
      }
      tile.breakStrength = Math.max(recentClearCombo, recentClearSize);
      tile.dieStaggerMs = Number.isFinite(recentClearBorn)
        ? MATCH_STAGGER_MIN_MS + ((tile.id + tile.r + tile.c) % 3) * MATCH_STAGGER_STEP_MS
        : 0;
      const impactRemaining = hasMatchPresentation
        ? Math.max(0, impactDelay - (Number.isFinite(recentClearBorn) ? now - recentClearBorn : 0))
        : 0;
      tile.dieAge = -(impactRemaining + tile.dieStaggerMs) / 1000;
      if (!swapTarget) tile.moveKind = "idle";
      tile.flash = reduced ? 0.28 : hasMatchPresentation ? 0.78 : 1;
      tile.glow = hasMatchPresentation ? 0.82 : 1;
      tile.burstEmitted = impactRemaining + tile.dieStaggerMs <= 0;
      if (tile.burstEmitted) {
        this.burst(view, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell, tile.breakStrength);
      }
      if (isPlayer) view.shake = Math.max(view.shake, 0.9);
    }

    let overlayPower: FxEvent | undefined;
    let overlayRewind: FxEvent | undefined;
    for (const fxEvent of fx) {
      if (!overlayRewind && fxEvent.kind === "rewind" && (!fxEvent.side || (fxEvent.side === "player") === isPlayer)) {
        overlayRewind = fxEvent;
      }
      if (
        !overlayPower &&
        (fxEvent.kind === "power" || fxEvent.kind === "rewind") &&
        (!fxEvent.side || (fxEvent.side === "player") === isPlayer) &&
        now - fxEvent.born < 640
      ) {
        overlayPower = fxEvent;
      }
      if (view.seenFx.has(fxEvent.id)) continue;
      if (fxEvent.side && fxEvent.side !== (isPlayer ? "player" : "opponent")) continue;
      if (fxEvent.kind !== "clear" && fxEvent.kind !== "combo" && fxEvent.kind !== "power" && fxEvent.kind !== "rewind") {
        continue;
      }
      view.seenFx.add(fxEvent.id);
      if (fxEvent.kind === "power" || fxEvent.kind === "rewind") {
        this.castPower(view, fxEvent.text, ox + size / 2, oy + size / 2, cell, isPlayer);
        if (fxEvent.kind === "rewind" && isPlayer && !this.fx.reducedMotion) {
          for (const tile of view.tiles.values()) {
            tile.glow = Math.max(tile.glow, 0.3);
            tile.flash = Math.max(tile.flash, 0.35);
          }
        }
        continue;
      }
      if (!this.fx.showCombo) continue;
      const combo = fxEvent.combo ?? 1;
      if (fxEvent.kind === "clear") {
        const pts = Math.abs(Number(String(fxEvent.text).replace(/[^\d]/g, "")) || 0);
        const px = fxEvent.at ? ix + GAP + fxEvent.at.c * (cell + GAP) + cell / 2 : ox + size / 2;
        const py = fxEvent.at ? iy + GAP + fxEvent.at.r * (cell + GAP) + cell / 2 : oy + size * 0.46;
        view.floats.push({
          x: px,
          y: py,
          text: fxEvent.text,
          born: now,
          color: combo >= 4 || pts >= 400 ? (isPlayer ? "#EAFBFF" : "#FFD6E2") : "#F3FAFF",
          size: 14 + Math.min(18, Math.log10(pts + 12) * 7 + combo),
          rise: 24 + combo * 5 + Math.min(18, pts / 80),
          life: 640 + Math.min(280, combo * 40 + pts / 12),
        });
        if (view.floats.length > 5) view.floats.splice(0, view.floats.length - 5);
      }
      if (fxEvent.kind === "combo") {
        if (!isPlayer) {
          view.floats.push({
            x: ox + size / 2,
            y: oy + size * 0.32,
            text: fxEvent.text,
            born: now,
            color: combo >= 5 ? "#FFE1EA" : combo >= 4 ? "#FF6B91" : "#FFD6E2",
            size: 13 + Math.min(14, combo * 2.4),
            rise: 22 + combo * 5,
            life: 700 + Math.min(280, combo * 50),
          });
        }
        view.shake = Math.max(view.shake, (combo >= 6 ? 5.2 : combo >= 4 ? 3.4 : combo >= 3 ? 2.2 : 1.4) * mul);
        if (view.floats.length > 5) view.floats.splice(0, view.floats.length - 5);
      }
    }

    const dieDur = gemDieDuration(anim, reduced);
    for (const tile of view.tiles.values()) {
      if (!tile.dying) continue;
      if (tile.moveKind === "swap" && tile.moveDur > 0) {
        tile.moveAge += dt;
        const swapT = Math.min(1, tile.moveAge / tile.moveDur);
        const swapE = gemTravelEase("swap", swapT);
        tile.x = tile.fromX + (tile.toX - tile.fromX) * swapE;
        tile.y = tile.fromY + (tile.toY - tile.fromY) * swapE;
        if (swapT >= 1) {
          tile.moveKind = "idle";
          tile.vx = 0;
          tile.vy = 0;
        }
      }
      tile.dieAge += dt;
      if (!tile.burstEmitted && tile.dieAge >= 0) {
        tile.burstEmitted = true;
        this.burst(view, tile.x + cell / 2, tile.y + cell / 2, tile.color, cell, tile.breakStrength);
      }
      const pose = easeCrystalDie(Math.max(0, tile.dieAge) / dieDur);
      if (reduced) {
        tile.alpha -= 0.28;
        tile.flash *= 0.7;
      } else if (tile.dieAge < 0) {
        // Hold the matched crystal in a tiny charged lock before the break.
        const charge = Math.max(0, Math.min(1, (tile.dieAge + MATCH_IMPACT_MS / 1000) / (MATCH_IMPACT_MS / 1000)));
        tile.scale = 1.018 - charge * 0.028;
        tile.alpha = 1;
        tile.flash = Math.max(tile.flash, 0.42 + charge * 0.3);
        tile.glow = Math.max(tile.glow, 0.38 + charge * 0.28);
      } else {
        tile.scale = pose.scale;
        tile.alpha = pose.alpha;
        tile.flash = pose.flash;
        tile.glow = pose.flash;
      }
    }
    for (const [id, tile] of view.tiles) {
      if (tile.dying && tile.alpha <= 0) view.tiles.delete(id);
    }

    const invalid =
      isPlayer && now < this.invalidUntil
        ? [this.invalidA, this.invalidB]
        : [];

    this.hintBits.fill(0);
    for (const p of hints) {
      if (p.r >= 0 && p.r < ROWS && p.c >= 0 && p.c < COLS) {
        this.hintBits[p.r * COLS + p.c] = 1;
      }
    }

    const tiles = this.tileScratch;
    tiles.length = 0;
    let needSort = false;
    for (const tile of view.tiles.values()) {
      tiles.push(tile);
      if (tile.dying || tile.moveKind !== "idle" || tile.vy !== 0 || tile.y < iy || Math.abs(tile.scale - 1) > 0.02) needSort = true;
    }
    if (needSort) tiles.sort((a, b) => Number(a.dying) - Number(b.dying) || a.y - b.y || a.x - b.x);
    for (const tile of tiles) {
      const sel = selected?.r === tile.r && selected?.c === tile.c && !tile.dying;
      const hinted = !tile.dying && this.hintBits[tile.r * COLS + tile.c] === 1;
      const bad = invalid.some((p) => p && p.r === tile.r && p.c === tile.c);
      const wobble = bad ? Math.sin(now / 18) * 3.2 : 0;
      const lift = sel ? 1.026 : 1;
      const restX = ix + GAP + tile.c * (cell + GAP);
      const restY = iy + GAP + tile.r * (cell + GAP);
      const settleT = tile.settleDur > 0 ? Math.min(1, tile.settleAge / tile.settleDur) : 1;
      const settleEase = 1 - Math.pow(1 - settleT, 3);
      const settleDx = tile.settleX * (1 - settleEase);
      const settleDy = tile.settleY * (1 - settleEase);
      const origin = liveGemDrawOrigin(
        restX,
        restY,
        tile.x,
        tile.y,
        cell,
        tile.dying,
        0,
        0,
        wobble,
        settleDx,
        settleDy,
      );
      this.drawGem(
        origin.x,
        origin.y,
        cell,
        tile,
        sel,
        hinted,
        lift,
        now,
        Boolean(sel && drag) || tile.moveKind !== "idle",
      );
    }

    this.stepParticles(view);
    this.stepCrystalShards(view);
    this.drawParticles(view);
    this.drawCrystalShards(view);
    this.drawShockwaves(view, now);
    this.drawFloats(view, now);

    if (frozen && !isPlayer) {
      if (freezeLeftMs > 4600) {
        view.shake = Math.max(view.shake, 7);
        view.flash = Math.max(view.flash, 0.28);
      }
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = "#7CF5FF29";
      ctx.fill();
      ctx.strokeStyle = "#7CF5FFD9";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox + 8, oy + 8, size - 16, size - 16);
      ctx.clip();
      ctx.strokeStyle = "#EAFBFF73";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) {
        const px = ox + 10 + ((i * 53) % (size - 20));
        ctx.beginPath();
        ctx.moveTo(px, oy + 8);
        ctx.lineTo(px + size * 0.12, oy + size - 8);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 10; i++) {
        const px = ox + 12 + ((i * 47) % (size - 24));
        const py = oy + 10 + ((i * 31) % (size - 20));
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const secs = Math.max(1, Math.ceil(freezeLeftMs / 1000));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#03121A8C";
      roundRect(ctx, ox + size * 0.18, oy + size * 0.34, size * 0.64, size * 0.32, 16);
      ctx.fill();
      ctx.fillStyle = "#EAFBFF";
      ctx.font = "800 12px Outfit, Trebuchet MS, sans-serif";
      ctx.fillText("FREEZE", ox + size / 2, oy + size * 0.42);
      ctx.font = "900 36px Outfit, Trebuchet MS, sans-serif";
      ctx.fillText(String(secs), ox + size / 2, oy + size * 0.56);
    }

    if (shiftLeftMs > 0 && !frozen) {
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = "#A855F71F";
      ctx.fill();
      ctx.strokeStyle = "#D8B4FEC7";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      if (this.fx.quality !== "low" && !this.fx.reducedMotion) {
        const scan = ((now / 28) % (size * 0.7)) - size * 0.1;
        ctx.fillStyle = "#D8B4FE1A";
        roundRect(ctx, ox + 6, oy + scan, size - 12, size * 0.1, 8);
        ctx.fill();
      }
      const secs = Math.max(1, Math.ceil(shiftLeftMs / 1000));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#080B188C";
      roundRect(ctx, ox + size * 0.16, oy + size * 0.36, size * 0.68, size * 0.28, 16);
      ctx.fill();
      ctx.fillStyle = "#EAFBFF";
      ctx.font = "800 12px Outfit, Trebuchet MS, sans-serif";
      ctx.fillText("TIME STOLEN", ox + size / 2, oy + size * 0.44);
      ctx.font = "900 28px Outfit, Trebuchet MS, sans-serif";
      ctx.fillText(String(secs), ox + size / 2, oy + size * 0.56);
      if (this.fx.quality !== "low" && !this.fx.reducedMotion) {
        const cx = ox + size / 2;
        const cy = oy + size / 2;
        const spin = now / 180;
        ctx.strokeStyle = "#D8B4FEB3";
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 8; i++) {
          const a = spin + (Math.PI * 2 * i) / 8;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * size * 0.28, cy + Math.sin(a) * size * 0.28);
          ctx.lineTo(cx + Math.cos(a) * size * 0.36, cy + Math.sin(a) * size * 0.36);
          ctx.stroke();
        }
      }
    }

    if (lockLeftMs > 0) {
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = "#FF174F24";
      ctx.fill();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFD6E2";
      ctx.font = "800 13px Outfit, Trebuchet MS, sans-serif";
      ctx.fillText("LOCKED", ox + size / 2, oy + size * 0.5);
    }

    const powerFx = overlayPower;
    const rewindFx = overlayRewind;
    if (powerFx && now - powerFx.born < 640) {
      const t = 1 - (now - powerFx.born) / 640;
      const label = powerFx.text.toUpperCase();
      const freeze = label.includes("FREEZE");
      const rewind = label.includes("REWIND") || label.includes("BOARD RESTORED");
      const fill = freeze
        ? colorWithAlpha("#00D9FF", 0.18 * t)
        : rewind
          ? colorWithAlpha("#FF174F", 0.16 * t)
          : colorWithAlpha("#A855F7", 0.16 * t);
      const stroke = freeze
        ? colorWithAlpha("#7CF5FF", 0.9 * t)
        : rewind
          ? colorWithAlpha("#FF6B91", 0.85 * t)
          : colorWithAlpha("#D8B4FE", 0.85 * t);
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = freeze ? 3 : 2.4;
      ctx.stroke();
      if (rewind && this.fx.quality !== "low" && !this.fx.reducedMotion) {
        const cx = ox + size / 2;
        const cy = oy + size / 2;
        const spin = -now / 90;
        ctx.strokeStyle = colorWithAlpha("#FF6B91", 0.75 * t);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.28, spin, spin + 1.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.36, spin + Math.PI, spin + Math.PI + 1.6);
        ctx.stroke();
      }
      if (!frozen && !(shiftLeftMs > 0)) {
        ctx.fillStyle = freeze
          ? colorWithAlpha("#EAFBFF", 0.92 * t)
          : rewind
            ? colorWithAlpha("#FFD6E2", 0.9 * t)
            : colorWithAlpha("#F3E8FF", 0.9 * t);
        ctx.font = "800 13px Outfit, Trebuchet MS, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(freeze ? "FREEZE" : rewind ? "REWIND" : "TIME SHIFT", ox + size / 2, oy + size * 0.5);
      }
    } else if (rewindFx && now - rewindFx.born < 720) {
      const t = 1 - (now - rewindFx.born) / 720;
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = colorWithAlpha("#FF174F", 0.16 * t);
      ctx.fill();
      ctx.strokeStyle = colorWithAlpha("#FF6B91", 0.85 * t);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = colorWithAlpha("#FFD6E2", 0.9 * t);
      ctx.font = "800 13px Outfit, Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("REWIND", ox + size / 2, oy + size * 0.5);
    }

    if (view.flash > 0.02) {
      roundRect(ctx, ox, oy, size, size, 22);
      ctx.fillStyle = isPlayer
        ? colorWithAlpha("#EAFBFF", view.flash * 0.28)
        : colorWithAlpha("#FFD6E2", view.flash * 0.24);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSocketPulses(view: BoardView, now: number): void {
    if (!view.socketPulses.length) return;
    view.socketPulses = view.socketPulses.filter((pulse) => now - pulse.born < pulse.life);
    for (const pulse of view.socketPulses) {
      const progress = Math.max(0, Math.min(1, (now - pulse.born) / pulse.life));
      const envelope = Math.sin(Math.PI * progress);
      const radius = this.lastPlayerCell * (0.27 + progress * 0.1);
      this.ctx.save();
      this.ctx.globalAlpha = envelope * 0.42;
      this.ctx.strokeStyle = pulse.color;
      this.ctx.lineWidth = Math.max(1, this.lastPlayerCell * 0.028);
      this.ctx.shadowColor = pulse.color;
      this.ctx.shadowBlur = this.lastPlayerCell * 0.08;
      this.ctx.beginPath();
      this.ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private blitWells(ctx: CanvasRenderingContext2D, ox: number, oy: number, size: number, cell: number, isPlayer: boolean): void {
    const theme = this.fx.boardTheme;
    const key = `${Math.round(size)}|${Math.round(cell * 10)}|${isPlayer ? "p" : "o"}|${theme}|hw8`;
    let sheet = this.wellCache.get(key);
    if (!sheet) {
      sheet = document.createElement("canvas");
      const scale = Math.min(2, window.devicePixelRatio || 1);
      sheet.width = Math.max(1, Math.floor(size * scale));
      sheet.height = Math.max(1, Math.floor(size * scale));
      const g = sheet.getContext("2d");
      if (!g) return;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      paintDeviceBoard(g, size, cell, isPlayer, theme);
      this.wellCache.set(key, sheet);
    }
    ctx.drawImage(sheet, ox, oy, size, size);
  }

  private drawBoardEnergy(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    size: number,
    isPlayer: boolean,
    boosted: boolean,
    frozen: boolean,
    now: number,
  ): void {
    if (this.fx.quality === "low" || this.fx.reducedMotion) return;
    const active = boosted || frozen;
    if (!active) return;
    const pulse = 0.5 + Math.sin(now / (boosted ? 150 : 420)) * 0.5;
    const color = frozen ? "#7CF5FF" : isPlayer ? "#00D9FF" : "#FF174F";
    const alpha = (boosted || frozen ? 0.16 : 0.055) + pulse * (boosted || frozen ? 0.13 : 0.035);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = boosted ? 1.8 : 1;
    const radius = size * 0.46;
    const cx = ox + size / 2;
    const cy = oy + size / 2;
    const spin = now / (boosted ? 800 : 1800);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, spin, spin + (boosted ? 1.5 : 0.9));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3, spin + Math.PI, spin + Math.PI + (boosted ? 1.1 : 0.65));
    ctx.stroke();
    if (boosted) {
      ctx.globalAlpha = alpha * 0.55;
      ctx.fillStyle = color;
      ctx.fillRect(ox + size * 0.12, oy + size * 0.08 + ((now / 24) % (size * 0.84)), size * 0.76, 1);
    }
    ctx.restore();
  }

  private spawnParticle(view: BoardView, init: Particle): void {
    const p = this.particlePool.pop() ?? init;
    if (p !== init) {
      p.x = init.x;
      p.y = init.y;
      p.vx = init.vx;
      p.vy = init.vy;
      p.life = init.life;
      p.max = init.max;
      p.size = init.size;
      p.color = init.color;
      p.g = init.g;
    }
    view.particles.push(p);
  }

  private recycleParticle(p: Particle): void {
    if (this.particlePool.length < 96) this.particlePool.push(p);
  }

  private spawnCrystalShard(view: BoardView, shard: CrystalShard): void {
    view.shards.push(shard);
    if (view.shards.length > 40) view.shards.splice(0, view.shards.length - 40);
  }

  private gemSprite(atlas: HTMLCanvasElement, colorIndex: number, color: string, inner: number, selected: boolean): HTMLCanvasElement {
    const q = Math.max(GEM_CELL, Math.round(inner));
    const key = `${colorIndex}|${q}|${selected ? 1 : 0}|c6`;
    let sheet = this.gemSprites.get(key);
    if (sheet) return sheet;
    sheet = document.createElement("canvas");
    sheet.width = q;
    sheet.height = q;
    const g = sheet.getContext("2d");
    if (!g) return sheet;
    const prev = this.ctx;
    this.ctx = g;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    this.paintAtlasGem(atlas, q / 2, q / 2, q, colorIndex, color, selected);
    this.ctx = prev;
    this.gemSprites.set(key, sheet);
    if (this.gemSprites.size > 40) {
      const first = this.gemSprites.keys().next().value;
      if (first) this.gemSprites.delete(first);
    }
    return sheet;
  }

  private burst(view: BoardView, x: number, y: number, color: number, cell: number, combo = 1): void {
    const n = particleBudget(this.fx.quality, this.fx.reducedMotion);
    if (!n) return;
    const hex = COLORS[color - 1] ?? "#fff";
    const accent =
      this.fx.vfxTheme === "nova-fx"
        ? "#FFD447"
        : this.fx.vfxTheme === "aurora-fx"
          ? "#7CF5FF"
          : this.fx.vfxTheme === "ember-fx"
            ? "#FF9D00"
            : hex;

    const shardCount = this.fx.quality === "medium" ? 2 : combo >= 5 ? 5 : combo >= 4 ? 4 : 3;
    for (let i = 0; i < shardCount; i++) {
      const a = (Math.PI * 2 * i) / shardCount + 0.18;
      const sp = 2.1 + combo * 0.14 + Math.random() * 0.55;
      this.spawnCrystalShard(view, {
        x: x + Math.cos(a) * cell * 0.08,
        y: y + Math.sin(a) * cell * 0.08,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.85,
        rotation: a,
        spin: (i % 2 ? 1 : -1) * (0.08 + Math.random() * 0.06),
        life: 0.2,
        max: 0.2,
        size: cell * (0.07 + Math.random() * 0.022),
        color: i % 2 ? "#EAFBFF" : accent,
      });
    }

    const particleCount = Math.min(12, n + (combo >= 5 ? 3 : combo >= 4 ? 2 : combo >= 3 ? 1 : 0));
    for (let i = 0; i < particleCount; i++) {
      const a = (Math.PI * 2 * i) / particleCount + Math.random() * 0.35;
      const sp = 1.8 + Math.random() * 1.8;
      this.spawnParticle(view, {
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2.2,
        life: 0.13,
        max: 0.13,
        size: cell * (0.04 + Math.random() * 0.035),
        color: i % 3 === 0 ? "#EAFBFF" : i % 2 === 0 ? hex : accent,
      });
    }
    this.capParticles(view);
  }

  private impactSpark(view: BoardView, x: number, y: number, color: number, cell: number): void {
    if (this.fx.quality === "low" || this.fx.reducedMotion) return;
    const hex = COLORS[color - 1] ?? "#EAFBFF";
    const n = this.fx.quality === "medium" ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = 1.1 + Math.random() * 1.4;
      this.spawnParticle(view, {
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.4,
        life: 0.72,
        max: 0.72,
        size: cell * (0.028 + Math.random() * 0.022),
        color: i % 2 === 0 ? "#EAFBFF" : hex,
        g: 0.04,
      });
    }
    this.capParticles(view);
  }

  private capParticles(view: BoardView): void {
    const cap = this.fx.quality === "medium" ? 20 : this.fx.quality === "low" ? 8 : 32;
    if (view.particles.length > cap) {
      const extra = view.particles.splice(0, view.particles.length - cap);
      for (const p of extra) this.recycleParticle(p);
    }
  }

  private addShockwave(
    view: BoardView,
    x: number,
    y: number,
    radius: number,
    color: string,
    life: number,
    width: number,
    born = performance.now(),
  ): void {
    if (this.fx.quality === "low" || this.fx.reducedMotion) return;
    view.shockwaves.push({ x, y, born, life, radius, color, width });
    if (view.shockwaves.length > 12) view.shockwaves.splice(0, view.shockwaves.length - 12);
  }

  private drawShockwaves(view: BoardView, now: number): void {
    if (!view.shockwaves.length) return;
    const ctx = this.ctx;
    view.shockwaves = view.shockwaves.filter((wave) => now - wave.born < wave.life);
    ctx.save();
    for (const wave of view.shockwaves) {
      const t = Math.max(0, Math.min(1, (now - wave.born) / wave.life));
      const eased = 1 - Math.pow(1 - t, 2);
      const alpha = (1 - t) * (1 - t) * 0.8;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(0.8, wave.width * (1 - t * 0.55));
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 8 + wave.width * 2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 4 + wave.radius * eased, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.34;
      ctx.lineWidth = Math.max(0.6, wave.width * 0.42 * (1 - t));
      ctx.shadowBlur = 3 + wave.width;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 4 + wave.radius * eased * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private castPower(view: BoardView, text: string, x: number, y: number, cell: number, isPlayer: boolean): void {
    const t = text.toUpperCase();
    const n = particleBudget(this.fx.quality, this.fx.reducedMotion);
    const mul = feelMul(this.fx.quality, this.fx.reducedMotion);
    const freeze = t.includes("FREEZE");
    const rewind = t.includes("REWIND") || t.includes("BOARD RESTORED");
    const burst = t.includes("ENERGY BURST");
    const mega = t.includes("MEGA STRIKE");
    const powerColor = freeze ? "#00D9FF" : rewind ? "#FF174F" : mega ? "#FF174F" : burst ? "#39FF88" : "#A855F7";
    view.flash = Math.max(view.flash, (freeze ? 0.32 : rewind ? 0.26 : mega ? 0.38 : 0.24) * Math.max(0.35, mul));
    view.shake = Math.max(view.shake, (freeze ? 4.6 : rewind ? 3.8 : mega ? 6.2 : 3.4) * mul);
    this.addShockwave(view, x, y, cell * (mega ? 3.7 : burst ? 2.8 : freeze ? 2.2 : 2.4), powerColor, mega ? 900 : 660, mega ? 4.8 : 3.2);
    if (!n) return;
    if (freeze) {
      const count = n + (isPlayer ? 0 : 2);
      for (let i = 0; i < count; i++) {
        this.spawnParticle(view, {
          x: x + (Math.random() - 0.5) * cell * 6,
          y: y - cell * 2.2 + Math.random() * cell,
          vx: (Math.random() - 0.5) * 0.7,
          vy: 0.55 + Math.random() * 1.15,
          life: 1,
          max: 1,
          size: cell * (0.08 + Math.random() * 0.08),
          color: i % 2 ? "#EAFBFF" : "#7CF5FF",
          g: 0.16,
        });
      }
    } else if (rewind) {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const r = cell * 3.2;
        const sp = 1.8 + Math.random() * 0.6;
        this.spawnParticle(view, {
          x: x + Math.cos(a) * r,
          y: y + Math.sin(a) * r,
          vx: -Math.cos(a) * sp,
          vy: -Math.sin(a) * sp,
          life: 1,
          max: 1,
          size: cell * 0.09,
          color: i % 2 ? "#E9D5FF" : "#FF174F",
          g: 0,
        });
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        const sp = (mega ? 2.9 : burst ? 2.5 : 2.2) + Math.random();
        this.spawnParticle(view, {
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.85,
          life: 1,
          max: 1,
          size: cell * 0.08,
          color: i % 2 ? (mega ? "#FFE1EA" : "#EAFBFF") : powerColor,
          g: 0.03,
        });
      }
    }
    this.capParticles(view);
  }

  private ringBurst(view: BoardView, x: number, y: number, cell: number, combo: number): void {
    if (this.fx.quality === "low" || this.fx.reducedMotion) return;
    const n = this.fx.quality === "medium" ? 5 : combo >= 8 ? 8 : combo >= 5 ? 7 : 6;
    const energy = combo >= 8 ? "#EAFBFF" : combo >= 5 ? "#7CF5FF" : "#00D9FF";
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const sp = 1.8 + combo * 0.18;
      this.spawnParticle(view, {
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.82,
        max: 0.82,
        size: cell * (combo >= 8 ? 0.07 : combo >= 5 ? 0.055 : 0.045),
        color: energy,
        g: 0.02,
      });
    }
    this.capParticles(view);
  }

  private stepParticles(view: BoardView): void {
    const list = view.particles;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g ?? 0.12;
      p.life -= 0.032;
      if (p.life > 0) list[write++] = p;
      else this.recycleParticle(p);
    }
    list.length = write;
  }

  private stepCrystalShards(view: BoardView): void {
    let write = 0;
    for (let i = 0; i < view.shards.length; i++) {
      const shard = view.shards[i]!;
      shard.x += shard.vx;
      shard.y += shard.vy;
      shard.vy += 0.1;
      shard.rotation += shard.spin;
      shard.life -= 0.032;
      if (shard.life > 0) view.shards[write++] = shard;
    }
    view.shards.length = write;
  }

  private drawParticles(view: BoardView): void {
    const ctx = this.ctx;
    ctx.save();
    for (const p of view.particles) {
      const a = Math.max(0, p.life);
      const r = p.size * a;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = Math.max(1.5, r * 2.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.52, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r * 0.52, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawCrystalShards(view: BoardView): void {
    if (!view.shards.length) return;
    const ctx = this.ctx;
    ctx.save();
    for (const shard of view.shards) {
      const alpha = Math.max(0, shard.life / shard.max);
      const size = shard.size * (0.72 + alpha * 0.28);
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.rotation);
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = shard.color;
      ctx.shadowColor = shard.color;
      ctx.shadowBlur = Math.max(2, size * 1.8);
      ctx.beginPath();
      ctx.moveTo(-size * 0.62, size * 0.34);
      ctx.lineTo(-size * 0.12, -size * 0.58);
      ctx.lineTo(size * 0.58, -size * 0.12);
      ctx.lineTo(size * 0.16, size * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, -size * 0.58);
      ctx.lineTo(size * 0.12, -size * 0.24);
      ctx.lineTo(-size * 0.04, size * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawFloats(view: BoardView, now: number): void {
    view.floats = view.floats.filter((f) => now - f.born < f.life);
  }

  private drawAtmosphere(w: number, h: number, last10: boolean, danger: boolean, now: number): void {
    if (!last10 && !danger) return;
    const mul = feelMul(this.fx.quality, this.fx.reducedMotion);
    const ctx = this.ctx;
    const pulse =
      this.fx.quality === "low" || this.fx.reducedMotion
        ? 0.35
        : 0.5 + Math.sin(now / (last10 ? 180 : 280)) * 0.5;
    ctx.save();
    const glow = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.12, w / 2, h * 0.5, w * 0.72);
    glow.addColorStop(0, "rgba(0,0,0,0)");
    glow.addColorStop(
      1,
      last10
        ? colorWithAlpha("#FF174F", (0.12 + pulse * 0.12) * Math.max(0.45, mul))
        : colorWithAlpha("#8A1235", (0.07 + pulse * 0.07) * Math.max(0.45, mul)),
    );
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private consumeAttacks(snap: GameSnapshot, now: number): void {
    for (const fxEvent of snap.fx) {
      if (fxEvent.kind !== "attack") continue;
      if (this.playerView.seenFx.has(fxEvent.id)) continue;
      this.playerView.seenFx.add(fxEvent.id);
      const combo = fxEvent.combo ?? 2;
      const fromPlayer = fxEvent.side !== "opponent";
      this.bolts.push({
        born: now,
        dur: fxEvent.text.includes("FINAL") || fxEvent.text.includes("FINALE") ? 720 : 420,
        fromPlayer,
        combo,
        text: fxEvent.text,
        impacted: false,
      });
    }
    this.bolts = this.bolts.filter((b) => now - b.born < b.dur + 280);
  }

  private drawBolts(
    oppX: number,
    oppY: number,
    plyX: number,
    plyY: number,
    now: number,
    rivalFrozen: boolean,
  ): void {
    const ctx = this.ctx;
    for (const bolt of this.bolts) {
      const t = Math.min(1, (now - bolt.born) / bolt.dur);
      const ease = 1 - (1 - t) * (1 - t);
      const x0 = bolt.fromPlayer ? plyX : oppX;
      const y0 = bolt.fromPlayer ? plyY : oppY;
      const x1 = bolt.fromPlayer ? oppX : plyX;
      const y1 = bolt.fromPlayer ? oppY : plyY;
      const x = x0 + (x1 - x0) * ease;
      const y = y0 + (y1 - y0) * ease;
      const strong = bolt.combo >= 4;
      if (this.fx.quality !== "low" && t < 1 && !this.fx.reducedMotion) {
        ctx.save();
        const hue = bolt.fromPlayer ? "#00D9FF" : "#FF174F";
        const core = bolt.fromPlayer ? "#EAFBFF" : "#FFD6E2";
        ctx.strokeStyle = bolt.fromPlayer ? "#7CF5FFD9" : "#FF6B91D9";
        ctx.lineWidth = strong ? 6 : 3.6;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x) / 2 + (bolt.fromPlayer ? 18 : -18), (y0 + y) / 2, x, y);
        ctx.stroke();
        const orb = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, strong ? 16 : 11);
        orb.addColorStop(0, "#FFFFFF");
        orb.addColorStop(0.35, core);
        orb.addColorStop(0.7, hue);
        orb.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(x, y, strong ? 16 : 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (t >= 1 && !bolt.impacted) {
        bolt.impacted = true;
        const target = bolt.fromPlayer ? this.oppView : this.playerView;
        target.flash = Math.max(target.flash, bolt.combo >= 5 ? 0.42 : 0.26);
        target.shake = Math.max(target.shake, Math.min(5, 1.6 + bolt.combo * 0.45));
        if (!(bolt.fromPlayer && rivalFrozen)) {
          this.combatFloats.push({
            x: bolt.fromPlayer ? x1 : x0,
            y: bolt.fromPlayer ? y1 : y0,
            text: bolt.text,
            born: now,
         color: bolt.fromPlayer ? "#E9D5FF" : "#FFD6E2",
            size: bolt.fromPlayer ? (bolt.combo >= 5 ? 15 : 12) : 11,
            rise: 16,
            life: 520,
          });
        }
        if (this.fx.quality !== "low") {
          this.ringBurst(target, x1, y1, 22, bolt.combo);
        }
      }
    }
  }

  private drawCombatFloats(now: number): void {
    const ctx = this.ctx;
    this.combatFloats = this.combatFloats.filter((f) => now - f.born < f.life);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.combatFloats) {
      const t = (now - f.born) / f.life;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.font = `800 ${f.size}px Orbitron, Outfit, Trebuchet MS, sans-serif`;
      const tw = ctx.measureText(f.text).width;
      ctx.fillStyle = "#080B188C";
      roundRect(ctx, f.x - tw / 2 - 8, f.y - t * f.rise - f.size, tw + 16, f.size + 10, 8);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - t * f.rise);
    }
    ctx.restore();
  }

  private paintPlayerFrameLighting(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    size: number,
    boosted: boolean,
    frozen: boolean,
  ): void {
    const chamfer = Math.min(12, Math.max(8, size * 0.08));
    const frameInset = FRAME - 0.7;
    const rail = boosted ? "#8AFFFF" : frozen ? "#7CF5FF" : "#28DFFF";
    const railHot = boosted ? "#F4FFFF" : "#B9F8FF";
    const railSoft = frozen ? "#00D9FF80" : "#00D9FFB0";

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Dark metal housing: the player frame keeps a distinct lower-right shadow.
    const housing = ctx.createLinearGradient(ox, oy, ox + size, oy + size);
    housing.addColorStop(0, "#DDF8FF42");
    housing.addColorStop(0.12, "#173C4A");
    housing.addColorStop(0.52, "#06131C");
    housing.addColorStop(0.82, "#01050A");
    housing.addColorStop(1, "#000204");
    chamferedRect(ctx, ox + 1.2, oy + 1.2, size - 2.4, chamfer);
    ctx.strokeStyle = housing;
    ctx.lineWidth = 4.6;
    ctx.shadowColor = "#000000A8";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Metallic bevel separating the bright rails from the recessed board.
    const bevel = ctx.createLinearGradient(ox, oy, ox + size, oy + size);
    bevel.addColorStop(0, "#EAFBFF70");
    bevel.addColorStop(0.18, "#6FEAFF38");
    bevel.addColorStop(0.48, "#0A3543");
    bevel.addColorStop(0.78, "#01050A");
    bevel.addColorStop(1, "#000204");
    chamferedRect(ctx, ox + 2.5, oy + 2.5, size - 5, chamfer - 1);
    ctx.strokeStyle = bevel;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Side rails carry the strongest energy; the segmented pass keeps them
    // technological rather than reading as one uniform cyan glow.
    const sideRail = ctx.createLinearGradient(ox, oy, ox, oy + size);
    sideRail.addColorStop(0, railHot);
    sideRail.addColorStop(0.18, rail);
    sideRail.addColorStop(0.5, railSoft);
    sideRail.addColorStop(0.82, rail);
    sideRail.addColorStop(1, "#007A9E80");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = sideRail;
    ctx.lineWidth = 1.55;
    ctx.shadowColor = "#00D9FF80";
    ctx.shadowBlur = 7;
    for (let edge = 0; edge < 2; edge++) {
      const edgeX = ox + (edge === 0 ? 2.5 : size - 2.5);
      ctx.beginPath();
      ctx.moveTo(edgeX, oy + chamfer + 3);
      ctx.lineTo(edgeX, oy + size - chamfer - 3);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.setLineDash([Math.max(7, size * 0.075), Math.max(4, size * 0.045)]);
    ctx.lineDashOffset = -size * 0.08;
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = "#7CF5FFB8";
    for (let edge = 0; edge < 2; edge++) {
      const edgeX = ox + (edge === 0 ? 2.5 : size - 2.5);
      ctx.beginPath();
      ctx.moveTo(edgeX, oy + chamfer + 4);
      ctx.lineTo(edgeX, oy + size - chamfer - 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Top and bottom rails are quieter horizontal reflections.
    const horizontalRail = ctx.createLinearGradient(ox, oy, ox + size, oy);
    horizontalRail.addColorStop(0, "#00D9FF60");
    horizontalRail.addColorStop(0.18, railHot);
    horizontalRail.addColorStop(0.5, "#00D9FF88");
    horizontalRail.addColorStop(0.82, rail);
    horizontalRail.addColorStop(1, "#00D9FF42");
    ctx.lineWidth = 1.15;
    ctx.strokeStyle = horizontalRail;
    ctx.shadowColor = "#00D9FF4D";
    ctx.shadowBlur = 4;
    for (let edge = 0; edge < 2; edge++) {
      const edgeY = oy + (edge === 0 ? 2.5 : size - 2.5);
      ctx.beginPath();
      ctx.moveTo(ox + chamfer + 3, edgeY);
      ctx.lineTo(ox + size - chamfer - 3, edgeY);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // Four angular energy nodes concentrate the brightest light at the corners.
    for (let corner = 0; corner < 4; corner++) {
      const cx = ox + (corner % 2 === 0 ? 3.8 : size - 3.8);
      const cy = oy + (corner < 2 ? 3.8 : size - 3.8);
      const node = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6.5);
      node.addColorStop(0, "#F4FFFFFF");
      node.addColorStop(0.2, "#B9F8FFFF");
      node.addColorStop(0.52, "#00D9FF99");
      node.addColorStop(1, "#00D9FF00");
      ctx.fillStyle = node;
      ctx.beginPath();
      ctx.arc(cx, cy, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3.1);
      ctx.lineTo(cx + 3.1, cy);
      ctx.lineTo(cx, cy + 3.1);
      ctx.lineTo(cx - 3.1, cy);
      ctx.closePath();
      ctx.fillStyle = "#B9F8FFCC";
      ctx.fill();
      ctx.strokeStyle = "#F4FFFFFF";
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // Thin cyan reflection follows the inside edge without entering the wells.
    const innerReflection = ctx.createLinearGradient(
      ox + frameInset,
      oy + frameInset,
      ox + size - frameInset,
      oy + size - frameInset,
    );
    innerReflection.addColorStop(0, "#EAFBFF42");
    innerReflection.addColorStop(0.28, "#00D9FF12");
    innerReflection.addColorStop(0.68, "#00D9FF18");
    innerReflection.addColorStop(1, "#7CF5FF58");
    chamferedRect(ctx, ox + frameInset, oy + frameInset, size - frameInset * 2, 5);
    ctx.strokeStyle = innerReflection;
    ctx.lineWidth = 1.15;
    ctx.stroke();

    ctx.restore();
  }

  private drawGem(
    x: number,
    y: number,
    size: number,
    tile: VisualTile,
    selected: boolean,
    hinted: boolean,
    lift: number,
    now: number,
    dragging = false,
  ): void {
    const ctx = this.ctx;
    const color = COLORS[tile.color - 1] ?? "#FFFFFF";
    const pulse =
      selected && this.fx.animation !== "low" && !this.fx.reducedMotion ? 1 + Math.sin(now / 140) * 0.03 : 1;
    const visScale = Math.min(tile.scale * GEM_VISUAL_SCALE, 1.1);
    let travelLift = 1;
    if (!tile.dying && tile.moveKind !== "idle" && tile.moveDur > 0 && !this.fx.reducedMotion) {
      const t = Math.min(1, tile.moveAge / tile.moveDur);
      const arch = Math.sin(Math.PI * t);
      travelLift = tile.moveKind === "fall" ? 1 + 0.03 * arch : 1 + 0.016 * arch;
    }
    const inset = Math.max(1.1, size * 0.028);
    const inner = Math.max(8, size - inset * 2);
    const s = inner * visScale * lift * pulse * travelLift;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const crystal = crystalAccent(tile.color);
    const charge =
      tile.dying && tile.dieAge < 0
        ? Math.max(0, Math.min(1, (tile.dieAge + MATCH_IMPACT_MS / 1000) / (MATCH_IMPACT_MS / 1000)))
        : 0;
    ctx.save();
    ctx.globalAlpha *= tile.alpha;
    const atlas = gemAtlasCanvas();
    const useAtlas = Boolean(atlas && tile.color >= 1 && tile.color <= 6);
    ctx.fillStyle = "rgba(0, 0, 0, 0.66)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.44, s * 0.36, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.36, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    jewelPath(ctx, cx + s * 0.032, cy + s * 0.09, s * 0.95, tile.color);
    ctx.fillStyle = "rgba(0, 3, 10, 0.78)";
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(color, 0.24);
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.04, s * 0.4, 0, Math.PI * 2);
    const halo = ctx.createRadialGradient(cx, cy - s * 0.04, s * 0.04, cx, cy + s * 0.06, s * 0.4);
    halo.addColorStop(0, crystal.bloom);
    halo.addColorStop(0.32, `${color}18`);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.fill();
    if (charge > 0 && !this.fx.reducedMotion) {
      ctx.save();
      ctx.globalAlpha *= 0.13 + charge * 0.1;
      ctx.strokeStyle = crystal.bloom;
      ctx.lineWidth = Math.max(0.8, s * 0.018);
      ctx.shadowColor = crystal.bloom;
      ctx.shadowBlur = s * 0.06;
      const spin = now / 380;
      for (let i = 0; i < 4; i++) {
        const angle = spin + i * (Math.PI / 2);
        const outer = s * (0.42 - charge * 0.1);
        const inner = s * (0.14 + charge * 0.04);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.lineTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (tile.glow > 0.05 && !tile.dying) {
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.12, s * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.3, tile.glow * 0.42)})`;
      ctx.fill();
    }
    const speed = Math.hypot(tile.vx, tile.vy);
    if (
      dragging &&
      !tile.dying &&
      !this.fx.reducedMotion &&
      this.fx.animation === "high" &&
      this.fx.quality !== "low" &&
      speed > 220
    ) {
      const trail = Math.min(0.18, (speed - 220) / 2400);
      const ox = -(tile.vx / Math.max(speed, 1)) * s * trail * 1.6;
      const oy = -(tile.vy / Math.max(speed, 1)) * s * trail * 1.6;
      ctx.save();
      ctx.globalAlpha *= 0.28;
      if (useAtlas) this.drawAtlasGem(atlas!, cx + ox, cy + oy, s, tile.color, color, selected);
      else this.drawProceduralGem(cx + ox, cy + oy, s, tile.color, color, selected);
      ctx.restore();
    }
    if (!dragging && !tile.dying) {
      roundRect(ctx, x + 0.8, y + 0.8, size - 1.6, size - 1.6, Math.max(5, size * 0.2));
      ctx.clip();
    }
    if (useAtlas && atlas) {
      this.drawAtlasGem(atlas, cx, cy, s, tile.color, color, selected);
    } else {
      this.drawProceduralGem(cx, cy, s, tile.color, color, selected);
    }

    if (tile.flash > 0.04) {
      if (useAtlas) {
        const a = ctx.globalAlpha;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 0.08, s * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.globalAlpha = a * Math.min(0.55, tile.flash);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = crystal.bloom;
        ctx.globalAlpha = a * Math.min(0.42, tile.flash * 0.7);
        ctx.fill();
        ctx.globalAlpha = a;
      } else {
        jewelPath(ctx, cx, cy, s * 0.92, tile.color);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, tile.flash)})`;
        ctx.fill();
      }
    }

    if (tile.kind !== "normal") {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (tile.kind === "lineH") {
        ctx.moveTo(cx - s * 0.28, cy);
        ctx.lineTo(cx + s * 0.28, cy);
      } else if (tile.kind === "lineV") {
        ctx.moveTo(cx, cy - s * 0.28);
        ctx.lineTo(cx, cy + s * 0.28);
      } else {
        ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2);
        ctx.moveTo(cx, cy - s * 0.2);
        ctx.lineTo(cx, cy + s * 0.2);
        ctx.moveTo(cx - s * 0.2, cy);
        ctx.lineTo(cx + s * 0.2, cy);
      }
      ctx.stroke();
    }
    if (tile.dying && this.fx.quality !== "low" && !this.fx.reducedMotion) {
      const dieDur = gemDieDuration(this.fx.animation, false);
      const fractureProgress =
        tile.dieAge < 0
          ? charge * 0.28
          : 0.28 + Math.min(0.72, tile.dieAge / dieDur) * 0.72;
      this.drawCrystalFracture(
        cx,
        cy,
        s,
        tile.color,
        fractureProgress,
        tile.fractureSeed,
        tile.breakStrength,
      );
    }
    ctx.restore();
  }

  private drawCrystalFracture(
    cx: number,
    cy: number,
    s: number,
    colorIndex: number,
    progress: number,
    seed: number,
    strength: number,
  ): void {
    const ctx = this.ctx;
    const crystal = crystalAccent(colorIndex);
    const color = COLORS[colorIndex - 1] ?? "#FFFFFF";
    const crackProgress = Math.min(1, progress * 1.55);
    const fade = Math.max(0, 1 - progress * 0.72);
    const arms = strength >= 5 ? 5 : strength >= 4 ? 4 : 3;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = fade;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = crystal.bloom;
    ctx.shadowBlur = s * 0.08;
    for (let i = 0; i < arms; i++) {
      const angle = seed + (Math.PI * 2 * i) / arms;
      const reach = s * (0.16 + crackProgress * (0.26 + Math.min(0.05, strength * 0.008)));
      const kink = reach * 0.48;
      const inner = s * 0.05;
      const bend = Math.sin(seed * 2.3 + i * 1.7) * s * 0.035;
      const px = Math.cos(angle);
      const py = Math.sin(angle);
      const nx = -py;
      const ny = px;
      ctx.beginPath();
      ctx.moveTo(cx + px * inner, cy + py * inner);
      ctx.lineTo(cx + px * kink + nx * bend, cy + py * kink + ny * bend);
      ctx.lineTo(cx + px * reach, cy + py * reach);
      ctx.strokeStyle = colorWithAlpha("#EAFBFF", 0.76);
      ctx.lineWidth = Math.max(0.9, s * 0.018);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + px * (inner + s * 0.02), cy + py * (inner + s * 0.02));
      ctx.lineTo(cx + px * reach * 0.92, cy + py * reach * 0.92);
      ctx.strokeStyle = colorWithAlpha(color, 0.58);
      ctx.lineWidth = Math.max(0.55, s * 0.009);
      ctx.stroke();

      if (strength >= 4) {
        const branchAngle = angle + (i % 2 ? 1 : -1) * 0.42;
        const branchStart = reach * 0.42;
        const branchReach = reach * 0.78;
        ctx.beginPath();
        ctx.moveTo(
          cx + px * branchStart + nx * bend * 0.4,
          cy + py * branchStart + ny * bend * 0.4,
        );
        ctx.lineTo(
          cx + Math.cos(branchAngle) * branchReach,
          cy + Math.sin(branchAngle) * branchReach,
        );
        ctx.strokeStyle = colorWithAlpha("#EAFBFF", 0.52);
        ctx.lineWidth = Math.max(0.65, s * 0.012);
        ctx.stroke();
      }
    }

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.22);
    core.addColorStop(0, "#FFFFFF");
    core.addColorStop(0.2, crystal.core);
    core.addColorStop(1, colorWithAlpha(color, 0));
    ctx.globalAlpha = Math.min(0.7, 0.2 + progress * 0.5);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, s * (0.1 + progress * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawAtlasGem(
    atlas: HTMLCanvasElement,
    cx: number,
    cy: number,
    s: number,
    colorIndex: number,
    color: string,
    selected: boolean,
  ): void {
    const sprite = this.gemSprite(atlas, colorIndex, color, s, selected);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sprite, cx - s / 2, cy - s / 2, s, s);
  }

  private paintAtlasGem(
    atlas: HTMLCanvasElement,
    cx: number,
    cy: number,
    s: number,
    colorIndex: number,
    color: string,
    selected: boolean,
  ): void {
    const ctx = this.ctx;
    const { sx, sy } = gemCellOrigin(colorIndex);
    const dest = s * 0.98;
    const dx = cx - dest / 2;
    const dy = cy - dest / 2 + s * 0.018;
    const crystal = crystalAccent(colorIndex);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.08, s * 0.36, 0, Math.PI * 2);
    const under = ctx.createRadialGradient(cx, cy - s * 0.02, s * 0.02, cx, cy + s * 0.1, s * 0.36);
    under.addColorStop(0, crystal.bloom);
    under.addColorStop(0.38, `${color}52`);
    under.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = under;
    ctx.fill();
    ctx.restore();

    ctx.save();
    jewelPath(ctx, cx, cy, s, colorIndex);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(atlas, sx, sy, GEM_CELL, GEM_CELL, dx, dy, dest, dest);

    ctx.globalCompositeOperation = "source-atop";
    // The atlas supplies the approved silhouettes and reflections, but its
    // baked colors can otherwise overpower the live palette. A restrained
    // exact-primary tint makes each crystal read as its gameplay color while
    // preserving the atlas material detail.
    ctx.fillStyle = colorWithAlpha(color, 0.34);
    ctx.fillRect(dx, dy, dest, dest);
    const occlude = ctx.createRadialGradient(cx + s * 0.14, cy + s * 0.24, s * 0.02, cx, cy, s * 0.52);
    occlude.addColorStop(0, "rgba(0, 4, 12, 0.4)");
    occlude.addColorStop(0.42, "rgba(0,0,0,0)");
    occlude.addColorStop(1, "rgba(0, 6, 14, 0.24)");
    ctx.fillStyle = occlude;
    ctx.fillRect(dx, dy, dest, dest);
    const volume = ctx.createRadialGradient(cx - s * 0.16, cy - s * 0.26, s * 0.01, cx, cy + s * 0.1, s * 0.5);
    volume.addColorStop(0, selected ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.18)");
    volume.addColorStop(0.18, `${color}38`);
    volume.addColorStop(0.46, "rgba(255,255,255,0.04)");
    volume.addColorStop(0.72, "rgba(0,0,0,0)");
    volume.addColorStop(1, "rgba(0,8,18,0.28)");
    ctx.fillStyle = volume;
    ctx.fillRect(dx, dy, dest, dest);
    paintCrystalOptics(ctx, cx, cy, s, colorIndex, color);

    const bevel = ctx.createLinearGradient(cx - s * 0.46, cy - s * 0.46, cx + s * 0.46, cy + s * 0.46);
    bevel.addColorStop(0, "rgba(255,255,255,0.08)");
    bevel.addColorStop(0.32, "rgba(255,255,255,0)");
    bevel.addColorStop(0.72, "rgba(0,0,0,0.04)");
    bevel.addColorStop(1, "rgba(0,5,14,0.42)");
    ctx.fillStyle = bevel;
    ctx.fillRect(dx, dy, dest, dest);
    const edgeShade = ctx.createLinearGradient(cx - s * 0.48, cy - s * 0.48, cx + s * 0.48, cy + s * 0.48);
    edgeShade.addColorStop(0, "rgba(255,255,255,0)");
    edgeShade.addColorStop(0.62, "rgba(0,0,0,0)");
    edgeShade.addColorStop(1, "rgba(0,8,18,0.55)");
    jewelPath(ctx, cx, cy, s * 0.97, colorIndex);
    ctx.strokeStyle = edgeShade;
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.stroke();

    ctx.globalCompositeOperation = "lighter";
    const core = ctx.createRadialGradient(cx - s * 0.04, cy - s * 0.08, s * 0.006, cx, cy + s * 0.02, s * 0.26);
    core.addColorStop(0, "rgba(255,255,255,0.64)");
    core.addColorStop(0.16, crystal.core);
    core.addColorStop(0.52, `${color}4d`);
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.05, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    paintSpeculars(ctx, cx, cy, s);

    ctx.globalCompositeOperation = "source-atop";
    jewelPath(ctx, cx, cy, s * 0.92, colorIndex);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = Math.max(0.8, s * 0.016);
    ctx.stroke();
    jewelPath(ctx, cx, cy, s * 0.98, colorIndex);
    ctx.strokeStyle = crystal.edge;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = Math.max(0.9, s * 0.02);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = Math.max(0.7, s * 0.012);
    ctx.beginPath();
    ctx.arc(cx - s * 0.1, cy - s * 0.14, s * 0.26, -0.95, 0.5);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = crystal.edge;
    ctx.globalAlpha = 0.48;
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.02, s * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawGemIcon(ctx, cx, cy, s, colorIndex);
  }

  private drawProceduralGem(
    cx: number,
    cy: number,
    s: number,
    colorIndex: number,
    color: string,
    selected: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    jewelPath(ctx, cx + 1.8, cy + s * 0.1, s * 0.92, colorIndex);
    ctx.fill();

    jewelPath(ctx, cx, cy, s * 0.92, colorIndex);
    ctx.fillStyle = shade(color, selected ? 0.34 : 0.28);
    ctx.fill();

    jewelPath(ctx, cx, cy, s * 0.78, colorIndex);
    const body = ctx.createLinearGradient(cx - s * 0.2, cy - s * 0.46, cx + s * 0.18, cy + s * 0.46);
    body.addColorStop(0, shade(color, 1.55));
    body.addColorStop(0.35, shade(color, 1.08));
    body.addColorStop(0.62, color);
    body.addColorStop(1, shade(color, 0.38));
    ctx.fillStyle = body;
    ctx.fill();

    const core = ctx.createRadialGradient(cx - s * 0.08, cy - s * 0.1, s * 0.04, cx, cy, s * 0.34);
    core.addColorStop(0, "rgba(255,255,255,0.55)");
    core.addColorStop(0.35, `${color}cc`);
    core.addColorStop(1, "rgba(0,0,0,0)");
    jewelPath(ctx, cx, cy, s * 0.62, colorIndex);
    ctx.fillStyle = core;
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    jewelPath(ctx, cx - s * 0.12, cy - s * 0.2, s * 0.28, colorIndex);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    jewelPath(ctx, cx + s * 0.14, cy + s * 0.12, s * 0.2, colorIndex);
    ctx.fill();

    jewelPath(ctx, cx, cy, s * 0.92, colorIndex);
    ctx.strokeStyle = `${color}f2`;
    ctx.lineWidth = Math.max(1.4, s * 0.045);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    jewelPath(ctx, cx, cy, s * 0.8, colorIndex);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    jewelPath(ctx, cx + s * 0.06, cy + s * 0.16, s * 0.42, colorIndex);
    ctx.fill();

    ctx.save();
    jewelPath(ctx, cx, cy, s * 0.92, colorIndex);
    ctx.clip();
    paintCrystalOptics(ctx, cx, cy, s, colorIndex, color);
    ctx.globalCompositeOperation = "lighter";
    paintSpeculars(ctx, cx, cy, s);
    ctx.restore();

    drawGemIcon(ctx, cx, cy, s, colorIndex);
  }
}

function boardLayout(x: number, y: number, w: number, h: number): {
  size: number;
  ox: number;
  oy: number;
  cell: number;
  ix: number;
  iy: number;
} {
  const size = Math.min(w, h);
  const ox = x + (w - size) / 2;
  const oy = y + (h - size) / 2;
  const inner = size - FRAME * 2;
  const cell = (inner - GAP * (COLS + 1)) / COLS;
  return { size, ox, oy, cell, ix: ox + FRAME, iy: oy + FRAME };
}

function crystalAccent(colorIndex: number): { core: string; edge: string; bloom: string } {
  switch (colorIndex) {
    case 1:
      return { core: "#FF48C8", edge: "#FFE1F4", bloom: "#FF167F55" };
    case 2:
      return { core: "#FFD447", edge: "#FFF2B0", bloom: "#FF9D0055" };
    case 3:
      return { core: "#35FFB0", edge: "#D9FFF1", bloom: "#00B86B55" };
    case 4:
      return { core: "#28C8FF", edge: "#DDF8FF", bloom: "#126BFF55" };
    case 5:
      return { core: "#D94CFF", edge: "#F3D9FF", bloom: "#8A20FF55" };
    default:
      return { core: "#49F6FF", edge: "#EAFBFF", bloom: "#00BFFF55" };
  }
}

function paintDeviceBoard(
  g: CanvasRenderingContext2D,
  size: number,
  cell: number,
  isPlayer: boolean,
  theme: string,
): void {
  const ember = theme === "ember";
  const aurora = theme === "aurora";
  const rim = isPlayer ? "#00CFFF" : "#E91E55";
  const rimHot = isPlayer ? "#6FEAFF" : "#FFD6E2";
  const rimSoft = isPlayer ? "#007A9E9E" : "#8F163D94";
  const rimDim = isPlayer ? "#005B7833" : "#8F163D26";
  const body = g.createLinearGradient(0, 0, 0, size);
  if (ember) {
    body.addColorStop(0, "#300D1C");
    body.addColorStop(0.5, "#190812");
    body.addColorStop(1, "#080204");
  } else if (aurora) {
    body.addColorStop(0, "#0A2634");
    body.addColorStop(0.5, "#06151F");
    body.addColorStop(1, "#020611");
  } else if (isPlayer) {
    body.addColorStop(0, "#173344");
    body.addColorStop(0.22, "#0A2634");
    body.addColorStop(0.55, "#06131D");
    body.addColorStop(1, "#01050A");
  } else {
    body.addColorStop(0, "#300D1C");
    body.addColorStop(0.22, "#190812");
    body.addColorStop(0.55, "#180710");
    body.addColorStop(1, "#01050A");
  }
  roundRect(g, 0, 0, size, size, 22);
  g.fillStyle = body;
  g.fill();

  const metal = g.createLinearGradient(0, 0, size, size);
  metal.addColorStop(0, isPlayer ? "#DDF8FF29" : "#FFD6E21F");
  metal.addColorStop(0.22, "#FFFFFF14");
  metal.addColorStop(0.48, "#0613222E");
  metal.addColorStop(0.72, "#01050A38");
  metal.addColorStop(1, "#01050A94");
  g.fillStyle = metal;
  g.fill();

  const bevel = g.createLinearGradient(0, 0, 0, size);
  bevel.addColorStop(0, "rgba(255,255,255,0.14)");
  bevel.addColorStop(0.08, "rgba(255,255,255,0.04)");
  bevel.addColorStop(0.92, "rgba(0,0,0,0)");
  bevel.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = bevel;
  g.fill();

  const glass = g.createLinearGradient(0, 0, 0, size * 0.28);
  glass.addColorStop(0, "rgba(255,255,255,0.16)");
  glass.addColorStop(0.42, "rgba(255,255,255,0.05)");
  glass.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glass;
  g.fill();

  const innerShade = g.createLinearGradient(0, size * 0.62, 0, size);
  innerShade.addColorStop(0, "rgba(0,0,0,0)");
  innerShade.addColorStop(1, "rgba(0,0,0,0.38)");
  g.fillStyle = innerShade;
  g.fill();

  const wellGlass = g.createLinearGradient(size * 0.08, size * 0.08, size * 0.4, size * 0.32);
  wellGlass.addColorStop(0, "rgba(255,255,255,0.16)");
  wellGlass.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = wellGlass;
  roundRect(g, size * 0.07, size * 0.07, size * 0.38, size * 0.2, 10);
  g.fill();

  const edgeLite = g.createLinearGradient(0, 0, size, 0);
  edgeLite.addColorStop(0, isPlayer ? "#00CFFF4D" : "#FF174F1F");
  edgeLite.addColorStop(0.45, "#FFFFFF00");
  edgeLite.addColorStop(1, isPlayer ? "#00CFFF1F" : "#FF174F42");
  g.fillStyle = edgeLite;
  g.fill();

  roundRect(g, 0.7, 0.7, size - 1.4, size - 1.4, 21);
   g.strokeStyle = "#01050A";
  g.lineWidth = 1.4;
  g.stroke();

  roundRect(g, 1.6, 1.6, size - 3.2, size - 3.2, 20);
  g.strokeStyle = rimSoft;
  g.lineWidth = 1.7;
  g.stroke();

  roundRect(g, 3.15, 3.15, size - 6.3, size - 6.3, 18);
  g.strokeStyle = "#FFFFFF29";
  g.lineWidth = 0.9;
  g.stroke();

  roundRect(g, 4.35, 4.35, size - 8.7, size - 8.7, 16);
  g.strokeStyle = rim;
  g.lineWidth = 1.35;
  g.stroke();

  roundRect(g, 6.2, 6.2, size - 12.4, size - 12.4, 14);
   g.fillStyle = isPlayer ? "#04101A" : "#190812";
  g.fill();
  const pit = g.createRadialGradient(size * 0.5, size * 0.38, size * 0.05, size * 0.5, size * 0.52, size * 0.76);
  pit.addColorStop(0, isPlayer ? "#005B7852" : "#8A12353D");
  pit.addColorStop(0.5, "rgba(0,0,0,0.22)");
  pit.addColorStop(1, "rgba(0,0,0,0.7)");
  g.fillStyle = pit;
  g.fill();
  g.strokeStyle = rimDim;
  g.lineWidth = 1;
  g.stroke();
  roundRect(g, 6.9, 6.9, size - 13.8, size - 13.8, 13);
  g.strokeStyle = "#01050A8C";
  g.lineWidth = 2.2;
  g.stroke();
  roundRect(g, 5.05, 5.05, size - 10.1, size - 10.1, 15);
  g.strokeStyle = isPlayer ? "#DDF8FF29" : "#FFD6E21F";
  g.lineWidth = 0.9;
  g.stroke();

  g.save();
  g.strokeStyle = rimHot;
  g.globalAlpha = 0.38;
  g.lineWidth = isPlayer ? 1.55 : 1.35;
  g.lineCap = "round";
  const pipePad = Math.max(18, size * 0.07);
  const mid = size / 2;
  g.beginPath();
  g.moveTo(pipePad, 3.15);
  g.lineTo(size - pipePad, 3.15);
  g.moveTo(pipePad, size - 3.15);
  g.lineTo(size - pipePad, size - 3.15);
  if (isPlayer) {
    g.moveTo(3.15, mid - pipePad * 0.4);
    g.lineTo(3.15, mid + pipePad * 0.4);
    g.moveTo(size - 3.15, mid - pipePad * 0.4);
    g.lineTo(size - 3.15, mid + pipePad * 0.4);
  }
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = rim;
  const tick = Math.max(11, size * 0.055);
  g.lineWidth = isPlayer ? 2.7 : 2.25;
  g.beginPath();
  g.moveTo(11, 11 + tick);
  g.lineTo(11, 11);
  g.lineTo(11 + tick, 11);
  g.moveTo(size - 11 - tick, 11);
  g.lineTo(size - 11, 11);
  g.lineTo(size - 11, 11 + tick);
  g.moveTo(11, size - 11 - tick);
  g.lineTo(11, size - 11);
  g.lineTo(11 + tick, size - 11);
  g.moveTo(size - 11 - tick, size - 11);
  g.lineTo(size - 11, size - 11);
  g.lineTo(size - 11, size - 11 - tick);
  g.stroke();
  const rivets: Array<[number, number]> = [
    [4.8, 4.8],
    [size - 4.8, 4.8],
    [4.8, size - 4.8],
    [size - 4.8, size - 4.8],
  ];
  for (const [rx, ry] of rivets) {
    g.beginPath();
    g.arc(rx, ry, 1.55, 0, Math.PI * 2);
   g.fillStyle = isPlayer ? "#061321" : "#300D1C";
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = 0.85;
    g.stroke();
    g.beginPath();
    g.arc(rx - 0.4, ry - 0.45, 0.55, 0, Math.PI * 2);
    g.fillStyle = "#FFFFFF9E";
    g.fill();
  }
  g.restore();

  const wellR = Math.max(3.2, cell * 0.15);
  const pad = Math.max(1.8, cell * 0.11);
  const lipFill = isPlayer ? "#06111C" : "#190812";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const wx = FRAME + GAP + c * (cell + GAP);
      const wy = FRAME + GAP + r * (cell + GAP);
      roundRect(g, wx, wy, cell, cell, wellR);
      g.fillStyle = lipFill;
      g.fill();
      const well = g.createLinearGradient(wx, wy, wx, wy + cell);
      well.addColorStop(0, isPlayer ? "#005B7847" : "#8A123538");
      well.addColorStop(0.42, "#01050A00");
      well.addColorStop(1, "#01050AC7");
      g.fillStyle = well;
      g.fill();
      roundRect(g, wx + pad, wy + pad, cell - pad * 2, cell - pad * 2, Math.max(2, wellR - 1.5));
       g.fillStyle = (r + c) % 2 === 0 ? "#02060D" : "#06111C";
      g.fill();
      const dent = g.createLinearGradient(wx, wy, wx, wy + cell);
      dent.addColorStop(0, "#FFFFFF0D");
      dent.addColorStop(0.32, "#01050A00");
      dent.addColorStop(1, "#01050A6B");
      g.fillStyle = dent;
      g.fill();
      const pocket = g.createRadialGradient(
        wx + cell * 0.5,
        wy + cell * 0.72,
        cell * 0.04,
        wx + cell * 0.5,
        wy + cell * 0.58,
        cell * 0.46,
      );
      pocket.addColorStop(0, "#01050A9E");
      pocket.addColorStop(1, "#01050A00");
      g.fillStyle = pocket;
      g.fill();
      const lip = g.createLinearGradient(wx, wy, wx + cell * 0.62, wy + cell * 0.28);
      lip.addColorStop(0, "#FFFFFF1A");
      lip.addColorStop(0.45, "#FFFFFF08");
      lip.addColorStop(1, "#FFFFFF00");
      g.fillStyle = lip;
      roundRect(g, wx + pad, wy + pad, cell - pad * 2, Math.max(4, (cell - pad * 2) * 0.38), Math.max(2, wellR - 1.5));
      g.fill();
      g.strokeStyle = "#01050A7A";
      g.lineWidth = 1;
      roundRect(g, wx + 0.8, wy + 0.8, cell - 1.6, cell - 1.6, wellR);
      g.stroke();
      g.strokeStyle = rimDim;
      g.lineWidth = 0.55;
      roundRect(g, wx + 0.5, wy + 0.5, cell - 1, cell - 1, wellR);
      g.stroke();
       g.strokeStyle = isPlayer ? "#12394A2E" : "#8F163D22";
      g.lineWidth = 0.55;
      roundRect(g, wx + pad * 0.45, wy + pad * 0.45, cell - pad * 0.9, cell - pad * 0.9, Math.max(2, wellR - 1));
      g.stroke();
    }
  }

  g.save();
  roundRect(g, FRAME, FRAME, size - FRAME * 2, size - FRAME * 2, 13);
  g.clip();
  const sheen = g.createLinearGradient(FRAME, FRAME, size * 0.7, FRAME + (size - FRAME * 2) * 0.4);
  sheen.addColorStop(0, isPlayer ? "#DDF8FF0E" : "#FFD6E20A");
  sheen.addColorStop(0.3, "#FFFFFF05");
  sheen.addColorStop(0.58, "#FFFFFF00");
  sheen.addColorStop(1, "#01050A1F");
  g.fillStyle = sheen;
  g.fillRect(FRAME, FRAME, size - FRAME * 2, size - FRAME * 2);
  const innerLit = g.createLinearGradient(FRAME, FRAME, FRAME, FRAME + 16);
  innerLit.addColorStop(0, "#FFFFFF12");
  innerLit.addColorStop(1, "#FFFFFF00");
  g.fillStyle = innerLit;
  g.fillRect(FRAME, FRAME, size - FRAME * 2, 16);
  g.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function chamferedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  chamfer: number,
): void {
  const c = Math.min(Math.max(0, chamfer), size / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + size - c, y);
  ctx.lineTo(x + size, y + c);
  ctx.lineTo(x + size, y + size - c);
  ctx.lineTo(x + size - c, y + size);
  ctx.lineTo(x + c, y + size);
  ctx.lineTo(x, y + size - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function colorWithAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

function shade(hex: string, mul: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * mul));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * mul));
  const b = Math.min(255, Math.round((n & 255) * mul));
  return `rgb(${r},${g},${b})`;
}

function polygonPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  rot: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (Math.PI * 2 * i) / sides;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintSpeculars(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const glints: Array<[number, number, number, number]> = [
    [-0.2, -0.24, 0.082, 0.78],
    [0.16, -0.14, 0.036, 0.54],
    [-0.06, 0.18, 0.03, 0.22],
    [0.22, 0.06, 0.026, 0.4],
  ];
  for (const [ox, oy, rad, a] of glints) {
    const x = cx + s * ox;
    const y = cy + s * oy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.32, `rgba(255,255,255,${a * 0.34})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCrystalOptics(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  colorIndex: number,
  color: string,
): void {
  const r = s / 2;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (colorIndex === 1) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.18);
    ctx.lineTo(cx - r * 0.58, cy - r * 0.4);
    ctx.lineTo(cx, cy + r * 0.68);
    ctx.closePath();
    ctx.fillStyle = "#8F084857";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.18);
    ctx.lineTo(cx + r * 0.58, cy - r * 0.4);
    ctx.lineTo(cx, cy + r * 0.68);
    ctx.closePath();
    ctx.fillStyle = "#FFE1F447";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.22);
    ctx.lineTo(cx - r * 0.3, cy - r * 0.16);
    ctx.lineTo(cx + r * 0.3, cy - r * 0.16);
    ctx.closePath();
    ctx.fillStyle = "#FF48C847";
    ctx.fill();
  } else if (colorIndex === 2) {
    for (let i = 0; i < 5; i++) {
      const a0 = -Math.PI / 2 + (Math.PI * 2 * i) / 5;
      const a1 = -Math.PI / 2 + (Math.PI * 2 * (i + 1)) / 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * r * 0.74, cy + Math.sin(a0) * r * 0.74);
      ctx.lineTo(cx + Math.cos(a1) * r * 0.74, cy + Math.sin(a1) * r * 0.74);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#FFD44747" : "#FFF2B024";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.strokeStyle = "#FFF2B059";
    ctx.lineWidth = Math.max(1.4, s * 0.03);
    polygonPath(ctx, cx, cy, r * 0.78, 5, -Math.PI / 2);
    ctx.stroke();
  } else if (colorIndex === 3) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx - r * 0.46, cy + r * 0.34);
    ctx.lineTo(cx, cy + r * 0.18);
    ctx.closePath();
    ctx.fillStyle = "#005C3847";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.46, cy + r * 0.34);
    ctx.lineTo(cx, cy + r * 0.18);
    ctx.closePath();
    ctx.fillStyle = "#D9FFF142";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.36);
    ctx.lineTo(cx + r * 0.32, cy + r * 0.22);
    ctx.lineTo(cx - r * 0.32, cy + r * 0.22);
    ctx.closePath();
    ctx.fillStyle = `${color}40`;
    ctx.fill();
  } else if (colorIndex === 4) {
    const t = r * 0.38;
    ctx.fillStyle = `${color}30`;
    roundRect(ctx, cx - t, cy - t, t * 2, t * 2, r * 0.08);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.64, cy - r * 0.64);
    ctx.lineTo(cx + r * 0.64, cy - r * 0.64);
    ctx.lineTo(cx + t, cy - t);
    ctx.lineTo(cx - t, cy - t);
    ctx.closePath();
    ctx.fillStyle = "#DDF8FF42";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.64, cy - r * 0.64);
    ctx.lineTo(cx + r * 0.64, cy + r * 0.64);
    ctx.lineTo(cx + t, cy + t);
    ctx.lineTo(cx + t, cy - t);
    ctx.closePath();
    ctx.fillStyle = "#073A9E38";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.64, cy + r * 0.64);
    ctx.lineTo(cx + r * 0.64, cy + r * 0.64);
    ctx.lineTo(cx + t, cy + t);
    ctx.lineTo(cx - t, cy + t);
    ctx.closePath();
    ctx.fillStyle = "#073A9E2E";
    ctx.fill();
  } else if (colorIndex === 5) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.74);
    ctx.lineTo(cx + r * 0.24, cy - r * 0.08);
    ctx.lineTo(cx + r * 0.68, cy);
    ctx.lineTo(cx + r * 0.24, cy + r * 0.08);
    ctx.lineTo(cx, cy + r * 0.74);
    ctx.lineTo(cx - r * 0.24, cy + r * 0.08);
    ctx.lineTo(cx - r * 0.68, cy);
    ctx.lineTo(cx - r * 0.24, cy - r * 0.08);
    ctx.closePath();
    ctx.fillStyle = `${color}36`;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.28, cy);
    ctx.lineTo(cx, cy + r * 0.42);
    ctx.lineTo(cx - r * 0.28, cy);
    ctx.closePath();
    ctx.fillStyle = "#F3D9FF38";
    ctx.fill();
  } else {
    ctx.fillStyle = "#49F6FF1F";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#EAFBFF29";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#EAFBFF61";
    ctx.lineWidth = Math.max(1.6, s * 0.028);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      ctx.lineTo(cx + Math.cos(a + 0.38) * r * 0.5, cy + Math.sin(a + 0.38) * r * 0.5);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#49F6FF1A" : "#005C731A";
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.16;
  const caustic = ctx.createRadialGradient(cx - s * 0.1, cy - s * 0.06, 0, cx - s * 0.02, cy + s * 0.04, s * 0.22);
  caustic.addColorStop(0, "rgba(255,255,255,0.48)");
  caustic.addColorStop(0.38, `${color}4a`);
  caustic.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = caustic;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.06, cy - s * 0.02, s * 0.13, s * 0.19, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#FFFFFF8C";
  ctx.lineWidth = Math.max(0.6, s * 0.012);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.18, cy - s * 0.16);
  ctx.quadraticCurveTo(cx - s * 0.02, cy - s * 0.22, cx + s * 0.12, cy - s * 0.08);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function jewelPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, colorIndex: number): void {
  const r = s / 2;
  if (colorIndex === 1) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.96);
    ctx.lineTo(cx - r * 0.94, cy - r * 0.58);
    ctx.lineTo(cx + r * 0.94, cy - r * 0.58);
    ctx.closePath();
    return;
  }
  if (colorIndex === 2) {
    polygonPath(ctx, cx, cy, r * 0.94, 5, -Math.PI / 2);
    return;
  }
  if (colorIndex === 3) {
    polygonPath(ctx, cx, cy, r * 0.92, 6, Math.PI / 6);
    return;
  }
  if (colorIndex === 4) {
    roundRect(ctx, cx - r * 0.84, cy - r * 0.84, r * 1.68, r * 1.68, r * 0.22);
    return;
  }
  if (colorIndex === 5) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.72, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.72, cy);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.closePath();
}

function drawGemIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, colorIndex: number): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const r = Math.max(2.4, s * 0.2);
  ctx.beginPath();
  if (colorIndex === 1) {
    ctx.moveTo(cx - r, cy - r * 0.1);
    ctx.lineTo(cx, cy + r * 0.78);
    ctx.lineTo(cx + r, cy - r * 0.1);
    ctx.closePath();
  } else if (colorIndex === 2) {
    ctx.moveTo(cx - r, cy + r * 0.48);
    ctx.lineTo(cx - r, cy - r * 0.08);
    ctx.lineTo(cx - r * 0.4, cy + r * 0.16);
    ctx.lineTo(cx, cy - r * 0.58);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.16);
    ctx.lineTo(cx + r, cy - r * 0.08);
    ctx.lineTo(cx + r, cy + r * 0.48);
    ctx.closePath();
  } else if (colorIndex === 3) {
    ctx.moveTo(cx, cy - r * 0.78);
    ctx.lineTo(cx + r * 0.8, cy + r * 0.52);
    ctx.lineTo(cx - r * 0.8, cy + r * 0.52);
    ctx.closePath();
  } else if (colorIndex === 4) {
    roundRect(ctx, cx - r * 0.56, cy - r * 0.56, r * 1.12, r * 1.12, r * 0.12);
  } else if (colorIndex === 5) {
    ctx.moveTo(cx, cy - r * 0.86);
    ctx.lineTo(cx + r * 0.28, cy - r * 0.08);
    ctx.lineTo(cx + r * 0.9, cy);
    ctx.lineTo(cx + r * 0.28, cy + r * 0.08);
    ctx.lineTo(cx, cy + r * 0.86);
    ctx.lineTo(cx - r * 0.28, cy + r * 0.08);
    ctx.lineTo(cx - r * 0.9, cy);
    ctx.lineTo(cx - r * 0.28, cy - r * 0.08);
    ctx.closePath();
  } else {
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.46, cy);
    ctx.arc(cx, cy, r * 0.46, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.2, cy);
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  }
  const glow = ctx.createRadialGradient(cx, cy - r * 0.08, r * 0.06, cx, cy, r);
  glow.addColorStop(0, "rgba(255,255,255,0.72)");
  glow.addColorStop(0.38, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.fill("evenodd");
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.restore();
}
