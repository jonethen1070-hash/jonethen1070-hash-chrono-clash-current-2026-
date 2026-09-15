import {
  applyGravity,
  cloneBoard,
  createSeededRng,
  findAnyValidSwap,
  generateBoard,
  matchingNeighbors,
  snapshotBoard,
  trySwap,
} from "./board";
import { attackBanner, clampScoreTarget, comboFlavor, fillAttack } from "./combat";
import { seatForPlayer, seatSeed } from "./online";
import { grantMatchRewards, loadProgress, resetProgress, saveProgress, RewardGrant } from "./progress";
import { isOwned } from "./catalog";
import { clearAvatarPhoto, hasAvatarPhoto, saveAvatarPhoto } from "./avatarPhoto";
import {
  applyEconomy,
  buyCharge,
  canEarnCharge,
  claimAdReward,
  economyFromProgress,
  EconomyFail,
  getCharge,
  grantWinningCoins,
  spendCharge,
  spendWinningCoins,
} from "./economy";
import { powerConsumesCharge, powerEnergyCost, resolveTargetedPower } from "./powers";
import {
  applyDailyRun,
  applyDailyRunOutcome,
  canStartDailyRun as dailyRunHasLives,
  dailyRunFromProgress,
  DailyRunFail,
  DailyRunState,
  refreshDailyRun,
  restoreDailyLifeAd,
} from "./dailyRun";
import { isDevBattleBypassEnabled } from "./devBattleBypass";
import { loadSettings, saveSettings } from "./settings";
import {
  canAffordCoinRoom,
  clampCoinRoomMatch,
  coinRoomById,
  markCoinRoomCharged,
  markCoinRoomSettled,
  openCoinRoomRecord,
  parseCoinRoomId,
  roomPayoutForOutcome,
  type CoinRoom,
  type CoinRoomEnterResult,
  type CoinRoomId,
  type CoinRoomMatchRecord,
  type CoinRoomSettlement,
  type CoinRoomSettleOutcome,
} from "./rooms";
import { INTRO_TOTAL_MS, introBeat, IntroBeat } from "./intro";
import {
  ATTACK_MAX,
  Board,
  COMBO_HOLD_MS,
  COLS,
  Coord,
  COUNTDOWN_SECONDS,
  ENERGY_FREEZE,
  ENERGY_MAX,
  ENERGY_REWIND,
  ENERGY_TIMESHIFT,
  FINALE_MS,
  FREEZE_MS,
  GameMode,
  INVALID_RETURN_MS,
  LocalProgress,
  SWAP_INPUT_LOCK_MS,
  MATCH_SECONDS,
  MatchState,
  POWER_LOCK_MS,
  PowerId,
  PRESSURE_MS,
  READY_MS,
  ResolveResult,
  REWIND_HISTORY,
  RIVAL_FREEZE_MS,
  ROWS,
  SCORE_SURGE_MS,
  SCORE_TARGET,
  TIME_STEAL_MS,
  TIMESHIFT_MS,
} from "./types";

export { FINALE_MS };

export type Screen =
  | "splash"
  | "menu"
  | "profile"
  | "trophies"
  | "modes"
  | "ready"
  | "match"
  | "results"
  | "rewards"
  | "settings"
  | "tutorial"
  | "online";
export type MatchPhase = "countdown" | "playing" | "paused" | "ended";
export type Outcome = "win" | "loss" | "tie";

export interface FighterState {
  board: Board;
  score: number;
  energy: number;
  combo: number;
  bestCombo: number;
  lastClearAt: number;
  attack: number;
}

export interface MatchResult {
  outcome: Outcome;
  playerScore: number;
  opponentScore: number;
  playerBestCombo: number;
  opponentBestCombo: number;
  mode: GameMode;
  target: number;
  progress: LocalProgress;
  grant: RewardGrant | null;
  inspection?: boolean;
  coinRoom?: CoinRoomSettlement | null;
}

export interface DragState {
  from: Coord;
  dx: number;
  dy: number;
}

export interface BounceState extends DragState {
  born: number;
}

export interface GameSnapshot {
  screen: Screen;
  phase: MatchPhase;
  matchState: MatchState;
  mode: GameMode;
  target: number;
  coinRoomId: CoinRoomId;
  remainingMs: number;
  countdownMs: number;
  readyMs: number;
  player: FighterState;
  opponent: FighterState;
  selected: Coord | null;
  drag: DragState | null;
  bounce: BounceState | null;
  hint: Coord[];
  fx: FxEvent[];
  freezeUntil: number;
  timeshiftUntil: number;
  freezeRemainingMs: number;
  timeshiftRemainingMs: number;
  playerLockedRemainingMs: number;
  rivalLockedRemainingMs: number;
  scoreBoostRemainingMs: number;
  playerAttack: number;
  opponentAttack: number;
  last5: boolean;
  last10: boolean;
  danger: boolean;
  muted: boolean;
  busy: boolean;
  finaleMs: number;
  result: MatchResult | null;
  progress: LocalProgress;
  tutorial: number;
  intro: boolean;
  splashElapsedMs: number;
  introBeat: IntroBeat;
  now: number;
}

export type FxSide = "player" | "opponent";

export interface FxEvent {
  id: number;
  kind:
    | "clear"
    | "combo"
    | "power"
    | "countdown"
    | "urgent"
    | "attack"
    | "finale"
    | "rewind"
    | "pressure"
    | "state";
  text: string;
  born: number;
  side?: FxSide;
  combo?: number;
  score?: number;
  at?: Coord;
  cells?: Coord[];
}

interface PlayerSnap {
  board: Board;
  score: number;
  combo: number;
  energy: number;
  bestCombo: number;
  attack: number;
}

export class GameSession {
  screen: Screen = "splash";
  phase: MatchPhase = "countdown";
  mode: GameMode = "time";
  scoreTarget = SCORE_TARGET;
  selectedRoomId: CoinRoomId = "rookie";
  lastCoinRoomEnter: CoinRoomEnterResult | null = null;
  lastCoinRoomSettlement: CoinRoomSettlement | null = null;
  muted = false;
  selected: Coord | null = null;
  drag: DragState | null = null;
  bounce: BounceState | null = null;
  player!: FighterState;
  opponent!: FighterState;
  result: MatchResult | null = null;
  inspectionMatch = false;
  progress: LocalProgress = loadProgress();
  trustedUtcMs: number | null = null;
  fx: FxEvent[] = [];
  freezeUntil = 0;
  timeshiftUntil = 0;
  playerLockedUntil = 0;
  rivalPressureUntil = 0;
  scoreBoostUntil = 0;
  tutorial = 0;
  private settingsBack: Screen = "menu";
  private pausedForSettings = false;
  private rng = createSeededRng(Date.now() >>> 0);
  onlineMatchId: string | null = null;
  onlineRivalId: string | null = null;
  onlinePlayerId: string | null = null;
  onlineSeat: "a" | "b" = "a";
  onlineLastSeq = 0;
  pendingClientSeq = 0;
  private onlineSeed: number | null = null;
  private onlinePhase: "waiting" | "countdown" | "playing" | "ended" | "cancelled" | null = null;
  private onlineRemainingMs: number | null = null;
  private onlineRemainingAt = 0;

  get onlineRemote(): boolean {
    return this.onlineMatchId != null;
  }
  private matchStart = 0;
  private pausedAt = 0;
  private pausedAccum = 0;
  private countdownStart = 0;
  private lastOppThink = 0;
  private lastPlayerSnap: PlayerSnap[] = [];
  private fxId = 1;
  private busyUntil = 0;
  private finaleUntil = 0;
  private readyAt = 0;
  private timeshiftHold = 0;
  private timeshiftStarted = 0;
  private timeshiftCoolUntil = 0;
  private clockFrozenUntil = 0;
  private clockFrozenStart = 0;
  private powersThisMatch: PowerId[] = [];
  private splashAt = 0;
  private warnedFinal = false;
  private warnedDanger = false;
  private clockExpired = false;
  private powerLockUntil = 0;
  private resolving = false;
  private ended = false;
  private rivalPowerCool = 0;
  private playerBoardGen = 0;
  private oppBoardGen = 0;
  private cachedPlayerBoard: Board | null = null;
  private cachedOppBoard: Board | null = null;
  private cachedPlayerGen = -1;
  private cachedOppGen = -1;
  private cachedHint: Coord[] = [];
  private cachedHintGen = -1;
  private cachedHintSel = "";
  private snapPlayer: FighterState = {
    board: [],
    score: 0,
    energy: 0,
    combo: 0,
    bestCombo: 0,
    lastClearAt: 0,
    attack: 0,
  };
  private snapOpp: FighterState = {
    board: [],
    score: 0,
    energy: 0,
    combo: 0,
    bestCombo: 0,
    lastClearAt: 0,
    attack: 0,
  };
  private snapDrag: DragState | null = null;
  private coinRoomIntent: CoinRoomMatchRecord | null = null;
  private activeCoinRoom: CoinRoomMatchRecord | null = null;

  constructor() {
    this.resetFighters();
    this.muted = !loadSettings().sfx;
    const settings = loadSettings();
    this.mode = this.progress.lastMode === "score" ? "score" : "time";
    this.selectedRoomId = parseCoinRoomId(this.progress.lastCoinRoomId);
    this.scoreTarget = clampScoreTarget(settings.scoreTarget, SCORE_TARGET);
    this.splashAt = typeof performance !== "undefined" ? performance.now() : 0;
    this.reconcileAbandonedCoinRoom();
  }

  get intro(): boolean {
    return this.progress.matchesSeen < 1;
  }

  matchState(now = performance.now()): MatchState {
    if (this.screen === "ready") return "READY";
    if (this.screen === "match" && this.phase === "countdown") return "COUNTDOWN";
    if (this.screen === "match" && this.phase === "paused") return "PAUSED";
    if (this.phase === "ended" || this.result) {
      if (this.result?.outcome === "win") return "WON";
      if (this.result?.outcome === "loss") return "LOST";
      if (this.result?.outcome === "tie") return "DRAW";
    }
    if (this.screen === "match" && this.phase === "playing") {
      const powered =
        now < this.freezeUntil ||
        now < this.timeshiftUntil ||
        now < this.playerLockedUntil ||
        now < this.clockFrozenUntil ||
        now < this.scoreBoostUntil;
      if (powered) return "POWER_ACTIVE";
      if (this.mode === "time" && this.remainingMs(now) <= 10_000) return "FINAL_SECONDS";
      return "PLAYING";
    }
    return "PLAYING";
  }

  snapshot(now = performance.now()): GameSnapshot {
    const remaining = this.remainingMs(now);
    const playing = this.phase === "playing";
    this.snapPlayer.board = this.clonePlayerBoard();
    this.snapPlayer.score = this.player.score;
    this.snapPlayer.energy = this.player.energy;
    this.snapPlayer.combo = this.player.combo;
    this.snapPlayer.bestCombo = this.player.bestCombo;
    this.snapPlayer.lastClearAt = this.player.lastClearAt;
    this.snapPlayer.attack = this.player.attack;
    this.snapOpp.board = this.cloneOppBoard();
    this.snapOpp.score = this.opponent.score;
    this.snapOpp.energy = this.opponent.energy;
    this.snapOpp.combo = this.opponent.combo;
    this.snapOpp.bestCombo = this.opponent.bestCombo;
    this.snapOpp.lastClearAt = this.opponent.lastClearAt;
    this.snapOpp.attack = this.opponent.attack;
    if (this.drag) {
      if (!this.snapDrag) this.snapDrag = { from: { r: 0, c: 0 }, dx: 0, dy: 0 };
      this.snapDrag.from.r = this.drag.from.r;
      this.snapDrag.from.c = this.drag.from.c;
      this.snapDrag.dx = this.drag.dx;
      this.snapDrag.dy = this.drag.dy;
    }
    return {
      screen: this.screen,
      phase: this.phase,
      matchState: this.matchState(now),
      mode: this.mode,
      target: this.mode === "score" ? this.scoreTarget : 0,
      coinRoomId: this.selectedRoomId,
      remainingMs: remaining,
      countdownMs: this.countdownMs(now),
      readyMs: this.screen === "ready" ? Math.max(0, READY_MS - (now - this.readyAt)) : 0,
      player: this.snapPlayer,
      opponent: this.snapOpp,
      selected: this.selected,
      drag: this.drag ? this.snapDrag : null,
      bounce: this.liveBounce(now),
      hint: this.hintCells(now),
      fx: this.fx,
      freezeUntil: this.freezeUntil,
      timeshiftUntil: this.timeshiftUntil,
      freezeRemainingMs: Math.max(0, this.freezeUntil - now),
      timeshiftRemainingMs: Math.max(0, this.timeshiftUntil - now),
      playerLockedRemainingMs: Math.max(0, this.playerLockedUntil - now),
      rivalLockedRemainingMs: Math.max(0, Math.max(this.freezeUntil, this.timeshiftUntil, this.rivalPressureUntil) - now),
      scoreBoostRemainingMs: Math.max(0, this.scoreBoostUntil - now),
      playerAttack: this.player.attack,
      opponentAttack: this.opponent.attack,
      last5: playing && this.mode === "time" && remaining <= 5000,
      last10: playing && this.mode === "time" && remaining <= 10_000,
      danger: this.isDanger(now),
      muted: this.muted,
      busy: now < this.busyUntil,
      finaleMs: this.phase === "ended" ? Math.max(0, this.finaleUntil - now) : 0,
      result: this.result,
      progress: this.progress,
      tutorial: this.tutorial,
      intro: this.intro,
      splashElapsedMs: this.screen === "splash" ? Math.max(0, now - this.splashAt) : 0,
      introBeat: this.screen === "splash" ? introBeat(now - this.splashAt) : "done",
      now,
    };
  }

  begin(now = performance.now(), skipIntro = false): void {
    if (skipIntro) {
      this.screen = "menu";
      return;
    }
    if (this.screen !== "splash") return;
    this.splashAt = now;
  }

  skipIntro(allowed: boolean): boolean {
    if (!allowed || this.screen !== "splash") return false;
    this.screen = "menu";
    return true;
  }

  toMenu(): void {
    this.abandonOpenCoinRoomMatch();
    this.coinRoomIntent = null;
    this.screen = "menu";
    this.phase = "countdown";
    this.result = null;
    this.selected = null;
    this.drag = null;
    this.bounce = null;
    this.fx = [];
    this.pausedForSettings = false;
    this.settingsBack = "menu";
    this.clearOnlineMatch();
  }

  openOnline(): void {
    if (this.screen === "menu" || this.screen === "splash") this.screen = "online";
  }

  openProfile(): void {
    if (this.screen === "menu" || this.screen === "rewards" || this.screen === "trophies") this.screen = "profile";
  }

  openTrophies(): void {
    if (this.screen === "menu" || this.screen === "profile" || this.screen === "rewards") this.screen = "trophies";
  }

  openModes(): void {
    if (!this.progress.tutorialDone) {
      this.openTutorial();
      return;
    }
    this.refreshDailyRun();
    if (this.screen === "menu" || this.screen === "profile" || this.screen === "trophies") this.screen = "modes";
  }

  playNow(now = performance.now()): void {
    this.clearOnlineMatch();
    if (!this.progress.tutorialDone) {
      this.openTutorial();
      return;
    }
    this.chooseMode(this.progress.lastMode === "score" ? "score" : "time", now);
  }

  beginOnlineTimeBattle(
    input: { matchId: string; opponentId: string; seed: number; playerId?: string; players?: string[] },
    now = performance.now(),
  ): void {
    if (!this.canStartDailyRun()) {
      this.clearOnlineMatch();
      this.screen = "modes";
      return;
    }
    this.onlineMatchId = input.matchId;
    this.onlineRivalId = input.opponentId;
    this.onlinePlayerId = input.playerId ?? null;
    this.onlineSeat = input.playerId && input.players?.length ? seatForPlayer(input.playerId, input.players) : "a";
    this.onlineSeed = input.seed >>> 0;
    this.onlinePhase = "waiting";
    this.onlineRemainingMs = MATCH_SECONDS * 1000;
    this.onlineRemainingAt = now;
    this.onlineLastSeq = 0;
    this.pendingClientSeq = 0;
    this.mode = "time";
    this.progress = { ...this.progress, lastMode: "time", tutorialDone: true };
    this.chooseMode("time", now);
  }

  clearOnlineMatch(): void {
    this.onlineMatchId = null;
    this.onlineRivalId = null;
    this.onlinePlayerId = null;
    this.onlineSeat = "a";
    this.onlineSeed = null;
    this.onlinePhase = null;
    this.onlineRemainingMs = null;
    this.onlineRemainingAt = 0;
    this.onlineLastSeq = 0;
    this.pendingClientSeq = 0;
  }

  applyBattleSnapshot(
    snap: {
      matchId: string;
      seed: number;
      seq: number;
      phase: "waiting" | "countdown" | "playing" | "ended" | "cancelled";
      remainingMs: number;
      you: {
        playerId: string;
        board: Board;
        score: number;
        combo: number;
        energy: number;
        attack: number;
        lock: number;
        lastClientSeq: number;
      };
      opponent: {
        playerId: string;
        board: Board;
        score: number;
        combo: number;
        energy: number;
        attack: number;
        lock: number;
      };
      result: { winnerId: string | null; scores: Record<string, number> } | null;
      yourLastClientSeq: number;
    },
    now = performance.now(),
  ): void {
    if (!this.onlineMatchId || snap.matchId !== this.onlineMatchId) return;
    if (snap.seq < this.onlineLastSeq) return;
    this.onlinePhase = snap.phase;
    this.onlineRemainingMs = snap.remainingMs;
    this.onlineRemainingAt = now;
    this.onlineLastSeq = snap.seq;
    this.onlineSeed = snap.seed >>> 0;
    this.opponent.board = cloneBoard(snap.opponent.board);
    this.bumpOppBoard();
    this.opponent.score = snap.opponent.score;
    this.opponent.energy = snap.opponent.energy;
    this.opponent.combo = snap.opponent.combo;
    this.opponent.attack = snap.opponent.attack;
    this.rivalPressureUntil = now + Math.max(0, snap.opponent.lock);
    this.freezeUntil = now + Math.max(0, snap.opponent.lock);
    this.playerLockedUntil = now + Math.max(0, snap.you.lock);
    if (this.pendingClientSeq <= snap.yourLastClientSeq) {
      this.player.board = cloneBoard(snap.you.board);
      this.bumpPlayerBoard();
      this.player.score = snap.you.score;
      this.player.energy = snap.you.energy;
      this.player.combo = snap.you.combo;
      this.player.attack = snap.you.attack;
    }
    if (snap.phase === "playing" && this.screen === "match" && this.phase === "countdown") {
      this.phase = "playing";
      this.matchStart = now;
    }
    if ((snap.phase === "waiting" || snap.phase === "countdown") && this.phase === "playing" && !this.ended) {
      this.phase = "countdown";
    }
    if (snap.phase === "cancelled" && !this.ended) {
      this.toMenu();
      return;
    }
    if (snap.result && !this.ended) {
      const youId = this.onlinePlayerId || snap.you.playerId;
      const rivalId = this.onlineRivalId || snap.opponent.playerId;
      this.player.score = snap.result.scores[youId] ?? snap.you.score;
      this.opponent.score = snap.result.scores[rivalId] ?? snap.opponent.score;
      const outcome: Outcome = !snap.result.winnerId ? "tie" : snap.result.winnerId === youId ? "win" : "loss";
      this.endMatch(now, outcome);
    }
  }

  closeSettings(now = performance.now()): void {
    if (this.screen !== "settings") return;
    const back = this.settingsBack;
    const shouldResume = this.pausedForSettings;
    this.settingsBack = "menu";
    this.pausedForSettings = false;
    this.screen = back === "match" ? "match" : "menu";
    if (this.screen === "match" && shouldResume && this.phase === "paused") this.resume(now);
  }

  quitToMenu(now = performance.now()): void {
    this.pausedForSettings = false;
    this.settingsBack = "menu";
    if (this.hasOpenCoinRoomStake() && this.screen === "match" && !this.ended) {
      this.endMatch(now, "loss");
    }
    this.toMenu();
  }

  openSettings(): void {
    if (this.screen === "menu" || this.screen === "match") {
      this.settingsBack = this.screen;
      this.pausedForSettings = false;
      if (this.screen === "match" && this.phase === "playing") {
        this.pause();
        this.pausedForSettings = true;
      }
      this.screen = "settings";
    }
  }

  openTutorial(): void {
    this.screen = "tutorial";
    this.tutorial = 0;
  }

  nextTutorial(): void {
    if (this.screen !== "tutorial") return;
    this.tutorial += 1;
    if (this.tutorial > 5) {
      this.progress = { ...this.progress, tutorialDone: true };
      saveProgress(this.progress);
      this.screen = "modes";
    }
  }

  skipTutorial(): void {
    this.progress = { ...this.progress, tutorialDone: true };
    saveProgress(this.progress);
    this.screen = this.progress.plays ? "menu" : "modes";
  }

  setScoreTarget(target: number): number {
    this.scoreTarget = clampScoreTarget(target, this.scoreTarget);
    const settings = loadSettings();
    settings.scoreTarget = this.scoreTarget;
    saveSettings(settings);
    return this.scoreTarget;
  }

  /** Remember a virtual coin room. Does not deduct coins or start a match. */
  selectCoinRoom(id: string): CoinRoom {
    const room = coinRoomById(id);
    this.selectedRoomId = room.id;
    this.progress = { ...this.progress, lastCoinRoomId: room.id };
    saveProgress(this.progress);
    return room;
  }

  coinRoom(): CoinRoom {
    return coinRoomById(this.selectedRoomId);
  }

  /**
   * Explicit coin-room entry. Time/Score via chooseMode remain free.
   * Deducts the entry fee only when startMatch actually begins the match.
   */
  enterCoinRoomMatch(mode: GameMode, roomId?: string, now = performance.now()): CoinRoomEnterResult {
    const room = coinRoomById(roomId ?? this.selectedRoomId);
    this.selectCoinRoom(room.id);
    const have = Math.max(0, Math.trunc(Number(this.progress.winningCoins) || 0));
    const fail = (reason: "funds" | "unavailable"): CoinRoomEnterResult => {
      const result: CoinRoomEnterResult = { ok: false, reason, room, have, need: room.entryCoins, charged: 0 };
      this.lastCoinRoomEnter = result;
      this.coinRoomIntent = null;
      return result;
    };
    this.refreshDailyRun();
    if (!this.canEnterLocalBattle()) return fail("unavailable");
    if (!canAffordCoinRoom(have, room)) return fail("funds");
    this.coinRoomIntent = openCoinRoomRecord(room, now);
    this.chooseMode(mode, now);
    if (this.screen !== "ready") return fail("unavailable");
    const result: CoinRoomEnterResult = { ok: true, room, have, need: room.entryCoins, charged: 0 };
    this.lastCoinRoomEnter = result;
    return result;
  }

  activeCoinRoomMatch(): CoinRoomMatchRecord | null {
    return this.activeCoinRoom;
  }

  /** Idempotent settlement. Win pays rewardCoins once; any other outcome pays 0. */
  settleActiveCoinRoom(outcome: CoinRoomSettleOutcome): CoinRoomSettlement | null {
    const record =
      this.activeCoinRoom ??
      clampCoinRoomMatch(this.progress.coinRoomMatch);
    if (!record?.charged) return this.lastCoinRoomSettlement;
    if (record.settled) {
      const already: CoinRoomSettlement = {
        matchId: record.matchId,
        roomId: record.roomId,
        entryCoins: record.entryCoins,
        payout: 0,
        settled: true,
        outcome,
      };
      this.lastCoinRoomSettlement = already;
      this.activeCoinRoom = record;
      return already;
    }
    const payout = roomPayoutForOutcome(record, outcome);
    let next = this.progress;
    if (payout > 0) {
      const granted = grantWinningCoins(economyFromProgress(next), payout);
      if (granted.ok) next = applyEconomy(next, granted.state);
    }
    const settled = markCoinRoomSettled(record);
    next = { ...next, coinRoomMatch: settled };
    this.progress = next;
    saveProgress(this.progress);
    this.activeCoinRoom = settled;
    const settlement: CoinRoomSettlement = {
      matchId: settled.matchId,
      roomId: settled.roomId,
      entryCoins: settled.entryCoins,
      payout,
      settled: true,
      outcome,
    };
    this.lastCoinRoomSettlement = settlement;
    return settlement;
  }

  private reconcileAbandonedCoinRoom(): void {
    const rec = clampCoinRoomMatch(this.progress.coinRoomMatch);
    if (!rec?.charged || rec.settled) {
      this.activeCoinRoom = rec?.charged ? rec : null;
      return;
    }
    this.activeCoinRoom = rec;
    this.settleActiveCoinRoom("void");
  }

  private hasOpenCoinRoomStake(): boolean {
    const rec = this.activeCoinRoom ?? clampCoinRoomMatch(this.progress.coinRoomMatch);
    return Boolean(rec?.charged && !rec.settled);
  }

  private abandonOpenCoinRoomMatch(): void {
    if (this.ended) return;
    if (this.hasOpenCoinRoomStake()) this.settleActiveCoinRoom("void");
  }

  private chargeCoinRoomIntent(): CoinRoomEnterResult {
    const intent = this.coinRoomIntent;
    const room = intent ? coinRoomById(intent.roomId) : this.coinRoom();
    const have = Math.max(0, Math.trunc(Number(this.progress.winningCoins) || 0));
    if (!intent) {
      return { ok: true, room, have, need: 0, charged: 0 };
    }
    const persisted = clampCoinRoomMatch(this.progress.coinRoomMatch);
    if (persisted?.matchId === intent.matchId && persisted.charged) {
      this.activeCoinRoom = persisted;
      this.coinRoomIntent = null;
      const result: CoinRoomEnterResult = {
        ok: true,
        room,
        have,
        need: intent.entryCoins,
        charged: persisted.settled ? 0 : intent.entryCoins,
      };
      this.lastCoinRoomEnter = result;
      return result;
    }
    if (!canAffordCoinRoom(have, room)) {
      this.coinRoomIntent = null;
      const result: CoinRoomEnterResult = {
        ok: false,
        reason: "funds",
        room,
        have,
        need: room.entryCoins,
        charged: 0,
      };
      this.lastCoinRoomEnter = result;
      return result;
    }
    const spent = spendWinningCoins(economyFromProgress(this.progress), intent.entryCoins);
    if (!spent.ok) {
      this.coinRoomIntent = null;
      const result: CoinRoomEnterResult = {
        ok: false,
        reason: "funds",
        room,
        have,
        need: room.entryCoins,
        charged: 0,
      };
      this.lastCoinRoomEnter = result;
      return result;
    }
    const charged = markCoinRoomCharged(intent);
    this.progress = { ...applyEconomy(this.progress, spent.state), coinRoomMatch: charged };
    saveProgress(this.progress);
    this.activeCoinRoom = charged;
    this.coinRoomIntent = null;
    const result: CoinRoomEnterResult = {
      ok: true,
      room,
      have: this.progress.winningCoins,
      need: charged.entryCoins,
      charged: charged.entryCoins,
    };
    this.lastCoinRoomEnter = result;
    return result;
  }

  chooseMode(mode: GameMode, now = performance.now()): void {
    this.refreshDailyRun();
    if (!this.canEnterLocalBattle()) {
      this.screen = "modes";
      return;
    }
    this.mode = mode;
    this.progress = { ...this.progress, lastMode: mode };
    saveProgress(this.progress);
    this.screen = "ready";
    this.readyAt = now;
  }

  confirmReady(now = performance.now()): void {
    if (this.screen !== "ready") return;
    this.startMatch(now);
  }

  isInteractive(now = performance.now()): boolean {
    if (this.onlineRemote && this.onlinePhase !== "playing") return false;
    if (this.screen !== "match" || this.phase !== "playing" || this.ended) return false;
    if (this.resolving) return false;
    if (now < this.busyUntil) return false;
    if (now < this.playerLockedUntil) return false;
    return true;
  }

  canUsePower(id: PowerId, now = performance.now()): boolean {
    if (this.screen !== "match" || this.phase !== "playing" || this.ended) return false;
    if (this.resolving) return false;
    if (now < this.powerLockUntil) return false;
    if (powerConsumesCharge(id) && getCharge(economyFromProgress(this.progress), id) <= 0) return false;
    if (id === "freeze") return this.player.energy >= powerEnergyCost(id);
    if (id === "timeshift") {
      return (
        this.player.energy >= powerEnergyCost(id) &&
        now >= this.timeshiftUntil &&
        now >= this.timeshiftCoolUntil
      );
    }
    if (id === "rewind") return this.player.energy >= powerEnergyCost(id) && this.lastPlayerSnap.length >= 2;
    if (id === "burst" || id === "megaStrike") return this.player.energy >= powerEnergyCost(id);
    return false;
  }

  powerCharges(id: string): number {
    return getCharge(economyFromProgress(this.progress), id);
  }

  buyPowerCharge(id: string): { ok: boolean; reason?: EconomyFail } {
    const result = buyCharge(economyFromProgress(this.progress), id);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.progress = applyEconomy(this.progress, result.state);
    saveProgress(this.progress);
    return { ok: true };
  }

  syncEconomy(state: { winningCoins: number; powerCharges: Record<string, number>; claimedAdReceipts: string[] }): void {
    this.progress = applyEconomy(this.progress, state);
    saveProgress(this.progress);
  }

  claimPowerAd(id: string, receiptId: string, redeem: (receipt: string) => boolean): { ok: boolean; reason?: EconomyFail } {
    if (!canEarnCharge(economyFromProgress(this.progress), id)) return { ok: false, reason: "full" };
    if (!redeem(receiptId)) return { ok: false, reason: "receipt" };
    const result = claimAdReward(economyFromProgress(this.progress), id, receiptId);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.progress = applyEconomy(this.progress, result.state);
    saveProgress(this.progress);
    return { ok: true };
  }

  syncTrustedClock(utcMs: number): void {
    const now = Math.trunc(Number(utcMs) || 0);
    if (now <= 0) return;
    this.trustedUtcMs = now;
    this.refreshDailyRun();
  }

  syncDailyRun(state: DailyRunState): void {
    this.progress = applyDailyRun(this.progress, state);
    saveProgress(this.progress);
  }

  refreshDailyRun(): void {
    const trusted = this.trustedUtcMs != null;
    const now = this.trustedUtcMs ?? Date.now();
    this.progress = applyDailyRun(this.progress, refreshDailyRun(dailyRunFromProgress(this.progress), now, trusted));
    saveProgress(this.progress);
  }

  canStartDailyRun(): boolean {
    this.refreshDailyRun();
    return dailyRunHasLives(dailyRunFromProgress(this.progress), this.trustedUtcMs ?? Date.now(), this.trustedUtcMs != null);
  }

  canEnterLocalBattle(): boolean {
    return this.canStartDailyRun() || isDevBattleBypassEnabled();
  }

  dailyLives(): number {
    return this.dailyRun().lives;
  }

  dailyRun(): DailyRunState {
    this.refreshDailyRun();
    return dailyRunFromProgress(this.progress);
  }

  claimLifeAd(receiptId: string, redeem: (receipt: string) => boolean): { ok: boolean; reason?: DailyRunFail } {
    this.refreshDailyRun();
    if (!redeem(receiptId)) return { ok: false, reason: "receipt" };
    const result = restoreDailyLifeAd(
      dailyRunFromProgress(this.progress),
      receiptId,
      this.trustedUtcMs ?? Date.now(),
      this.trustedUtcMs != null,
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    this.progress = applyDailyRun(this.progress, result.state);
    saveProgress(this.progress);
    return { ok: true };
  }

  private consumeCharge(id: PowerId): boolean {
    if (!powerConsumesCharge(id)) return true;
    const result = spendCharge(economyFromProgress(this.progress), id);
    if (!result.ok) return false;
    this.progress = applyEconomy(this.progress, result.state);
    saveProgress(this.progress);
    return true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  startMatch(now = performance.now()): void {
    this.refreshDailyRun();
    if (!this.canEnterLocalBattle()) {
      if (this.coinRoomIntent) {
        const room = coinRoomById(this.coinRoomIntent.roomId);
        this.lastCoinRoomEnter = {
          ok: false,
          reason: "unavailable",
          room,
          have: Math.max(0, Math.trunc(Number(this.progress.winningCoins) || 0)),
          need: room.entryCoins,
          charged: 0,
        };
        this.coinRoomIntent = null;
      }
      this.screen = "modes";
      return;
    }
    if (this.coinRoomIntent) {
      const charged = this.chargeCoinRoomIntent();
      if (!charged.ok) {
        this.screen = "modes";
        return;
      }
    } else {
      this.activeCoinRoom = null;
    }
    this.inspectionMatch = !this.canStartDailyRun();
    this.resetFighters();
    this.screen = "match";
    this.phase = "countdown";
    this.result = null;
    this.selected = null;
    this.drag = null;
    this.bounce = null;
    this.fx = [];
    this.freezeUntil = 0;
    this.timeshiftUntil = 0;
    this.playerLockedUntil = 0;
    this.rivalPressureUntil = 0;
    this.scoreBoostUntil = 0;
    this.pausedAt = 0;
    this.pausedAccum = 0;
    this.timeshiftHold = 0;
    this.timeshiftStarted = 0;
    this.timeshiftCoolUntil = 0;
    this.clockFrozenUntil = 0;
    this.clockFrozenStart = 0;
    this.countdownStart = now;
    this.matchStart = 0;
    this.lastOppThink = now;
    this.busyUntil = 0;
    this.finaleUntil = 0;
    this.powersThisMatch = [];
    this.warnedFinal = false;
    this.warnedDanger = false;
    this.clockExpired = false;
    this.powerLockUntil = 0;
    this.resolving = false;
    this.ended = false;
    this.rivalPowerCool = 0;
    this.pushFx("countdown", "3", now);
    this.pushFx("state", "COUNTDOWN", now);
  }

  playAgain(now = performance.now()): void {
    this.clearOnlineMatch();
    this.refreshDailyRun();
    if (!this.canEnterLocalBattle()) {
      this.screen = "modes";
      this.result = null;
      this.ended = false;
      return;
    }
    this.screen = "ready";
    this.readyAt = now;
    this.result = null;
    this.ended = false;
  }

  pause(now = performance.now()): void {
    if (this.screen !== "match" || this.phase !== "playing") return;
    this.phase = "paused";
    this.pausedAt = now;
    this.drag = null;
    this.bounce = null;
    this.pushFx("state", "PAUSED", now);
  }

  resume(now = performance.now()): void {
    if (this.screen !== "match" || this.phase !== "paused") return;
    this.pausedAccum += now - this.pausedAt;
    this.pausedAt = 0;
    this.phase = "playing";
    this.lastOppThink = now;
    this.pushFx("state", "PLAYING", now);
  }

  setDrag(from: Coord | null, dx = 0, dy = 0): void {
    if (!from) {
      this.selected = null;
      this.drag = null;
      return;
    }
    this.bounce = null;
    this.selected = from;
    this.drag = { from, dx, dy };
  }

  updateDrag(dx: number, dy: number): void {
    if (!this.drag) return;
    this.drag.dx = dx;
    this.drag.dy = dy;
  }

  rejectSwipe(now = performance.now()): void {
    const drag = this.drag;
    this.selected = null;
    this.drag = null;
    if (drag && (Math.abs(drag.dx) > 2 || Math.abs(drag.dy) > 2)) {
      this.bounce = { ...drag, born: now };
    }
  }

  tick(now = performance.now()): void {
    this.pruneFx(now);
    if (this.bounce && now - this.bounce.born > INVALID_RETURN_MS) this.bounce = null;
    if (this.screen === "splash" && now - this.splashAt >= INTRO_TOTAL_MS) this.screen = "menu";
    if (this.screen === "ready" && now - this.readyAt >= READY_MS) this.startMatch(now);
    if (this.screen !== "match") return;

    if (this.phase === "countdown") {
      const elapsed = now - this.countdownStart;
      const left = COUNTDOWN_SECONDS * 1000 - elapsed;
      if (left <= 2000 && this.fx.every((f) => f.text !== "2")) this.pushFx("countdown", "2", now);
      if (left <= 1000 && this.fx.every((f) => f.text !== "1")) this.pushFx("countdown", "1", now);
      if (elapsed >= COUNTDOWN_SECONDS * 1000 && (!this.onlineRemote || this.onlinePhase === "playing")) {
        this.phase = "playing";
        this.matchStart = now;
        this.lastOppThink = now;
        this.pushFx("countdown", "CLASH!", now);
        this.pushFx("state", "PLAYING", now);
      }
      return;
    }

    if (this.phase === "ended") {
      if (this.screen === "match" && now >= this.finaleUntil) this.screen = "results";
      return;
    }

    if (this.phase !== "playing") return;

    if (this.mode === "score") {
      if (this.player.score >= this.scoreTarget || this.opponent.score >= this.scoreTarget) {
        this.endMatch(now);
        return;
      }
      if (this.isDanger(now) && !this.warnedDanger) {
        this.warnedDanger = true;
        this.pushFx("urgent", "DANGER", now);
      }
    } else {
      const remaining = this.remainingMs(now);
      if (remaining <= 0) {
        this.clockExpired = true;
        this.endMatch(now);
        return;
      }
      if (remaining <= 10_000 && !this.warnedFinal) {
        this.warnedFinal = true;
        this.pushFx("urgent", "FINAL SECONDS", now);
        this.pushFx("state", "FINAL_SECONDS", now);
      } else if (this.isDanger(now) && !this.warnedDanger && remaining > 10_000) {
        this.warnedDanger = true;
        this.pushFx("urgent", "DANGER", now);
      }
    }

    this.decayCombos(now);
    if (!this.onlineRemote) {
      this.thinkOpponent(now);
      this.thinkRivalPower(now);
    }
  }

  tryPlayerSwap(a: Coord, b: Coord, now = performance.now()): boolean {
    if (!this.isInteractive(now)) {
      this.rejectSwipe(now);
      return false;
    }
    this.resolving = true;
    const boost = now < this.scoreBoostUntil || (this.mode === "time" && now < this.timeshiftUntil) ? 1.35 : 1;
    const pre = this.capturePlayer();
    const result = trySwap(this.player.board, a, b, this.rng);
    if (!result) {
      this.resolving = false;
      this.rejectSwipe(now);
      return false;
    }
    this.bumpPlayerBoard();
    this.drag = null;
    this.selected = null;
    this.bounce = null;
    this.lastPlayerSnap.push(pre);
    if (this.lastPlayerSnap.length > REWIND_HISTORY) this.lastPlayerSnap.shift();
    this.applyResolve(this.player, result, boost, now, "player");
    // Logic is already fully resolved (including cascades). Gate only the swap
    // tween so a second gesture cannot overlap the first swap pose.
    this.busyUntil = now + SWAP_INPUT_LOCK_MS;
    this.resolving = false;
    if (this.mode === "score" && this.player.score >= this.scoreTarget) this.endMatch(now);
    return true;
  }

  selectCell(cell: Coord, now = performance.now()): boolean {
    if (!this.isInteractive(now)) return false;
    if (!this.selected) {
      this.selected = cell;
      return false;
    }
    if (this.selected.r === cell.r && this.selected.c === cell.c) {
      this.selected = null;
      return false;
    }
    const ok = this.tryPlayerSwap(this.selected, cell, now);
    if (!ok) this.selected = cell;
    return ok;
  }

  hintCells(_now: number): Coord[] {
    if (this.screen !== "match" || this.phase !== "playing") return [];
    const selKey = this.selected ? `${this.selected.r},${this.selected.c}` : "";
    if (this.cachedHintGen === this.playerBoardGen && this.cachedHintSel === selKey) {
      return this.cachedHint;
    }
    const hint = this.selected
      ? matchingNeighbors(this.player.board, this.selected)
      : this.idleHint();
    this.cachedHint = hint;
    this.cachedHintGen = this.playerBoardGen;
    this.cachedHintSel = selKey;
    return hint;
  }

  private idleHint(): Coord[] {
    const move = findAnyValidSwap(this.player.board);
    return move ? [move.a, move.b] : [];
  }

  usePower(id: PowerId, now = performance.now(), target?: Coord): boolean {
    if (this.mode === "time" && this.remainingMs(now) <= 0) {
      this.endMatch(now);
      return false;
    }
    if (!this.canUsePower(id, now)) return false;

    if (id === "burst" || id === "megaStrike") {
      if (
        !target ||
        target.r < 0 ||
        target.r >= ROWS ||
        target.c < 0 ||
        target.c >= COLS ||
        !this.player.board[target.r]?.[target.c]
      ) {
        return false;
      }
      const cost = powerEnergyCost(id);
      const pre = this.capturePlayer();
      this.resolving = true;
      this.player.energy = Math.max(0, this.player.energy - cost);
      const result = this.applyEnergyAttack(id, target);
      this.bumpPlayerBoard();
      this.drag = null;
      this.selected = null;
      this.bounce = null;
      this.lastPlayerSnap.push(pre);
      if (this.lastPlayerSnap.length > REWIND_HISTORY) this.lastPlayerSnap.shift();
      const boost = now < this.scoreBoostUntil || (this.mode === "time" && now < this.timeshiftUntil) ? 1.35 : 1;
      this.applyResolve(this.player, result, boost, now, "player");
      this.powerLockUntil = now + 620;
      // Board is already fully resolved. Gate swipes like a normal swap so
      // power VFX cannot hold the next legal move for 620ms.
      this.busyUntil = Math.max(this.busyUntil, now + SWAP_INPUT_LOCK_MS);
      this.rivalPressureUntil = Math.max(
        this.rivalPressureUntil,
        now + (id === "megaStrike" ? PRESSURE_MS * 2 : PRESSURE_MS),
      );
      this.resolving = false;
      this.notePower(id);
      this.pushFx("power", id === "burst" ? "ENERGY BURST" : "MEGA STRIKE", now, {
        side: "player",
        combo: id === "burst" ? 3 : 6,
      });
      this.pushFx("attack", id === "burst" ? "ENERGY BURST HIT" : "MEGA STRIKE HIT", now, {
        side: "player",
        combo: id === "burst" ? 3 : 6,
      });
      this.pushFx("pressure", id === "burst" ? "RIVAL BLAST" : "RIVAL OBLITERATED", now, {
        side: "opponent",
        combo: id === "burst" ? 3 : 6,
      });
      if (this.mode === "score" && this.player.score >= this.scoreTarget) this.endMatch(now);
      return true;
    }

    if (id === "freeze") {
      if (this.player.energy < ENERGY_FREEZE) return false;
      if (!this.consumeCharge(id)) return false;
      this.player.energy = Math.max(0, this.player.energy - ENERGY_FREEZE);
      this.freezeUntil = now + FREEZE_MS;
      this.powerLockUntil = now + POWER_LOCK_MS;
      this.notePower(id);
      this.pushFx("power", "FREEZE", now, { side: "opponent" });
      this.pushFx("state", "POWER_ACTIVE", now);
      return true;
    }
    if (id === "timeshift") {
      if (this.player.energy < ENERGY_TIMESHIFT) return false;
      if (now < this.timeshiftUntil || now < this.timeshiftCoolUntil) return false;
      if (!this.consumeCharge(id)) return false;
      this.player.energy = Math.max(0, this.player.energy - ENERGY_TIMESHIFT);
      this.timeshiftStarted = now;
      this.timeshiftUntil = now + TIMESHIFT_MS;
      this.powerLockUntil = now + POWER_LOCK_MS;
      this.notePower(id);
      if (this.mode === "time") {
        this.clockFrozenStart = now;
        this.clockFrozenUntil = now + TIME_STEAL_MS;
        this.pushFx("power", "TIME SHIFT", now, { side: "player" });
      } else {
        this.scoreBoostUntil = now + SCORE_SURGE_MS;
        this.pushFx("power", "TEMPO SURGE", now, { side: "player" });
      }
      this.pushFx("state", "POWER_ACTIVE", now);
      return true;
    }
    if (id === "rewind") {
      if (this.player.energy < ENERGY_REWIND) return false;
      if (this.lastPlayerSnap.length < 2) return false;
      const prev = this.lastPlayerSnap.pop();
      if (!prev) return false;
      this.player.board = snapshotBoard(prev.board);
      this.bumpPlayerBoard();
      this.player.score = prev.score;
      this.player.combo = prev.combo;
      this.player.bestCombo = prev.bestCombo;
      this.player.attack = prev.attack;
      this.player.energy = Math.max(0, prev.energy - ENERGY_REWIND);
      this.player.lastClearAt = now;
      this.selected = null;
      this.drag = null;
      this.bounce = null;
      this.powerLockUntil = now + POWER_LOCK_MS;
      this.busyUntil = Math.max(this.busyUntil, now + POWER_LOCK_MS);
      this.notePower(id);
      this.pushFx("rewind", "BOARD RESTORED", now, { side: "player" });
      return true;
    }
    return false;
  }

  private applyEnergyAttack(id: "burst" | "megaStrike", target: Coord): ResolveResult {
    const result = resolveTargetedPower(this.player.board, this.rng, id, target);
    if (!result) throw new Error(`Invalid ${id} target.`);
    this.opponent.attack = Math.max(0, this.opponent.attack - (id === "burst" ? 22 : 48));
    this.opponent.combo = 0;
    return result;
  }

  remainingMs(now: number): number {
    if (this.mode === "score") return 0;
    if (this.onlineRemote && this.onlineRemainingMs != null && this.phase === "playing") {
      return Math.max(0, this.onlineRemainingMs - Math.max(0, now - this.onlineRemainingAt));
    }
    const cap = MATCH_SECONDS * 1000;
    if (this.phase === "countdown") return cap;
    if (this.phase === "ended") return 0;
    const origin = this.matchStart || now;
    const paused = this.phase === "paused" && this.pausedAt ? now - this.pausedAt : 0;
    const shiftLive =
      now < this.clockFrozenUntil && this.clockFrozenStart ? now - this.clockFrozenStart : 0;
    const elapsed = now - origin - this.pausedAccum - paused - this.timeshiftHold - shiftLive;
    return Math.max(0, cap - elapsed);
  }

  collectTimeshift(now: number): void {
    if (this.clockFrozenUntil && now >= this.clockFrozenUntil && this.clockFrozenStart) {
      this.timeshiftHold += this.clockFrozenUntil - this.clockFrozenStart;
      this.clockFrozenStart = 0;
      this.clockFrozenUntil = 0;
    }
    if (this.timeshiftUntil && now >= this.timeshiftUntil && this.timeshiftStarted) {
      this.timeshiftCoolUntil = now + 6000;
      this.timeshiftStarted = 0;
      this.timeshiftUntil = 0;
    }
  }

  setName(name: string): void {
    this.progress = { ...this.progress, name: name.trim().slice(0, 16) || "CHRONO PILOT" };
    saveProgress(this.progress);
  }

  setAvatar(n: number): void {
    const i = Math.max(0, Math.min(5, n));
    if (!isOwned(this.progress, `avatar-${i}`)) return;
    this.progress = { ...this.progress, avatar: i, customAvatar: false };
    saveProgress(this.progress);
  }

  equipCustomAvatar(): boolean {
    if (!hasAvatarPhoto()) return false;
    this.progress = { ...this.progress, customAvatar: true };
    saveProgress(this.progress);
    return true;
  }

  saveCustomAvatarPhoto(dataUrl: string): boolean {
    if (!saveAvatarPhoto(dataUrl)) return false;
    this.progress = { ...this.progress, customAvatar: true };
    saveProgress(this.progress);
    return true;
  }

  removeCustomAvatar(): void {
    clearAvatarPhoto();
    this.progress = { ...this.progress, customAvatar: false };
    saveProgress(this.progress);
  }

  equip(kind: "frame" | "boardTheme" | "tileTheme" | "title" | "vfxTheme", id: string): void {
    const aliases = [id, `board-${id}`, `tile-${id}`, `title-${id}`];
    const owned = aliases.some((key) => isOwned(this.progress, key) || this.progress.unlocked.includes(key));
    if (!owned) return;
    this.progress = { ...this.progress, [kind]: id } as LocalProgress;
    saveProgress(this.progress);
  }

  resetLocal(): void {
    this.progress = resetProgress();
  }

  goRewards(): void {
    if (this.screen === "results") this.screen = "rewards";
  }

  private liveBounce(now: number): BounceState | null {
    if (!this.bounce) return null;
    const t = Math.min(1, (now - this.bounce.born) / INVALID_RETURN_MS);
    const smoothReturn = 1 - t * t * (3 - 2 * t);
    const settle = t > 0.74 ? Math.sin(((t - 0.74) / 0.26) * Math.PI) * 0.035 : 0;
    const k = Math.max(0, smoothReturn + settle);
    return {
      from: this.bounce.from,
      dx: this.bounce.dx * k,
      dy: this.bounce.dy * k,
      born: this.bounce.born,
    };
  }

  private countdownMs(now: number): number {
    if (this.phase !== "countdown") return 0;
    return Math.max(0, COUNTDOWN_SECONDS * 1000 - (now - this.countdownStart));
  }

  private notePower(id: PowerId): void {
    if (!this.powersThisMatch.includes(id)) this.powersThisMatch.push(id);
  }

  private resetFighters(): void {
    if (this.onlineSeed != null) {
      const rngA = createSeededRng(seatSeed(this.onlineSeed, "a"));
      const rngB = createSeededRng(seatSeed(this.onlineSeed, "b"));
      const boardA = generateBoard(rngA);
      const boardB = generateBoard(rngB);
      if (this.onlineSeat === "b") {
        this.rng = rngB;
        this.player = this.freshFighter(boardB);
        this.opponent = this.freshFighter(boardA);
      } else {
        this.rng = rngA;
        this.player = this.freshFighter(boardA);
        this.opponent = this.freshFighter(boardB);
      }
    } else {
      const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      this.rng = createSeededRng(seed);
      this.player = this.freshFighter();
      this.opponent = this.freshFighter();
    }
    this.lastPlayerSnap = [this.capturePlayer()];
    this.bumpPlayerBoard();
    this.bumpOppBoard();
  }

  private freshFighter(board?: Board): FighterState {
    return {
      board: board ?? generateBoard(this.rng),
      score: 0,
      energy: 0,
      combo: 0,
      bestCombo: 0,
      lastClearAt: 0,
      attack: 0,
    };
  }

  private capturePlayer(): PlayerSnap {
    return {
      board: snapshotBoard(this.player.board),
      score: this.player.score,
      combo: this.player.combo,
      energy: this.player.energy,
      bestCombo: this.player.bestCombo,
      attack: this.player.attack,
    };
  }

  private bumpPlayerBoard(): void {
    this.playerBoardGen++;
  }

  private bumpOppBoard(): void {
    this.oppBoardGen++;
  }

  private clonePlayerBoard(): Board {
    if (this.cachedPlayerGen !== this.playerBoardGen || !this.cachedPlayerBoard) {
      this.cachedPlayerBoard = cloneBoard(this.player.board);
      this.cachedPlayerGen = this.playerBoardGen;
    }
    return this.cachedPlayerBoard;
  }

  private cloneOppBoard(): Board {
    if (this.cachedOppGen !== this.oppBoardGen || !this.cachedOppBoard) {
      this.cachedOppBoard = cloneBoard(this.opponent.board);
      this.cachedOppGen = this.oppBoardGen;
    }
    return this.cachedOppBoard;
  }

  private applyResolve(
    fighter: FighterState,
    result: ResolveResult | null,
    scoreMul: number,
    now: number,
    side: FxSide,
  ): void {
    if (!result || result.cleared <= 0) return;
    const score = Math.round(result.scoreDelta * scoreMul);
    fighter.score += score;
    fighter.energy = Math.max(0, Math.min(ENERGY_MAX, fighter.energy + result.energyDelta));
    fighter.combo = result.comboPeak;
    fighter.bestCombo = Math.max(fighter.bestCombo, result.comboPeak);
    fighter.lastClearAt = now;
    const charged = fillAttack(fighter.attack, result.comboPeak, result.cleared);
    fighter.attack = Math.max(0, Math.min(ATTACK_MAX, charged.meter));
    const clearWaves = result.events.filter((event) => event.type === "clear");
    if (clearWaves.length) {
      for (const wave of clearWaves) {
        const waveScore = Math.round(wave.score * scoreMul);
        const at = wave.cells?.[0];
        this.pushFx("clear", `+${waveScore}`, now, {
          side,
          combo: wave.combo,
          score: waveScore,
          at,
          cells: wave.cells,
        });
        if (wave.combo >= 2) {
          this.pushFx("combo", comboFlavor(wave.combo), now, { side, combo: wave.combo, score: waveScore });
        }
      }
    } else if (result.cleared > 0) {
      const at = result.events.find((e) => e.type === "clear" && e.cells?.length)?.cells?.[0];
      this.pushFx("clear", `+${score}`, now, { side, combo: result.comboPeak, score, at });
    }
    if (result.comboPeak >= 2) {
      this.pushFx("attack", side === "opponent" ? "RIVAL PULSE" : attackBanner(result.comboPeak), now, {
        side,
        combo: result.comboPeak,
        score,
      });
    }
    if (charged.fired && result.comboPeak >= 2) {
      this.firePressure(side, now, result.comboPeak);
    }
  }

  private firePressure(side: FxSide, now: number, combo: number): void {
    if (side === "player") {
      this.rivalPressureUntil = Math.max(this.rivalPressureUntil, now + PRESSURE_MS);
      this.pushFx("pressure", "PRESSURE", now, { side: "opponent", combo });
      this.pushFx("attack", "TIME STRIKE", now, { side: "player", combo: Math.max(4, combo) });
    } else {
      this.pushFx("pressure", "RIVAL PRESSURE", now, { side: "player", combo });
      this.pushFx("attack", "RIVAL STRIKE", now, { side: "opponent", combo: Math.max(4, combo) });
    }
  }

  private decayCombos(now: number): void {
    if (now - this.player.lastClearAt > COMBO_HOLD_MS) this.player.combo = 0;
    if (now - this.opponent.lastClearAt > COMBO_HOLD_MS) this.opponent.combo = 0;
    this.collectTimeshift(now);
  }

  private rivalHalted(now: number): boolean {
    return now < this.freezeUntil || now < this.timeshiftUntil || now < this.rivalPressureUntil;
  }

  private thinkOpponent(now: number): void {
    if (this.rivalHalted(now)) return;
    const intro = this.progress.matchesSeen < 1;
    const trailing = this.opponent.score + 400 < this.player.score;
    const interval = intro ? 1200 : trailing ? 640 : 820;
    if (now - this.lastOppThink < interval) return;
    this.lastOppThink = now;
    if (this.rng() < (intro ? 0.42 : trailing ? 0.18 : 0.32)) return;
    const move = findAnyValidSwap(this.opponent.board);
    if (!move) {
      applyGravity(this.opponent.board, this.rng);
      this.bumpOppBoard();
      return;
    }
    const result = trySwap(this.opponent.board, move.a, move.b, this.rng);
    if (result) this.bumpOppBoard();
    this.applyResolve(this.opponent, result, intro ? 0.62 : 0.72, now, "opponent");
    if (this.mode === "score" && this.opponent.score >= this.scoreTarget) this.endMatch(now);
  }

  private thinkRivalPower(now: number): void {
    if (this.rivalHalted(now) || this.intro) return;
    if (now < this.rivalPowerCool) return;
    if (this.opponent.energy < ENERGY_FREEZE) return;
    const playerLeading = this.player.score > this.opponent.score + 180;
    const chance = playerLeading ? 0.22 : 0.08;
    if (this.rng() > chance) return;
    if (this.opponent.energy >= ENERGY_TIMESHIFT && this.mode === "time" && playerLeading && this.rng() < 0.45) {
      this.opponent.energy = Math.max(0, this.opponent.energy - ENERGY_TIMESHIFT);
      this.pausedAccum -= 3000;
      this.rivalPowerCool = now + 8000;
      this.pushFx("power", "RIVAL SHIFT", now, { side: "player" });
      return;
    }
    this.opponent.energy = Math.max(0, this.opponent.energy - ENERGY_FREEZE);
    this.rivalPowerCool = now + 7000;
    this.pushFx("power", "RIVAL FREEZE", now, { side: "player" });
  }

  private endMatch(now: number, forced?: Outcome): void {
    if (this.ended) return;
    this.ended = true;
    this.phase = "ended";
    this.screen = "match";
    this.finaleUntil = now + FINALE_MS;
    this.drag = null;
    this.selected = null;
    this.bounce = null;
    const playerScore = this.player.score;
    const opponentScore = this.opponent.score;
    let outcome: Outcome = forced ?? "tie";
    if (!forced && this.mode === "score") {
      if (playerScore >= this.scoreTarget && playerScore >= opponentScore) outcome = "win";
      else if (opponentScore >= this.scoreTarget && opponentScore > playerScore) outcome = "loss";
      else if (playerScore > opponentScore) outcome = "win";
      else if (playerScore < opponentScore) outcome = "loss";
    } else if (!forced && playerScore > opponentScore) outcome = "win";
    else if (!forced && playerScore < opponentScore) outcome = "loss";

    if (this.inspectionMatch) {
      const coinRoom = this.settleActiveCoinRoom(outcome);
      this.result = {
        outcome,
        playerScore,
        opponentScore,
        playerBestCombo: this.player.bestCombo,
        opponentBestCombo: this.opponent.bestCombo,
        mode: this.mode,
        target: this.mode === "score" ? this.scoreTarget : MATCH_SECONDS,
        progress: { ...this.progress },
        grant: null,
        inspection: true,
        coinRoom,
      };
    } else {
      const recorded = grantMatchRewards(this.progress, {
        outcome,
        score: playerScore,
        bestCombo: this.player.bestCombo,
        mode: this.mode,
        rivalScore: opponentScore,
        powersThisMatch: [...this.powersThisMatch],
      });
      this.progress = recorded.progress;
      this.progress = applyDailyRun(
        this.progress,
        applyDailyRunOutcome(
          dailyRunFromProgress(this.progress),
          outcome,
          this.trustedUtcMs ?? Date.now(),
          this.trustedUtcMs != null,
        ),
      );
      const coinRoom = this.settleActiveCoinRoom(outcome);
      saveProgress(this.progress);
      this.result = {
        outcome,
        playerScore,
        opponentScore,
        playerBestCombo: this.player.bestCombo,
        opponentBestCombo: this.opponent.bestCombo,
        mode: this.mode,
        target: this.mode === "score" ? this.scoreTarget : MATCH_SECONDS,
        progress: { ...this.progress },
        grant: recorded.grant,
        coinRoom,
      };
    }
    const side: FxSide = outcome === "loss" ? "opponent" : "player";
    if (this.clockExpired) this.pushFx("urgent", "TIME!", now);
    this.pushFx("finale", outcome === "win" ? "VICTORY" : outcome === "loss" ? "DEFEAT" : "DRAW", now, {
      side,
      combo: outcome === "tie" ? 2 : 5,
    });
    this.pushFx("state", outcome === "win" ? "WON" : outcome === "loss" ? "LOST" : "DRAW", now);
    if (outcome !== "tie") {
      this.pushFx("attack", outcome === "win" ? "FINAL STRIKE" : "RIVAL FINALE", now, { side, combo: 5 });
    }
  }

  private pushFx(
    kind: FxEvent["kind"],
    text: string,
    now: number,
    extra: Pick<FxEvent, "side" | "combo" | "score" | "at" | "cells"> = {},
  ): void {
    this.fx.push({ id: this.fxId++, kind, text, born: now, ...extra });
  }

  private pruneFx(now: number): void {
    let write = 0;
    for (let read = 0; read < this.fx.length; read++) {
      const fx = this.fx[read]!;
      if (now - fx.born < (fx.kind === "finale" || fx.kind === "attack" ? 1700 : 1100)) {
        this.fx[write++] = fx;
      }
    }
    this.fx.length = write;
  }

  private isDanger(now: number): boolean {
    if (this.phase !== "playing") return false;
    if (this.mode === "score") {
      return this.opponent.score >= this.scoreTarget * 0.72 && this.opponent.score >= this.player.score - 400;
    }
    return this.remainingMs(now) <= 18_000 && this.opponent.score > this.player.score;
  }
}
