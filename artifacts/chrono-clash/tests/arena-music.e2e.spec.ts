import { expect, test } from "@playwright/test";

type AudioProbe = {
  battleDecodedAt: number | null;
  oscillatorStarts: Array<{ frequency: number; type: string }>;
  sources: Array<{
    duration: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    startAt: number;
    stopAt: number | null;
    startCalls: number;
    stopCalls: number;
  }>;
};

type ChronoAudio = {
  audioReady: () => Promise<{
    musicBed: string;
    musicPlayback: string;
  }>;
  scene: () => {
    musicBed: string;
    musicPlayback: string;
    musicNodeCount: number;
  };
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "chrono-clash-settings-v2",
      JSON.stringify({
        sfx: false,
        music: true,
        sfxVolume: 0.84,
        musicVolume: 0.72,
        haptics: false,
        effects: "low",
        animation: "low",
        showComboEffects: false,
        scoreTarget: 3000,
        introSeen: true,
      }),
    );

    const probe: AudioProbe = {
      battleDecodedAt: null,
      oscillatorStarts: [],
      sources: [],
    };
    (window as Window & { __arenaAudioProbe?: AudioProbe }).__arenaAudioProbe =
      probe;

    const contextPrototype = AudioContext.prototype;
    const originalDecode = contextPrototype.decodeAudioData;
    contextPrototype.decodeAudioData = function (
      ...args: Parameters<AudioContext["decodeAudioData"]>
    ) {
      const result = originalDecode.apply(this, args);
      if (
        !result ||
        typeof (result as Promise<AudioBuffer>).then !== "function"
      )
        return result;
      return (result as Promise<AudioBuffer>).then((buffer) => {
        if (buffer.duration > 200) probe.battleDecodedAt = performance.now();
        return buffer;
      });
    } as AudioContext["decodeAudioData"];

    const originalCreateOscillator = contextPrototype.createOscillator;
    contextPrototype.createOscillator = function () {
      const oscillator = originalCreateOscillator.call(this);
      const originalStart = oscillator.start.bind(oscillator);
      oscillator.start = ((...args: any[]) => {
        probe.oscillatorStarts.push({
          frequency: oscillator.frequency.value,
          type: oscillator.type,
        });
        return originalStart(...args);
      }) as typeof oscillator.start;
      return oscillator;
    };

    const originalCreateBufferSource = contextPrototype.createBufferSource;
    contextPrototype.createBufferSource = function () {
      const source = originalCreateBufferSource.call(this);
      const record = {
        duration: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        startAt: 0,
        stopAt: null as number | null,
        startCalls: 0,
        stopCalls: 0,
      };
      probe.sources.push(record);

      const originalStart = source.start.bind(source);
      source.start = ((...args: any[]) => {
        record.duration = source.buffer?.duration ?? 0;
        record.loop = source.loop;
        record.loopStart = source.loopStart;
        record.loopEnd = source.loopEnd;
        record.startAt = performance.now();
        record.startCalls += 1;
        return originalStart(...args);
      }) as typeof source.start;

      const originalStop = source.stop.bind(source);
      source.stop = ((...args: any[]) => {
        record.stopAt = performance.now();
        record.stopCalls += 1;
        return originalStop(...args);
      }) as typeof source.stop;
      return source;
    };
  });
});


test("Arena waits for the uploaded file, loops it, and never duplicates it across lobby re-entry", async ({
  page,
}) => {
  const battleRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("Arena_Pulse_Replit"))
      battleRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.locator("#menu.active")).toBeVisible();

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();

  const firstAudio = await page.evaluate(async () => {
    const chrono = (window as Window & { __chrono?: ChronoAudio }).__chrono;
    if (!chrono) throw new Error("Missing Chrono browser probe");
    await chrono.audioReady();
    return chrono.scene();
  });

  expect(firstAudio.musicBed).toBe("battle");
  expect(firstAudio.musicPlayback).toBe("file");

  const firstProbe = await page.evaluate(() => {
    const probe = (window as Window & { __arenaAudioProbe?: AudioProbe })
      .__arenaAudioProbe;
    if (!probe) throw new Error("Missing audio instrumentation");
    return probe;
  });
  const firstBattleSources = firstProbe.sources.filter(
    (source) => source.duration > 200,
  );

  expect(battleRequests[0]).toContain("Arena_Pulse_Replit.m4a");
  expect(firstProbe.battleDecodedAt).not.toBeNull();
  expect(firstBattleSources).toHaveLength(1);
  expect(firstBattleSources[0]).toMatchObject({
    loop: true,
    loopStart: 0,
    startCalls: 1,
    stopCalls: 0,
  });
  expect(firstBattleSources[0]!.loopEnd).toBeGreaterThan(200);
  expect(firstBattleSources[0]!.startAt).toBeGreaterThanOrEqual(
    firstProbe.battleDecodedAt!,
  );
  const battleFallbackFrequencies = [1.12, 1.8, 73.42, 146.83, 196, 293.66];
  expect(
    firstProbe.oscillatorStarts.filter(({ frequency }) =>
      battleFallbackFrequencies.some(
        (expected) => Math.abs(frequency - expected) < 0.01,
      ),
    ),
  ).toHaveLength(0);

  await page.locator("#dockSettings").click();
  await expect(page.locator("#settingsScreen.active")).toBeVisible();
  await page.locator("#quitGame").click();
  await expect(page.locator("#menu.active")).toBeVisible();

  const afterLeaving = await page.evaluate(() => {
    const probe = (window as Window & { __arenaAudioProbe?: AudioProbe })
      .__arenaAudioProbe;
    if (!probe) throw new Error("Missing audio instrumentation");
    return probe.sources.filter((source) => source.duration > 200);
  });
  expect(afterLeaving).toHaveLength(1);
  expect(afterLeaving[0]!.stopCalls).toBe(1);

  await page.locator("#menuGuest").click();
  await expect(page.locator("#match.active")).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const probe = (window as Window & { __arenaAudioProbe?: AudioProbe })
          .__arenaAudioProbe;
        return (
          probe?.sources.filter(
            (source) => source.duration > 200 && source.startCalls > 0,
          ).length ?? 0
        );
      });
    })
    .toBe(2);

  const secondAudio = await page.evaluate(() => {
    const chrono = (window as Window & { __chrono?: ChronoAudio }).__chrono;
    if (!chrono) throw new Error("Missing Chrono browser probe");
    return chrono.scene();
  });
  const secondProbe = await page.evaluate(() => {
    const probe = (window as Window & { __arenaAudioProbe?: AudioProbe })
      .__arenaAudioProbe;
    if (!probe) throw new Error("Missing audio instrumentation");
    return probe;
  });
  const activeBattleSources = secondProbe.sources.filter(
    (source) => source.duration > 200 && source.stopCalls === 0,
  );

  expect(secondAudio.musicBed).toBe("battle");
  expect(secondAudio.musicPlayback).toBe("file");
  expect(secondAudio.musicNodeCount).toBe(1);
  expect(activeBattleSources).toHaveLength(1);
  expect(activeBattleSources[0]).toMatchObject({
    loop: true,
    loopStart: 0,
    startCalls: 1,
    stopCalls: 0,
  });
  expect(
    secondProbe.oscillatorStarts.filter(({ frequency }) =>
      battleFallbackFrequencies.some(
        (expected) => Math.abs(frequency - expected) < 0.01,
      ),
    ),
  ).toHaveLength(0);
});