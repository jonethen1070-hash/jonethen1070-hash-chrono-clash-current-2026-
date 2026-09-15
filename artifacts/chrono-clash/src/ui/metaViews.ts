import { cosmeticsOf, isOwned } from "../engine/catalog";
import { hasAvatarPhoto, loadAvatarPhoto } from "../engine/avatarPhoto";
import { avatarFaceHtml, isCustomAvatarEquipped } from "./avatarFace";
import { ACHIEVEMENTS, favoritePower, winRate, xpToNext } from "../engine/progress";
import {
  WINNING_COINS_DAILY_WIN,
  WINNING_COINS_WEEKLY_BONUS,
  WINNING_COINS_WEEKLY_WINS,
  economyFromProgress,
  getCharge,
  utcDayKey,
  utcWeekKey,
} from "../engine/economy";
import { POWER_CHARGE_COIN_COST, PowerDefinition, storefrontPowers } from "../engine/powers";
import { GameMode, LocalProgress } from "../engine/types";
import {
  canAffordCoinRoom,
  coinRooms,
  type CoinRoomEnterResult,
} from "../engine/rooms";
import { DAILY_LIFE_ADS_MAX, DAILY_LIVES_MAX, dailyRunFromProgress } from "../engine/dailyRun";
import { isDevBattleBypassEnabled } from "../engine/devBattleBypass";

export function renderMenuPilot(el: HTMLElement, p: LocalProgress): void {
  const need = xpToNext(p.level);
  const pct = Math.min(100, (p.xp / Math.max(1, need)) * 100);
  el.innerHTML = `<div class="pilot-mark">${avatarFaceHtml(p)}</div><div class="pilot-copy"><b>${p.name}</b><small>LV ${p.level} · ${p.title} · ${p.plays} MATCHES</small><div class="xp lobby-xp"><span style="width:${pct}%"></span></div></div>`;
}

export function equippedAvatarName(p: LocalProgress): string {
  if (isCustomAvatarEquipped(p)) return "Custom";
  return cosmeticsOf("avatar").find((a) => a.index === p.avatar)?.name ?? "Pulse";
}

function customAvatarPickHtml(p: LocalProgress): string {
  const has = hasAvatarPhoto();
  const on = isCustomAvatarEquipped(p);
  const face = has
    ? `<span class="avatar ${p.frame} custom-photo"><img alt="" src="${loadAvatarPhoto() ?? ""}"></span>`
    : `<span class="avatar ${p.frame} custom-photo add-photo" aria-hidden="true"><i></i></span>`;
  return `<button type="button" class="avatar-pick photo-pick ${on ? "on" : ""}" data-photo="${has ? "custom" : "add"}" aria-label="${has ? "Custom photo" : "Add photo"}" aria-pressed="${on ? "true" : "false"}">${face}<small>${has ? "CUSTOM" : "ADD PHOTO"}</small></button>`;
}

export function profileView(p: LocalProgress): {
  stats: string;
  xpWidth: string;
  xpLabel: string;
  avatars: string;
  preview: string;
  achievements: string;
  selectedName: string;
} {
  const rate = winRate(p);
  const need = xpToNext(p.level);
  const selectedName = equippedAvatarName(p);
  return {
    stats: `
    <div class="stat"><span>Level</span><b>${p.level}</b></div>
    <div class="stat"><span>XP</span><b>${p.xp}/${need}</b></div>
    <div class="stat"><span>Wins</span><b>${p.wins}</b></div>
    <div class="stat"><span>Losses</span><b>${p.losses}</b></div>
    <div class="stat"><span>Games played</span><b>${p.plays}</b></div>
    <div class="stat"><span>Win streak</span><b>${p.winStreak}</b></div>
    <div class="stat"><span>Best score</span><b>${p.bestScore}</b></div>
    <div class="stat"><span>Best combo</span><b>x${p.bestCombo}</b></div>
    <div class="stat"><span>Win rate</span><b>${rate}%</b></div>
    <div class="stat"><span>Winning Coins</span><b>${p.winningCoins ?? 0}</b></div>
    <div class="stat"><span>Favorite power</span><b>${favoritePower(p).toUpperCase()}</b></div>`,
    xpWidth: `${Math.min(100, (p.xp / need) * 100)}%`,
    xpLabel: `${p.xp} / ${need} XP · best streak ${p.bestStreak}`,
    selectedName,
    avatars:
      cosmeticsOf("avatar")
        .map((a) => {
          const owned = isOwned(p, a.id);
          const on = !isCustomAvatarEquipped(p) && p.avatar === (a.index ?? 0);
          return `<button type="button" class="avatar-pick ${on ? "on" : ""} ${owned ? "" : "lock"}" data-a="${a.index}" aria-label="${a.name}" aria-pressed="${on ? "true" : "false"}" ${owned ? "" : "disabled"}><span class="avatar a${a.index} ${p.frame}">${a.glyph}</span><small>${a.name}</small></button>`;
        })
        .join("") + customAvatarPickHtml(p),
    preview: avatarFaceHtml(p),
    achievements: ACHIEVEMENTS.map((a) => {
      const on = p.unlocked.includes(a.id);
      return `<div class="achieve ${on ? "on" : ""}"><b>${a.name}</b><span>${a.detail} · ${a.xp} XP</span></div>`;
    }).join(""),
  };
}

export function chatHtml(lines: string[]): string {
  if (!lines.length) return `<p class="empty-note">BATTLE EVENTS WILL APPEAR HERE</p>`;
  return lines.map((line) => `<div class="log-line">${line}</div>`).join("");
}

export function leaderboardHtml(p: LocalProgress): string {
  const recents = p.recentMatches || [];
  const records = `
    <div class="lb-row"><span>BEST SCORE</span><b>${p.bestScore.toLocaleString()}</b></div>
    <div class="lb-row"><span>BEST COMBO</span><b>x${p.bestCombo}</b></div>
    <div class="lb-row"><span>WINS</span><b>${p.wins}</b></div>
    <div class="lb-row"><span>STREAK</span><b>${p.bestStreak}</b></div>`;
  if (!recents.length) return `${records}<p class="empty-note">NO MATCHES RECORDED YET</p>`;
  return (
    records +
    recents
      .map((m) => {
        const label = m.outcome === "win" ? "WIN" : m.outcome === "loss" ? "LOSS" : "DRAW";
        const mode = m.mode === "score" ? "SCORE" : "TIME";
        return `<div class="lb-row"><span>${label} · ${mode} · x${m.combo}</span><b>${m.score} – ${m.rivalScore}</b></div>`;
      })
      .join("")
  );
}

export function missionsHtml(p: LocalProgress): string {
  return ACHIEVEMENTS.map((a) => {
    const on = p.unlocked.includes(a.id);
    return `<div class="mission ${on ? "on" : ""}"><b>${a.name}</b><span>${on ? "COMPLETE" : a.detail} · ${a.xp} XP</span></div>`;
  }).join("");
}

export function trophiesHtml(p: LocalProgress): string {
  return ACHIEVEMENTS.map((a) => {
    const on = p.unlocked.includes(a.id);
    return `<article class="trophy-card ${on ? "on" : "lock"}" data-id="${a.id}">
      <span class="trophy-mark" aria-hidden="true"></span>
      <span class="trophy-copy">
        <b>${a.name}</b>
        <span class="trophy-req">${a.detail}</span>
        <span class="trophy-status">${on ? "UNLOCKED" : "LOCKED"}</span>
      </span>
    </article>`;
  }).join("");
}

export function powerArmoryHtml(p: LocalProgress, adsAvailable: boolean): string {
  const econ = economyFromProgress(p);
  const cards = storefrontPowers()
    .map((power) => armoryCard(power, econ.winningCoins, getCharge(econ, power.id), adsAvailable))
    .join("");
  const day = utcDayKey();
  const week = utcWeekKey();
  const dailyClaimed = p.coinDailyDay === day;
  const weeklyWins = p.coinWeeklyWeek === week ? p.coinWeeklyWins : 0;
  const weeklyClaimed = weeklyWins >= WINNING_COINS_WEEKLY_WINS;
  return `<div class="armory">
    <div class="armory-head"><small>CHRONO POWERS</small><b>WINNING COINS ${econ.winningCoins}</b></div>
    <p class="armory-note">${POWER_CHARGE_COIN_COST} coins = 1 charge. Coins are rare. Ads grant +1 charge, not coins.</p>
    <div class="armory-objectives">
      <span>DAILY WIN ${dailyClaimed ? "CLAIMED" : `+${WINNING_COINS_DAILY_WIN}`}</span>
      <span>WEEKLY ${weeklyWins}/${WINNING_COINS_WEEKLY_WINS} WINS ${weeklyClaimed ? "CLAIMED" : `+${WINNING_COINS_WEEKLY_BONUS}`}</span>
    </div>
    ${cards}
  </div>`;
}

export function dailyRunHtml(p: LocalProgress, adsAvailable: boolean): string {
  const run = dailyRunFromProgress(p);
  const lives = run.lives;
  const hearts = Array.from({ length: DAILY_LIVES_MAX }, (_, i) => `<i class="life ${i < lives ? "on" : ""}"></i>`).join("");
  const empty = lives <= 0;
  const adCap = run.adsUsed >= DAILY_LIFE_ADS_MAX;
  const adOff = !empty || !adsAvailable || adCap;
  const adWhy = adCap ? "AD CAP TODAY" : !adsAvailable ? "AD UNAVAILABLE" : "WATCH AD +1 LIFE";
  return `<div class="daily-run ${empty ? "empty" : ""}">
    <div class="daily-run-head"><small>DAILY WIN RUN</small><b>${lives}/${DAILY_LIVES_MAX} LIVES</b></div>
    <div class="daily-run-hearts" aria-label="${lives} of ${DAILY_LIVES_MAX} lives">${hearts}</div>
    <p class="daily-run-note">Wins keep the run going. A loss spends 1 life. Lives reset at 00:00 UTC.</p>
    ${
      empty
        ? `<p class="daily-run-wait">No lives left. Watch a rewarded ad for +1 life, or wait until the next UTC day.</p>
    <button type="button" class="ghost daily-life-ad" data-life-ad="1" ${adOff ? "disabled" : ""}>${adWhy}</button>${
        isDevBattleBypassEnabled()
          ? `<p class="daily-run-dev">DEV TEST · TAP TIME BATTLE OR SCORE BATTLE. Lives stay 0/3. Ads and coins are unchanged.</p>`
          : ""
      }`
        : ""
    }
  </div>`;
}

function coinsLabel(value: number): string {
  return `${Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("en-US")} 🪙`;
}

export function roomsViewHtml(
  p: LocalProgress,
  selectedId: string,
  battleMode: GameMode,
  canEnterBattle: boolean,
  lastEnter: CoinRoomEnterResult | null = null,
): string {
  const have = Math.max(0, Math.trunc(Number(p.winningCoins) || 0));
  const rooms = coinRooms();
  const cards = rooms
    .map((room, index) => {
      const afford = canAffordCoinRoom(have, room);
      const canPlay = afford && canEnterBattle;
      const selected = room.id === selectedId;
      const gate = String(index + 1).padStart(2, "0");
      const access = !canEnterBattle
        ? "NO LIVES LEFT"
        : afford
          ? "ENTRY OPEN"
          : `NEED ${coinsLabel(Math.max(0, room.entryCoins - have))}`;
      const enterLabel = canPlay ? `Enter ${room.name}` : `${room.name} locked`;
      return `<article class="room-card room-${room.id}${selected ? " on" : ""}${afford ? " open" : " locked"}" data-room="${room.id}" aria-selected="${selected ? "true" : "false"}">
      <div class="room-card-copy">
        <small>GATE ${gate}</small>
        <b>${room.name.toUpperCase()} — ${coinsLabel(room.entryCoins)}</b>
        <span class="room-balance">YOUR BALANCE ${coinsLabel(have)}</span>
        <span class="room-access ${canPlay ? "ready" : "need"}">${access}</span>
      </div>
      <button type="button" class="${canPlay ? "primary" : "ghost"} room-enter" data-enter="${room.id}" ${canPlay ? "" : "disabled"} aria-label="${enterLabel}">${canPlay ? "ENTER" : "LOCKED"}</button>
    </article>`;
    })
    .join("");
  let status = "Select a room, then ENTER. Coins are taken when the match starts.";
  if (!canEnterBattle) status = "No lives left. Coin rooms stay closed until the daily run resets.";
  else if (lastEnter && !lastEnter.ok) {
    status =
      lastEnter.reason === "funds"
        ? `${lastEnter.room.name.toUpperCase()} needs ${coinsLabel(lastEnter.need)}. You have ${coinsLabel(lastEnter.have)}.`
        : "This room is unavailable right now.";
  }
  return `<div class="rooms-wallet" data-wallet="${have}">
    <small>WINNING COINS</small>
    <b>${coinsLabel(have)}</b>
  </div>
  <div class="chips rooms-modes" role="group" aria-label="Battle mode for coin rooms">
    <button type="button" class="chip ${battleMode === "time" ? "on" : ""}" data-rooms-mode="time">TIME BATTLE</button>
    <button type="button" class="chip ${battleMode === "score" ? "on" : ""}" data-rooms-mode="score">SCORE BATTLE</button>
  </div>
  <div class="room-list">${cards}</div>
  <p class="rooms-status muted">${status}</p>`;
}

export function readyPowerStripHtml(p: LocalProgress): string {
  const econ = economyFromProgress(p);
  const run = dailyRunFromProgress(p);
  return `<div class="ready-powers"><span class="ready-lives">${run.lives}/${DAILY_LIVES_MAX} LIVES${
    run.lives <= 0 && isDevBattleBypassEnabled() ? " · DEV" : ""
  }</span>${storefrontPowers()
    .map((power) => {
      const qty = getCharge(econ, power.id);
      return `<span class="ready-power"><i>${power.icon}</i> ${power.displayName} ${qty}/${power.maxCharges}</span>`;
    })
    .join("")}</div>`;
}

export function matchPowerQty(p: LocalProgress, id: string, fallback: string): string {
  const power = storefrontPowers().find((item) => item.id === id);
  if (!power) return fallback;
  return `${getCharge(economyFromProgress(p), id)}/${power.maxCharges}`;
}

function armoryCard(power: PowerDefinition, coins: number, qty: number, adsAvailable: boolean): string {
  const full = qty >= power.maxCharges;
  const afford = coins >= power.coinCost;
  const buyOff = full || !afford;
  const adOff = full || !adsAvailable || !power.rewardedAd;
  const buyWhy = full ? "FULL 5/5" : !afford ? "NEED COINS" : `BUY ${power.coinCost}`;
  const adWhy = full ? "FULL 5/5" : !adsAvailable || !power.rewardedAd ? "AD UNAVAILABLE" : "WATCH AD +1";
  return `<article class="armory-card ${full ? "full" : ""}">
    <span class="armory-icon" aria-hidden="true">${power.icon}</span>
    <div class="armory-copy">
      <b>${power.displayName}</b>
      <span class="armory-qty">${qty}/${power.maxCharges}</span>
    </div>
    <div class="armory-actions">
      <button type="button" class="ghost armory-buy" data-buy="${power.id}" ${buyOff ? "disabled" : ""}>${buyWhy}</button>
      <button type="button" class="ghost armory-ad" data-ad="${power.id}" ${adOff ? "disabled" : ""}>${adWhy}</button>
    </div>
  </article>`;
}
