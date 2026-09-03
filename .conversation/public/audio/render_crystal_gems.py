#!/usr/bin/env python3
"""Premium Chrono Clash gem SFX — tempered crystal, not arcade beeps.

Player-board only. Short, dimensional glass/metal hits with round-robin variants.
Does not rewrite music beds or voice callouts.
"""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

SR = 48000
OUT = os.path.dirname(os.path.abspath(__file__))
PI2 = np.pi * 2.0

# Glass-plate inharmonic ratios (not a harmonic beep stack).
GLASS = (1.00, 1.47, 2.52, 2.76, 3.78, 5.12, 5.40)
METAL = (1.00, 2.76, 4.54, 6.15)


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def fade(x: np.ndarray, inn: float = 0.00005, out: float = 0.02) -> np.ndarray:
    n = x.shape[0]
    y = x.copy()
    ni = max(1, min(n // 16, int(max(inn, 1e-6) * SR)))
    no = max(2, min(n // 3, int(out * SR)))
    ramp_in = np.linspace(0.0, 1.0, ni)
    ramp_out = np.linspace(1.0, 0.0, no)
    if y.ndim == 2:
        y[:ni] *= ramp_in[:, None]
        y[-no:] *= ramp_out[:, None]
    else:
        y[:ni] *= ramp_in
        y[-no:] *= ramp_out
    return y


def fft_band(n: int, lo: float, hi: float, seed: int, slope: float = 0.0) -> np.ndarray:
    rng = np.random.RandomState(seed)
    spec = rng.randn(n // 2 + 1) + 1j * rng.randn(n // 2 + 1)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    mag = np.ones_like(freqs)
    mag[freqs < lo] = 0
    mag[freqs > hi] = 0
    edge = max(80.0, (hi - lo) * 0.08)
    lo_w = (freqs >= lo) & (freqs < lo + edge)
    hi_w = (freqs <= hi) & (freqs > hi - edge)
    mag[lo_w] *= np.clip((freqs[lo_w] - lo) / edge, 0, 1)
    mag[hi_w] *= np.clip((hi - freqs[hi_w]) / edge, 0, 1)
    if slope:
        mag *= (np.maximum(freqs, 80.0) / 1000.0) ** slope
    spec *= mag
    spec[0] = 0
    y = np.fft.irfft(spec, n)
    peak = float(np.max(np.abs(y))) + 1e-9
    return y / peak


def one_pole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    rc = np.exp(-2.0 * np.pi * cutoff / SR)
    a = 1.0 - rc
    y = np.empty_like(x)
    acc = np.zeros(x.shape[1], dtype=np.float64) if x.ndim == 2 else 0.0
    for i in range(len(x)):
        acc = rc * acc + a * x[i]
        y[i] = acc
    return y


def one_pole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - one_pole_lp(x, cutoff)


def modal(
    n: int,
    f0: float,
    seed: int,
    ratios: tuple[float, ...] = GLASS,
    decay: float = 0.055,
    bright: float = 0.55,
    glide: float = 0.988,
) -> np.ndarray:
    rng = np.random.RandomState(seed)
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros(n, dtype=np.float64)
    for i, r in enumerate(ratios):
        f = f0 * r * (1.0 + rng.uniform(-0.008, 0.008))
        if f < 90 or f > 7800:
            continue
        inst = f * (glide ** np.minimum(t / 0.08, 1.0))
        phase = np.cumsum(PI2 * inst / SR)
        beat = f * (1.0 + rng.uniform(0.0018, 0.0045))
        phase_b = np.cumsum(PI2 * beat / SR)
        d = decay * (0.72 + 0.55 / (i + 1))
        amp = (0.62 / (i + 1) ** 0.72) * (bright if i >= 3 else 1.0)
        env = np.exp(-t / d)
        out += amp * env * np.sin(phase + rng.random() * PI2)
        out += amp * 0.22 * env * np.sin(phase_b + rng.random() * PI2)
    return out


def crack(n: int, seed: int, lo: float = 1400, hi: float = 5600, decay: float = 0.0038) -> np.ndarray:
    noise = fft_band(n, lo, hi, seed, slope=-0.15)
    t = np.arange(n) / SR
    return noise * np.exp(-t / decay)


def body_thud(n: int, f: float, amp: float) -> np.ndarray:
    t = np.arange(n) / SR
    s = amp * np.exp(-t / 0.011) * np.sin(PI2 * f * t)
    s += amp * 0.38 * np.exp(-t / 0.018) * np.sin(PI2 * (f * 0.52) * t)
    return s


def metal_tail(n: int, f: float, seed: int, amp: float, decay: float) -> np.ndarray:
    bank = modal(n, f, seed, ratios=METAL, decay=decay, bright=0.35, glide=0.996)
    t = np.arange(n) / SR
    return amp * bank * np.exp(-t / (decay * 1.6))


def stereo(mono: np.ndarray, delay: int, width: float, seed: int) -> np.ndarray:
    rng = np.random.RandomState(seed)
    n = len(mono)
    left = mono.copy()
    right = np.zeros(n)
    right[delay:] = mono[: n - delay]
    # Tiny decorrelated air, never a whoosh.
    air = fft_band(n, 2200, 6400, seed + 9, slope=-0.2) * 0.04
    t = np.arange(n) / SR
    air *= np.exp(-t / 0.045)
    left = left * (1.0 - width * 0.35) + air * width
    right = right * (1.0 - width * 0.2) + air * (width * 0.7) * (0.85 + 0.15 * rng.random())
    return np.column_stack([left, right])


def soft_limit(audio: np.ndarray, peak: float) -> np.ndarray:
    m = float(np.max(np.abs(audio))) + 1e-12
    shaped = np.tanh(audio * (1.12 * peak / m)) / np.tanh(1.12)
    return shaped * peak


def mix_to(dest: np.ndarray, src: np.ndarray, offset: int = 0, gain: float = 1.0) -> None:
    if offset >= len(dest):
        return
    take = min(len(src), len(dest) - offset)
    dest[offset : offset + take] += gain * src[:take]


def crystal_tap(dur: float, f0: float, seed: int, weight: float) -> np.ndarray:
    n = int(dur * SR)
    sig = np.zeros(n)
    mix_to(sig, crack(n, seed, 1600, 5200, 0.0028), 0, 0.55 + weight * 0.1)
    mix_to(sig, modal(n, f0, seed + 1, decay=0.042, bright=0.42, glide=0.99), 0, 0.72)
    mix_to(sig, body_thud(n, 112 + seed % 17, 0.16 + weight * 0.06), 0, 1.0)
    mix_to(sig, metal_tail(n, f0 * 0.62, seed + 3, 0.12, 0.05), 0, 1.0)
    sig = one_pole_hp(one_pole_lp(sig, 6800), 85)
    return fade(sig, 0.00004, max(0.016, dur * 0.2))


def crystal_swipe(dur: float, seed: int) -> np.ndarray:
    """Two gem faces kiss: contact crack, answering clink, no whoosh."""
    n = int(dur * SR)
    sig = np.zeros(n)
    a = crystal_tap(dur, 1580 + (seed % 5) * 28, seed, weight=0.35)
    b = crystal_tap(dur, 1340 + (seed % 7) * 22, seed + 11, weight=0.28)
    delay = int((0.016 + (seed % 3) * 0.003) * SR)
    mix_to(sig, a, 0, 1.18)
    mix_to(sig, b, delay, 0.58)
    # Quiet face-friction, band-limited, dies immediately.
    grain = fft_band(n, 2100, 4800, seed + 4, slope=-0.25)
    t = np.arange(n) / SR
    gate = np.clip((t - 0.008) / 0.01, 0, 1) * np.exp(-np.maximum(t - 0.012, 0) / 0.028)
    mix_to(sig, grain * gate, 0, 0.055)
    sig = one_pole_hp(one_pole_lp(sig, 6400), 90)
    return fade(sig, 0.00004, 0.024)


def shatter(dur: float, seed: int, shards: int, weight: float) -> np.ndarray:
    """Tempered-glass break. Escalates with shard count, never arcade sparkle."""
    n = int(dur * SR)
    sig = np.zeros(n)
    mix_to(sig, crack(n, seed, 1200, 5400, 0.0042), 0, 0.5 + weight * 0.08)
    mix_to(sig, body_thud(n, 78 + weight * 10, 0.28 + weight * 0.16), 0, 1.0)
    mix_to(sig, modal(n, 980 + weight * 40, seed + 2, decay=0.05 + weight * 0.012, bright=0.38), 0, 0.48)
    rng = np.random.RandomState(seed)
    for i in range(shards):
        delay = 0.004 + i * (0.0074 - weight * 0.0008) + float(rng.uniform(0.0, 0.003))
        f0 = 1180.0 + i * 95.0 + float(rng.uniform(-70.0, 80.0))
        shard = crystal_tap(min(dur, 0.22), f0, seed + 17 * (i + 1), weight=0.18 + weight * 0.1)
        amp = (0.58 + weight * 0.08) / (i + 1) ** 0.46
        mix_to(sig, shard, int(delay * SR), amp)
    mix_to(sig, metal_tail(n, 720 + weight * 80, seed + 8, 0.14 + weight * 0.08, 0.07 + weight * 0.03), 0, 1.0)
    sig = one_pole_hp(one_pole_lp(sig, 6200 if weight < 0.7 else 6600), 70)
    return fade(sig, 0.00004, max(0.022, dur * 0.26))


def render_job(name: str, mono: np.ndarray, delay: int, width: float, seed: int, peak: float) -> np.ndarray:
    st = stereo(mono, delay=delay, width=width, seed=seed)
    return fade(soft_limit(st, peak), 0.00004, 0.016)


JOBS = (
    ("sfx-move.wav", lambda: crystal_swipe(0.18, 21), 6, 0.16, 21, 0.68),
    ("sfx-move-b.wav", lambda: crystal_swipe(0.18, 34), 8, 0.18, 34, 0.66),
    ("sfx-move-c.wav", lambda: crystal_swipe(0.19, 55), 5, 0.15, 55, 0.66),
    ("sfx-place.wav", lambda: crystal_tap(0.15, 1640, 17, 0.18), 5, 0.12, 17, 0.52),
    ("sfx-place-b.wav", lambda: crystal_tap(0.15, 1520, 28, 0.16), 7, 0.13, 28, 0.51),
    ("sfx-place-c.wav", lambda: crystal_tap(0.16, 1710, 39, 0.17), 4, 0.11, 39, 0.51),
    ("sfx-match.wav", lambda: shatter(0.26, 101, 3, 0.22), 8, 0.18, 101, 0.62),
    ("sfx-match-b.wav", lambda: shatter(0.26, 118, 3, 0.24), 10, 0.2, 118, 0.61),
    ("sfx-match-c.wav", lambda: shatter(0.27, 139, 3, 0.2), 7, 0.17, 139, 0.61),
    ("sfx-combo.wav", lambda: shatter(0.34, 202, 5, 0.48), 11, 0.24, 202, 0.66),
    ("sfx-combo-b.wav", lambda: shatter(0.34, 221, 5, 0.5), 9, 0.26, 221, 0.65),
    ("sfx-combo-c.wav", lambda: shatter(0.35, 247, 5, 0.46), 12, 0.23, 247, 0.65),
    ("sfx-highcombo.wav", lambda: shatter(0.44, 303, 7, 0.78), 13, 0.3, 303, 0.7),
    ("sfx-highcombo-b.wav", lambda: shatter(0.44, 331, 7, 0.8), 11, 0.32, 331, 0.69),
    ("sfx-highcombo-c.wav", lambda: shatter(0.46, 359, 7, 0.76), 14, 0.28, 359, 0.69),
)


def encode_mp3(wav_path: str) -> None:
    mp3 = wav_path[:-4] + ".mp3"
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "3", mp3],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, make, delay, width, seed, peak in JOBS:
        audio = render_job(name, make(), delay, width, seed, peak)
        path = os.path.join(OUT, name)
        write_wav(path, audio)
        encode_mp3(path)
        early = audio[: int(0.01 * SR)]
        print(
            name,
            os.path.getsize(path),
            f"peak={float(np.max(np.abs(audio))):.3f}",
            f"early={float(np.max(np.abs(early))):.3f}",
            f"dur={audio.shape[0] / SR:.3f}",
        )


if __name__ == "__main__":
    main()
