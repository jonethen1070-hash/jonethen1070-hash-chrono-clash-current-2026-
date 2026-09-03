import { AuthProvider } from "./types";

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function playerIdFor(provider: AuthProvider, subject: string): string {
  const a = fnv1a(`${provider}:${subject}`);
  const b = fnv1a(`${subject}|${provider}|chrono`);
  return `cc_${a}${b}`;
}

export function randomToken(bytes = 16): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buf);
    return [...buf].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return out;
}
