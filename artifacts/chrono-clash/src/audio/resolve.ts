import { AUDIO_DIR } from "./catalog";

/** iPhone Safari cannot decode ogg; try mp3 first, then wav. */
export const PREFERRED_FORMATS = ["mp3", "wav", "ogg"] as const;

export function assetStem(file: string): string {
  return file.replace(/\.(wav|ogg|mp3|m4a)$/i, "");
}

export function candidateUrls(file: string, dir = AUDIO_DIR): string[] {
  const stem = assetStem(file);
  const formats = /\.m4a$/i.test(file) ? ["m4a", ...PREFERRED_FORMATS] : PREFERRED_FORMATS;
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const ext of formats) {
    const url = `${dir}/${stem}.${ext}`;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export async function fetchAudioBuffer(
  urls: string[],
  fetchImpl: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<{ url: string; data: ArrayBuffer } | null> {
  if (!fetchImpl) return null;
  for (const url of urls) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html") || type.includes("application/json") && !type.includes("audio")) continue;
      const data = await res.arrayBuffer();
      if (!looksLikeAudio(data, type)) continue;
      return { url, data };
    } catch {
      continue;
    }
  }
  return null;
}

function looksLikeAudio(data: ArrayBuffer, contentType: string): boolean {
  if (data.byteLength < 12) return false;
  const b = new Uint8Array(data);
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return true; // RIFF/WAVE
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return true; // OggS
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // ID3
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return true; // MPEG frame
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true; // ftyp
  return contentType.startsWith("audio/");
}

export async function decodeAudioBuffer(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  const copy = data.slice(0);
  const result = ctx.decodeAudioData(copy);
  if (result && typeof (result as Promise<AudioBuffer>).then === "function") {
    return result;
  }
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(data.slice(0), resolve, reject);
  });
}
