#!/usr/bin/env python3
"""Generate Chrono Clash SFX WAV fixtures. Music is assemble_chrono_ost.py, not this file."""
from __future__ import annotations

import math
import os
import struct
import wave

SR = 22050
OUT = os.path.dirname(os.path.abspath(__file__))
PI2 = math.pi * 2.0


def clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if x < lo else hi if x > hi else x


def midi(n: float) -> float:
    return 440.0 * (2.0 ** ((n - 69.0) / 12.0))


def env(t: float, dur: float, a: float = 0.02, d: float = 0.12, s: float = 0.7, r: float = 0.18) -> float:
    if t < 0 or t > dur:
        return 0.0
    if t < a:
        return t / a if a > 0 else 1.0
    if t < a + d:
        return 1.0 - (1.0 - s) * ((t - a) / d if d > 0 else 1.0)
    if t > dur - r:
        tail = (dur - t) / r if r > 0 else 0.0
        return s * max(0.0, tail)
    return s


def tanh_sat(x: float, drive: float = 1.15) -> float:
    return math.tanh(x * drive)


def write_wav(path: str, left: list[float], right: list[float] | None = None) -> None:
    n = len(left)
    with wave.open(path, "w") as wf:
        wf.setnchannels(2 if right is not None else 1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        frames = bytearray()
        if right is None:
            for i in range(n):
                frames += struct.pack("<h", int(clamp(left[i]) * 32767))
        else:
            for i in range(n):
                frames += struct.pack("<hh", int(clamp(left[i]) * 32767), int(clamp(right[i]) * 32767))
        wf.writeframes(frames)


def zeros(n: int) -> list[float]:
    return [0.0] * n


def add_tone(
    buf: list[float],
    start: float,
    dur: float,
    freq: float,
    amp: float,
    harmonics: tuple[float, ...] = (1.0, 0.42, 0.18, 0.08, 0.04),
    a: float = 0.03,
    d: float = 0.14,
    s: float = 0.72,
    r: float = 0.22,
    vibrato_hz: float = 0.0,
    vibrato_cents: float = 0.0,
) -> None:
    n = len(buf)
    i0 = max(0, int(start * SR))
    i1 = min(n, int((start + dur) * SR))
    for i in range(i0, i1):
        t = (i - i0) / SR
        e = env(t, dur, a, d, s, r)
        if e <= 0:
            continue
        cents = math.sin(PI2 * vibrato_hz * (start + t)) * vibrato_cents if vibrato_hz else 0.0
        f = freq * (2.0 ** (cents / 1200.0))
        sample = 0.0
        for h, w in enumerate(harmonics, start=1):
            sample += w * math.sin(PI2 * f * h * (start + t))
        buf[i] += sample * amp * e


def add_noise(buf: list[float], start: float, dur: float, amp: float, hp: float = 1800.0) -> None:
    n = len(buf)
    i0 = max(0, int(start * SR))
    i1 = min(n, int((start + dur) * SR))
    state = 0.0
    rc = math.exp(-hp / SR)
    seed = 1
    for i in range(i0, i1):
        t = (i - i0) / SR
        e = env(t, dur, 0.01, 0.04, 0.55, max(0.04, dur * 0.4))
        seed = (1103515245 * seed + 12345 + i) & 0x7FFFFFFF
        white = (seed / 0x40000000) - 1.0
        state = state * rc + white * (1.0 - rc)
        high = white - state
        buf[i] += high * amp * e


def add_sweep(buf: list[float], start: float, dur: float, f0: float, f1: float, amp: float) -> None:
    n = len(buf)
    i0 = max(0, int(start * SR))
    i1 = min(n, int((start + dur) * SR))
    phase = 0.0
    for i in range(i0, i1):
        t = (i - i0) / SR
        x = t / dur if dur else 1.0
        e = env(t, dur, 0.02, 0.08, 0.8, 0.2)
        freq = f0 * ((f1 / f0) ** x)
        phase += PI2 * freq / SR
        buf[i] += math.sin(phase) * amp * e


def stereo(mono: list[float], delay_ms: float = 14.0, width: float = 0.22) -> tuple[list[float], list[float]]:
    d = int(SR * delay_ms / 1000.0)
    n = len(mono)
    left = zeros(n)
    right = zeros(n)
    for i, s in enumerate(mono):
        left[i] += s * (1.0 - width)
        j = i + d
        if j < n:
            right[j] += s * (1.0 - width)
        right[i] += s * width
        if i >= d:
            left[i] += mono[i - d] * width * 0.65
    return left, right


def normalize(bufs: list[list[float]], peak: float = 0.89) -> None:
    m = 0.0
    for buf in bufs:
        for x in buf:
            ax = abs(x)
            if ax > m:
                m = ax
    if m < 1e-8:
        return
    g = peak / m
    for buf in bufs:
        for i, x in enumerate(buf):
            buf[i] = tanh_sat(x * g, 1.05)


def loop_crossfade(buf: list[float], fade_s: float = 0.35) -> list[float]:
    fade = min(len(buf) // 4, int(fade_s * SR))
    if fade < 8:
        return buf
    out = buf[:-fade]
    for i in range(fade):
        t = i / fade
        out[i] = buf[i] * t + buf[len(buf) - fade + i] * (1.0 - t)
    return out


def render_lobby(seconds: float = 16.0) -> tuple[list[float], list[float]]:
    n = int(SR * (seconds + 0.4))
    m = zeros(n)
    # Deep navy pad — A minor / dorian stack
    for freq, amp in ((55.0, 0.22), (110.0, 0.2), (164.81, 0.16), (220.0, 0.14), (329.63, 0.07), (392.0, 0.05)):
        add_tone(m, 0, seconds + 0.4, freq, amp, vibrato_hz=0.07, vibrato_cents=7.0, a=1.2, r=0.5, s=0.9)
        add_tone(m, 0, seconds + 0.4, freq * 1.004, amp * 0.45, vibrato_hz=0.05, vibrato_cents=5.0, a=1.4, r=0.5, s=0.9)
    # Crystalline arp (quiet)
    arp = [midi(81), midi(84), midi(88), midi(84), midi(79), midi(76), midi(72), midi(76)]
    step = 0.5
    t = 0.12
    while t < seconds:
        note = arp[int((t / step) % len(arp))]
        add_tone(m, t, 0.62, note, 0.045, harmonics=(1.0, 0.55, 0.22), a=0.01, d=0.08, s=0.18, r=0.4)
        add_tone(m, t + 0.02, 0.5, note * 2, 0.012, harmonics=(1.0, 0.2), a=0.005, r=0.35, s=0.1)
        t += step
    # Subtle pulse
    t = 0.0
    while t < seconds:
        add_tone(m, t, 0.9, 55.0, 0.09, harmonics=(1.0, 0.3), a=0.02, d=0.2, s=0.12, r=0.55)
        t += 2.0
    add_noise(m, 0, seconds + 0.4, 0.03, hp=2400)
    m = loop_crossfade(m, 0.4)
    left, right = stereo(m, 18, 0.28)
    normalize([left, right], 0.78)
    return left, right


def render_battle(seconds: float = 16.0) -> tuple[list[float], list[float]]:
    n = int(SR * (seconds + 0.4))
    m = zeros(n)
    beat = 60.0 / 108.0
    for freq, amp in ((73.42, 0.2), (146.83, 0.16), (220.0, 0.1), (174.61, 0.08)):
        add_tone(m, 0, seconds + 0.4, freq, amp, vibrato_hz=0.12, vibrato_cents=6.0, a=0.6, s=0.88, r=0.4)
    t = 0.0
    while t < seconds:
        add_tone(m, t, 0.28, 73.42, 0.2, harmonics=(1.0, 0.55, 0.18), a=0.004, d=0.08, s=0.15, r=0.16)
        add_sweep(m, t, 0.12, 90.0, 48.0, 0.08)
        t += beat
    arp = [midi(62), midi(65), midi(69), midi(72), midi(69), midi(65), midi(60), midi(65)]
    t = 0.0
    step = beat / 2
    while t < seconds:
        note = arp[int((t / step) % len(arp))]
        add_tone(m, t, 0.22, note, 0.05, harmonics=(1.0, 0.35), a=0.008, d=0.05, s=0.2, r=0.12)
        t += step
    add_noise(m, 0, seconds + 0.4, 0.025, hp=2000)
    m = loop_crossfade(m, 0.32)
    left, right = stereo(m, 11, 0.2)
    normalize([left, right], 0.74)
    return left, right


def render_victory() -> tuple[list[float], list[float]]:
    dur = 6.2
    m = zeros(int(SR * dur))
    add_tone(m, 0.0, dur, 110.0, 0.16, a=0.08, s=0.7, r=1.4)
    add_tone(m, 0.0, dur, 164.81, 0.12, a=0.1, s=0.65, r=1.4)
    melody = [(0.0, 220.0), (0.22, 277.18), (0.44, 329.63), (0.7, 440.0), (1.05, 554.37), (1.45, 659.25), (2.0, 880.0)]
    for t, f in melody:
        add_tone(m, t, 1.15, f, 0.16, harmonics=(1.0, 0.4, 0.16), a=0.015, d=0.12, s=0.45, r=0.7)
        add_tone(m, t + 0.03, 0.9, f * 2, 0.04, a=0.01, r=0.5, s=0.2)
    add_tone(m, 2.3, 3.6, 440.0, 0.1, a=0.2, s=0.55, r=1.6, vibrato_hz=4.2, vibrato_cents=8)
    add_tone(m, 2.3, 3.6, 659.25, 0.08, a=0.25, s=0.5, r=1.6)
    add_noise(m, 1.8, 1.2, 0.04, hp=2600)
    left, right = stereo(m, 12, 0.24)
    normalize([left, right], 0.86)
    return left, right


def render_defeat() -> tuple[list[float], list[float]]:
    dur = 6.4
    m = zeros(int(SR * dur))
    add_tone(m, 0.0, dur, 110.0, 0.18, a=0.12, s=0.7, r=1.8)
    add_tone(m, 0.0, dur, 164.81, 0.1, a=0.16, s=0.55, r=1.8)
    melody = [(0.0, 220.0), (0.38, 196.0), (0.82, 164.81), (1.3, 146.83), (1.9, 110.0), (2.6, 82.41)]
    for t, f in melody:
        add_tone(m, t, 1.4, f, 0.14, harmonics=(1.0, 0.28, 0.1), a=0.04, d=0.2, s=0.4, r=0.85)
    add_tone(m, 2.8, 3.4, 130.81, 0.07, a=0.4, s=0.45, r=1.8)  # lingering hope
    add_noise(m, 0.2, 1.4, 0.025, hp=1400)
    left, right = stereo(m, 16, 0.18)
    normalize([left, right], 0.8)
    return left, right


def render_draw() -> tuple[list[float], list[float]]:
    dur = 4.2
    m = zeros(int(SR * dur))
    add_tone(m, 0.0, dur, 146.83, 0.14, a=0.08, s=0.6, r=1.1)
    add_tone(m, 0.12, 1.1, 220.0, 0.12, a=0.02, r=0.7, s=0.35)
    add_tone(m, 0.42, 1.2, 329.63, 0.1, a=0.02, r=0.8, s=0.3)
    add_tone(m, 1.1, 2.6, 196.0, 0.1, a=0.15, s=0.45, r=1.2)
    left, right = stereo(m, 10, 0.16)
    normalize([left, right], 0.8)
    return left, right


def sfx_buf(dur: float) -> list[float]:
    return zeros(int(SR * dur))


def render_sfx() -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}

    b = sfx_buf(0.22)
    add_tone(b, 0, 0.18, 920, 0.22, harmonics=(1.0, 0.35), a=0.004, d=0.03, s=0.2, r=0.12)
    add_tone(b, 0.01, 0.12, 1840, 0.06, a=0.002, r=0.1, s=0.12)
    out["sfx-ui.wav"] = b

    b = sfx_buf(0.38)
    add_tone(b, 0, 0.2, 659.25, 0.2, a=0.006, r=0.14, s=0.3)
    add_tone(b, 0.08, 0.26, 880, 0.16, a=0.006, r=0.18, s=0.25)
    out["sfx-confirm.wav"] = b

    b = sfx_buf(0.28)
    add_tone(b, 0, 0.2, 740, 0.18, harmonics=(1.0, 0.5, 0.18), a=0.003, r=0.16, s=0.2)
    add_noise(b, 0, 0.08, 0.04, hp=3200)
    out["sfx-place.wav"] = b

    # Gem swipe is a 48 kHz crystal clink written by render_crystal_swipe.py.

    b = sfx_buf(0.34)
    add_tone(b, 0, 0.22, 160, 0.18, harmonics=(1.0, 0.4), a=0.004, r=0.18, s=0.25)
    add_tone(b, 0.05, 0.2, 120, 0.12, a=0.01, r=0.16, s=0.2)
    out["sfx-invalid.wav"] = b

    b = sfx_buf(0.42)
    add_tone(b, 0, 0.28, 523.25, 0.18, a=0.006, r=0.2, s=0.3)
    add_tone(b, 0.03, 0.3, 659.25, 0.14, a=0.008, r=0.22, s=0.28)
    add_tone(b, 0.07, 0.28, 783.99, 0.1, a=0.01, r=0.2, s=0.22)
    out["sfx-match.wav"] = b

    b = sfx_buf(0.48)
    add_tone(b, 0, 0.2, 659.25, 0.16, a=0.005, r=0.14, s=0.28)
    add_tone(b, 0.08, 0.24, 783.99, 0.15, a=0.006, r=0.16, s=0.26)
    add_tone(b, 0.16, 0.28, 987.77, 0.12, a=0.008, r=0.2, s=0.22)
    out["sfx-combo.wav"] = b

    b = sfx_buf(0.7)
    for i, f in enumerate((523.25, 659.25, 783.99, 1046.5)):
        add_tone(b, 0.05 * i, 0.38, f, 0.14, a=0.008, r=0.24, s=0.3)
    add_noise(b, 0.12, 0.25, 0.04, hp=2800)
    out["sfx-highcombo.wav"] = b

    b = sfx_buf(0.28)
    add_tone(b, 0, 0.14, 980, 0.14, a=0.003, r=0.1, s=0.2)
    add_tone(b, 0.04, 0.16, 1310, 0.08, a=0.003, r=0.12, s=0.15)
    out["sfx-score.wav"] = b

    b = sfx_buf(0.3)
    add_tone(b, 0, 0.18, 420, 0.14, a=0.004, r=0.14, s=0.22)
    add_tone(b, 0.05, 0.16, 310, 0.1, a=0.006, r=0.12, s=0.18)
    out["sfx-oppscore.wav"] = b

    b = sfx_buf(0.55)
    add_tone(b, 0, 0.22, 880, 0.14, a=0.004, r=0.12, s=0.2)
    add_tone(b, 0.16, 0.28, 880, 0.12, a=0.004, r=0.16, s=0.18)
    out["sfx-warning.wav"] = b

    b = sfx_buf(0.7)
    add_tone(b, 0, 0.18, 740, 0.16, a=0.003, r=0.1, s=0.22)
    add_tone(b, 0.14, 0.2, 620, 0.15, a=0.003, r=0.12, s=0.2)
    add_tone(b, 0.3, 0.32, 494, 0.16, a=0.004, r=0.18, s=0.22)
    out["sfx-critical.wav"] = b

    b = sfx_buf(0.85)
    add_sweep(b, 0, 0.55, 1480, 220, 0.16)
    add_tone(b, 0.08, 0.7, 920, 0.08, a=0.02, r=0.5, s=0.2)
    add_noise(b, 0.0, 0.35, 0.05, hp=3600)
    out["sfx-freeze.wav"] = b

    b = sfx_buf(0.8)
    add_sweep(b, 0, 0.55, 180, 1400, 0.15)
    add_tone(b, 0.2, 0.45, 960, 0.1, a=0.02, r=0.28, s=0.22)
    out["sfx-timeshift.wav"] = b

    b = sfx_buf(0.7)
    add_sweep(b, 0, 0.45, 880, 180, 0.14)
    add_tone(b, 0.1, 0.4, 440, 0.1, a=0.02, r=0.28, s=0.2)
    out["sfx-rewind.wav"] = b

    b = sfx_buf(0.4)
    add_tone(b, 0, 0.22, 140, 0.18, harmonics=(1.0, 0.5), a=0.004, r=0.16, s=0.22)
    add_tone(b, 0.06, 0.2, 98, 0.12, a=0.01, r=0.14, s=0.18)
    out["sfx-deny.wav"] = b

    b = sfx_buf(1.6)
    add_tone(b, 0.0, 0.35, 620, 0.1, a=0.01, r=0.28, s=0.15)
    add_tone(b, 0.55, 0.4, 820, 0.08, a=0.01, r=0.3, s=0.12)
    add_tone(b, 1.1, 0.4, 620, 0.08, a=0.01, r=0.3, s=0.12)
    add_noise(b, 0.0, 0.2, 0.03, hp=2200)
    out["sfx-search.wav"] = b

    b = sfx_buf(0.9)
    add_tone(b, 0, 0.35, 392, 0.16, a=0.01, r=0.22, s=0.3)
    add_tone(b, 0.12, 0.45, 523.25, 0.14, a=0.012, r=0.28, s=0.28)
    add_tone(b, 0.28, 0.55, 659.25, 0.12, a=0.015, r=0.35, s=0.25)
    out["sfx-found.wav"] = b

    b = sfx_buf(0.28)
    add_tone(b, 0, 0.16, 510, 0.16, harmonics=(1.0, 0.2), a=0.003, r=0.1, s=0.18)
    out["sfx-countdown.wav"] = b

    b = sfx_buf(0.95)
    add_tone(b, 0, 0.28, 196, 0.16, harmonics=(1.0, 0.45), a=0.008, r=0.18, s=0.28)
    add_tone(b, 0.08, 0.35, 246.94, 0.14, a=0.01, r=0.22, s=0.26)
    add_tone(b, 0.18, 0.45, 329.63, 0.13, a=0.012, r=0.28, s=0.24)
    add_tone(b, 0.32, 0.5, 392, 0.1, a=0.02, r=0.32, s=0.22)
    add_noise(b, 0.02, 0.18, 0.05, hp=800)
    out["sfx-start.wav"] = b

    b = sfx_buf(1.35)
    for i, f in enumerate((261.63, 329.63, 392.0, 523.25, 659.25)):
        add_tone(b, 0.08 * i, 0.55, f, 0.14, a=0.01, r=0.35, s=0.32)
    out["sfx-victory.wav"] = b

    b = sfx_buf(1.4)
    for i, f in enumerate((196.0, 164.81, 130.81, 98.0)):
        add_tone(b, 0.12 * i, 0.7, f, 0.14, a=0.02, r=0.45, s=0.3)
    out["sfx-defeat.wav"] = b

    b = sfx_buf(1.05)
    add_tone(b, 0, 0.5, 196, 0.14, a=0.02, r=0.35, s=0.3)
    add_tone(b, 0.14, 0.55, 293.66, 0.12, a=0.02, r=0.38, s=0.28)
    add_tone(b, 0.32, 0.55, 246.94, 0.1, a=0.03, r=0.4, s=0.24)
    out["sfx-draw.wav"] = b

    b = sfx_buf(0.55)
    add_tone(b, 0, 0.28, 240, 0.14, a=0.01, r=0.18, s=0.25)
    add_tone(b, 0.08, 0.32, 720, 0.1, a=0.012, r=0.22, s=0.2)
    out["sfx-power.wav"] = b

    b = sfx_buf(0.45)
    add_sweep(b, 0, 0.22, 180, 640, 0.14)
    add_tone(b, 0.08, 0.28, 520, 0.1, a=0.01, r=0.18, s=0.2)
    out["sfx-launch.wav"] = b

    b = sfx_buf(0.5)
    add_tone(b, 0, 0.22, 880, 0.12, harmonics=(1.0, 0.25), a=0.004, r=0.14, s=0.2)
    add_tone(b, 0.12, 0.28, 1100, 0.1, a=0.006, r=0.18, s=0.18)
    out["sfx-incoming.wav"] = b

    b = sfx_buf(0.42)
    add_tone(b, 0, 0.2, 70, 0.22, harmonics=(1.0, 0.6, 0.2), a=0.003, r=0.16, s=0.25)
    add_noise(b, 0, 0.12, 0.08, hp=600)
    out["sfx-impact.wav"] = b

    b = sfx_buf(0.7)
    add_tone(b, 0, 0.35, 247, 0.16, a=0.01, r=0.28, s=0.28)
    add_tone(b, 0.12, 0.45, 185, 0.14, a=0.02, r=0.32, s=0.24)
    add_noise(b, 0.05, 0.2, 0.04, hp=1800)
    out["sfx-lifelost.wav"] = b

    b = sfx_buf(0.85)
    add_tone(b, 0, 0.3, 523.25, 0.14, a=0.01, r=0.22, s=0.28)
    add_tone(b, 0.12, 0.4, 659.25, 0.13, a=0.012, r=0.28, s=0.26)
    add_tone(b, 0.28, 0.5, 783.99, 0.12, a=0.015, r=0.35, s=0.24)
    out["sfx-lifead.wav"] = b

    b = sfx_buf(1.15)
    add_tone(b, 0, 0.45, 329.63, 0.12, a=0.02, r=0.3, s=0.28)
    add_tone(b, 0.16, 0.5, 392.0, 0.12, a=0.02, r=0.32, s=0.26)
    add_tone(b, 0.34, 0.65, 523.25, 0.14, a=0.025, r=0.42, s=0.28)
    add_tone(b, 0.52, 0.6, 659.25, 0.1, a=0.03, r=0.4, s=0.22)
    out["sfx-livesreset.wav"] = b

    for name, buf in out.items():
        normalize([buf], 0.84)
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, buf in render_sfx().items():
        path = os.path.join(OUT, name)
        write_wav(path, buf)
        print(f"wrote {name} {os.path.getsize(path)} bytes")
    from render_crystal_swipe import main as write_crystal_swipe

    write_crystal_swipe()
    print("SFX only. Music is assembled by assemble_chrono_ost.py.")


if __name__ == "__main__":
    main()
