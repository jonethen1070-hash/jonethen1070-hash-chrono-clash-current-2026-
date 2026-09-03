#!/usr/bin/env python3
"""Chrono-Crystal prototype beds. Writes ONLY into this preview folder.

Does not touch public/audio/ live game masters.
Shared motif: A–E–C–D (A–E leap is the Chrono Clash identity).
"""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

SR = 48000
PI2 = 2.0 * np.pi
OUT = os.path.dirname(os.path.abspath(__file__))

# Concert pitch motif
A4, E5, C5, D5 = 440.00, 659.25, 523.25, 587.33
CS5, A5, A3, E4, C4, D4 = 554.37, 880.00, 220.00, 329.63, 261.63, 293.66


def midi_hz(n: float) -> float:
    return 440.0 * (2.0 ** ((n - 69.0) / 12.0))


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def one_pole_lp(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    if np.isscalar(cutoff):
        cutoff = np.full(len(x), float(cutoff))
    cutoff = np.clip(np.asarray(cutoff, dtype=np.float64), 40.0, SR * 0.45)
    a = np.exp(-PI2 * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1.0 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def one_pole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - one_pole_lp(x, cutoff)


def env_adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    e = np.zeros(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na, nd, nr = max(na, 1), max(nd, 1), max(nr, 1)
    ns = max(n - na - nd - nr, 0)
    i = 0
    e[i : i + na] = np.linspace(0, 1, na)
    i += na
    e[i : i + nd] = np.linspace(1, s, nd)
    i += nd
    e[i : i + ns] = s
    i += ns
    rem = n - i
    if rem > 0:
        e[i:] = np.linspace(s, 0, rem)
    return e


def saw(n: int, freq: np.ndarray | float) -> np.ndarray:
    if np.isscalar(freq):
        freq = np.full(n, float(freq))
    phase = np.cumsum(PI2 * np.asarray(freq) / SR)
    return 2.0 * (np.mod(phase, PI2) / PI2) - 1.0


def square(n: int, freq: float) -> np.ndarray:
    phase = np.cumsum(PI2 * freq / SR)
    return np.sign(np.sin(phase) + 1e-9)


def sine(n: int, freq: np.ndarray | float, phase0: float = 0.0) -> np.ndarray:
    if np.isscalar(freq):
        freq = np.full(n, float(freq))
    phase = np.cumsum(PI2 * np.asarray(freq) / SR) + phase0
    return np.sin(phase)


def noise(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


def stereo(mono: np.ndarray, width: float = 0.18, delay: int = 38) -> np.ndarray:
    left = mono.copy()
    right = np.zeros_like(mono)
    right[delay:] = mono[:-delay]
    mid = (left + right) * 0.5
    side = (left - right) * width
    return np.column_stack([mid + side, mid - side])


def place(dst: np.ndarray, src: np.ndarray, t: float, gain: float = 1.0) -> None:
    i0 = int(round(t * SR))
    if i0 >= len(dst) or i0 < 0:
        return
    n = min(len(src), len(dst) - i0)
    dst[i0 : i0 + n] += src[:n] * gain


def kick(n: int, pitch0: float = 140.0, pitch1: float = 48.0) -> np.ndarray:
    t = np.arange(n) / SR
    freq = pitch1 + (pitch0 - pitch1) * np.exp(-t / 0.035)
    body = sine(n, freq) * np.exp(-t / 0.16)
    click = one_pole_hp(np.sin(PI2 * 4200 * t) * np.exp(-t / 0.004), 2000) * 0.18
    return 0.92 * body + click


def pulse_bass(n: int, freq: float, cutoff: float) -> np.ndarray:
    raw = 0.65 * saw(n, freq) + 0.35 * sine(n, freq)
    return one_pole_lp(raw, cutoff)


def crystal_partials(n: int, f0: float, amp: float) -> np.ndarray:
    # Inharmonic glass-like stack (not a harmonic organ)
    ratios = (1.00, 2.71, 4.86, 6.55, 9.12)
    decays = (0.22, 0.14, 0.09, 0.06, 0.04)
    amps = (1.00, 0.42, 0.22, 0.12, 0.07)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, d, a in zip(ratios, decays, amps):
        out += a * np.sin(PI2 * f0 * r * t) * np.exp(-t / d)
    return out * amp * env_adsr(n, 0.004, 0.05, 0.35, 0.12)


def analog_lead(n: int, freq: float, cutoff0: float, cutoff1: float) -> np.ndarray:
    det = saw(n, freq * 1.003) * 0.5 + saw(n, freq * 0.997) * 0.5
    cut = np.linspace(cutoff0, cutoff1, n)
    tone = one_pole_lp(det + 0.25 * square(n, freq), cut)
    return tone * env_adsr(n, 0.01, 0.08, 0.55, 0.18)


def clock_tick(n: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    click = one_pole_hp(noise(n, rng), 2500) * np.exp(-t / 0.012)
    ping = sine(n, 2680) * np.exp(-t / 0.03) * 0.25
    return 0.55 * click + ping


def sidechain(audio: np.ndarray, bpm: float, depth: float = 0.35) -> np.ndarray:
    beat = 60.0 / bpm
    t = np.arange(len(audio)) / SR
    duck = 1.0 - depth * np.exp(-(t % beat) / 0.09)
    if audio.ndim == 2:
        return audio * duck[:, None]
    return audio * duck


def motif_hits(kind: str) -> list[tuple[float, float, float]]:
    """(beat, hz, dur_beats) relative to phrase start."""
    if kind == "lobby":
        return [(0.0, A4, 0.9), (1.0, E5, 1.1), (2.25, C5, 0.75), (3.1, D5, 1.6)]
    if kind == "battle":
        return [
            (0.0, A4, 0.22),
            (0.25, E5, 0.22),
            (0.5, C5, 0.22),
            (0.75, D5, 0.4),
            (1.25, A4, 0.22),
            (1.5, E5, 0.22),
            (1.75, C5, 0.22),
            (2.0, D5, 0.7),
        ]
    if kind == "victory":
        return [(0.0, A4, 0.45), (0.5, E5, 0.5), (1.05, CS5, 0.5), (1.6, A5, 1.8)]
    # defeat: same notes, lower, punched, unresolved D
    return [(0.0, D4, 0.35), (0.4, C4, 0.35), (0.8, E4, 0.45), (1.3, A3, 0.35), (1.7, D4, 1.1)]


def render_bed(kind: str) -> np.ndarray:
    rng = np.random.default_rng({"lobby": 11, "battle": 22, "victory": 33, "defeat": 44}[kind])
    if kind == "lobby":
        bpm, seconds, root = 104.0, 16.0, A3
        pad_cut, bass_cut, lead_gain = 1200.0, 380.0, 0.22
    elif kind == "battle":
        bpm, seconds, root = 124.0, 16.0, A3
        pad_cut, bass_cut, lead_gain = 2200.0, 520.0, 0.18
    elif kind == "victory":
        bpm, seconds, root = 118.0, 11.0, A3
        pad_cut, bass_cut, lead_gain = 3200.0, 600.0, 0.26
    else:
        bpm, seconds, root = 122.0, 10.0, A3 * 0.75
        pad_cut, bass_cut, lead_gain = 1600.0, 480.0, 0.20

    n = int(seconds * SR)
    beat = 60.0 / bpm
    mix = np.zeros(n)

    # Arena engine: kick + analog bass pulse
    kick_len = int(0.28 * SR)
    bass_len = int(beat * SR)
    steps = int(seconds / beat)
    for i in range(steps):
        t = i * beat
        if kind == "lobby" and i % 2:
            continue
        k = kick(kick_len, 150 if kind != "defeat" else 128, 46)
        place(mix, k, t, 0.34 if kind != "victory" else 0.28)
        if kind == "battle" or (kind == "defeat" and i % 1 == 0):
            b = pulse_bass(bass_len, root, bass_cut + (80 if i % 4 == 0 else 0))
            b *= env_adsr(len(b), 0.004, 0.06, 0.4, 0.12)
            place(mix, b, t, 0.22)
        elif kind in ("lobby", "victory") and i % 2 == 0:
            b = pulse_bass(int(beat * 2 * SR), root, bass_cut)
            b *= env_adsr(len(b), 0.02, 0.12, 0.45, 0.2)
            place(mix, b, t, 0.16)

    # Clock subdivisions (time identity)
    tick_n = int(0.05 * SR)
    tick_gain = 0.07 if kind == "lobby" else 0.09 if kind == "battle" else 0.06
    subdiv = 1 if kind == "battle" else 2
    for i in range(0, steps, subdiv):
        place(mix, clock_tick(tick_n, rng), i * beat, tick_gain)

    # Slow analog pad (filtered detuned saws) — cosmic machine bed
    pad_freq = root * (1.5 if kind == "victory" else 1.0)
    pad = analog_lead(n, pad_freq, pad_cut * 0.45, pad_cut)
    if kind == "defeat":
        pad = one_pole_lp(pad, 900)
        pad *= 0.55
    else:
        pad *= 0.28 if kind == "lobby" else 0.22
    mix += pad

    # Air / crystal dust
    dust = one_pole_hp(noise(n, rng), 2800) * 0.035
    if kind == "defeat":
        dust *= 0.6
    mix += dust * env_adsr(n, 0.2, 0.4, 0.7, 1.2)

    # Motif: crystal + analog doubling, restated
    hits = motif_hits(kind)
    phrase_beats = 4.0 if kind != "battle" else 2.5
    phrase_len = phrase_beats * beat
    repeats = max(1, int(seconds / phrase_len))
    for r in range(repeats):
        t0 = r * phrase_len + (0.12 if kind == "lobby" else 0.04)
        if t0 > seconds - 1.2:
            break
        for beat_off, hz, dur_beats in hits:
            dur = dur_beats * beat
            nn = int((dur + 0.25) * SR)
            crystal = crystal_partials(nn, hz, 0.9)
            lead = analog_lead(nn, hz, 1400, 3400 if kind != "defeat" else 1800)
            voice = 0.72 * crystal + lead_gain * lead
            if kind == "victory":
                voice += crystal_partials(nn, hz * 2, 0.28)
            if kind == "defeat":
                voice = one_pole_lp(voice, 2100)
            place(mix, voice, t0 + beat_off * beat, 0.95 if r == 0 else 0.72)

    # Time artifact: short reverse grain into phrase 2 (not sad wash)
    if kind in ("lobby", "battle"):
        g0 = int(3.2 * SR)
        g1 = min(n, g0 + int(0.22 * SR))
        mix[g0:g1] += mix[g0:g1][::-1] * 0.18

    if kind == "victory":
        mix *= env_adsr(n, 0.01, 0.2, 1.0, 2.2)
    elif kind == "defeat":
        mix *= env_adsr(n, 0.01, 0.08, 1.0, 1.4)
        # keep the last kick hits present — rematch, not fade-to-black
    else:
        mix[: int(0.04 * SR)] *= np.linspace(0, 1, int(0.04 * SR))
        mix[-int(0.25 * SR) :] *= np.linspace(1, 0.72, int(0.25 * SR))

    st = stereo(mix, width=0.16 if kind != "defeat" else 0.1, delay=32 if kind != "battle" else 24)
    st = sidechain(st, bpm, 0.22 if kind == "lobby" else 0.32)
    if kind in ("lobby", "battle"):
        fade = int(0.35 * SR)
        ramp = np.linspace(0.0, 1.0, fade)[:, None]
        st[:fade] = st[:fade] * ramp + st[-fade:] * (1.0 - ramp)
        st = st[:-fade]
    peak = float(np.max(np.abs(st)))
    if peak > 0:
        st *= 0.86 / peak
    return st


def render_swipe() -> np.ndarray:
    rng = np.random.default_rng(9)
    n = int(0.24 * SR)
    t = np.arange(n) / SR
    a = np.zeros(n)
    b = np.zeros(n)
    for f, d, g in ((2480, 0.05, 0.55), (3720, 0.065, 0.4), (5310, 0.04, 0.26), (7940, 0.03, 0.14), (11880, 0.02, 0.08)):
        a += g * np.sin(PI2 * f * t * (1.01 ** t)) * np.exp(-t / d)
    for f, d, g in ((2215, 0.065, 0.5), (3390, 0.08, 0.36), (4860, 0.045, 0.22), (7270, 0.032, 0.12)):
        b += g * np.sin(PI2 * f * t * (0.985 ** t)) * np.exp(-t / d)
    delay = int(0.026 * SR)
    b2 = np.zeros(n)
    b2[delay:] = b[: n - delay]
    strike = one_pole_hp(rng.standard_normal(n), 1800) * np.exp(-t / 0.007) * 0.2
    slide = one_pole_hp(rng.standard_normal(n), 2400)
    slide *= np.clip((t - 0.012) / 0.028, 0, 1) * np.exp(-np.clip(t - 0.02, 0, None) / 0.06) * 0.1
    mono = 0.7 * a + 0.78 * b2 + strike + slide
    left = 0.9 * mono + 0.2 * a
    right = 0.9 * mono + 0.2 * b2
    audio = np.column_stack([left, right])
    audio *= 0.86 / (np.max(np.abs(audio)) + 1e-9)
    audio[-int(0.012 * SR) :] *= np.linspace(1, 0, int(0.012 * SR))[:, None]
    return audio


def master(wav: str, mp3: str, lufs: float) -> None:
    filt = (
        f"highpass=f=75,lowpass=f=13500,"
        f"equalizer=f=1700:t=q:w=1.0:g=2.3,"
        f"equalizer=f=3200:t=q:w=1.1:g=-1.3,"
        f"loudnorm=I={lufs}:TP=-1.5:LRA=9:linear=true"
    )
    staged = wav.replace(".wav", "-m.wav")
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af", filt, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", staged]
    )
    os.replace(staged, wav)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            wav,
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            "-ar",
            str(SR),
            "-ac",
            "2",
            mp3,
        ]
    )


def main() -> None:
    jobs = (("lobby", -14.5), ("battle", -15.5), ("victory", -14.0), ("defeat", -15.0))
    for kind, lufs in jobs:
        audio = render_bed(kind)
        wav = os.path.join(OUT, f"proto-{kind}.wav")
        mp3 = os.path.join(OUT, f"proto-{kind}.mp3")
        write_wav(wav, audio)
        master(wav, mp3, lufs)
        print("wrote", mp3, os.path.getsize(mp3))
    swipe = render_swipe()
    swipe_path = os.path.join(OUT, "proto-swipe.wav")
    write_wav(swipe_path, swipe)
    print("wrote", swipe_path, os.path.getsize(swipe_path))


if __name__ == "__main__":
    main()
