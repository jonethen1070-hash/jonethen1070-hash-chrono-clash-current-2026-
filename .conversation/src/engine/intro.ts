export const STUDIO_MS = 1800;
export const TITLE_MS = 2200;
export const INTRO_TOTAL_MS = STUDIO_MS + TITLE_MS;

export type IntroBeat = "studio" | "title" | "done";

export function introBeat(elapsedMs: number): IntroBeat {
  if (elapsedMs < STUDIO_MS) return "studio";
  if (elapsedMs < INTRO_TOTAL_MS) return "title";
  return "done";
}

export function shouldPlayIntro(introSeen: boolean): boolean {
  return !introSeen;
}

export function canSkipIntro(introSeen: boolean): boolean {
  return introSeen;
}
