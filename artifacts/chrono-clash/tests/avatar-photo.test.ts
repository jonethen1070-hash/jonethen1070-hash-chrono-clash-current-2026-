import { afterEach, describe, expect, it } from "vitest";
import {
  AVATAR_PHOTO_KEY,
  clampCrop,
  clearAvatarPhoto,
  coverScale,
  hasAvatarPhoto,
  isAvatarPhotoDataUrl,
  loadAvatarPhoto,
  panToImagePoint,
  saveAvatarPhoto,
} from "../src/engine/avatarPhoto";
import { GameSession } from "../src/engine/session";
import { saveProgress } from "../src/engine/progress";
import { EMPTY_PROGRESS } from "../src/engine/types";
import { cosmeticsOf } from "../src/engine/catalog";
import { equippedAvatarName, profileView } from "../src/ui/metaViews";
import { isCustomAvatarEquipped } from "../src/ui/avatarFace";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function memoryStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  return ls;
}

afterEach(() => {
  clearAvatarPhoto();
});

describe("avatar photo storage stays local", () => {
  it("accepts a local data URL and rejects anything else", () => {
    memoryStorage();
    expect(isAvatarPhotoDataUrl(PIXEL)).toBe(true);
    expect(isAvatarPhotoDataUrl("https://example.com/a.jpg")).toBe(false);
    expect(saveAvatarPhoto(PIXEL)).toBe(true);
    expect(loadAvatarPhoto()).toBe(PIXEL);
    expect(hasAvatarPhoto()).toBe(true);
    clearAvatarPhoto();
    expect(loadAvatarPhoto()).toBeNull();
    expect(globalThis.localStorage.getItem(AVATAR_PHOTO_KEY)).toBeNull();
  });
});

describe("avatar crop math", () => {
  it("covers the crop window and clamps pan so the frame stays filled", () => {
    const min = coverScale(800, 400, 200);
    expect(min).toBe(0.5);
    const loose = clampCrop({ scale: 0.1, x: 999, y: -999 }, 800, 400, 200);
    expect(loose.scale).toBe(min);
    expect(Math.abs(loose.x)).toBeLessThanOrEqual((800 * min - 200) / 2 + 1e-6);
    expect(Math.abs(loose.y)).toBeLessThanOrEqual((400 * min - 200) / 2 + 1e-6);
    const face = panToImagePoint(800, 400, 200, min, 100, 50);
    expect(face.scale).toBe(min);
  });
});

describe("custom avatar session", () => {
  it("equips a local photo, persists it, and returns to the last preset", () => {
    memoryStorage();
    const game = new GameSession();
    game.progress = {
      ...EMPTY_PROGRESS,
      tutorialDone: true,
      unlocked: [...EMPTY_PROGRESS.unlocked],
      powersUsed: { freeze: 0, timeshift: 0, rewind: 0 },
    };
    game.setAvatar(1);
    expect(game.progress.avatar).toBe(1);
    expect(game.saveCustomAvatarPhoto(PIXEL)).toBe(true);
    expect(game.progress.customAvatar).toBe(true);
    expect(game.progress.avatar).toBe(1);
    expect(isCustomAvatarEquipped(game.progress)).toBe(true);
    expect(equippedAvatarName(game.progress)).toBe("Custom");
    saveProgress(game.progress);
    const loaded = new GameSession();
    expect(loaded.progress.customAvatar).toBe(true);
    expect(loadAvatarPhoto()).toBe(PIXEL);

    loaded.setAvatar(2);
    expect(loaded.progress.customAvatar).toBe(false);
    expect(loaded.progress.avatar).toBe(2);
    expect(isCustomAvatarEquipped(loaded.progress)).toBe(false);
    expect(equippedAvatarName(loaded.progress)).toBe("Aether");
    expect(hasAvatarPhoto()).toBe(true);

    loaded.equipCustomAvatar();
    expect(loaded.progress.customAvatar).toBe(true);
    loaded.removeCustomAvatar();
    expect(loaded.progress.customAvatar).toBe(false);
    expect(loaded.progress.avatar).toBe(2);
    expect(hasAvatarPhoto()).toBe(false);
  });

  it("keeps the six preset avatars and shows an Add Photo option", () => {
    memoryStorage();
    expect(cosmeticsOf("avatar").map((item) => item.name)).toEqual(["Pulse", "Ion", "Aether", "Ember", "Nova", "Solar"]);
    const view = profileView({ ...EMPTY_PROGRESS, unlocked: [...EMPTY_PROGRESS.unlocked] });
    expect(view.avatars).toContain("Pulse");
    expect(view.avatars).toContain("ADD PHOTO");
    expect(view.avatars).toContain("data-photo");
    expect(view.selectedName).toBe("Pulse");
  });

  it("does not treat a locked preset as selectable", () => {
    memoryStorage();
    const game = new GameSession();
    game.setAvatar(5);
    expect(game.progress.avatar).toBe(0);
    expect(game.progress.customAvatar).toBe(false);
  });
});
