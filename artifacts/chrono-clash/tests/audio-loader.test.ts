import { afterEach, describe, expect, it } from "vitest";
import { AudioBus } from "../src/audio/bus";
import { candidateUrls, fetchAudioBuffer } from "../src/audio/resolve";
import { MUSIC_FILES, uniqueAudioAssets } from "../src/audio/catalog";

describe("audio file resolver", () => {
  it("tries mp3 then wav then ogg so iPhone Safari gets a decodable master first", () => {
    expect(candidateUrls("music-lobby.wav")).toEqual([
      "/audio/music-lobby.mp3",
      "/audio/music-lobby.wav",
      "/audio/music-lobby.ogg",
    ]);
    expect(candidateUrls("sfx-freeze.wav")[0]).toBe("/audio/sfx-freeze.mp3");
    expect(candidateUrls("Arena_Pulse.m4a")).toEqual([
      "/audio/Arena_Pulse.m4a",
      "/audio/Arena_Pulse.mp3",
      "/audio/Arena_Pulse.wav",
      "/audio/Arena_Pulse.ogg",
    ]);
  });

  it("marks committed files as stand-ins that the loader can replace", () => {
    expect(MUSIC_FILES.lobby.standIn).toBe(true);
    expect(MUSIC_FILES.battle.loop).toBe(true);
    expect(MUSIC_FILES.victory.loop).toBe(false);
    expect(uniqueAudioAssets().some((item) => item.id === "music-lobby")).toBe(true);
  });

  it("ignores Vite HTML fallbacks for missing ogg files and uses the wav stand-in", async () => {
    const html = new TextEncoder().encode("<!doctype html><html><body>app</body></html>");
    const wav = new Uint8Array(128);
    wav.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    const found = await fetchAudioBuffer(["/audio/music-lobby.ogg", "/audio/music-lobby.wav"], (async (input) => {
      const url = String(input);
      if (url.endsWith(".ogg")) {
        return {
          ok: true,
          headers: { get: () => "text/html" },
          arrayBuffer: async () => html.buffer,
        } as Response;
      }
      return {
        ok: true,
        headers: { get: () => "audio/wav" },
        arrayBuffer: async () => wav.buffer,
      } as Response;
    }) as typeof fetch);
    expect(found?.url).toBe("/audio/music-lobby.wav");
  });
});

describe("AudioBus file loader", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "fetch");
    Reflect.deleteProperty(globalThis, "AudioContext");
  });

  it("decodes the first available format and promotes the current bed to a file source", async () => {
    const requested: string[] = [];
    (globalThis as { fetch?: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      const headers = {
        get(name: string) {
          if (name.toLowerCase() !== "content-type") return null;
          if (url.endsWith(".ogg")) return "audio/ogg";
          if (url.endsWith(".mp3")) return "audio/mpeg";
          return "audio/wav";
        },
      };
      const body = new Uint8Array(128);
      if (url.endsWith(".mp3") && url.includes("music-lobby")) {
        body.set([0x49, 0x44, 0x33]);
        return { ok: true, headers, arrayBuffer: async () => body.buffer } as Response;
      }
      if (url.endsWith(".wav")) {
        body.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
        return { ok: true, headers, arrayBuffer: async () => body.buffer } as Response;
      }
      return { ok: false, headers, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
    }) as typeof fetch;

    let sources = 0;
    class FakeParam {
      value = 0;
      setValueAtTime(v: number) {
        this.value = v;
        return this;
      }
      cancelScheduledValues() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class FakeNode {
      connect() {
        return this;
      }
      disconnect() {}
    }
    class FakeOsc extends FakeNode {
      type = "sine";
      frequency = new FakeParam();
      detune = new FakeParam();
      start() {}
      stop() {}
    }
    class FakeGain extends FakeNode {
      gain = new FakeParam();
    }
    class FakeFilter extends FakeNode {
      type = "lowpass";
      frequency = new FakeParam();
    }
    class FakeSource extends FakeNode {
      buffer: AudioBuffer | null = null;
      loop = false;
      loopStart = 0;
      loopEnd = 0;
      playbackRate = { value: 1 };
      onended: (() => void) | null = null;
      start() {
        sources += 1;
      }
      stop() {}
    }
    class FakeCtx {
      currentTime = 0;
      sampleRate = 22050;
      state = "running";
      destination = new FakeNode();
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createOscillator() {
        return new FakeOsc();
      }
      createGain() {
        return new FakeGain();
      }
      createBiquadFilter() {
        return new FakeFilter();
      }
      createBufferSource() {
        return new FakeSource();
      }
      decodeAudioData() {
        return Promise.resolve({
          duration: 16,
          sampleRate: 22050,
          numberOfChannels: 2,
          length: 16,
          getChannelData() {
            return new Float32Array(16);
          },
        } as AudioBuffer);
      }
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeCtx;

    const bus = new AudioBus();
    bus.configure(true, true, "high");
    bus.syncBed("lobby");
    bus.warm();
    await bus.whenReady();
    const status = bus.status();
    expect(status.catalogReady).toBe(true);
    expect(status.unlocked).toBe(true);
    expect(status.loaded).toContain("music-lobby");
    expect(status.sources["music-lobby"]).toBe("/audio/music-lobby.mp3");
    expect(status.musicBed).toBe("lobby");
    expect(status.musicPlayback).toBe("file");
    expect(sources).toBeGreaterThan(0);
    expect(requested[0]).toContain(".mp3");
    bus.dispose();
  });
});
