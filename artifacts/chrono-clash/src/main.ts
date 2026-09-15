import { AudioBus } from "./audio/bus";
import { Announcer } from "./audio/announcer";
import { playBattleCues } from "./audio/events";
import { bedFromScene } from "./audio/scene";
import { cuesFromFxBatch, VOICE, VoiceLineId } from "./audio/voice";
import { clampDrag, neighborFromSwipe } from "./engine/input";
import { GameSettings, applyMatchAudioMute, isMatchAudioMuted, loadSettings, saveSettings } from "./engine/settings";
import { unlockGameAudio } from "./audio/unlock";
import { canSkipIntro } from "./engine/intro";
import {
  COLS,
  ENERGY_BURST,
  ENERGY_FREEZE,
  ENERGY_MAX,
  ENERGY_MEGA_STRIKE,
  ENERGY_REWIND,
  ROWS,
  SCORE_TARGETS,
  type Coord,
  type GameMode,
} from "./engine/types";
import { GAME_MODES, modeInfo } from "./engine/catalog";
import { comboBurstText } from "./engine/combat";
import { GameSession, type FxEvent } from "./engine/session";
import { BOARD_FRAME, BOARD_GAP, BoardRenderer, RenderFx } from "./ui/renderer";
import { prefetchGemAtlas } from "./ui/gemAtlas";
import { comboBurstClass, resultHeadline, scoreTickerRate } from "./ui/feel";
import { matchImpactDelayMs } from "./ui/gemMotion";
import { HapticBus, hapticCuesFromFx } from "./ui/haptics";
import { chatHtml, coinReadyViewHtml, coinResultViewHtml, dailyRunHtml, equippedAvatarName, matchPowerQty, powerArmoryHtml, profileView, readyPowerStripHtml, renderMenuPilot, roomsViewHtml, trophiesHtml } from "./ui/metaViews";
import { RewardGrant, grantHasBounty, xpToNext } from "./engine/progress";
import { paintAvatarElement } from "./ui/avatarFace";
import { mountAvatarPhotoFlow } from "./ui/avatarPhotoFlow";
import { hasAvatarPhoto } from "./engine/avatarPhoto";
import { startArenaParallax } from "./ui/arenaParallax";
import { ChronoClient, isAuthFailure } from "./net/client";
import type { BattleActionInput } from "./server/battle";
import { detectPlatform, guestDeviceToken } from "./net/identity";
import { consumeOAuthRedirect, obtainProviderCredential, takeRedirectIdToken } from "./net/oauth-web";
import { AuthProvider } from "./server/types";
import { resolveRewardedAdPort } from "./engine/ads";
import { economyFromProgress } from "./engine/economy";
import { DAILY_LIFE_AD_PLACEMENT, DAILY_LIVES_MAX, dailyRunFromProgress } from "./engine/dailyRun";
import { isDevBattleBypassEnabled } from "./engine/devBattleBypass";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");
consumeOAuthRedirect();
const returningGoogle = takeRedirectIdToken();

const session = new GameSession();
const net = new ChronoClient("");
const ads = resolveRewardedAdPort();
void pullTrustedClock();
if (net.restore()) {
  void net
    .me()
    .then(() => Promise.all([pullRemoteEconomy(), pullRemoteDailyRun()]))
    .catch((err) => {
      // Only drop the stored Player ID when the server rejected the session.
      if (isAuthFailure(err)) void net.signOut();
    });
}
const audio = new AudioBus();
const announcer = new Announcer(audio);
const haptics = new HapticBus();
let settings: GameSettings = loadSettings();

type Swipe = { id: number; r: number; c: number; x: number; y: number; dx: number; dy: number };
let swipe: Swipe | null = null;
let armedEnergyPower: "burst" | "megaStrike" | null = null;
app.innerHTML = `
  <div class="space-layer" aria-hidden="true">
    <div class="space-far">
      <div class="space-stars"></div>
      <div class="space-planet"></div>
      <div class="space-nebula"></div>
    </div>
    <div class="space-mid">
      <div class="space-clouds"></div>
      <div class="space-drift"></div>
      <div class="space-structure"></div>
      <div class="space-peaks"></div>
    </div>
    <div class="space-near">
      <div class="space-split"></div>
      <div class="space-sparks"></div>
      <div class="space-dust"></div>
      <div class="space-debris"></div>
    </div>
    <div class="space-vignette"></div>
  </div>
  <div class="shell">
    <section id="splash" class="screen active splash beat-studio">
      <div class="studio-mark" id="studioMark">
        <p class="studio-name">OLIVIA NOVA</p>
        <p class="studio-presents">PRESENTS</p>
      </div>
      <div class="logo title-mark has-art" id="titleMark">
        <img class="logo-art" src="/assets/chrono-clash-logo.png" alt="" aria-hidden="true" />
        <h1>CHRONO<br/>CLASH</h1>
        <p>TIME IS THE BATTLEFIELD</p>
      </div>
      <button type="button" class="ghost skip-intro hidden" id="skipIntro">SKIP</button>
    </section>

    <section id="menu" class="screen">
      <div class="logo menu-hero has-art">
        <img class="logo-art" src="/assets/chrono-clash-logo.png" alt="" aria-hidden="true" />
        <h1>CHRONO<br/>CLASH</h1>
        <p>PREMIUM PUZZLE BATTLE</p>
      </div>
      <div class="menu-pilot" id="menuPilot"></div>
      <div class="menu-account" id="menuAccount">
        <p class="menu-kicker">ENTER THE GAME</p>
        <p class="menu-ident" id="menuIdent">Sign in to save your Player ID, progression and trophies.</p>
        <div class="identity-list">
          <button type="button" class="primary game-ctl identity-facebook" id="menuFacebook">
            <span class="identity-button-content">
              <span class="identity-icon identity-icon-facebook" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path fill="#fff" d="M13.35 12.75h2.08l.33-2.15h-2.41V9.2c0-.62.3-1.04 1.15-1.04h1.35V6.24c-.24-.03-.93-.09-1.77-.09-1.75 0-2.95 1.07-2.95 3.03v1.42H9.15v2.15h1.98v5.52h2.22v-5.52Z"/></svg>
              </span>
              <span>SIGN IN WITH FACEBOOK</span>
            </span>
          </button>
          <button type="button" class="ghost game-ctl identity-google" id="menuGoogle">
            <span class="identity-button-content">
              <span class="identity-icon identity-icon-google" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path fill="#4285F4" d="M21.35 12.27c0-.77-.07-1.51-.22-2.22H12v4.2h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.37Z"/>
                  <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.75Z"/>
                  <path fill="#FBBC05" d="M6.54 13.83A5.85 5.85 0 0 1 6.23 12c0-.64.11-1.26.31-1.83V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.53Z"/>
                  <path fill="#EA4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.24 14.63 2.25 12 2.25a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 7.86 9.46 6.14 12 6.14Z"/>
                </svg>
              </span>
              <span>SIGN IN WITH GOOGLE</span>
            </span>
          </button>
          <button type="button" class="ghost game-ctl identity-email" id="menuEmail">
            <span class="identity-button-content">
              <span class="identity-icon identity-icon-email" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6.75h16v10.5H4zM4.5 7.5 12 13l7.5-5.5"/></svg>
              </span>
              <span>SIGN IN WITH EMAIL</span>
            </span>
          </button>
          <button type="button" class="ghost game-ctl identity-guest" id="menuGuest">
            <span class="identity-button-content">
              <span class="identity-icon identity-icon-guest" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M5.5 19.25c.72-3.03 2.87-4.55 6.5-4.55s5.78 1.52 6.5 4.55"/></svg>
              </span>
              <span>CONTINUE AS GUEST</span>
            </span>
          </button>
        </div>
        <p class="menu-status" id="menuStatus" aria-live="polite"></p>
      </div>
      <div class="menu-nav">
        <div class="menu-row">
          <button type="button" class="ghost game-ctl" id="toProfile">PROFILE</button>
          <button type="button" class="ghost game-ctl" id="toTrophies">TROPHIES</button>
        </div>
        <button type="button" class="ghost game-ctl" id="toSettings">SETTINGS</button>
      </div>
    </section>

    <div class="email-dialog hidden" id="emailDialog" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="emailDialogTitle">
      <form class="email-dialog-card" id="emailForm">
        <div class="email-dialog-heading">
          <p class="menu-kicker">CHRONO CLASH ID</p>
          <h2 id="emailDialogTitle">SIGN IN WITH EMAIL</h2>
          <p id="emailDialogIntro">Use your email and password to continue your pilot profile.</p>
        </div>
        <label class="email-field">
          <span>EMAIL</span>
          <input id="emailAddress" type="email" autocomplete="email" maxlength="254" required />
        </label>
        <label class="email-field">
          <span>PASSWORD</span>
          <input id="emailPassword" type="password" autocomplete="current-password" minlength="8" maxlength="128" required />
        </label>
        <p class="email-dialog-status" id="emailDialogStatus" aria-live="polite"></p>
        <div class="email-dialog-actions">
          <button type="submit" class="primary game-ctl" id="emailSubmit">SIGN IN</button>
          <button type="button" class="ghost game-ctl" id="emailCancel">CANCEL</button>
        </div>
        <button type="button" class="email-mode-toggle" id="emailModeToggle">NEW PILOT? CREATE AN ACCOUNT</button>
      </form>
    </div>

    <section id="online" class="screen">
      <div class="logo compact"><h1>CHOOSE YOUR BATTLE</h1><p id="onlineSub">SELECT A MATCH TYPE</p></div>
      <div class="settings-body">
        <p class="brief" id="onlineIdent">Choose how you want to play.</p>
        <div class="mode-list" id="authButtons"></div>
        <p class="muted" id="onlineStatus"></p>
      </div>
      <div class="stack"><button class="ghost" id="onlineBack">BACK</button></div>
    </section>

    <section id="profile" class="screen profile">
      <div class="logo compact"><h1>PROFILE</h1><p id="profileTitle">NEWCOMER</p></div>
      <div class="settings-body">
        <div class="pilot-card">
          <div class="avatar-wrap" id="avatarPreview"></div>
          <input id="pilotName" maxlength="16" aria-label="Pilot name" autocomplete="off" enterkeyhint="done" />
        </div>
        <div class="setting-block avatar-block">
          <h3>CHANGE AVATAR</h3>
          <p class="avatar-hint" id="avatarHint">Select a mark. It stays equipped on Home, battle, and results.</p>
          <div class="avatars" id="avatarRow"></div>
        </div>
        <div class="stat-grid mini" id="profileStats"></div>
        <div class="setting-block">
          <h3>PROGRESS</h3>
          <div class="xp"><span id="xpFill"></span></div>
          <p class="muted" id="xpLabel"></p>
        </div>
        <div class="setting-block">
          <h3>ACHIEVEMENTS</h3>
          <div id="achieveList"></div>
        </div>
      </div>
      <div class="stack settings-foot"><button class="primary" id="profileBack">BACK</button></div>
    </section>

    <section id="trophies" class="screen trophies">
      <div class="logo compact"><h1>TROPHIES</h1><p>ACHIEVEMENTS</p></div>
      <div class="settings-body">
        <div id="trophiesList" class="trophy-list"></div>
      </div>
      <div class="stack settings-foot"><button class="primary" id="trophiesBack">BACK</button></div>
    </section>

    <section id="modes" class="screen">
      <div class="logo compact"><h1>GAME MODES</h1><p>CHOOSE YOUR BATTLE</p></div>
      <div id="dailyRun" class="daily-run-host"></div>
      <div class="mode-list">
        <button class="mode-card" id="modeTime">
          <small>${GAME_MODES.time.tag}</small>
          <b>${GAME_MODES.time.name}</b>
          <span>${GAME_MODES.time.detail}</span>
        </button>
        <button class="mode-card" id="modeScore">
          <small>${GAME_MODES.score.tag}</small>
          <b>${GAME_MODES.score.name}</b>
          <span>${GAME_MODES.score.detail}</span>
        </button>
        <button class="mode-card" id="modeRooms">
          <small>VIRTUAL STAKES</small>
          <b>COIN ROOMS</b>
          <span>Pick a room. Entry coins are taken only when the match starts.</span>
        </button>
      </div>
      <div id="powerArmory" class="power-armory"></div>
      <div class="target-setup">
        <small>SCORE BATTLE TARGET</small>
        <div class="chips" id="scoreTargets"></div>
      </div>
      <div class="stack"><button class="ghost" id="modesBack">BACK</button></div>
    </section>

    <section id="rooms" class="screen">
      <div class="logo compact"><h1>COIN ROOMS</h1><p>SELECT YOUR STAKE</p></div>
      <div id="roomsView" class="rooms-view"></div>
      <div class="stack"><button class="ghost" id="roomsBack">BACK</button></div>
    </section>

    <section id="ready" class="screen ready">
      <div class="logo compact"><h1 id="readyTitle">TIME BATTLE</h1><p id="readySub">HIGHEST SCORE IN 60s</p></div>
      <div class="ready-target" id="readyTarget"></div>
      <div class="ready-powers" id="readyPowers"></div>
      <div id="readyClash" class="ready-clash hidden"></div>
      <div class="ready-pulse"></div>
      <p class="muted" id="readyHint">Swipe gems. Chain combos. Spend stored Chrono Power charges in battle.</p>
      <div class="stack"><button type="button" class="primary hidden" id="readyStart">READY</button></div>
    </section>

    <section id="tutorial" class="screen">
      <div class="logo compact"><h1>BRIEFING</h1><p id="tutStep">1 / 6</p></div>
      <p class="brief" id="tutText"></p>
      <div class="stack">
        <button class="primary" id="tutNext">NEXT</button>
        <button class="ghost" id="tutSkip">SKIP</button>
      </div>
    </section>

    <section id="settingsScreen" class="screen settings">
      <div class="logo compact"><h1>SETTINGS</h1><p>DEVICE</p></div>
      <div class="settings-body">
        <div class="setting-block">
          <button type="button" class="setting-row" id="sfxToggle" aria-pressed="true"><span>Sound</span><b class="toggle-val">ON</b></button>
          <label class="setting-row setting-slider"><span>Sound volume</span><input type="range" id="sfxVolume" min="0" max="100" step="1" value="84" aria-label="Sound volume"></label>
          <button type="button" class="setting-row" id="musicToggle" aria-pressed="true"><span>Music</span><b class="toggle-val">ON</b></button>
          <label class="setting-row setting-slider"><span>Music volume</span><input type="range" id="musicVolume" min="0" max="100" step="1" value="72" aria-label="Music volume"></label>
          <button type="button" class="setting-row" id="hapticsToggle" aria-pressed="true"><span>Vibration</span><b class="toggle-val">ON</b></button>
          <button type="button" class="setting-row danger" id="quitGame"><span>Quit</span><b>EXIT</b></button>
        </div>
      </div>
      <div class="stack settings-foot"><button class="primary" id="backMenu">BACK</button></div>
    </section>

    <section id="match" class="screen match-screen">
      <div class="match-stage">
      <div class="arena-architecture" aria-hidden="true">
        <div class="arena-backplane"></div>
        <div class="arena-energy-chamber">
          <i class="chamber-rib a"></i>
          <i class="chamber-rib b"></i>
          <i class="chamber-rib c"></i>
          <i class="chamber-conduit left"></i>
          <i class="chamber-conduit right"></i>
          <i class="chamber-core"></i>
          <i class="chamber-haze"></i>
        </div>
        <div class="arena-pylon arena-pylon-left"><i></i><i></i><i></i></div>
        <div class="arena-pylon arena-pylon-right"><i></i><i></i><i></i></div>
        <div class="arena-board-cradle"></div>
        <div class="arena-deck">
          <i class="deck-plate"></i>
          <i class="deck-seam"></i>
          <i class="deck-conduit"></i>
          <i class="deck-reactor a"></i>
          <i class="deck-reactor b"></i>
          <i class="deck-reactor c"></i>
        </div>
        <div class="arena-lower-floor" data-env-surface="arena-floor">
          <i class="floor-wash"></i>
          <i class="floor-perspective"></i>
          <i class="floor-bridge"></i>
          <i class="floor-bay left"></i>
          <i class="floor-bay center"></i>
          <i class="floor-bay right"></i>
          <i class="floor-seams"></i>
          <i class="floor-spine"></i>
          <i class="floor-rail player"></i>
          <i class="floor-rail rival"></i>
          <i class="floor-edge"></i>
        </div>
      </div>
      <div class="match-controls-row">
        <div class="match-brand-actions">
          <button type="button" class="hud-icon" id="dockChat" aria-label="Chat" title="Chat">
            <span class="dock-ico chat" aria-hidden="true"></span>
          </button>
          <button type="button" class="hud-mute" id="hudMute" aria-pressed="false" aria-label="Mute audio">AUDIO ON</button>
          <button type="button" class="hud-icon hud-icon-settings" id="dockSettings" aria-label="Settings" title="Settings">
            <span class="dock-ico settings" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="match-top">
        <div class="hud-conduit hud-conduit-left" aria-hidden="true"></div>
        <div class="hud-conduit hud-conduit-right" aria-hidden="true"></div>
        <div class="fighter you" id="playerCard">
          <div class="avatar-ring you">
            <div class="avatar" id="youAvatar">◈</div>
          </div>
          <div class="fighter-copy">
            <small id="youName">YOU</small>
            <em id="youLevel">LV 1</em>
            <div class="score-rail">
              <b id="playerScore">0</b>
              <span class="score-track"><i id="playerScoreFill"></i></span>
            </div>
          </div>
        </div>
        <div class="vs-column">
          <div class="vs-arcs" aria-hidden="true"></div>
          <div class="vs-clash" aria-hidden="true"></div>
          <div class="vs-reactor" aria-hidden="true">
            <i class="vs-reactor-ring outer"></i>
            <i class="vs-reactor-ring inner"></i>
            <i class="vs-reactor-core"></i>
          </div>
          <div class="vs-badge">VS</div>
          <button class="timer ghost" id="timerBtn">
            <small id="timerLabel">TIME REMAINING</small>
            <b id="timer">01:00</b>
          </button>
        </div>
        <div class="fighter rival" id="oppCard">
          <div class="fighter-copy">
            <small>RIVAL</small>
            <em id="rivalLevel">CPU</em>
             <span class="rival-state" id="rivalState">RIVAL ONLINE</span>
            <div class="score-rail">
              <b id="oppScore">0</b>
              <span class="score-track"><i id="oppScoreFill"></i></span>
            </div>
          </div>
          <div class="avatar-ring rival">
            <div class="avatar rival-face" id="rivalAvatar">◆</div>
          </div>
        </div>
      </div>
      <div class="boards">
        <div class="player-side">
          <div class="you-meta" aria-hidden="true">
            <span class="shift-clock" id="shiftClock"></span>
            <span class="combo" id="playerCombo"></span>
            <span class="combo-damage" id="comboDamage"></span>
             <span class="match-objective" id="matchObjective"></span>
          </div>
          <div id="playerBoard" class="board-slot">
            <div class="board-hardware" aria-hidden="true">
              <div class="board-outer-rail"></div>
              <div class="board-energy-glass"></div>
              <div class="board-socket-bed"></div>
              <i class="board-fastener tl"></i><i class="board-fastener tr"></i>
              <i class="board-fastener bl"></i><i class="board-fastener br"></i>
            </div>
            <canvas id="playerGems" class="board-canvas" aria-hidden="true"></canvas>
          </div>
        </div>
      </div>
      <div id="oppBoard" class="opponent-render-reserve" aria-hidden="true">
        <span id="freezeClock"></span>
        <span id="oppCombo"></span>
        <canvas id="oppGems" aria-hidden="true"></canvas>
      </div>
      </div>
      <p id="matchStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
      <canvas id="stage"></canvas>
      <div id="overlay" class="overlay hidden"><div class="big" id="overlayText"></div></div>
      <div id="comboBurst" class="combo-burst hidden"></div>
      <div id="energyBurst" class="energy-burst hidden"></div>
    </section>

    <div id="sheet" class="sheet hidden">
      <div class="sheet-card">
        <header><h2 id="sheetTitle">CHAT</h2><button type="button" class="ghost" id="sheetClose">CLOSE</button></header>
        <div id="sheetBody" class="sheet-body"></div>
      </div>
    </div>

    <section id="results" class="screen results">
      <div class="result-burst"></div>
      <div class="result-spark" aria-hidden="true"></div>
      <h2 id="resultTitle">VICTORY</h2>
      <div class="result-ident">
        <div class="avatar" id="resultAvatar">◈</div>
        <div>
          <b id="resultPilot">CHRONO PILOT</b>
          <small id="resultMark">PULSE</small>
        </div>
      </div>
      <p class="result-xp" id="resultXp"></p>
      <p class="result-lives" id="resultLives"></p>
      <div class="stat-grid">
        <div class="stat"><span>Your score</span><b id="resPlayer">0</b></div>
        <div class="stat"><span>Rival score</span><b id="resOpp">0</b></div>
        <div class="stat"><span>Best combo</span><b id="resCombo">0</b></div>
        <div class="stat"><span>Mode</span><b id="resMode">TIME</b></div>
      </div>
      <div id="resultCoins" class="result-coins hidden"></div>
      <div class="stack result-actions" id="resultStandardActions">
        <button class="primary" id="retryMatch">RETRY</button>
        <button class="ghost" id="toRewards">CONTINUE</button>
      </div>
      <div class="stack result-actions hidden" id="resultCoinActions">
        <button type="button" class="primary" id="resultPlayAgain">PLAY AGAIN</button>
        <button type="button" class="ghost" id="resultBackRooms">BACK TO ROOMS</button>
      </div>
    </section>

      <section id="rewards" class="screen rewards">
        <div class="rewards-scroll">
          <div class="logo compact"><h1>REWARDS</h1><p id="rewardXp">+0 XP</p></div>
          <div class="rewards-hero" id="rewardsHero" aria-hidden="true">
            <div class="rewards-aura"></div>
            <div class="rewards-spark"></div>
            <div class="rewards-xp"><span id="rewardXpFill"></span></div>
          </div>
          <p class="rewards-note" id="rewardNote"></p>
          <div id="rewardList" class="reward-list"></div>
        </div>
        <div class="rewards-footer">
          <button class="primary" id="rewardsContinue">CONTINUE</button>
          <button class="ghost" id="again">PLAY AGAIN</button>
          <div class="rewards-footer-row">
            <button class="ghost" id="rewProfile">PROFILE</button>
            <button class="ghost" id="toMenu">MAIN MENU</button>
          </div>
        </div>
      </section>
  </div>
  <div id="callout" class="callout hidden"></div>
`;

function canvas2d(el: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!el) return null;
  return el.getContext("2d", { alpha: true }) || el.getContext("2d");
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const playerGems = document.querySelector<HTMLCanvasElement>("#playerGems");
const oppGems = document.querySelector<HTMLCanvasElement>("#oppGems");
const ctx = canvas2d(canvas);
if (!ctx) throw new Error("Canvas unsupported");
const renderer = new BoardRenderer(ctx);
renderer.setBoardLayers(canvas2d(playerGems), canvas2d(oppGems));
prefetchGemAtlas();
const spaceLayer = app.querySelector<HTMLElement>(".space-layer");
if (spaceLayer) startArenaParallax(spaceLayer, app);

const ui = {
  splash: $("#splash"),
  skipIntro: $("#skipIntro"),
  menu: $("#menu"),
  menuStatus: $("#menuStatus"),
  emailDialog: $("#emailDialog"),
  emailForm: $("#emailForm") as HTMLFormElement,
  emailDialogTitle: $("#emailDialogTitle"),
  emailDialogIntro: $("#emailDialogIntro"),
  emailAddress: $("#emailAddress") as HTMLInputElement,
  emailPassword: $("#emailPassword") as HTMLInputElement,
  emailDialogStatus: $("#emailDialogStatus"),
  emailSubmit: $("#emailSubmit") as HTMLButtonElement,
  emailCancel: $("#emailCancel") as HTMLButtonElement,
  emailModeToggle: $("#emailModeToggle") as HTMLButtonElement,
  online: $("#online"),
  onlineSub: $("#onlineSub"),
  onlineIdent: $("#onlineIdent"),
  onlineStatus: $("#onlineStatus"),
  authButtons: $("#authButtons"),
  profile: $("#profile"),
  trophies: $("#trophies"),
  modes: $("#modes"),
  rooms: $("#rooms"),
  roomsView: $("#roomsView"),
  ready: $("#ready"),
  tutorial: $("#tutorial"),
  settings: $("#settingsScreen"),
  match: $("#match"),
  results: $("#results"),
  rewards: $("#rewards"),
  playerScore: $("#playerScore"),
  oppScore: $("#oppScore"),
  playerCard: $("#playerCard"),
  oppCard: $("#oppCard"),
  rivalState: $("#rivalState"),
  timer: $("#timer"),
  timerBtn: $("#timerBtn"),
  timerLabel: $("#timerLabel"),
  playerCombo: $("#playerCombo"),
  oppCombo: $("#oppCombo"),
  freezeClock: $("#freezeClock"),
  shiftClock: $("#shiftClock"),
  energyFill: document.querySelector<HTMLElement>("#energyFill"),
  energyLabel: document.querySelector<HTMLElement>("#energyLabel"),
  playerScoreFill: $("#playerScoreFill"),
  oppScoreFill: $("#oppScoreFill"),
  comboDamage: $("#comboDamage"),
  matchObjective: $("#matchObjective"),
  comboBurst: $("#comboBurst"),
  energyBurst: $("#energyBurst"),
  matchStatus: $("#matchStatus"),
  overlay: $("#overlay"),
  overlayText: $("#overlayText"),
  callout: $("#callout"),
  playerBoard: $("#playerBoard"),
  oppBoard: $("#oppBoard"),
  rewind: document.querySelector<HTMLButtonElement>("#rewind"),
  energyBurstAttack: document.querySelector<HTMLButtonElement>("#energyBurstAttack"),
  megaStrikeAttack: document.querySelector<HTMLButtonElement>("#megaStrikeAttack"),
  cancelPowerTarget: document.querySelector<HTMLButtonElement>("#cancelPowerTarget"),
  powerArmory: $("#powerArmory"),
  dailyRun: $("#dailyRun"),
  modeTime: $("#modeTime") as HTMLButtonElement,
  modeScore: $("#modeScore") as HTMLButtonElement,
  modeRooms: $("#modeRooms") as HTMLButtonElement,
  readyPowers: $("#readyPowers"),
  youAvatar: $("#youAvatar"),
  youName: $("#youName"),
  youLevel: $("#youLevel"),
  rivalLevel: $("#rivalLevel"),
  rivalAvatar: $("#rivalAvatar"),
  sheet: $("#sheet"),
  sheetTitle: $("#sheetTitle"),
  sheetBody: $("#sheetBody"),
  resultTitle: $("#resultTitle"),
  resultXp: $("#resultXp"),
  resultLives: $("#resultLives"),
  resultAvatar: $("#resultAvatar"),
  resultPilot: $("#resultPilot"),
  resultMark: $("#resultMark"),
  retryMatch: $("#retryMatch") as HTMLButtonElement,
  toRewards: $("#toRewards") as HTMLButtonElement,
  resultCoins: $("#resultCoins"),
  resultStandardActions: $("#resultStandardActions"),
  resultCoinActions: $("#resultCoinActions"),
  resultPlayAgain: $("#resultPlayAgain") as HTMLButtonElement,
  resultBackRooms: $("#resultBackRooms") as HTMLButtonElement,
  resPlayer: $("#resPlayer"),
  resOpp: $("#resOpp"),
  resCombo: $("#resCombo"),
  resMode: $("#resMode"),
  rewardList: $("#rewardList"),
  rewardXp: $("#rewardXp"),
  rewardNote: $("#rewardNote"),
  rewardXpFill: $("#rewardXpFill"),
  tutText: $("#tutText"),
  tutStep: $("#tutStep"),
  readyTitle: $("#readyTitle"),
  readySub: $("#readySub"),
  readyTarget: $("#readyTarget"),
  readyClash: $("#readyClash"),
  readyHint: $("#readyHint"),
  readyStart: $("#readyStart") as HTMLButtonElement,
};

const photoFlow = mountAvatarPhotoFlow(document.body, {
  onSave(dataUrl) {
    if (session.saveCustomAvatarPhoto(dataUrl)) refreshAvatarSurfaces();
  },
  onRemove() {
    session.removeCustomAvatar();
    refreshAvatarSurfaces();
  },
});

const energyWrap = ui.energyFill?.closest(".energy-wrap") ?? null;

const SCREEN_NODES: [HTMLElement, string][] = [
  [ui.splash, "splash"],
  [ui.menu, "menu"],
  [ui.online, "online"],
  [ui.profile, "profile"],
  [ui.trophies, "trophies"],
  [ui.modes, "modes"],
  [ui.rooms, "rooms"],
  [ui.ready, "ready"],
  [ui.tutorial, "tutorial"],
  [ui.settings, "settings"],
  [ui.match, "match"],
  [ui.results, "results"],
  [ui.rewards, "rewards"],
];

function syncScreenNow(): void {
  const id = session.screen;
  for (const [el, name] of SCREEN_NODES) {
    const show = name === id || (name === "match" && id === "results");
    if (el.classList.contains("active") !== show) el.classList.toggle("active", show);
  }
}

function restartAnim(el: HTMLElement | null | undefined, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setText(el: HTMLElement | null | undefined, value: string): void {
  if (!el) return;
  if (el.textContent !== value) el.textContent = value;
}

function setWidth(el: HTMLElement | null | undefined, value: string): void {
  if (!el) return;
  if (el.style.width !== value) el.style.width = value;
}

function rewardCard(title: string, detail: string, rarity: "gold" | "cyan" | "level"): string {
  const glyph = rarity === "level" ? "▲" : rarity === "gold" ? "★" : "◆";
  return `<article class="reward-card ${rarity}"><span class="reward-glyph">${glyph}</span><b>${title}</b><small>${detail}</small></article>`;
}

let xpCountRaf = 0;
function paintRewards(grant: RewardGrant | null): void {
  const bounty = grantHasBounty(grant);
  ui.rewards.classList.toggle("has-bounty", bounty);
  ui.rewards.classList.toggle("empty-bounty", !bounty);
  restartAnim(ui.rewards, bounty ? "reward-burst" : "reward-idle");
  const need = xpToNext(session.progress.level);
  const pct = Math.min(100, (session.progress.xp / Math.max(1, need)) * 100);
  ui.rewardXpFill.style.width = bounty ? "0%" : `${pct}%`;
  if (!bounty) {
    ui.rewardXp.textContent = "+0 XP";
    ui.rewardNote.textContent = "NO MATCH BOUNTY";
    ui.rewardList.innerHTML = "";
    return;
  }
  ui.rewardNote.textContent = "MATCH BOUNTY";
  ui.rewardList.innerHTML = [
    ...(grant?.notes ?? []).map((n) => rewardCard(n, "MATCH BONUS", "cyan")),
    ...(grant?.achievements ?? []).map((a) => rewardCard(a.name, "ACHIEVEMENT UNLOCKED", "gold")),
    ...(grant?.unlocked ?? []).map((u) => rewardCard(u.replace(/-/g, " ").toUpperCase(), "COSMETIC UNLOCK", "gold")),
    grant?.coins ? rewardCard(`+${grant.coins} WINNING COINS`, "MATCH BOUNTY", "gold") : "",
    grant && grant.levelAfter > grant.levelBefore ? rewardCard(`LEVEL ${grant.levelAfter}`, "RANK UP", "level") : "",
  ].join("");
  const xp = grant?.xp ?? 0;
  revealRewardXp(xp, pct);
}

function revealRewardXp(target: number, barPct: number): void {
  if (xpCountRaf) cancelAnimationFrame(xpCountRaf);
  if (reducedMotion() || settings.animation === "low") {
    ui.rewardXp.textContent = `+${target} XP`;
    ui.rewardXpFill.style.width = `${barPct}%`;
    return;
  }
  const start = performance.now();
  const dur = Math.min(480, 160 + Math.min(target, 40) * 6);
  const tick = (now: number): void => {
    if (session.screen !== "rewards") return;
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - t) * (1 - t);
    ui.rewardXp.textContent = `+${Math.round(target * eased)} XP`;
    ui.rewardXpFill.style.width = `${barPct * eased}%`;
    if (t < 1) xpCountRaf = requestAnimationFrame(tick);
  };
  ui.rewardXp.textContent = "+0 XP";
  xpCountRaf = requestAnimationFrame(tick);
}

function pulseUxEnter(id: string): void {
  if (!app || id === "splash" || id === "match") return;
  const root = app;
  root.classList.remove("ux-enter");
  void root.offsetWidth;
  root.classList.add("ux-enter");
  window.setTimeout(() => root.classList.remove("ux-enter"), 360);
}

function feelHaptic(kind: Parameters<HapticBus["play"]>[0], combo = 1): void {
  haptics.defer(kind, combo);
}

function pressUi(cue: "ui" | "confirm" = "ui"): void {
  audio.play(cue);
  feelHaptic("tap");
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function fxOptions(extra: Partial<RenderFx> = {}): RenderFx {
  return {
    quality: settings.effects,
    animation: settings.animation,
    showCombo: settings.showComboEffects && settings.effects !== "low",
    tileTheme: session.progress.tileTheme,
    boardTheme: session.progress.boardTheme,
    vfxTheme: session.progress.vfxTheme,
    reducedMotion: reducedMotion(),
    ...extra,
  };
}

function applySettings(): void {
  saveSettings(settings);
  session.setMuted(!settings.sfx);
  audio.configure(settings.sfx, settings.music, settings.effects, settings.sfxVolume, settings.musicVolume);
  announcer.configure(settings.announcer && settings.sfx);
  haptics.setEnabled(settings.haptics);
  renderer.setFx(fxOptions());
  if (!app) return;
  app.classList.remove("fx-high", "fx-medium", "fx-low", "anim-high", "anim-medium", "anim-low");
  app.classList.add(`fx-${settings.effects}`, `anim-${settings.animation}`);
  paintToggle($("#sfxToggle"), settings.sfx);
  paintToggle($("#musicToggle"), settings.music);
  paintToggle($("#hapticsToggle"), settings.haptics);
  paintVolume($("#sfxVolume"), settings.sfxVolume);
  paintVolume($("#musicVolume"), settings.musicVolume);
  paintHudMute();
}

function paintVolume(input: HTMLElement, value: number): void {
  if (!(input instanceof HTMLInputElement)) return;
  input.value = String(Math.round(value * 100));
}

function paintHudMute(): void {
  const btn = document.querySelector<HTMLButtonElement>("#hudMute");
  if (!btn) return;
  const muted = isMatchAudioMuted(settings);
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  btn.textContent = muted ? "AUDIO OFF" : "AUDIO ON";
  btn.classList.toggle("off", muted);
}

function paintToggle(btn: HTMLElement, on: boolean): void {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const val = btn.querySelector(".toggle-val");
  if (val) val.textContent = on ? "ON" : "OFF";
}

applySettings();
session.begin(performance.now(), settings.introSeen || Boolean(returningGoogle));

function armFirstGestureAudio(): void {
  const once = () => {
    document.removeEventListener("pointerdown", once, true);
    document.removeEventListener("keydown", once, true);
    const startBed = session.screen !== "splash";
    unlockGameAudio(audio, settings.music, startBed);
  };
  document.addEventListener("pointerdown", once, true);
  document.addEventListener("keydown", once, true);
}
armFirstGestureAudio();
audio.prefetch();
if (returningGoogle) {
  session.openOnline();
  void signInWith("google", returningGoogle).then((signedIn) => {
    if (signedIn) {
      enterBattleSelect();
    }
  });
}

function displayCallout(id: VoiceLineId): void {
  const line = VOICE[id];
  showCallout(line.text, line.intensity);
  if (line.priority >= 40 && settings.effects !== "low") {
    flashImpact();
  }
}

announcer.onSpeak = displayCallout;

let calloutTimer = 0;
let protectedCalloutUntil = 0;
function showCallout(text: string, intensity: string, protectMs = 0): void {
  const now = performance.now();
  if (protectMs <= 0 && now < protectedCalloutUntil) return;
  if (protectMs > 0) protectedCalloutUntil = now + protectMs;
  ui.callout.textContent = text;
  const ingame = session.screen === "match" ? " ingame" : "";
  ui.callout.className = `callout pop ${intensity}${ingame}`;
  window.clearTimeout(calloutTimer);
  calloutTimer = window.setTimeout(() => {
    if (ui.callout.textContent === text) ui.callout.classList.add("hidden");
  }, 780);
}

const TUTORIAL = [
  "Press a gem, hold, and swipe up, down, left, or right. It swaps with its neighbor.",
  "Three or more of the same color clear. Cascades refill the board and score extra.",
  "Chain clears to build COMBO x2, x3, x4… Bigger combos charge attack and hit the rival.",
  "FREEZE ice-locks the rival for 5 seconds. TIME SHIFT steals 5 seconds in TIME BATTLE, or grants a tempo surge in SCORE BATTLE. REWIND restores your last valid move.",
  "TIME BATTLE: 60 seconds, highest score wins.",
  "SCORE BATTLE: first to the target score wins immediately. Set the target on the mode screen.",
];

function renderScoreTargets(): void {
  const row = $("#scoreTargets");
  row.innerHTML = SCORE_TARGETS.map(
    (n) =>
      `<button type="button" class="chip ${session.scoreTarget === n ? "on" : ""}" data-target="${n}">${n.toLocaleString()}</button>`,
  ).join("");
  paintArmory();
  paintDailyRun();
}

function paintArmory(): void {
  ui.powerArmory.innerHTML = powerArmoryHtml(session.progress, ads.isAvailable());
}

let dailyAudioKey = "";
function paintDailyRun(): void {
  session.refreshDailyRun();
  const run = dailyRunFromProgress(session.progress);
  const key = `${run.utcDay}|${run.lives}|${run.adsUsed}`;
  if (dailyAudioKey) {
    const [prevDay, prevLives, prevAds] = dailyAudioKey.split("|");
    const livesBefore = Number(prevLives);
    const adsBefore = Number(prevAds);
    if (run.utcDay !== prevDay && run.lives >= DAILY_LIVES_MAX) audio.play("livesreset");
    else if (run.lives < livesBefore) audio.play("lifelost");
    else if (run.lives > livesBefore && run.adsUsed > adsBefore) audio.play("lifead");
  }
  dailyAudioKey = key;
  ui.dailyRun.innerHTML = dailyRunHtml(session.progress, ads.isAvailable());
  const bypass = isDevBattleBypassEnabled();
  const blocked = !session.canEnterLocalBattle();
  ui.modes.classList.toggle("dev-local-open", bypass);
  for (const btn of [ui.modeTime, ui.modeScore, ui.modeRooms]) {
    btn.disabled = blocked;
    btn.classList.toggle("off", blocked);
    btn.setAttribute("aria-disabled", blocked ? "true" : "false");
  }
}

function paintReadyPowers(): void {
  ui.readyPowers.innerHTML = readyPowerStripHtml(session.progress);
}

const READY_HINT = "Swipe gems. Chain combos. Spend stored Chrono Power charges in battle.";

function paintReady(): void {
  const info = modeInfo(session.mode, session.scoreTarget);
  const room = session.pendingCoinRoom();
  ui.ready.classList.toggle("coin-ready", Boolean(room));
  ui.readyClash.classList.toggle("hidden", !room);
  ui.readyStart.classList.toggle("hidden", !room);
  if (room) {
    ui.readyTitle.textContent = "COIN MATCH";
    ui.readySub.textContent = info.name;
    ui.readyTarget.textContent = `${room.name.toUpperCase()} · ${room.entryCoins.toLocaleString("en-US")} 🪙`;
    ui.readyHint.textContent = "Entry is taken when the match starts.";
    ui.readyClash.innerHTML = coinReadyViewHtml(session.progress, room);
  } else {
    ui.readyTitle.textContent = info.name;
    ui.readySub.textContent = info.tag;
    ui.readyTarget.textContent = session.mode === "score" ? `TARGET ${session.scoreTarget.toLocaleString()}` : "60 SECONDS";
    ui.readyHint.textContent = READY_HINT;
    ui.readyClash.innerHTML = "";
  }
  paintReadyPowers();
}

let roomsBattleMode: GameMode = session.mode === "score" ? "score" : "time";

function paintRooms(): void {
  ui.roomsView.innerHTML = roomsViewHtml(
    session.progress,
    session.selectedRoomId,
    roomsBattleMode,
    session.canEnterLocalBattle(),
    session.lastCoinRoomEnter,
  );
}

async function pullTrustedClock(): Promise<void> {
  try {
    const health = await net.health();
    if (health.utcMs) session.syncTrustedClock(health.utcMs);
  } catch {
    /* local clock stays untrusted so it cannot reset lives */
  }
}

async function pullRemoteEconomy(): Promise<void> {
  if (!net.token) return;
  try {
    const remote = await net.hydrateEconomy(economyFromProgress(session.progress));
    session.syncEconomy(remote);
  } catch {
    try {
      session.syncEconomy(await net.economy());
    } catch {
      /* keep local economy if the server is unreachable */
    }
  }
}

async function pullRemoteDailyRun(): Promise<void> {
  await pullTrustedClock();
  if (!net.token) {
    paintDailyRun();
    return;
  }
  try {
    const remote = await net.hydrateDailyRun(dailyRunFromProgress(session.progress));
    session.syncDailyRun(remote);
  } catch {
    try {
      session.syncDailyRun(await net.dailyRun());
    } catch {
      /* keep local lives if the server is unreachable */
    }
  }
  paintDailyRun();
}

async function buyArmoryPower(id: string): Promise<void> {
  if (net.token) {
    try {
      const out = await net.buyPower(id);
      if (out.ok) {
        session.syncEconomy(out.economy);
        audio.play("confirm");
      } else if (out.reason === "funds") audio.play("deny");
      paintArmory();
      return;
    } catch {
      /* fall through to local wallet */
    }
  }
  const local = session.buyPowerCharge(id);
  if (local.ok) audio.play("confirm");
  else if (local.reason === "funds") audio.play("deny");
  paintArmory();
}

async function watchArmoryAd(id: string): Promise<void> {
  const shown = await ads.showRewarded(id);
  if (!shown.ok) {
    paintArmory();
    return;
  }
  if (net.token) {
    try {
      const out = await net.claimAdReward(id, shown.receiptId);
      ads.redeemReceipt(shown.receiptId);
      if (out.ok) session.syncEconomy(out.economy);
    } catch {
      /* keep the receipt unredeemed so a network retry can still reach the server */
    }
    paintArmory();
    return;
  }
  session.claimPowerAd(id, shown.receiptId, (receipt) => ads.redeemReceipt(receipt));
  paintArmory();
}

async function watchDailyLifeAd(): Promise<void> {
  const shown = await ads.showRewarded(DAILY_LIFE_AD_PLACEMENT);
  if (!shown.ok) {
    paintDailyRun();
    return;
  }
  if (net.token) {
    try {
      const out = await net.claimLifeAd(shown.receiptId);
      ads.redeemReceipt(shown.receiptId);
      if (out.ok) session.syncDailyRun(out.daily);
    } catch {
      /* keep the receipt unredeemed so a network retry can still reach the server */
    }
    paintDailyRun();
    return;
  }
  session.claimLifeAd(shown.receiptId, (receipt) => ads.redeemReceipt(receipt));
  paintDailyRun();
}

function renderTutorial(): void {
  ui.tutStep.textContent = `${session.tutorial + 1} / ${TUTORIAL.length}`;
  ui.tutText.textContent = TUTORIAL[session.tutorial] ?? "";
}

function renderProfile(): void {
  const p = session.progress;
  const view = profileView(p);
  $("#profileTitle").textContent = p.title;
  const name = $("#pilotName") as HTMLInputElement;
  name.value = p.name;
  $("#avatarPreview").innerHTML = view.preview;
  $("#avatarRow").innerHTML = view.avatars;
  $("#avatarHint").textContent = session.progress.customAvatar
    ? "Equipped: Custom photo. Tap it to change or remove. Preset marks stay available."
    : `Equipped: ${view.selectedName}. Locked marks unlock through play.`;
  $("#profileStats").innerHTML = view.stats;
  $("#xpFill").style.width = view.xpWidth;
  $("#xpLabel").textContent = view.xpLabel;
  $("#achieveList").innerHTML = view.achievements;
}

function refreshAvatarSurfaces(): void {
  renderProfile();
  paintMenuPilot();
  paintMatchIdentities();
  paintResultIdentities();
}

function renderTrophies(): void {
  $("#trophiesList").innerHTML = trophiesHtml(session.progress);
}

function paintMenuPilot(): void {
  renderMenuPilot($("#menuPilot"), session.progress);
  paintMenuAccount();
}

function paintMenuAccount(): void {
  const ident = document.querySelector("#menuIdent");
  if (!ident) return;
  ident.textContent = net.player
    ? `${net.player.provider.toUpperCase()} · ${net.player.playerId}`
    : "Sign in to save your Player ID, progression and trophies.";
}

async function paintOnline(): Promise<void> {
  const me = net.player;
  ui.onlineSub.textContent = "SELECT A MATCH TYPE";
  ui.onlineIdent.textContent = me ? `${me.name} · ${me.playerId}` : "Guest pilot · Player ID ready.";
  ui.authButtons.innerHTML = `
    <button class="mode-card battle-choice" id="battleLocal">
      <small>LOCAL ARENA</small>
      <b>1v1 BATTLE</b>
      <span>Challenge another player</span>
    </button>
    <button class="mode-card battle-choice" id="battleRandom">
      <small>ONLINE ARENA</small>
      <b>RANDOM MATCH</b>
      <span>Find an opponent automatically</span>
    </button>
  `;
  ui.onlineStatus.textContent = "";
}

let matchPoll: ReturnType<typeof setInterval> | null = null;
let matchPollGeneration = 0;
let emailMode: "sign-in" | "create-account" = "sign-in";

function updateEmailDialogMode(): void {
  const create = emailMode === "create-account";
  ui.emailDialogTitle.textContent = create ? "CREATE PILOT ACCOUNT" : "SIGN IN WITH EMAIL";
  ui.emailDialogIntro.textContent = create
    ? "Create a Player ID that keeps your profile, progression, and trophies."
    : "Use your email and password to continue your pilot profile.";
  ui.emailSubmit.textContent = create ? "CREATE ACCOUNT" : "SIGN IN";
  ui.emailModeToggle.textContent = create ? "ALREADY HAVE AN ACCOUNT? SIGN IN" : "NEW PILOT? CREATE AN ACCOUNT";
  ui.emailPassword.autocomplete = create ? "new-password" : "current-password";
}

function openEmailDialog(): void {
  emailMode = "sign-in";
  updateEmailDialogMode();
  ui.emailDialogStatus.textContent = "";
  ui.emailDialog.classList.remove("hidden");
  ui.emailDialog.setAttribute("aria-hidden", "false");
  ui.emailAddress.focus();
}

function closeEmailDialog(): void {
  ui.emailDialog.classList.add("hidden");
  ui.emailDialog.setAttribute("aria-hidden", "true");
  ui.emailForm.reset();
  ui.emailDialogStatus.textContent = "";
  ui.emailSubmit.disabled = false;
  ui.emailCancel.disabled = false;
}

function stopMatchPoll(): void {
  matchPollGeneration += 1;
  if (matchPoll) {
    clearInterval(matchPoll);
    matchPoll = null;
  }
}

let battlePoll: ReturnType<typeof setInterval> | null = null;
let battleSyncGeneration = 0;
let battleClientSeq = 0;
let battleSyncInFlight = false;
let battleSyncFailures = 0;
let battleActionQueue: Promise<void> = Promise.resolve();

function stopBattleSync(): void {
  battleSyncGeneration += 1;
  if (battlePoll) {
    clearInterval(battlePoll);
    battlePoll = null;
  }
  battleSyncInFlight = false;
  battleSyncFailures = 0;
}

function nextBattleSeq(): number {
  battleClientSeq += 1;
  session.pendingClientSeq = battleClientSeq;
  return battleClientSeq;
}

function leaveOnlineBattle(): void {
  stopBattleSync();
  const matchId = session.onlineMatchId;
  if (matchId && net.token) void net.leaveBattle(matchId).catch(() => undefined);
}

function sendOnlineAction(action: Omit<BattleActionInput, "clientSeq">): void {
  const matchId = session.onlineMatchId;
  if (!session.onlineRemote || !matchId || !net.token) return;
  const generation = battleSyncGeneration;
  const clientSeq = nextBattleSeq();
  battleActionQueue = battleActionQueue
    .catch(() => undefined)
    .then(async () => {
      if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) return;
      try {
        const snap = await net.sendBattleAction(matchId, { ...action, clientSeq });
        if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) return;
        battleSyncFailures = 0;
        session.applyBattleSnapshot(snap);
      } catch {
        if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) return;
        battleSyncFailures += 1;
        if (battleSyncFailures >= 4) ui.onlineStatus.textContent = "CONNECTION UNSTABLE";
      }
    });
}

function startBattleSync(matchId: string): void {
  stopBattleSync();
  const generation = battleSyncGeneration;
  battleClientSeq = 0;
  session.pendingClientSeq = 0;
  battleSyncInFlight = true;
  void net
    .joinBattle(matchId)
    .then((snap) => {
      if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) return;
      battleSyncInFlight = false;
      battleSyncFailures = 0;
      session.applyBattleSnapshot(snap);
      battlePoll = setInterval(() => {
        if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) {
          stopBattleSync();
          return;
        }
        if (battleSyncInFlight) return;
        battleSyncInFlight = true;
        void net
          .syncBattle(session.onlineMatchId, session.onlineLastSeq)
          .then((next) => {
            if (generation !== battleSyncGeneration || session.onlineMatchId !== matchId) return;
            battleSyncFailures = 0;
            session.applyBattleSnapshot(next);
          })
          .catch(() => {
            battleSyncFailures += 1;
            if (battleSyncFailures >= 4) ui.onlineStatus.textContent = "CONNECTION UNSTABLE";
          })
          .finally(() => {
            battleSyncInFlight = false;
          });
      }, 250);
    })
    .catch((err: unknown) => {
      if (generation !== battleSyncGeneration) return;
      battleSyncFailures += 1;
      battleSyncInFlight = false;
      ui.onlineStatus.textContent = err instanceof Error ? err.message : "battle join failed";
    });
}

function showSearching(): void {
  const me = net.player;
  ui.onlineIdent.textContent = me ? `${me.name} · ${me.playerId}` : "SEARCHING";
  ui.onlineStatus.textContent = "SEARCHING";
  ui.authButtons.innerHTML = `<button class="mode-card" id="cancelOnlineMatch"><small>ONLINE</small><b>SEARCHING</b><span>Waiting for a second player.</span></button><button class="mode-card" id="signOutOnline"><small>SESSION</small><b>SIGN OUT</b><span>Leave the queue.</span></button>`;
  audio.play("search");
}

async function applyMatchState(state: { status: string; matchId: string | null; playerId: string; opponentId: string | null; players: string[] | null; seed: number | null }): Promise<void> {
  if (state.status === "searching") {
    showSearching();
    return;
  }
  if (state.status === "cancelled") {
    stopMatchPoll();
    ui.onlineStatus.textContent = "CANCELLED";
    await paintOnline();
    return;
  }
  if (state.status === "matched" && state.matchId && state.opponentId != null && state.seed != null) {
    stopMatchPoll();
    if (session.onlineMatchId === state.matchId) return;
    ui.onlineIdent.textContent = `MATCH FOUND · ${state.matchId}`;
    ui.onlineStatus.textContent = `OPPONENT ${state.opponentId}`;
    audio.play("found");
    audio.startMusic();
    audio.resetSwapWave();
    session.beginOnlineTimeBattle({
      matchId: state.matchId,
      opponentId: state.opponentId,
      seed: state.seed,
      playerId: state.playerId,
      players: state.players ?? undefined,
    });
    startBattleSync(state.matchId);
    return;
  }
  stopMatchPoll();
  ui.onlineStatus.textContent = "error";
}

async function startOnlineMatch(): Promise<void> {
  stopMatchPoll();
  const generation = matchPollGeneration;
  ui.onlineStatus.textContent = "CONTACTING CHRONO CLASH SERVER...";
  try {
    await pullRemoteDailyRun();
    if (!session.canStartDailyRun()) {
      ui.onlineStatus.textContent = "no lives remaining";
      return;
    }
    const state = await net.findMatch();
    if (generation !== matchPollGeneration || session.screen !== "online") return;
    await applyMatchState(state);
    if (state.status === "searching") {
      const poll = setInterval(() => {
        if (generation !== matchPollGeneration || session.screen !== "online") {
          clearInterval(poll);
          if (matchPoll === poll) matchPoll = null;
          return;
        }
        void net
          .findMatch()
          .then((next) => {
            if (generation === matchPollGeneration && session.screen === "online") {
              return applyMatchState(next);
            }
            return undefined;
          })
          .catch((err: unknown) => {
            if (generation !== matchPollGeneration || session.screen !== "online") return;
            stopMatchPoll();
            ui.onlineStatus.textContent = err instanceof Error ? err.message : "match start failed";
          });
      }, 1000);
      matchPoll = poll;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "match start failed";
    if (isAuthFailure(err)) {
      stopMatchPoll();
      await net.signOut();
      session.toMenu();
      syncScreenNow();
      paintMenuPilot();
    }
    ui.onlineStatus.textContent = message;
  }
}

async function cancelOnlineMatch(): Promise<void> {
  stopMatchPoll();
  try {
    await net.cancelMatch();
    ui.onlineStatus.textContent = "CANCELLED";
    await paintOnline();
  } catch (err) {
    ui.onlineStatus.textContent = err instanceof Error ? err.message : "cancel failed";
  }
}

function setIdentityStatus(message: string): void {
  ui.menuStatus.textContent = message;
  ui.onlineStatus.textContent = message;
}

function enterBattleSelect(): void {
  session.openOnline();
  syncScreenNow();
  void paintOnline();
}

async function signInWith(provider: AuthProvider, existingToken?: string): Promise<boolean> {
  const platform = detectPlatform();
  setIdentityStatus(provider === "guest" ? "SIGNING IN AS GUEST..." : `CONTACTING ${provider.toUpperCase()}...`);
  try {
    // Guest must not depend on /v1/auth/config; the server decides whether guest is allowed.
    const config = await net.authConfig().catch((err) => {
      if (provider !== "guest" && !existingToken) throw err;
      return null;
    });
    let token = existingToken || "";
    if (!token) {
      if (provider === "guest") token = guestDeviceToken();
      else if (!config) throw new Error(`${provider} sign-in is unavailable right now.`);
      else token = await obtainProviderCredential(provider, config);
    }
    await net.signIn({ platform, provider, token, displayName: session.progress.name });
    await Promise.all([pullRemoteEconomy(), pullRemoteDailyRun()]);
    setIdentityStatus(`PLAYER ID ${net.player?.playerId ?? ""}`);
    paintMenuAccount();
    return true;
  } catch (err) {
    setIdentityStatus(err instanceof Error ? err.message : "sign-in failed");
    return false;
  }
}

async function signInWithEmail(email: string, password: string): Promise<boolean> {
  setIdentityStatus(emailMode === "create-account" ? "CREATING PILOT ACCOUNT..." : "SIGNING IN WITH EMAIL...");
  try {
    await net.signIn({
      platform: detectPlatform(),
      provider: "email",
      email,
      password,
      intent: emailMode,
      displayName: session.progress.name,
    });
    await Promise.all([pullRemoteEconomy(), pullRemoteDailyRun()]);
    setIdentityStatus(`PLAYER ID ${net.player?.playerId ?? ""}`);
    paintMenuAccount();
    return true;
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    const message =
      status === 503 || (status !== undefined && status >= 500)
        ? "EMAIL SIGN-IN IS UNAVAILABLE RIGHT NOW. TRY AGAIN OR USE GUEST."
        : err instanceof Error
          ? err.message
          : "email sign-in failed";
    ui.emailDialogStatus.textContent = message;
    ui.menuStatus.textContent = message;
    return false;
  }
}

ui.skipIntro.addEventListener("click", (e) => {
  e.stopPropagation();
  if (session.skipIntro(canSkipIntro(settings.introSeen))) {
    pressUi();
    syncScreenNow();
  }
});
ui.splash.addEventListener("click", () => {
  if (session.skipIntro(canSkipIntro(settings.introSeen))) {
    pressUi();
    syncScreenNow();
  }
});
$("#menuFacebook").addEventListener("click", () => {
  unlockGameAudio(audio, settings.music);
  pressUi();
  void signInWith("facebook").then((signedIn) => {
    if (signedIn) enterBattleSelect();
  });
});
$("#menuGoogle").addEventListener("click", () => {
  unlockGameAudio(audio, settings.music);
  pressUi();
  void signInWith("google").then((signedIn) => {
    if (signedIn) enterBattleSelect();
  });
});
$("#menuEmail").addEventListener("click", () => {
  unlockGameAudio(audio, settings.music);
  pressUi();
  openEmailDialog();
});
ui.emailModeToggle.addEventListener("click", () => {
  emailMode = emailMode === "sign-in" ? "create-account" : "sign-in";
  updateEmailDialogMode();
  ui.emailDialogStatus.textContent = "";
  ui.emailPassword.focus();
});
ui.emailCancel.addEventListener("click", () => {
  pressUi();
  closeEmailDialog();
  ui.menuStatus.textContent = "EMAIL SIGN-IN CANCELLED.";
});
ui.emailDialog.addEventListener("click", (event) => {
  if (event.target === ui.emailDialog) {
    closeEmailDialog();
    ui.menuStatus.textContent = "EMAIL SIGN-IN CANCELLED.";
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!ui.emailDialog.classList.contains("hidden")) {
    closeEmailDialog();
    ui.menuStatus.textContent = "EMAIL SIGN-IN CANCELLED.";
    return;
  }
  if (armedEnergyPower && session.screen === "match") {
    event.preventDefault();
    cancelArmedEnergyPower();
  }
});
ui.emailForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (ui.emailSubmit.disabled) return;
  ui.emailSubmit.disabled = true;
  ui.emailCancel.disabled = true;
  ui.emailDialogStatus.textContent = emailMode === "create-account" ? "CREATING ACCOUNT..." : "CONTACTING CHRONO CLASH SERVER...";
  void signInWithEmail(ui.emailAddress.value, ui.emailPassword.value).then((signedIn) => {
    if (signedIn) {
      closeEmailDialog();
      enterBattleSelect();
    } else {
      ui.emailSubmit.disabled = false;
      ui.emailCancel.disabled = false;
    }
  });
});
$("#menuGuest").addEventListener("click", () => {
  unlockGameAudio(audio, settings.music, false);
  pressUi();
  session.clearOnlineMatch();
  session.openModes();
  syncScreenNow();
  if (session.screen === "tutorial") renderTutorial();
  if (session.screen === "modes") renderScoreTargets();
});
$("#hudMute").addEventListener("click", () => {
  const muted = !isMatchAudioMuted(settings);
  applyMatchAudioMute(settings, muted);
  unlockGameAudio(audio, settings.music);
  applySettings();
  if (settings.music) audio.startMusic();
  else audio.stopMusic();
  pressUi();
});
$("#onlineBack").addEventListener("click", () => {
  pressUi();
  stopMatchPoll();
  leaveOnlineBattle();
  if (net.token) void net.cancelMatch().catch(() => undefined);
  session.toMenu();
  syncScreenNow();
  paintMenuPilot();
});
$("#authButtons").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!btn || !ui.authButtons.contains(btn)) return;
  if (btn.id === "battleLocal") {
    pressUi("confirm");
    session.openModes();
    syncScreenNow();
    if (session.screen === "tutorial") renderTutorial();
    if (session.screen === "modes") renderScoreTargets();
  } else if (btn.id === "battleRandom") {
    pressUi("confirm");
    void startOnlineMatch();
  } else if (btn.id === "findOnlineMatch") void startOnlineMatch();
  else if (btn.id === "cancelOnlineMatch") void cancelOnlineMatch();
  else if (btn.id === "signOutOnline") {
    stopMatchPoll();
    leaveOnlineBattle();
    void net.signOut().then(() => {
      session.toMenu();
      syncScreenNow();
      paintMenuPilot();
    });
  }
});
$("#toProfile").addEventListener("click", () => {
  pressUi();
  session.openProfile();
  syncScreenNow();
  renderProfile();
});
$("#toTrophies").addEventListener("click", () => {
  pressUi();
  session.openTrophies();
  syncScreenNow();
  renderTrophies();
});
$("#toSettings").addEventListener("click", () => {
  pressUi();
  session.openSettings();
  syncScreenNow();
});
$("#profileBack").addEventListener("click", () => {
  pressUi();
  session.toMenu();
  syncScreenNow();
  paintMenuPilot();
});
$("#trophiesBack").addEventListener("click", () => {
  pressUi();
  session.toMenu();
  syncScreenNow();
  paintMenuPilot();
});
$("#modesBack").addEventListener("click", () => {
  pressUi();
  session.toMenu();
  syncScreenNow();
  paintMenuPilot();
});
$("#scoreTargets").addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-target]");
  const target = Number(chip?.dataset.target);
  if (!Number.isFinite(target)) return;
  session.setScoreTarget(target);
  settings.scoreTarget = session.scoreTarget;
  applySettings();
  renderScoreTargets();
  pressUi();
});
$("#backMenu").addEventListener("click", () => {
  pressUi();
  session.closeSettings();
  syncScreenNow();
  paintMenuPilot();
});
$("#modeTime").addEventListener("click", () => {
  audio.play("clash");
  session.chooseMode("time");
  syncScreenNow();
});
$("#modeScore").addEventListener("click", () => {
  audio.play("clash");
  session.chooseMode("score");
  syncScreenNow();
});
$("#modeRooms").addEventListener("click", () => {
  pressUi("confirm");
  roomsBattleMode = session.mode === "score" ? "score" : "time";
  session.openRooms();
  syncScreenNow();
  paintRooms();
});
$("#roomsBack").addEventListener("click", () => {
  pressUi();
  session.openModes();
  syncScreenNow();
  if (session.screen === "modes") renderScoreTargets();
});
ui.roomsView.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const modeChip = t.closest<HTMLElement>("[data-rooms-mode]");
  if (modeChip?.dataset.roomsMode === "time" || modeChip?.dataset.roomsMode === "score") {
    roomsBattleMode = modeChip.dataset.roomsMode;
    pressUi();
    paintRooms();
    return;
  }
  const enter = t.closest<HTMLButtonElement>("[data-enter]");
  if (enter?.dataset.enter) {
    if (enter.disabled) return;
    pressUi("confirm");
    const result = session.enterCoinRoomMatch(roomsBattleMode, enter.dataset.enter);
    if (result.ok) {
      syncScreenNow();
      paintReady();
      return;
    }
    paintRooms();
    return;
  }
  const card = t.closest<HTMLElement>("[data-room]");
  if (!card?.dataset.room) return;
  pressUi();
  session.selectCoinRoom(card.dataset.room);
  paintRooms();
});
ui.readyStart.addEventListener("click", () => {
  if (session.screen !== "ready") return;
  pressUi("confirm");
  session.confirmReady();
  syncScreenNow();
});
ui.dailyRun.addEventListener("click", (e) => {
  const ad = (e.target as HTMLElement).closest<HTMLElement>("[data-life-ad]");
  if (!ad) return;
  pressUi();
  void watchDailyLifeAd();
});
ui.powerArmory.addEventListener("click", (e) => {
  const buy = (e.target as HTMLElement).closest<HTMLElement>("[data-buy]");
  const ad = (e.target as HTMLElement).closest<HTMLElement>("[data-ad]");
  if (buy?.dataset.buy) {
    pressUi();
    void buyArmoryPower(buy.dataset.buy);
  } else if (ad?.dataset.ad) {
    pressUi();
    void watchArmoryAd(ad.dataset.ad);
  }
});
$("#tutNext").addEventListener("click", () => {
  pressUi();
  session.nextTutorial();
  renderTutorial();
  syncScreenNow();
});
$("#tutSkip").addEventListener("click", () => {
  pressUi();
  session.skipTutorial();
  syncScreenNow();
});
$("#toRewards").addEventListener("click", () => {
  pressUi();
  session.goRewards();
  syncScreenNow();
});
$("#retryMatch").addEventListener("click", () => {
  pressUi("confirm");
  audio.startMusic();
  audio.resetSwapWave();
  leaveOnlineBattle();
  session.playAgain();
  syncScreenNow();
});
$("#resultPlayAgain").addEventListener("click", () => {
  pressUi("confirm");
  audio.startMusic();
  audio.resetSwapWave();
  leaveOnlineBattle();
  const replay = session.replayCoinRoom();
  syncScreenNow();
  if (replay.ok) paintReady();
  else paintRooms();
});
$("#resultBackRooms").addEventListener("click", () => {
  pressUi();
  audio.stopMusic();
  leaveOnlineBattle();
  session.openRooms();
  syncScreenNow();
  paintRooms();
});
$("#again").addEventListener("click", () => {
  pressUi("confirm");
  audio.startMusic();
  audio.resetSwapWave();
  leaveOnlineBattle();
  session.playAgain();
  syncScreenNow();
});
const leaveRewardsToMenu = (): void => {
  pressUi();
  audio.stopMusic();
  leaveOnlineBattle();
  session.toMenu();
  syncScreenNow();
  paintMenuPilot();
};
$("#rewardsContinue").addEventListener("click", leaveRewardsToMenu);
$("#toMenu").addEventListener("click", leaveRewardsToMenu);
$("#rewProfile").addEventListener("click", () => {
  pressUi();
  session.openProfile();
  syncScreenNow();
  renderProfile();
});
ui.timerBtn.addEventListener("click", () => {
  const now = performance.now();
  if (session.phase === "playing") {
    session.pause(now);
    pressUi();
  } else if (session.phase === "paused") {
    session.resume(now);
    pressUi();
  }
});
let castTimer = 0;
function flashCast(matchClass: string, btn?: HTMLButtonElement | null): void {
  ui.match.classList.remove("cast-freeze", "cast-shift", "cast-rewind", "cast-burst", "cast-mega", "clash-in");
  ui.match.classList.add(matchClass);
  if (btn) restartAnim(btn, "cast");
  window.clearTimeout(castTimer);
  castTimer = window.setTimeout(() => {
    ui.match.classList.remove(matchClass);
    btn?.classList.remove("cast");
  }, 420);
}

let impactPulseTimer = 0;
function flashImpact(): void {
  // Short arena/board pulse — must clear so rails return to quiet idle.
  restartAnim(ui.match, "impact");
  window.clearTimeout(impactPulseTimer);
  impactPulseTimer = window.setTimeout(() => {
    ui.match.classList.remove("impact");
  }, 220);
}

let comboPulseTimer = 0;
function flashCombo(combo: number): void {
  ui.match.classList.remove("combo-pulse", "combo-hot", "combo-max", "combo-mega");
  restartAnim(ui.match, "combo-pulse");
  if (combo >= 2) ui.match.classList.add("combo-hot");
  if (combo >= 3) ui.match.classList.add("combo-max");
  if (combo >= 5) ui.match.classList.add("combo-mega");
  if (combo >= 2 && settings.effects !== "low") {
    ui.energyBurst.classList.remove("hidden");
    restartAnim(ui.energyBurst, "pop");
  }
  window.clearTimeout(comboPulseTimer);
  comboPulseTimer = window.setTimeout(() => {
    ui.match.classList.remove("combo-pulse", "combo-hot", "combo-max", "combo-mega");
    ui.energyBurst.classList.add("hidden");
    ui.energyBurst.classList.remove("pop");
  }, 480);
}

ui.rewind?.addEventListener("click", () => {
  if (armedEnergyPower) {
    setArmedEnergyPower(null);
    renderer.setPowerCastTarget(null, performance.now());
  }
  if (session.usePower("rewind")) {
    ping(ui.rewind);
    flashCast("cast-rewind", ui.rewind ?? undefined);
    sendOnlineAction({ type: "power", id: "rewind" });
  }
});
function setArmedEnergyPower(id: "burst" | "megaStrike" | null): void {
  armedEnergyPower = id;
  session.setDrag(null);
  renderer.setPowerTargeting(id === "megaStrike" ? "mega" : id === "burst" ? "burst" : null, performance.now());
  ui.energyBurstAttack?.setAttribute("aria-pressed", id === "burst" ? "true" : "false");
  ui.megaStrikeAttack?.setAttribute("aria-pressed", id === "megaStrike" ? "true" : "false");
  ui.cancelPowerTarget?.closest(".power-cancel")?.toggleAttribute("hidden", id === null);
  if (ui.cancelPowerTarget) {
    ui.cancelPowerTarget.textContent = id === "burst" ? "CANCEL ENERGY BURST" : id === "megaStrike" ? "CANCEL MEGA STRIKE" : "CANCEL TARGET";
  }
}

function useEnergyAttack(id: "burst" | "megaStrike", button: HTMLButtonElement): void {
  if (!session.canUsePower(id)) {
    restartAnim(button, "unavailable");
    audio.play("ui");
    return;
  }
  const next = armedEnergyPower === id ? null : id;
  if (next) {
    setArmedEnergyPower(next);
    pressPowerButton(button);
  } else {
    cancelArmedEnergyPower();
  }
}

function reportCanceledEnergyPower(id: "burst" | "megaStrike"): void {
  const name = id === "burst" ? "Energy Burst" : "Mega Strike";
  ui.matchStatus.textContent = `Target canceled. Select a gem on the board to use ${name}.`;
  showCallout("TARGET CANCELED", "urgent", 520);
  flashImpact();
}

function cancelArmedEnergyPower(): void {
  const id = armedEnergyPower;
  if (!id) return;
  setArmedEnergyPower(null);
  reportCanceledEnergyPower(id);
  audio.play("ui");
}

ui.energyBurstAttack?.addEventListener("click", () => {
  if (ui.energyBurstAttack) useEnergyAttack("burst", ui.energyBurstAttack);
});
ui.megaStrikeAttack?.addEventListener("click", () => {
  if (ui.megaStrikeAttack) useEnergyAttack("megaStrike", ui.megaStrikeAttack);
});
ui.cancelPowerTarget?.addEventListener("click", cancelArmedEnergyPower);
document.querySelector(".powers")?.addEventListener("pointerdown", (e) => {
  const point = e as PointerEvent;
  const target = e.target;
  if (!(target instanceof Element) || !target.closest("#rewind")) return;
  const x = point.clientX;
  const y = point.clientY;
  const box = ui.rewind?.getBoundingClientRect();
  if (box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom && !session.canUsePower("rewind")) {
    audio.play("deny");
  }
});

$("#sfxToggle").addEventListener("click", () => {
  settings.sfx = !settings.sfx;
  applySettings();
  pressUi();
});
$("#musicToggle").addEventListener("click", () => {
  settings.music = !settings.music;
  applySettings();
  if (settings.music) audio.startMusic();
  else audio.stopMusic();
});
$("#sfxVolume").addEventListener("input", () => {
  settings.sfxVolume = Number(($("#sfxVolume") as HTMLInputElement).value) / 100;
  applySettings();
});
$("#musicVolume").addEventListener("input", () => {
  settings.musicVolume = Number(($("#musicVolume") as HTMLInputElement).value) / 100;
  applySettings();
});
$("#hapticsToggle").addEventListener("click", () => {
  settings.haptics = !settings.haptics;
  applySettings();
  if (settings.haptics) haptics.defer("tap");
});
$("#quitGame").addEventListener("click", () => {
  pressUi();
  audio.stopMusic();
  closeBattleSheet();
  leaveOnlineBattle();
  session.quitToMenu();
  syncScreenNow();
  paintMenuPilot();
});
$("#pilotName").addEventListener("change", (e) => {
  session.setName((e.target as HTMLInputElement).value);
  renderProfile();
});
$("#avatarRow").addEventListener("click", (e) => {
  const photoBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-photo]");
  if (photoBtn) {
    const mode = photoBtn.dataset.photo;
    if (mode === "custom" && hasAvatarPhoto() && !session.progress.customAvatar) {
      session.equipCustomAvatar();
      refreshAvatarSurfaces();
      pressUi();
      return;
    }
    if (mode === "custom") photoFlow.openManage();
    else photoFlow.openAdd();
    pressUi();
    return;
  }
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]");
  if (!btn || btn.disabled) return;
  const n = Number(btn.dataset.a);
  if (!Number.isFinite(n)) return;
  session.setAvatar(n);
  refreshAvatarSurfaces();
  pressUi();
});
const battleLog: string[] = [];
let pausedForSheet = false;

function logBattle(text: string): void {
  const line = text.trim();
  if (!line) return;
  if (battleLog[0] === line) return;
  battleLog.unshift(line);
  if (battleLog.length > 36) battleLog.length = 36;
}

function paintMatchIdentities(): void {
  const p = session.progress;
  paintAvatarElement(ui.youAvatar, p);
  ui.youName.textContent = "YOU";
  ui.youLevel.textContent = `LV ${p.level}`;
  if (session.onlineRivalId) {
    ui.rivalLevel.textContent = session.onlineRivalId;
    ui.rivalAvatar.className = "avatar rival-face a4";
    ui.rivalAvatar.textContent = "◈";
  } else {
    ui.rivalLevel.textContent = "CPU";
    ui.rivalAvatar.className = "avatar rival-face a3";
    ui.rivalAvatar.textContent = "◆";
  }
  paintResultIdentities();
}

function paintResultIdentities(): void {
  const p = session.progress;
  paintAvatarElement(ui.resultAvatar, p);
  ui.resultPilot.textContent = p.name;
  ui.resultMark.textContent = equippedAvatarName(p).toUpperCase();
}

function openBattleSheet(title: string, html: string): void {
  if (session.screen !== "match") return;
  if (session.phase === "playing") {
    session.pause();
    pausedForSheet = true;
  }
  ui.sheetTitle.textContent = title;
  ui.sheetBody.innerHTML = html;
  ui.sheet.classList.remove("hidden");
}

function closeBattleSheet(): void {
  ui.sheet.classList.add("hidden");
  if (pausedForSheet && session.phase === "paused") session.resume();
  pausedForSheet = false;
}

$("#dockChat").addEventListener("click", () => {
  pressUi();
  openBattleSheet("CHAT", chatHtml(battleLog));
});
$("#dockSettings").addEventListener("click", () => {
  pressUi();
  closeBattleSheet();
  session.openSettings();
  syncScreenNow();
});
$("#sheetClose").addEventListener("click", () => {
  pressUi();
  closeBattleSheet();
});
ui.sheet.addEventListener("click", (e) => {
  if (e.target === ui.sheet) closeBattleSheet();
});

const layout = {
  player: new DOMRect(),
  opp: new DOMRect(),
  canvas: new DOMRect(),
  dirty: true,
};

function rectMoved(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.top - b.top) > 0.5
  );
}

function refreshLayout(): void {
  if (!layout.dirty) return;
  const player = ui.playerBoard.getBoundingClientRect();
  const opp = ui.oppBoard.getBoundingClientRect();
  const stage = canvas.getBoundingClientRect();
  if (rectMoved(player, layout.player) || rectMoved(opp, layout.opp) || rectMoved(stage, layout.canvas)) {
    renderer.invalidateLayout();
    cachedCellSize = 0;
  }
  layout.player = player;
  layout.opp = opp;
  layout.canvas = stage;
  layout.dirty = player.width <= 8 || player.height <= 8 || opp.width <= 8 || opp.height <= 8;
}

function markLayoutDirty(): void {
  layout.dirty = true;
  renderer.invalidateLayout();
}

const STAGE_STARS = [
  [0.06, 0.12, 1.1, 0.58],
  [0.16, 0.28, 0.8, 0.46],
  [0.27, 0.08, 0.7, 0.4],
  [0.38, 0.34, 0.9, 0.42],
  [0.5, 0.16, 0.65, 0.34],
  [0.62, 0.29, 0.9, 0.4],
  [0.74, 0.1, 0.75, 0.48],
  [0.86, 0.24, 1.15, 0.56],
  [0.94, 0.44, 0.7, 0.42],
  [0.08, 0.73, 0.8, 0.42],
  [0.2, 0.58, 0.65, 0.34],
  [0.34, 0.84, 1.05, 0.48],
  [0.66, 0.76, 0.75, 0.4],
  [0.82, 0.9, 0.95, 0.5],
] as const;

type BackdropCache = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
};

let backdropCache: BackdropCache | null = null;

function drawStageBackdrop(
  stageCtx: CanvasRenderingContext2D,
  stageRect: DOMRect,
  boardRect: DOMRect,
): void {
  const w = stageCtx.canvas.clientWidth;
  const h = stageCtx.canvas.clientHeight;
  if (w < 2 || h < 2 || boardRect.width < 8 || boardRect.height < 8) return;

  const boardX = boardRect.left - stageRect.left;
  const boardY = boardRect.top - stageRect.top;
  const boardW = boardRect.width;
  const boardH = boardRect.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const needsRedraw =
    !backdropCache ||
    backdropCache.width !== w ||
    backdropCache.height !== h ||
    backdropCache.dpr !== dpr ||
    Math.abs(backdropCache.boardX - boardX) > 0.25 ||
    Math.abs(backdropCache.boardY - boardY) > 0.25 ||
    Math.abs(backdropCache.boardW - boardW) > 0.25 ||
    Math.abs(backdropCache.boardH - boardH) > 0.25;

  if (needsRedraw) {
    if (!backdropCache) {
      const cacheCanvas = document.createElement("canvas");
      const cacheCtx = cacheCanvas.getContext("2d");
      if (!cacheCtx) return;
      backdropCache = {
        canvas: cacheCanvas,
        ctx: cacheCtx,
        width: 0,
        height: 0,
        dpr: 0,
        boardX: 0,
        boardY: 0,
        boardW: 0,
        boardH: 0,
      };
    }

    const cache = backdropCache;
    cache.width = w;
    cache.height = h;
    cache.dpr = dpr;
    cache.boardX = boardX;
    cache.boardY = boardY;
    cache.boardW = boardW;
    cache.boardH = boardH;
    cache.canvas.width = Math.max(1, Math.floor(w * dpr));
    cache.canvas.height = Math.max(1, Math.floor(h * dpr));
    cache.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cache.ctx.clearRect(0, 0, w, h);

    const bandTop = Math.max(0, boardY - boardH * 0.4);
    const bandBottom = Math.min(h, boardY + boardH * 1.16);
    const bandHeight = bandBottom - bandTop;
    if (bandHeight < 8) return;

    const boardPad = 10;
    const backdropCtx = cache.ctx;
    backdropCtx.save();
    backdropCtx.globalCompositeOperation = "source-over";
    backdropCtx.beginPath();
    backdropCtx.rect(0, bandTop, w, bandHeight);
    backdropCtx.rect(boardX - boardPad, boardY - boardPad, boardW + boardPad * 2, boardH + boardPad * 2);
    backdropCtx.clip("evenodd");

    const starY = (ratio: number) => bandTop + bandHeight * ratio;
    for (const [x, y, radius, alpha] of STAGE_STARS) {
      backdropCtx.beginPath();
      backdropCtx.fillStyle = `rgba(214, 242, 255, ${alpha * 0.34})`;
      backdropCtx.arc(w * x, starY(y), radius, 0, Math.PI * 2);
      backdropCtx.fill();
    }

    const centerCavity = backdropCtx.createRadialGradient(w * 0.5, boardY + boardH * 0.42, 0, w * 0.5, boardY + boardH * 0.42, w * 0.58);
    centerCavity.addColorStop(0, "rgba(0, 2, 10, 0.7)");
    centerCavity.addColorStop(0.42, "rgba(2, 5, 20, 0.42)");
    centerCavity.addColorStop(1, "rgba(2, 5, 20, 0)");
    backdropCtx.fillStyle = centerCavity;
    backdropCtx.fillRect(0, bandTop, w, bandHeight);

    const leftNebula = backdropCtx.createRadialGradient(-w * 0.04, boardY + boardH * 0.44, 0, w * 0.08, boardY + boardH * 0.44, w * 0.72);
    leftNebula.addColorStop(0, "rgba(0, 185, 245, 0.34)");
    leftNebula.addColorStop(0.26, "rgba(0, 125, 190, 0.2)");
    leftNebula.addColorStop(0.62, "rgba(0, 72, 125, 0.08)");
    leftNebula.addColorStop(1, "rgba(0, 22, 46, 0)");
    backdropCtx.fillStyle = leftNebula;
    backdropCtx.fillRect(0, bandTop, w * 0.68, bandHeight);

    const rightNebula = backdropCtx.createRadialGradient(w * 1.04, boardY + boardH * 0.46, 0, w * 0.92, boardY + boardH * 0.46, w * 0.72);
    rightNebula.addColorStop(0, "rgba(246, 24, 112, 0.3)");
    rightNebula.addColorStop(0.26, "rgba(164, 18, 94, 0.18)");
    rightNebula.addColorStop(0.62, "rgba(84, 18, 80, 0.08)");
    rightNebula.addColorStop(1, "rgba(23, 6, 28, 0)");
    backdropCtx.fillStyle = rightNebula;
    backdropCtx.fillRect(w * 0.32, bandTop, w * 0.68, bandHeight);

    const purpleTransition = backdropCtx.createRadialGradient(w * 0.5, boardY + boardH * 0.38, 0, w * 0.5, boardY + boardH * 0.38, w * 0.42);
    purpleTransition.addColorStop(0, "rgba(94, 58, 156, 0.14)");
    purpleTransition.addColorStop(0.48, "rgba(74, 34, 122, 0.08)");
    purpleTransition.addColorStop(1, "rgba(34, 15, 72, 0)");
    backdropCtx.fillStyle = purpleTransition;
    backdropCtx.fillRect(w * 0.12, bandTop, w * 0.76, bandHeight);

    const base = backdropCtx.createLinearGradient(0, bandTop, 0, bandBottom);
    base.addColorStop(0, "rgba(2, 8, 20, 0.9)");
    base.addColorStop(0.5, "rgba(1, 4, 13, 0.76)");
    base.addColorStop(1, "rgba(0, 2, 8, 0.92)");
    backdropCtx.fillStyle = base;
    backdropCtx.fillRect(0, bandTop, w, bandHeight);
    backdropCtx.restore();
  }

  if (!backdropCache) return;
  stageCtx.save();
  stageCtx.globalCompositeOperation = "destination-over";
  stageCtx.drawImage(backdropCache.canvas, 0, 0, w, h);
  stageCtx.restore();
}

function syncAppViewport(): void {
  const height = Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
  document.documentElement.style.setProperty("--app-vh", `${height}px`);
}

syncAppViewport();
window.addEventListener("resize", () => {
  syncAppViewport();
  markLayoutDirty();
}, { passive: true });
window.addEventListener("orientationchange", () => {
  syncAppViewport();
  markLayoutDirty();
});
window.visualViewport?.addEventListener("resize", () => {
  syncAppViewport();
  markLayoutDirty();
}, { passive: true });
window.visualViewport?.addEventListener("scroll", syncAppViewport, { passive: true });
if (typeof ResizeObserver !== "undefined") {
  const boardWatch = new ResizeObserver(markLayoutDirty);
  boardWatch.observe(ui.playerBoard);
  boardWatch.observe(ui.oppBoard);
}

function retain2d(el: HTMLCanvasElement | null): void {
  if (!el) return;
  el.addEventListener("contextlost", (event) => {
    event.preventDefault();
  });
  el.addEventListener("contextrestored", () => {
    renderer.setBoardLayers(canvas2d(playerGems), canvas2d(oppGems));
    markLayoutDirty();
  });
}
retain2d(canvas);
retain2d(playerGems);
retain2d(oppGems);

function ping(btn: HTMLButtonElement | null | undefined): void {
  if (!btn) return;
  restartAnim(btn, "active");
}

function pressPowerButton(btn: HTMLButtonElement | null | undefined): void {
  if (!btn) return;
  restartAnim(btn, "power-press");
  window.setTimeout(() => btn.classList.remove("power-press"), 170);
}

let cachedCellSize = 0;

function ensureInputLayout(): void {
  if (layout.dirty) refreshLayout();
}

function cellSize(): number {
  ensureInputLayout();
  if (cachedCellSize > 0) return cachedCellSize;
  const rect = layout.player;
  // Square cells on an 8x10 board: limited by both width and height budgets.
  const innerW = rect.width - BOARD_FRAME * 2;
  const innerH = rect.height - BOARD_FRAME * 2;
  const cellW = (innerW - BOARD_GAP * (COLS + 1)) / COLS;
  const cellH = (innerH - BOARD_GAP * (ROWS + 1)) / ROWS;
  cachedCellSize = Math.min(cellW, cellH);
  return cachedCellSize;
}

function swipeMin(): number {
  return Math.max(6, cellSize() * 0.1);
}

function commitSwipe(from: Coord, target: Coord, now: number, gestureDx = 0, gestureDy = 0): boolean {
  if (session.tryPlayerSwap(from, target, now)) {
    renderer.primeSwapPose(from, target, gestureDx, gestureDy, now);
    audio.playSwapWave();
    renderer.flashSwap(from, target, now);
    sendOnlineAction({ type: "swap", a: from, b: target });
    return true;
  }
  renderer.flashInvalid(from, target, now);
  feelHaptic("invalid");
  return false;
}

ui.playerBoard.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const now = performance.now();
    ensureInputLayout();
    if (!session.isInteractive(now)) return;
    const cell = hitPlayer(e);
    if (!cell) return;
    e.preventDefault();
    ui.matchStatus.textContent = "";
    swipe = { id: e.pointerId, r: cell.r, c: cell.c, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    session.setDrag(cell, 0, 0);
    if (armedEnergyPower) renderer.setPowerTarget(cell, now);
    renderer.flashSelect(cell, now);
    feelHaptic("tap");
    try {
      ui.playerBoard.setPointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
  },
  { passive: false },
);

ui.playerBoard.addEventListener(
  "pointermove",
  (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    e.preventDefault();
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    const drag = clampDrag(dx, dy, cellSize());
    swipe.dx = drag.dx;
    swipe.dy = drag.dy;
    session.updateDrag(swipe.dx, swipe.dy);
    if (armedEnergyPower) {
      renderer.setPowerTarget(hitPlayer(e), performance.now());
    }
    if (!armedEnergyPower) {
      const target = neighborFromSwipe({ r: swipe.r, c: swipe.c }, dx, dy, swipeMin());
      if (target) {
        const from = { r: swipe.r, c: swipe.c };
        const gestureDx = swipe.dx;
        const gestureDy = swipe.dy;
        swipe = null;
        commitSwipe(from, target, performance.now(), gestureDx, gestureDy);
      }
    }
  },
  { passive: false },
);

ui.playerBoard.addEventListener(
  "pointerup",
  (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const now = performance.now();
    const from = { r: swipe.r, c: swipe.c };
    if (armedEnergyPower) {
      const id = armedEnergyPower;
      const target = hitPlayer(e);
      const button = id === "burst" ? ui.energyBurstAttack : ui.megaStrikeAttack;
      swipe = null;
      setArmedEnergyPower(null);
      if (!target) {
        session.rejectSwipe(now);
        renderer.flashInvalid(from, from, now);
        restartAnim(button, "unavailable");
        feelHaptic("invalid");
        reportCanceledEnergyPower(id);
        return;
      }
      renderer.setPowerTarget(target, now);
      renderer.setPowerCastTarget(target, now);
      if (session.usePower(id, now, target)) {
        pressPowerButton(button);
        flashCast(id === "burst" ? "cast-burst" : "cast-mega", button);
        sendOnlineAction({ type: "power", id, target });
      } else {
        renderer.setPowerCastTarget(null, now);
        restartAnim(button, "unavailable");
      }
      return;
    }
    const rawDx = e.clientX - swipe.x;
    const rawDy = e.clientY - swipe.y;
    const finalDrag = clampDrag(rawDx, rawDy, cellSize());
    swipe.dx = finalDrag.dx;
    swipe.dy = finalDrag.dy;
    session.updateDrag(swipe.dx, swipe.dy);
    const target = neighborFromSwipe(from, rawDx, rawDy, swipeMin());
    const gestureDx = swipe.dx;
    const gestureDy = swipe.dy;
    swipe = null;
    if (target) {
      commitSwipe(from, target, now, gestureDx, gestureDy);
    } else {
      if (session.drag) session.rejectSwipe(now);
      else session.setDrag(null);
    }
  },
);
function finishSwipe(e?: Event): void {
  const pointerId = e && "pointerId" in e ? Number((e as Event & { pointerId?: number }).pointerId) : null;
  if (swipe && pointerId != null && pointerId !== swipe.id) return;
  const canceledPower = armedEnergyPower;
  const now = performance.now();
  swipe = null;
  if (canceledPower) {
    setArmedEnergyPower(null);
    renderer.clearPowerTargeting();
    session.setDrag(null);
    renderer.setPowerTarget(null, now);
    reportCanceledEnergyPower(canceledPower);
    return;
  }
  session.setDrag(null);
  renderer.setPowerTarget(null, performance.now());
}
ui.playerBoard.addEventListener("pointercancel", finishSwipe);
ui.playerBoard.addEventListener("lostpointercapture", finishSwipe);

function hitPlayer(e: PointerEvent) {
  ensureInputLayout();
  return renderer.cellAt(layout.player, layout.canvas, e.clientX, e.clientY);
}

function pop(el: HTMLElement): void {
  restartAnim(el, "pop");
}

let shownPlayer = 0;
let shownOpp = 0;
let revealPlayerScore = 0;
let pendingPlayerScoreAt = 0;
let lastPlayerScore = 0;
let lastOppScore = 0;
let lastPlayerEnergy = 0;
let lastTimerBand: "ok" | "warn" | "critical" = "ok";
let lastCombo = "";
let lastOppCombo = "";
let lastGameplayCalloutAt = 0;
let lastOverlay = "";
let seenFx = 0;
const freshFx: FxEvent[] = [];
let resultAt = 0;
let lastScreen = "";
let lastProfile = -1;
let boardsDrawn = false;
let lastResultKey = "";
let matchEffectsStopped = false;
let lastRivalActionAt = -Infinity;
let lastFinalSecond = 0;
let lastMegaReady = false;
let lastBurstReady = false;
let lastRewindReady = false;
let objectiveCompleted = false;
const RESULTS_BOARD_FADE_MS = 220;

type MatchObjective = {
  label: string;
  target: number;
  value: (snap: ReturnType<GameSession["snapshot"]>) => number;
};

const MATCH_OBJECTIVES: MatchObjective[] = [
  { label: "REACH COMBO x4", target: 4, value: (snap) => snap.player.bestCombo },
  { label: "CHARGE 50 ENERGY", target: 50, value: (snap) => snap.player.energy },
  { label: "BREAK 1,000 SCORE", target: 1_000, value: (snap) => snap.player.score },
  { label: "TAKE THE LEAD", target: 1, value: (snap) => (snap.player.score > snap.opponent.score ? 1 : 0) },
];
let matchObjective: MatchObjective = MATCH_OBJECTIVES[0]!;

function updateMatchObjective(snap: ReturnType<GameSession["snapshot"]>): void {
  const value = Math.max(0, Math.min(matchObjective.target, matchObjective.value(snap)));
  const complete = value >= matchObjective.target;
  ui.matchObjective.textContent = complete
    ? "OBJECTIVE COMPLETE"
    : `${matchObjective.label} · ${matchObjective.target === 1 ? "NOT YET" : `${Math.floor(value)}/${matchObjective.target}`}`;
  ui.matchObjective.classList.toggle("complete", complete);
  if (complete && !objectiveCompleted) {
    objectiveCompleted = true;
    showCallout("OBJECTIVE COMPLETE", "powerful", 780);
    restartAnim(ui.matchObjective, "complete");
  }
}

function updateRivalState(snap: ReturnType<GameSession["snapshot"]>, now: number): void {
  const playerLead = snap.player.score - snap.opponent.score;
  const critical = snap.mode === "score"
    ? snap.opponent.score >= snap.target * 0.72
    : snap.last10 && snap.opponent.score >= snap.player.score;
  const state = now - lastRivalActionAt < 900
    ? "RIVAL ATTACKING"
    : snap.opponent.combo >= 3
      ? "RIVAL COMBO"
      : critical
        ? "RIVAL CRITICAL"
        : playerLead >= 500
          ? "RIVAL LOW"
          : "RIVAL ONLINE";
  if (ui.rivalState.textContent !== state) ui.rivalState.textContent = state;
  ui.rivalState.className = `rival-state ${state.toLowerCase().replaceAll(" ", "-")}`;
}

function onScreenEnter(id: string, now: number): void {
  pulseUxEnter(id);
  if (id === "menu") paintMenuPilot();
  if (id === "online") void paintOnline();
  if (id === "profile") renderProfile();
  if (id === "trophies") renderTrophies();
  if (id === "tutorial") renderTutorial();
  if (id === "modes") {
    renderScoreTargets();
    void pullRemoteDailyRun();
    paintDailyRun();
  }
  if (id === "rooms") {
    paintRooms();
  }
  if (id === "ready") {
    paintReady();
    announcer.reset();
    announcer.submit("ready", now);
  }
  if (id === "match") {
    matchEffectsStopped = false;
    lastOverlay = "";
    seenFx = 0;
    lastGameplayCalloutAt = 0;
    lastPlayerEnergy = 0;
    lastFinalSecond = 0;
    lastMegaReady = false;
    lastBurstReady = false;
    lastRewindReady = false;
    lastRivalActionAt = -Infinity;
    objectiveCompleted = false;
    matchObjective = MATCH_OBJECTIVES[session.progress.matchesSeen % MATCH_OBJECTIVES.length]!;
    ui.matchObjective.textContent = matchObjective.label;
    ui.matchObjective.classList.remove("complete");
    ui.rivalState.textContent = "RIVAL ONLINE";
    ui.rivalState.className = "rival-state";
    battleLog.length = 0;
    ui.matchStatus.textContent = "";
    setArmedEnergyPower(null);
    layout.dirty = true;
    paintMatchIdentities();
  }
  if (id === "results") {
    resultAt = now;
    paintResultIdentities();
    restartAnim(ui.results, "reveal");
  }
  if (id === "rewards") {
    const g = session.result?.grant ?? null;
    paintRewards(g);
    if (grantHasBounty(g)) {
      audio.play("confirm");
    }
  }
  if (id !== "match" && id !== "ready") ui.callout.classList.add("hidden");
}

function frame(now: number): void {
  session.tick(now);
  const screen = session.screen;
  if (screen !== lastScreen) {
    syncScreenNow();
    const previous = lastScreen;
    onScreenEnter(screen, now);
    if (previous === "splash" && screen === "menu") {
      if (!settings.introSeen) {
        settings.introSeen = true;
        saveSettings(settings);
      }
      audio.resume();
      audio.syncBed("lobby");
    }
    lastScreen = screen;
    if (
      previous &&
      previous !== "splash" &&
      screen !== "ready" &&
      screen !== "splash" &&
      screen !== "results" &&
      screen !== "match"
    ) {
      audio.play("ui");
    }
  }

  audio.syncBed(bedFromScene({ screen, phase: session.phase, outcome: session.result?.outcome }));

  const heavy = screen === "match" || screen === "results" || screen === "ready" || screen === "splash";
  const snap = heavy ? session.snapshot(now) : null;

  if (snap && snap.screen === "splash") {
    ui.splash.classList.toggle("beat-studio", snap.introBeat === "studio");
    ui.splash.classList.toggle("beat-title", snap.introBeat === "title");
    ui.skipIntro.classList.toggle("hidden", !canSkipIntro(settings.introSeen));
  }

  if (screen === "profile" && session.progress.plays !== lastProfile) {
    lastProfile = session.progress.plays;
    renderProfile();
  }

  const showBoards = screen === "match" || (screen === "results" && now - resultAt < RESULTS_BOARD_FADE_MS);
  if (showBoards && snap && !document.hidden) {
    if (snap.phase === "ended" && !matchEffectsStopped) {
      renderer.stopMatchEffects(snap.fx);
      matchEffectsStopped = true;
    }
    const rate = scoreTickerRate(settings.animation, reducedMotion());
    if (snap.player.score !== lastPlayerScore) {
      if (snap.player.score > lastPlayerScore) {
        const delay = matchImpactDelayMs(reducedMotion());
        pendingPlayerScoreAt = now + delay;
        if (delay > 0) audio.playLater("score", delay);
        else audio.play("score");
        window.setTimeout(() => pop(ui.playerCard), delay);
      } else {
        revealPlayerScore = snap.player.score;
        pendingPlayerScoreAt = 0;
        pop(ui.playerCard);
      }
      lastPlayerScore = snap.player.score;
    }
    if (pendingPlayerScoreAt && now >= pendingPlayerScoreAt) {
      revealPlayerScore = lastPlayerScore;
      pendingPlayerScoreAt = 0;
    }
    shownPlayer += (revealPlayerScore - shownPlayer) * rate;
    shownOpp += (snap.opponent.score - shownOpp) * rate;
    if (Math.abs(revealPlayerScore - shownPlayer) < 0.6) shownPlayer = revealPlayerScore;
    if (Math.abs(snap.opponent.score - shownOpp) < 0.6) shownOpp = snap.opponent.score;
    setText(ui.playerScore, String(Math.round(shownPlayer)));
    setText(ui.oppScore, String(Math.round(shownOpp)));
    const scoreCap = Math.max(
      snap.mode === "score" ? snap.target || session.scoreTarget : 4000,
      snap.player.score,
      snap.opponent.score,
      1,
    );
    setWidth(ui.playerScoreFill, `${Math.min(100, (shownPlayer / scoreCap) * 100)}%`);
    setWidth(ui.oppScoreFill, `${Math.min(100, (shownOpp / scoreCap) * 100)}%`);
    if (snap.opponent.score !== lastOppScore) {
      // Rival board SFX stay silent — no oppscore / gem-break / match cues.
      lastOppScore = snap.opponent.score;
      pop(ui.oppCard);
    }
    if (snap.phase === "countdown") lastTimerBand = "ok";
    if (snap.last5) {
      if (lastTimerBand !== "critical") audio.play("critical");
      lastTimerBand = "critical";
    } else if (snap.last10) {
      if (lastTimerBand === "ok") audio.play("warning");
      lastTimerBand = "warn";
    } else {
      lastTimerBand = "ok";
    }
    if (snap.mode === "score") {
      setText(ui.timerLabel, snap.phase === "paused" ? "TARGET · RESUME" : "TARGET SCORE");
      setText(ui.timer, session.scoreTarget.toLocaleString());
    } else {
      setText(ui.timerLabel, snap.phase === "paused" ? "PAUSED" : "TIME REMAINING");
      setText(ui.timer, formatClock(snap.remainingMs));
    }
    ui.timerBtn.classList.toggle("urgent", snap.last5 || snap.last10);
    ui.timerBtn.classList.toggle("final", snap.last10);
    ui.timerBtn.classList.toggle("critical", snap.last5);
    ui.oppCard.classList.toggle("danger", snap.danger);
    ui.match.classList.toggle("danger-hud", snap.danger);
    ui.match.classList.toggle("final-seconds", snap.last10);
    ui.match.classList.toggle("final-critical", snap.last5);
    ui.match.classList.toggle("leading", snap.player.score > snap.opponent.score);
    ui.match.classList.toggle("trailing", snap.player.score < snap.opponent.score);
     updateRivalState(snap, now);
     const playing = snap.phase === "playing";
     ui.playerCard.classList.toggle("locked", snap.playerLockedRemainingMs > 0);
     ui.playerCard.classList.toggle("resolving", snap.busy && playing);
     ui.playerCard.setAttribute("aria-busy", snap.busy && playing ? "true" : "false");
    ui.oppCard.classList.toggle("pressured", snap.rivalLockedRemainingMs > 0);
    const pCombo = snap.player.combo > 1 ? `COMBO x${snap.player.combo}` : "";
    const oCombo = snap.opponent.combo > 1 ? `COMBO x${snap.opponent.combo}` : "";
    ui.playerCombo.classList.toggle("hot", snap.player.combo >= 4);
    ui.playerCombo.classList.toggle("max", snap.player.combo >= 6);
    ui.oppCombo.classList.toggle("hot", snap.opponent.combo >= 4);
    if (pCombo !== lastCombo) {
      ui.playerCombo.textContent = pCombo;
      ui.comboDamage.textContent = snap.player.combo > 1 ? `+${Math.min(400, (snap.player.combo - 1) * 45)}% DAMAGE` : "";
      if (pCombo) pop(ui.playerCombo);
      lastCombo = pCombo;
    }
    if (oCombo !== lastOppCombo) {
      ui.oppCombo.textContent = oCombo;
      if (oCombo) pop(ui.oppCombo);
      lastOppCombo = oCombo;
    }
    let freezeText = "";
    if (snap.freezeRemainingMs > 0) freezeText = `FREEZE ${Math.max(1, Math.ceil(snap.freezeRemainingMs / 1000))}`;
    else if (snap.rivalLockedRemainingMs > 0) freezeText = `HALTED ${Math.max(1, Math.ceil(snap.rivalLockedRemainingMs / 1000))}`;
    setText(ui.freezeClock, freezeText);
    ui.freezeClock.classList.toggle("on", freezeText.length > 0);
    let shiftText = "";
    if (snap.timeshiftRemainingMs > 0) shiftText = snap.mode === "score" ? "TEMPO SURGE" : "TIME STOLEN";
    else if (snap.playerLockedRemainingMs > 0) shiftText = "LOCKED";
    setText(ui.shiftClock, shiftText);
    ui.shiftClock.classList.toggle("on", shiftText.length > 0);
    setWidth(ui.energyFill, `${snap.player.energy}%`);
    setText(ui.energyLabel, `${Math.round(snap.player.energy)} / ${ENERGY_MAX}`);
     const megaReady = snap.player.energy >= ENERGY_MEGA_STRIKE;
     if (megaReady && !lastMegaReady) {
       showCallout("MEGA STRIKE READY", "powerful", 960);
       restartAnim(ui.megaStrikeAttack, "ready-pulse");
     }
     lastMegaReady = megaReady;
    const burstThresholdReady = snap.player.energy >= ENERGY_BURST;
    if (burstThresholdReady && !lastBurstReady) {
      restartAnim(ui.energyBurstAttack, "ready-pulse");
    }
    lastBurstReady = burstThresholdReady;
    const rewindThresholdReady = snap.player.energy >= ENERGY_REWIND;
    if (rewindThresholdReady && !lastRewindReady) {
      restartAnim(ui.rewind, "ready-pulse");
    }
    lastRewindReady = rewindThresholdReady;
    if (snap.player.energy > lastPlayerEnergy + 0.5) {
      if (energyWrap instanceof HTMLElement) restartAnim(energyWrap, "gain");
      restartAnim(ui.energyFill, "surge");
    } else if (snap.player.energy < lastPlayerEnergy - 0.5) {
      if (energyWrap instanceof HTMLElement) restartAnim(energyWrap, "spend");
    }
    lastPlayerEnergy = snap.player.energy;
    energyWrap?.classList.toggle("low", snap.player.energy < ENERGY_FREEZE);
    energyWrap?.classList.toggle("hot", snap.player.energy >= 70);
    if (ui.rewind) ui.rewind.disabled = !session.canUsePower("rewind", now);
    const burstReady = session.canUsePower("burst", now);
    const megaStrikeReady = session.canUsePower("megaStrike", now);
    if (ui.energyBurstAttack) {
      ui.energyBurstAttack.disabled = !burstReady;
      ui.energyBurstAttack.classList.toggle("ready", burstReady);
      ui.energyBurstAttack.classList.toggle("unavailable", !burstReady);
    }
    if (ui.megaStrikeAttack) {
      ui.megaStrikeAttack.disabled = !megaStrikeReady;
      ui.megaStrikeAttack.classList.toggle("ready", megaStrikeReady);
      ui.megaStrikeAttack.classList.toggle("unavailable", !megaStrikeReady);
      ui.megaStrikeAttack.classList.toggle("charged", megaReady);
    }
    const rewindReady = playing && snap.player.energy >= ENERGY_REWIND && !(ui.rewind?.disabled ?? true);
    ui.rewind?.classList.toggle("ready", rewindReady);
    ui.rewind?.classList.toggle("unavailable", !rewindReady);
     updateMatchObjective(snap);

    const comboAt = session.screen === "match" ? lastGameplayCalloutAt : announcer.lastComboAt;
    freshFx.length = 0;
    for (const fx of snap.fx) {
      if (fx.id <= seenFx) continue;
      seenFx = Math.max(seenFx, fx.id);
      freshFx.push(fx);
      const boardFeel = fx.side !== "opponent" && (fx.kind === "clear" || fx.kind === "combo");
      const feelDelay = boardFeel ? matchImpactDelayMs(reducedMotion()) : 0;
      playBattleCues(audio, fx, fx.combo || 1, feelDelay);
      const hapticCues = hapticCuesFromFx(fx).map((cue) =>
        feelDelay > 0 && !cue.delayMs ? { ...cue, delayMs: feelDelay } : cue,
      );
      haptics.dispatch(hapticCues, now);
      if (fx.kind === "countdown") {
        if (fx.text === "CLASH!") {
          audio.playMatchStart(String(fx.id));
          flashCast("clash-in");
        } else audio.play("countdown");
      }
      if (fx.kind === "clear" && fx.side !== "opponent") {
        // Pulse the arena on the break, not on the swipe.
        if (feelDelay > 0) window.setTimeout(() => flashImpact(), feelDelay);
        else flashImpact();
      }
      if (fx.kind === "combo" && (fx.combo ?? 0) >= 2 && fx.side !== "opponent") {
        flashCombo(fx.combo ?? 1);
      }
      const rivalAction = fx.text.toUpperCase().startsWith("RIVAL");
      if (
        (fx.side === "opponent" || rivalAction) &&
        (fx.kind === "clear" || fx.kind === "combo" || fx.kind === "power" || fx.kind === "attack")
      ) {
        restartAnim(ui.oppCard, "cpu-action");
         lastRivalActionAt = now;
      }
      if (fx.kind === "power") {
        const t = fx.text.toUpperCase();
        if (t.includes("FREEZE")) flashCast("cast-freeze");
        else if (t.includes("TIME") || t.includes("TEMPO") || t.includes("SHIFT")) {
          flashCast("cast-shift");
        }
        else if (t.includes("ENERGY BURST")) flashCast("cast-burst", t.startsWith("RIVAL") ? undefined : ui.energyBurstAttack ?? undefined);
        else if (t.includes("MEGA STRIKE")) flashCast("cast-mega", t.startsWith("RIVAL") ? undefined : ui.megaStrikeAttack ?? undefined);
      }
      if (fx.kind === "rewind") flashCast("cast-rewind", ui.rewind ?? undefined);
      if (fx.kind === "combo" || fx.kind === "power" || fx.kind === "rewind" || fx.kind === "attack" || fx.kind === "finale" || fx.kind === "urgent") {
        if (fx.side !== "opponent" || fx.kind === "attack" || fx.kind === "power" || fx.kind === "urgent") {
          logBattle(fx.text);
        }
      }
    }
    const gameplayCallouts = cuesFromFxBatch(freshFx, now, comboAt);
    if (session.screen === "match") {
      for (const cue of gameplayCallouts) {
        displayCallout(cue.id);
        if (cue.id === "combo") lastGameplayCalloutAt = now;
      }
     if (snap.last5) {
       const finalSecond = Math.max(1, Math.min(5, Math.ceil(snap.remainingMs / 1000)));
       if (finalSecond !== lastFinalSecond) {
         lastFinalSecond = finalSecond;
         showCallout(String(finalSecond), "urgent", 260);
         restartAnim(ui.timerBtn, "final-tick");
       }
     } else {
       lastFinalSecond = 0;
     }
    } else {
      for (const cue of gameplayCallouts) announcer.schedule(cue.id, cue.delayMs, now);
    }

    let burst: (typeof snap.fx)[number] | undefined;
    for (let i = snap.fx.length - 1; i >= 0; i--) {
      const f = snap.fx[i];
      if (f && f.kind === "combo" && f.side !== "opponent") {
        burst = f;
        break;
      }
    }
    const comboFeelAt = burst ? burst.born + matchImpactDelayMs(reducedMotion()) : 0;
    if (burst && now >= comboFeelAt && now - burst.born < 880 + matchImpactDelayMs(reducedMotion()) && settings.showComboEffects && settings.effects !== "low") {
      const intensity = comboBurstClass(burst.combo ?? 1);
      ui.comboBurst.textContent = comboBurstText(burst.combo ?? 1);
      ui.comboBurst.className = `combo-burst pop ${intensity}`;
    } else if (!ui.comboBurst.classList.contains("hidden")) {
      ui.comboBurst.classList.add("hidden");
    }
    const sheetOpen = !ui.sheet.classList.contains("hidden");
    const overlayText = snap.phase === "countdown"
      ? (Math.ceil(snap.countdownMs / 1000) > 0 ? String(Math.ceil(snap.countdownMs / 1000)) : "CLASH!")
      : snap.phase === "paused" && !sheetOpen
        ? "PAUSED"
        : snap.phase === "ended" && snap.screen === "match" && snap.result
          ? resultHeadline(snap.result.outcome)
          : "";
    if (overlayText !== lastOverlay) {
      ui.overlay.classList.remove("countdown", "paused", "finale", "win", "loss", "draw");
      if (!overlayText) {
        ui.overlay.classList.add("hidden");
      } else {
        ui.overlay.classList.remove("hidden");
        if (snap.phase === "countdown") ui.overlay.classList.add("countdown");
        else if (snap.phase === "paused") ui.overlay.classList.add("paused");
        else if (snap.phase === "ended") {
          ui.overlay.classList.add("finale");
          if (overlayText === "VICTORY") ui.overlay.classList.add("win");
          else if (overlayText === "DEFEATED") ui.overlay.classList.add("loss");
          else ui.overlay.classList.add("draw");
        }
        ui.overlayText.textContent = overlayText;
        pop(ui.overlayText);
      }
      lastOverlay = overlayText;
    }

    const fade = snap.screen === "results" ? Math.max(0, 1 - (now - resultAt) / RESULTS_BOARD_FADE_MS) : 1;
    refreshLayout();
    renderer.draw(snap, layout.player, layout.opp, now, fade);
    if (renderer.takeLandingImpacts() > 0) {
      haptics.defer("swap", 1, now);
    }
    drawStageBackdrop(ctx!, layout.canvas, layout.player);
    boardsDrawn = true;
  } else if (boardsDrawn && !showBoards) {
    renderer.clear();
    shownPlayer = 0;
    shownOpp = 0;
    revealPlayerScore = 0;
    pendingPlayerScoreAt = 0;
    lastPlayerScore = 0;
    boardsDrawn = false;
  }

  const result = session.result;
  if ((screen === "results" || screen === "rewards") && result) {
    const r = result;
    const lives = session.dailyLives();
    const key = `${r.outcome}|${r.playerScore}|${r.opponentScore}|${r.playerBestCombo}|${r.mode}|${r.grant?.xp ?? 0}|${lives}|${r.coinRoom?.matchId ?? ""}|${r.coinRoom?.payout ?? ""}`;
    if (key !== lastResultKey) {
      lastResultKey = key;
      ui.results.classList.remove("win", "loss", "tie");
      ui.results.classList.add(r.outcome);
      ui.results.classList.toggle("coin-result", Boolean(r.coinRoom));
      ui.resultTitle.textContent = r.coinRoom
        ? r.outcome === "win"
          ? "VICTORY"
          : r.outcome === "loss"
            ? "DEFEAT"
            : "DRAW"
        : resultHeadline(r.outcome);
      ui.resultXp.textContent = r.inspection
        ? "DEV INSPECTION · NO XP OR COINS"
        : r.grant
          ? `+${r.grant.xp} XP${r.grant.coins ? ` · +${r.grant.coins} COINS` : ""}`
          : "";
      ui.resultLives.textContent = r.inspection
        ? `${lives}/${DAILY_LIVES_MAX} LIVES · UNCHANGED`
        : lives <= 0
          ? `0/${DAILY_LIVES_MAX} LIVES · WATCH AN AD OR WAIT FOR UTC RESET`
          : `${lives}/${DAILY_LIVES_MAX} LIVES`;
      ui.retryMatch.textContent = lives <= 0 && !session.canEnterLocalBattle() ? "MODES" : "RETRY";
      ui.retryMatch.className = r.outcome === "loss" ? "primary play-cta" : "ghost game-ctl";
      ui.toRewards.className = r.outcome === "win" ? "primary play-cta" : "ghost game-ctl";
      ui.resPlayer.textContent = String(r.playerScore);
      ui.resOpp.textContent = String(r.opponentScore);
      ui.resCombo.textContent = `x${r.playerBestCombo}`;
      ui.resMode.textContent = r.mode === "score" ? "SCORE BATTLE" : "TIME BATTLE";
      const coin = r.coinRoom;
      ui.resultCoins.classList.toggle("hidden", !coin);
      ui.resultStandardActions.classList.toggle("hidden", Boolean(coin));
      ui.resultCoinActions.classList.toggle("hidden", !coin);
      if (coin) {
        ui.resultPlayAgain.className = r.outcome === "loss" ? "primary play-cta" : "ghost game-ctl";
        ui.resultBackRooms.className = r.outcome === "win" ? "primary play-cta" : "ghost game-ctl";
        ui.resultCoins.innerHTML = coinResultViewHtml(coin, session.progress.winningCoins);
      } else {
        ui.resultCoins.innerHTML = "";
      }
    }
  } else if (screen !== "results" && screen !== "rewards") {
    lastResultKey = "";
  }

  announcer.tick(now);
  if (!document.hidden) armFrame();
}

let raf = 0;
function armFrame(): void {
  if (raf) return;
  raf = requestAnimationFrame((t) => {
    raf = 0;
    try {
      frame(t);
    } catch (error) {
      // A visual/audio effect must never kill the main game loop. If a non-core
      // browser API throws, keep the simulation ticking and surface the error.
      console.error("Chrono Clash frame error", error);
      if (!document.hidden) armFrame();
    }
  });
}

armFrame();

if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  const chrono = {
    session,
    renderer,
    audio() {
      return audio.status();
    },
    scene() {
      return {
        screen: session.screen,
        splashActive: ui.splash.classList.contains("active"),
        menuActive: ui.menu.classList.contains("active"),
        musicNodeCount: audio.musicNodeCount,
        lastVoice: announcer.lastLine,
        voiceCurrent: announcer.current,
        devBattle: isDevBattleBypassEnabled(),
        inspectionMatch: session.inspectionMatch,
        lives: session.dailyLives(),
        ...audio.status(),
      };
    },
    audioReady() {
      return audio.whenReady().then(() => audio.status());
    },
    paint() {
      paintDailyRun();
      paintArmory();
      paintReady();
      paintRooms();
    },
    renderState() {
      return renderer.inspectPlayer();
    },
    flashSwap(a: Coord, b: Coord) {
      renderer.flashSwap(a, b, performance.now());
    },
    speak(id: "locked" | "combo" | "ultimate") {
      return announcer.submit(id, performance.now());
    },
    playCue(cue: Parameters<AudioBus["play"]>[0], combo = 1) {
      audio.play(cue, combo);
    },
    play(want: "win" | "loss") {
      return new Promise<{ outcome: string; lives: number; coins: number }>((resolve, reject) => {
        const started = performance.now();
        const timer = window.setInterval(() => {
          const now = performance.now();
          if (now - started > 130_000) {
            window.clearInterval(timer);
            reject(new Error("match timeout"));
            return;
          }
          session.tick(now);
          if (session.screen === "ready") session.confirmReady(now);
          if (want === "win" && session.screen === "match" && session.phase === "playing") {
            const hint = session.hintCells(now);
            const a = hint[0];
            const b = hint[1];
            if (a && b) session.tryPlayerSwap(a, b, now);
          }
          if (session.screen === "results" && session.result) {
            window.clearInterval(timer);
            chrono.paint();
            resolve({
              outcome: session.result.outcome,
              lives: session.dailyLives(),
              coins: session.progress.winningCoins,
            });
          }
        }, 90);
      });
    },
  };
  Object.defineProperty(globalThis, "__chrono", { value: chrono, configurable: true });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.suspend();
    haptics.cancel();
    return;
  }
  audio.resume();
  layout.dirty = true;
  armFrame();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  audio.resume();
  audio.warm();
  layout.dirty = true;
  armFrame();
});
window.addEventListener("pagehide", (event) => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (event.persisted) audio.suspend();
  else audio.dispose();
  haptics.cancel();
});
