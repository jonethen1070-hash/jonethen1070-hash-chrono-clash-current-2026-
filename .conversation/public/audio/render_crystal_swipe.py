#!/usr/bin/env python3
"""Premium crystal-on-crystal gem swipe. Two modal glass bodies strike then slide."""
from __future__ import annotations

import math
import os
import wave

import numpy as np

SR = 48000
OUT = os.path.dirname(os.path.abspath(__file__))
PI2 = math.pi * 2.0


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def modal_bank(n: int, freqs: list[float], decays: list[float], amps: list[float], glide: float = 1.0) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros(n, dtype=np.float64)
    for f, d, a in zip(freqs, decays, amps):
        inst = f * (glide ** t)
        phase = np.cumsum(PI2 * inst / SR)
        out += a * np.exp(-t / d) * np.sin(phase)
    return out


def band_noise(n: int, lo: float, hi: float) -> np.ndarray:
    x = np.random.default_rng(7).standard_normal(n)
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec[(freqs < lo) | (freqs > hi)] = 0
    y = np.fft.irfft(spec, n)
    return y / (np.max(np.abs(y)) + 1e-9)


def render_swipe(dur: float = 0.26) -> np.ndarray:
    n = int(dur * SR)
    # Crystal A (higher, first contact) and Crystal B (slightly heavier, answering slide)
    a = modal_bank(
        n,
        freqs=[2480, 3720, 5310, 7940, 11880],
        decays=[0.055, 0.07, 0.045, 0.035, 0.022],
        amps=[0.55, 0.42, 0.28, 0.18, 0.09],
        glide=1.012,
    )
    b = modal_bank(
        n,
        freqs=[2215, 3390, 4860, 7270, 10940],
        decays=[0.07, 0.085, 0.05, 0.04, 0.025],
        amps=[0.48, 0.38, 0.24, 0.16, 0.08],
        glide=0.982,
    )
    # Second crystal arrives 28ms later as they slide past
    delay = int(0.028 * SR)
    b_shift = np.zeros(n)
    b_shift[delay:] = b[: n - delay]
    body = a * 0.72 + b_shift * 0.78

    strike = band_noise(n, 1800, 9000)
    strike_env = np.exp(-np.arange(n) / (0.007 * SR))
    strike *= strike_env * 0.22

    # Friction shimmer while faces slide
    slide = band_noise(n, 2400, 11000)
    t = np.arange(n) / SR
    slide_env = np.clip((t - 0.012) / 0.03, 0, 1) * np.exp(-(t - 0.02).clip(min=0) / 0.07)
    slide *= slide_env * 0.11

    mono = body + strike + slide
    # Tiny stereo: left leads the first crystal, right the answering one
    left = mono * 0.92 + a * 0.18
    right = mono * 0.92 + b_shift * 0.18
    audio = np.column_stack([left, right])
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio *= 0.86 / peak
    fade = int(0.012 * SR)
    audio[-fade:] *= np.linspace(1.0, 0.0, fade)[:, None]
    audio[:8] *= np.linspace(0.0, 1.0, 8)[:, None]
    return audio


def main() -> None:
    audio = render_swipe(0.26)
    path = os.path.join(OUT, "sfx-move.wav")
    write_wav(path, audio)
    print(f"wrote {path} {os.path.getsize(path)} frames={len(audio)}")


if __name__ == "__main__":
    main()
