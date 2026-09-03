import { AudioBus } from "./bus";

/** Unlock the audio graph. `startBed` starts the current scene bed; keep false on the Olivia Nova splash. */
export function unlockGameAudio(bus: AudioBus, musicOn: boolean, startBed = true): void {
  bus.warm();
  bus.ensure();
  bus.resume();
  if (musicOn && startBed) bus.startMusic();
}
