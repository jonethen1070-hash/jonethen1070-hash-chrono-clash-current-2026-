#!/usr/bin/env python3
"""48 kHz stereo Chrono Clash SFX — crystalline, phone-speaker safe, not arcade beeps."""
from __future__ import annotations

import os
import wave

import numpy as np

SR = 48000
OUT = os.path.dirname(os.path.abspath(__file__))
PEAK = 0.72


def lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    rc = np.exp(-2.0 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    a = 1.0 - rc
    for i, s in enumerate(x):
        acc = rc * acc + a * s
        y[i] = acc
    return y


def hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - lp(x, cutoff)


def fade(x: np.ndarray, inn: float = 0.0008, out: float = 0.012) -> np.ndarray:
    n = len(x)
    ni = min(n // 6, int(inn * SR))
    no = min(n // 3, int(out * SR))
    y = x.copy()
    if ni > 2:
        y[:ni] *= np.linspace(0.0, 1.0, ni)
    if no > 2:
        y[-no:] *= np.linspace(1.0, 0.0, no)
    return y


def stereo(mono: np.ndarray, delay: int = 5, width: float = 0.12) -> np.ndarray:
    left = mono * (1.0 - width)
    right = np.roll(mono, delay) * (1.0 - width * 0.4)
    right[:delay] = 0.0
    right += mono * width
    return np.column_stack([left, right])


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def norm(audio: np.ndarray, peak: float = PEAK) -> np.ndarray:
    m = float(np.max(np.abs(audio)))
    if m < 1e-8:
        return audio
    return np.tanh(audio * (peak / m) * 1.05) / np.tanh(1.05) * peak


def env(t: np.ndarray, attack: float, decay: float) -> np.ndarray:
    a = np.minimum(t / max(attack, 1e-5), 1.0)
    return a * np.exp(-np.maximum(t - attack, 0.0) / decay)


def crystal(
    dur: float,
    f0: float,
    seed: int,
    body: float = 0.18,
    click: float = 0.1,
    second: float = 0.008,
) -> np.ndarray:
    """Physical glass-on-glass strike: inharmonic modes, not a harmonic beep."""
    rng = np.random.RandomState(seed)
    n = int(SR * dur)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    ratios = (1.0, 1.47, 2.52, 3.78, 5.12)
    decays = (0.017, 0.013, 0.01, 0.0075, 0.0055)
    amps = (0.58, 0.3, 0.16, 0.08, 0.045)
    for r, d, a in zip(ratios, decays, amps):
        f = f0 * r * (1.0 + rng.uniform(-0.01, 0.01))
        if f > 6000:
            continue
        slide = f * (1.0 - 0.014 * np.minimum(t / 0.018, 1.0))
        phase = np.cumsum(2.0 * np.pi * slide / SR)
        sig += a * np.exp(-t / d) * np.sin(phase + rng.random())
    noise = rng.randn(n)
    sig += click * hp(lp(noise, 4600), 1600) * np.exp(-t / 0.0022)
    sig += body * np.exp(-t / 0.012) * np.sin(2 * np.pi * 188 * t)
    sig += body * 0.32 * np.exp(-t / 0.008) * np.sin(2 * np.pi * 94 * t)
    if second > 0:
        t2 = np.maximum(t - second, 0.0)
        gate = (t >= second).astype(np.float64)
        sig += 0.22 * np.exp(-t2 / 0.014) * np.sin(2 * np.pi * f0 * 1.11 * t2) * gate
        sig += 0.08 * hp(lp(rng.randn(n), 4200), 1500) * np.exp(-t2 / 0.002) * gate
    sig = hp(lp(sig, 6200), 70)
    return fade(sig, 0.00025, max(0.012, dur * 0.2))


def ping(dur: float, f: float, amp: float, decay: float) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = amp * np.exp(-t / decay) * np.sin(2 * np.pi * f * t)
    s += 0.28 * amp * np.exp(-t / (decay * 0.7)) * np.sin(2 * np.pi * f * 2.02 * t)
    return fade(hp(lp(s, 6200), 80), 0.0006, decay * 0.45)


def thud(dur: float, f: float, amp: float) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    s = amp * np.exp(-t / 0.028) * np.sin(2 * np.pi * f * t)
    s += 0.4 * amp * np.exp(-t / 0.016) * np.sin(2 * np.pi * (f * 0.5) * t)
    return fade(lp(s, 420), 0.0008, 0.04)


def sweep(dur: float, f0: float, f1: float, amp: float) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = t / max(dur, 1e-6)
    freq = f0 * ((f1 / f0) ** x)
    phase = np.cumsum(2 * np.pi * freq / SR)
    s = amp * env(t, 0.018, dur * 0.45) * np.sin(phase)
    return fade(lp(s, 5400), 0.004, 0.05)


def mix(*parts: np.ndarray) -> np.ndarray:
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def shatter(
    dur: float,
    seed: int,
    shards: int = 4,
    body: float = 0.28,
    sparkle: float = 0.1,
) -> np.ndarray:
    """Layered tempered-glass break: short, punchy, phone-safe. Not an arcade beep."""
    rng = np.random.RandomState(seed)
    n = int(SR * dur)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    crack = hp(lp(rng.randn(n), 4300), 900) * np.exp(-t / 0.0036)
    sig += 0.42 * crack
    sig[: min(n, int(0.012 * SR))] += body * 0.85 * np.exp(-t[: min(n, int(0.012 * SR))] / 0.007) * np.sin(
        2 * np.pi * 86 * t[: min(n, int(0.012 * SR))]
    )
    for i in range(shards):
        delay = 0.0035 + i * 0.0068 + float(rng.uniform(0.0, 0.0035))
        f0 = 1320.0 + i * 165.0 + float(rng.uniform(-90.0, 110.0))
        shard = crystal(min(dur, 0.2), f0, seed + 19 * (i + 1), body=0.07, click=0.11, second=0.0)
        amp = 0.52 / (i + 1) ** 0.42
        o = int(delay * SR)
        take = min(len(shard), n - o)
        if take > 0:
            sig[o : o + take] += amp * shard[:take]
    for i in range(2):
        delay = 0.028 + i * 0.022
        p = ping(0.1, 1980.0 - i * 320.0, sparkle * 0.28, 0.032)
        o = int(delay * SR)
        take = min(len(p), n - o)
        if take > 0:
            sig[o : o + take] += p[:take]
    sig = hp(lp(sig, 5400), 60)
    return fade(sig, 0.0002, max(0.018, dur * 0.26))


def render_all() -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {}

    out["sfx-ui.wav"] = crystal(0.14, 1860, 11, body=0.08, click=0.05, second=0.0)
    out["sfx-confirm.wav"] = mix(crystal(0.28, 1720, 13, body=0.1, click=0.06), ping(0.3, 2210, 0.14, 0.07))
    out["sfx-place.wav"] = crystal(0.15, 1680, 17, body=0.12, click=0.08, second=0.0)
    out["sfx-move.wav"] = crystal(0.15, 1760, 21, body=0.24, click=0.16, second=0.008)
    out["sfx-invalid.wav"] = mix(thud(0.28, 118, 0.55), crystal(0.22, 780, 23, body=0.12, click=0.04, second=0.0))
    out["sfx-match.wav"] = shatter(0.22, 101, shards=3, body=0.26, sparkle=0.07)
    out["sfx-combo.wav"] = shatter(0.28, 202, shards=5, body=0.34, sparkle=0.09)
    out["sfx-highcombo.wav"] = shatter(0.36, 303, shards=7, body=0.42, sparkle=0.11)
    out["sfx-score.wav"] = ping(0.18, 1760, 0.28, 0.04)
    out["sfx-oppscore.wav"] = ping(0.2, 980, 0.26, 0.05)
    warn = np.zeros(int(SR * 0.48))
    a = ping(0.2, 1560, 0.24, 0.045)
    b = ping(0.22, 1560, 0.2, 0.05)
    warn[: len(a)] += a
    warn[int(0.18 * SR) : int(0.18 * SR) + len(b)] += b
    out["sfx-warning.wav"] = warn
    crit = np.zeros(int(SR * 0.62))
    for i, f in enumerate((1680.0, 1420.0, 1180.0)):
        p = ping(0.22, f, 0.22, 0.05)
        o = int(0.14 * SR * i)
        crit[o : o + len(p)] += p
    out["sfx-critical.wav"] = mix(crit, thud(0.4, 72, 0.22))
    out["sfx-freeze.wav"] = mix(sweep(0.55, 1640, 280, 0.22), crystal(0.7, 2200, 41, body=0.08, click=0.12, second=0.0))
    out["sfx-timeshift.wav"] = mix(sweep(0.55, 220, 1680, 0.2), ping(0.4, 1480, 0.16, 0.1))
    out["sfx-rewind.wav"] = mix(sweep(0.45, 1320, 220, 0.2), thud(0.4, 96, 0.28))
    out["sfx-deny.wav"] = mix(thud(0.3, 108, 0.5), ping(0.18, 420, 0.12, 0.06))
    search = np.zeros(int(SR * 1.35))
    for i, f in enumerate((1240.0, 1680.0, 1240.0)):
        p = ping(0.28, f, 0.16, 0.09)
        o = int(0.42 * SR * i)
        search[o : o + len(p)] += p
    out["sfx-search.wav"] = search
    out["sfx-found.wav"] = mix(ping(0.32, 1320, 0.2, 0.08), ping(0.38, 1760, 0.18, 0.1), ping(0.42, 2340, 0.14, 0.12))
    out["sfx-countdown.wav"] = mix(thud(0.18, 140, 0.28), ping(0.16, 980, 0.2, 0.04))
    riser = sweep(0.55, 180, 720, 0.22)
    start = mix(riser, thud(0.4, 68, 0.42), crystal(0.55, 1560, 47, body=0.16, click=0.08, second=0.012), ping(0.4, 2340, 0.12, 0.1))
    out["sfx-start.wav"] = start
    vic = np.zeros(int(SR * 1.15))
    for i, f in enumerate((1310.0, 1650.0, 1960.0, 2620.0)):
        p = ping(0.4, f, 0.18, 0.12)
        o = int(0.07 * SR * i)
        vic[o : o + len(p)] += p
    out["sfx-victory.wav"] = mix(vic, thud(0.5, 72, 0.3))
    defn = np.zeros(int(SR * 1.05))
    for i, f in enumerate((980.0, 780.0, 620.0)):
        p = ping(0.42, f, 0.2, 0.14)
        o = int(0.12 * SR * i)
        defn[o : o + len(p)] += p
    out["sfx-defeat.wav"] = mix(defn, thud(0.55, 64, 0.36))
    out["sfx-draw.wav"] = mix(ping(0.4, 980, 0.18, 0.12), ping(0.45, 1310, 0.14, 0.14), thud(0.4, 88, 0.24))
    out["sfx-power.wav"] = mix(thud(0.32, 110, 0.32), ping(0.28, 1480, 0.16, 0.08))
    out["sfx-launch.wav"] = mix(sweep(0.22, 160, 720, 0.2), thud(0.28, 82, 0.34))
    out["sfx-incoming.wav"] = mix(ping(0.22, 1860, 0.18, 0.05), ping(0.26, 2240, 0.14, 0.06))
    out["sfx-impact.wav"] = mix(thud(0.32, 64, 0.62), crystal(0.28, 1320, 53, body=0.2, click=0.1, second=0.0))
    out["sfx-lifelost.wav"] = mix(thud(0.4, 86, 0.36), ping(0.32, 620, 0.16, 0.1))
    out["sfx-lifead.wav"] = mix(ping(0.28, 1480, 0.18, 0.08), ping(0.34, 1960, 0.16, 0.1))
    out["sfx-livesreset.wav"] = mix(
        ping(0.36, 1310, 0.16, 0.1),
        ping(0.4, 1650, 0.15, 0.12),
        ping(0.46, 2080, 0.14, 0.14),
    )
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, mono in render_all().items():
        stereo_audio = norm(stereo(mono))
        path = os.path.join(OUT, name)
        write_wav(path, stereo_audio)
        print(f"wrote {name} {os.path.getsize(path)}")


if __name__ == "__main__":
    main()
