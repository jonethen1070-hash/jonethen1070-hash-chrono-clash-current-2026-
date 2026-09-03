#!/usr/bin/env python3
"""Chrono-Crystal Gen-2 prototype beds.

Writes ONLY into this preview folder. Does not touch public/audio/ live masters.

Gameplay is a through-composed ~96s arrangement (Force Field spine + Noizy drop),
not a short loop. Shared motif: A–E–C–D (A–E fifth leap is the identity).
"""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

SR = 48000
PI2 = 2.0 * np.pi
OUT = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(OUT, "_work")
BOX = os.environ.get(
    "CHRONO_OFDN_DIR",
    "/tmp/cc-el/box2/Of Far Different Nature - LOOP PACK #2 (CC-BY) - OGG files",
)

A2, A3, A4, A5 = 110.00, 220.00, 440.00, 880.00
E3, E4, E5 = 164.81, 329.63, 659.25
C4, C5, CS5 = 261.63, 523.25, 554.37
D3, D4, D5 = 146.83, 293.66, 587.33
G3, F3 = 196.00, 174.61

FORCE = os.path.join(BOX, "Of Far Different Nature - Force Field (CC-BY).ogg")
FLIES = os.path.join(BOX, "Of Far Different Nature - Time Flies (CC-BY).ogg")
NOIZY = os.path.join(BOX, "Of Far Different Nature - Noizy [v2] (CC-BY).ogg")
WRAGH = os.path.join(BOX, "Of Far Different Nature - Wraghstep [v2] (CC-BY).ogg")

BATTLE_BPM = 129.2


def run(cmd: list[str]) -> None:
    subprocess.check_call(cmd)


def write_wav(path: str, audio: np.ndarray, sr: int = SR) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        ch = wf.getnchannels()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
        return np.column_stack([raw, raw]) if ch == 1 else raw.reshape(-1, ch)[:, :2]


def extract(src: str, dst: str, start: float, duration: float, tempo: float = 1.0) -> None:
    af = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    if abs(tempo - 1.0) > 0.004:
        af = f"rubberband=tempo={tempo:.5f}," + af
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            src,
            "-af",
            af,
            "-c:a",
            "pcm_s16le",
            dst,
        ]
    )


def place(dst: np.ndarray, src: np.ndarray, t: float, gain: float = 1.0) -> None:
    i0 = int(round(t * SR))
    if i0 >= len(dst) or i0 < 0:
        return
    n = min(len(src), len(dst) - i0)
    dst[i0 : i0 + n] += src[:n] * gain


def fade_edges(audio: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    out = audio.copy()
    ni = min(len(out) - 2, int(fade_in * SR))
    no = min(len(out) - 2, int(fade_out * SR))
    if ni > 1:
        out[:ni] *= np.linspace(0.0, 1.0, ni)[:, None]
    if no > 1:
        out[-no:] *= np.linspace(1.0, 0.0, no)[:, None]
    return out


def lin_env(n: int, points: list[tuple[float, float]]) -> np.ndarray:
    xs = np.clip(np.array([p[0] for p in points], dtype=np.float64), 0, n - 1)
    vs = np.array([p[1] for p in points], dtype=np.float64)
    return np.interp(np.arange(n, dtype=np.float64), xs, vs)


def env_from_times(n: int, points: list[tuple[float, float]]) -> np.ndarray:
    sp = [(p[0] * SR, p[1]) for p in points]
    last_t = max(n - 1, int(sp[-1][0]))
    sp[-1] = (min(sp[-1][0], n - 1), sp[-1][1])
    if sp[0][0] != 0:
        sp = [(0.0, sp[0][1])] + sp
    if sp[-1][0] < n - 1:
        sp.append((float(n - 1), sp[-1][1]))
    return lin_env(n, sp)[:, None]


def sine(n: int, freq: np.ndarray | float, phase0: float = 0.0) -> np.ndarray:
    freq_a = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=np.float64)
    return np.sin(np.cumsum(PI2 * freq_a / SR) + phase0)


def saw(n: int, freq: np.ndarray | float) -> np.ndarray:
    freq_a = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=np.float64)
    return 2.0 * np.mod(np.cumsum(freq_a / SR), 1.0) - 1.0


def fft_band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    spec[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(spec, n=len(x))
    return y.astype(np.float64)


def supersaw(n: int, freq: float, voices: int = 5, detune: float = 0.010) -> np.ndarray:
    out = np.zeros(n)
    spreads = np.linspace(-detune, detune, voices)
    for i, d in enumerate(spreads):
        out += saw(n, freq * (1.0 + d))
    return out / voices


def analog_lead(n: int, freq: float, bright: float = 0.55) -> np.ndarray:
    body = supersaw(n, freq, 5, 0.009)
    body += 0.22 * sine(n, freq)
    # brightness via spectral tilt, not a washed reverb tail
    air = fft_band(body, 900.0, 5200.0)
    low = fft_band(body, 180.0, 1400.0)
    t = np.arange(n) / SR
    env = (1.0 - np.exp(-t / 0.012)) * np.exp(-t / (0.42 + 0.25 * bright))
    env = np.clip(env, 0, 1)
    # sustain plateau
    hold = np.clip((0.18 - t) / 0.08, 0, 1) * 0.0 + np.clip(1.0 - np.maximum(t - (n / SR - 0.16), 0) / 0.16, 0, 1)
    tone = (0.62 + 0.38 * bright) * air + (0.55 - 0.15 * bright) * low
    return tone * env * hold


def crystal_attack(n: int, f0: float) -> np.ndarray:
    # inharmonic glass, not a harmonic bell / coin
    ratios = (1.00, 2.63, 4.41, 6.92, 9.55)
    decays = (0.11, 0.07, 0.045, 0.03, 0.018)
    amps = (1.00, 0.38, 0.18, 0.10, 0.05)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, d, a in zip(ratios, decays, amps):
        out += a * np.sin(PI2 * f0 * r * t) * np.exp(-t / d)
    return out * (1.0 - np.exp(-t / 0.002))


def motif_note(freq: float, dur: float, bright: float, crystal: float) -> np.ndarray:
    n = int((dur + 0.05) * SR)
    lead = analog_lead(n, freq, bright)
    att = crystal_attack(n, freq)
    mono = 0.78 * lead + crystal * att
    delay = 28
    left = mono.copy()
    right = np.zeros_like(mono)
    right[delay:] = mono[:-delay]
    mid = (left + right) * 0.5
    side = (left - right) * 0.22
    return np.column_stack([mid + side, mid - side])


def render_motif_phrase(kind: str, bpm: float, bright: float) -> np.ndarray:
    beat = 60.0 / bpm
    if kind == "lobby":
        hits = [(0.00, A4, 0.85), (1.00, E5, 1.05), (2.20, C5, 0.70), (3.05, D5, 1.55)]
        length = 5.0 * beat
        crystal = 0.22
    elif kind == "battle":
        hits = [(0.00, A4, 0.28), (0.50, E5, 0.28), (1.00, C5, 0.28), (1.50, D5, 0.70)]
        length = 4.0 * beat
        crystal = 0.16
    elif kind == "battle_wide":
        hits = [(0.00, A3, 0.9), (1.00, E4, 1.0), (2.25, C4, 0.7), (3.10, D4, 1.4)]
        length = 8.0 * beat
        crystal = 0.20
    elif kind == "drop":
        hits = [(0.00, A4, 0.22), (0.25, E5, 0.22), (0.50, C5, 0.22), (0.75, D5, 0.45), (1.50, A5, 0.9)]
        length = 4.0 * beat
        crystal = 0.18
    elif kind == "victory":
        hits = [(0.00, A4, 0.40), (0.50, E5, 0.45), (1.05, CS5, 0.50), (1.65, A5, 1.9)]
        length = 4.2 * beat
        crystal = 0.28
        bright = 0.85
    else:
        hits = [(0.00, D4, 0.32), (0.40, C4, 0.32), (0.85, E4, 0.40), (1.35, A3, 0.35), (1.80, D4, 1.05)]
        length = 4.6 * beat
        crystal = 0.14
        bright = 0.42
    n = int(length * SR) + 8
    buf = np.zeros((n, 2))
    for beat_off, hz, dur_beats in hits:
        note = motif_note(hz, dur_beats * beat, bright, crystal)
        place(buf, note, beat_off * beat, 1.0)
    return buf


def moving_bass(seconds: float, bpm: float) -> np.ndarray:
    """Bass motion under the bed — A–G–F–E then A–E–C–D, filtered and dry."""
    n = int(seconds * SR)
    beat = 60.0 / bpm
    pattern = [A2, G3 / 2, F3 / 2, E3, A2, E3, C4 / 2, D3]
    buf = np.zeros(n)
    step = 2.0 * beat
    t = 0.0
    i = 0
    while t < seconds - 0.05:
        freq = pattern[i % len(pattern)]
        nn = int(step * SR)
        tone = 0.72 * sine(nn, freq) + 0.28 * saw(nn, freq)
        tone = fft_band(tone, 55.0, 280.0)
        env = np.concatenate(
            [
                np.linspace(0, 1, max(1, int(0.01 * SR))),
                np.ones(max(1, nn - int(0.12 * SR))),
                np.linspace(1, 0.15, max(1, int(0.11 * SR))),
            ]
        )[:nn]
        buf_slice = tone * env
        i0 = int(t * SR)
        nput = min(len(buf_slice), n - i0)
        if nput > 0:
            buf[i0 : i0 + nput] += buf_slice[:nput]
        t += step
        i += 1
    delay = 18
    st = np.column_stack([buf, np.roll(buf, delay)])
    return st * 0.16


def wobble_bass(seconds: float, bpm: float) -> np.ndarray:
    """Tasteful dubstep-ish wobble in A, used only across the drop."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    lfo_hz = (bpm / 60.0) * 2.0  # 8ths
    # two-bar pattern: A2 then E2
    bar = 4.0 * (60.0 / bpm)
    freq = np.where((t % (2 * bar)) < bar, A2, E3 / 2)
    raw = 0.55 * saw(n, freq) + 0.25 * saw(n, freq * 1.005) + 0.20 * sine(n, freq)
    # time-varying brightness via spectral blend, not a huge reverb
    dark = fft_band(raw, 50.0, 420.0)
    mid = fft_band(raw, 80.0, 1600.0)
    lfo = 0.5 + 0.5 * np.sin(PI2 * lfo_hz * t)
    # open the filter on off-beats of the drop, not a constant growl
    gate = np.clip(np.sin(PI2 * (bpm / 60.0) * 0.5 * t), 0, 1) ** 1.4
    mono = (0.75 * dark + 0.35 * mid * lfo) * (0.55 + 0.45 * gate)
    # hard close, phone-friendly — no sub rumble
    mono = fft_band(mono, 70.0, 2400.0)
    return np.column_stack([mono, np.roll(mono, 22)]) * 0.22


def riser(seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    rng = np.random.default_rng(21)
    noise = rng.standard_normal(n)
    # rising band
    spec = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    t = np.arange(n) / SR
    hi = 400.0 + 7800.0 * (t / seconds) ** 1.35
    # per-bin mask approximated by irfft of increasing HP
    # cheaper: several stacked HP noise envelopes
    mono = np.zeros(n)
    for lo, hi_f, g in ((200, 800, 0.18), (600, 2400, 0.28), (1800, 7000, 0.35), (4000, 12000, 0.22)):
        band = fft_band(noise, lo, hi_f)
        ramp = (t / seconds) ** (0.7 + lo / 8000)
        mono += g * band * ramp
    env = (t / seconds) ** 1.1
    mono *= env / (np.max(np.abs(mono)) + 1e-9)
    # snare-ish ticks in last 0.9s
    tick_n = int(0.03 * SR)
    last = seconds - 0.9
    for k in range(8):
        tt = last + k * (0.9 / 8)
        click = fft_band(rng.standard_normal(tick_n), 1800, 9000)
        click *= np.exp(-np.arange(tick_n) / (0.012 * SR)) * (0.12 + 0.04 * k)
        i0 = int(tt * SR)
        nput = min(tick_n, n - i0)
        if nput > 0:
            mono[i0 : i0 + nput] += click[:nput]
    return np.column_stack([mono, np.roll(mono, 31)]) * 0.55


def drop_impact() -> np.ndarray:
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    body = sine(n, 92.0 + 70.0 * np.exp(-t / 0.04)) * np.exp(-t / 0.18)
    click = fft_band(np.random.default_rng(3).standard_normal(n), 1200, 8000) * np.exp(-t / 0.012) * 0.35
    crash = fft_band(np.random.default_rng(4).standard_normal(n), 600, 6500) * np.exp(-t / 0.09) * 0.22
    mono = 0.9 * body + click + crash
    return np.column_stack([mono, np.roll(mono, 14)]) * 0.7


def loop_crossfade(audio: np.ndarray, fade_s: float = 1.4) -> np.ndarray:
    fade = min(len(audio) // 6, int(fade_s * SR))
    if fade < 64:
        return audio
    body = audio[:-fade].copy()
    ramp = np.linspace(0.0, 1.0, fade)[:, None]
    body[:fade] = audio[:fade] * ramp + audio[-fade:] * (1.0 - ramp)
    return body


def mix_to(length: float) -> np.ndarray:
    return np.zeros((int(length * SR), 2))


def overlay_motif(dst: np.ndarray, kind: str, bpm: float, t0: float, t1: float, gain: float, bright: float) -> None:
    phrase = render_motif_phrase(kind, bpm, bright)
    dur = len(phrase) / SR
    t = t0
    while t + 0.2 < t1 and t * SR < len(dst):
        place(dst, phrase, t, gain)
        t += dur


def assemble_lobby() -> np.ndarray:
    # Time Flies hook lands ~32s. Start just before so the melody is immediate.
    path = os.path.join(WORK, "lobby_bed.wav")
    extract(FLIES, path, start=31.2, duration=42.0)
    bed = fade_edges(read_wav(path), 0.04, 0.05)
    bed = loop_crossfade(bed, 1.35)
    n = len(bed)
    seconds = n / SR
    motif = mix_to(seconds)
    overlay_motif(motif, "lobby", 123.0, 0.08, seconds - 1.0, gain=0.34, bright=0.62)
    # extra first-hook doubling so the identity is memorable in <2s
    hook = render_motif_phrase("lobby", 123.0, 0.7)
    place(motif, hook, 0.06, 0.18)
    mix = 0.92 * bed + motif
    return mix


def assemble_battle() -> np.ndarray:
    """Through-composed ~96s. Force Field development + arranged drop. Does not loop."""
    seconds = 96.0
    mix = mix_to(seconds)

    ff_path = os.path.join(WORK, "ff.wav")
    extract(FORCE, ff_path, start=0.0, duration=101.0)
    ff = read_wav(ff_path)
    # Force Field already has intro / groove / breakdown / peaks. Ride it.
    ff_gain = env_from_times(
        len(mix),
        [
            (0.0, 0.72),
            (14.0, 0.88),
            (30.5, 0.90),
            (32.0, 0.55),  # breakdown
            (35.6, 0.22),  # duck under drop
            (51.5, 0.28),
            (54.0, 0.86),  # return
            (72.0, 0.90),
            (84.0, 0.94),
            (93.5, 0.90),
            (96.0, 0.0),
        ],
    )
    place(mix, ff[: len(mix)] * ff_gain, 0.0, 1.0)

    # Bass movement during the groove (before the drop)
    bass = moving_bass(32.0, BATTLE_BPM)
    bass = fade_edges(bass, 0.4, 1.2)
    place(mix, bass, 8.0, 0.55)

    # Build / transition into the drop (Force Field dip ~32s)
    place(mix, riser(4.2), 31.6, 1.0)

    # DROP ~36s: Noizy's actual drop (energy hits at 16s in source)
    nz_path = os.path.join(WORK, "noizy_drop.wav")
    # Native ~138 BPM half-time feel → 129.2 (small stretch)
    extract(NOIZY, nz_path, start=15.6, duration=18.5, tempo=129.2 / 138.0)
    noizy = fade_edges(read_wav(nz_path), 0.08, 1.4)
    place(mix, noizy, 35.85, 0.82)
    place(mix, drop_impact(), 35.85, 1.0)
    wob = fade_edges(wobble_bass(16.5, BATTLE_BPM), 0.05, 1.0)
    place(mix, wob, 35.9, 0.85)

    # Motif development across the form
    overlay_motif(mix, "battle_wide", BATTLE_BPM, 0.4, 15.5, gain=0.30, bright=0.48)
    overlay_motif(mix, "battle", BATTLE_BPM, 15.5, 31.5, gain=0.26, bright=0.58)
    overlay_motif(mix, "drop", BATTLE_BPM, 36.05, 51.5, gain=0.28, bright=0.72)
    overlay_motif(mix, "battle_wide", BATTLE_BPM, 54.0, 72.0, gain=0.27, bright=0.55)
    overlay_motif(mix, "battle", BATTLE_BPM, 72.0, 90.5, gain=0.29, bright=0.66)
    # closing statement
    last = render_motif_phrase("lobby", BATTLE_BPM, 0.74)
    place(mix, last, 90.8, 0.36)

    mix = fade_edges(mix, 0.02, 2.4)
    return mix


def assemble_victory() -> np.ndarray:
    path = os.path.join(WORK, "vic_bed.wav")
    extract(FORCE, path, start=75.2, duration=12.4)
    bed = fade_edges(read_wav(path), 0.01, 0.05)
    seconds = len(bed) / SR
    mix = 0.88 * bed
    overlay_motif(mix, "victory", 118.0, 0.05, min(seconds, 8.5), gain=0.40, bright=0.88)
    # crystalline lift on the final A
    sparkle = motif_note(A5, 1.8, 0.9, 0.40)
    place(mix, sparkle, 6.6, 0.45)
    mix = fade_edges(mix, 0.01, 1.8)
    # hard stop — payoff, not a loop
    return mix


def assemble_defeat() -> np.ndarray:
    path = os.path.join(WORK, "def_bed.wav")
    extract(WRAGH, path, start=39.5, duration=16.8)
    bed = fade_edges(read_wav(path), 0.02, 0.08)
    seconds = len(bed) / SR
    mix = 0.90 * bed
    overlay_motif(mix, "defeat", 136.0, 0.08, seconds - 1.2, gain=0.28, bright=0.40)
    mix = fade_edges(mix, 0.02, 1.3)
    return mix


def render_swipe() -> np.ndarray:
    """Two hard crystalline gems striking, then a short bright shimmer.

    Not a coin ping, candy bling, cartoon boing, or generic whoosh.
    """
    rng = np.random.default_rng(14)
    n = int(0.22 * SR)
    t = np.arange(n) / SR

    def gem(modes: list[tuple[float, float, float]], glide: float) -> np.ndarray:
        out = np.zeros(n)
        for f0, decay, amp in modes:
            inst = f0 * (glide ** t)
            out += amp * np.sin(np.cumsum(PI2 * inst / SR)) * np.exp(-t / decay)
        return out

    # Physical quartz/glass cluster: inharmonic, dominant energy 2–6 kHz.
    # Avoid a long 3.3 kHz coin-like ring as the lead partial.
    gem_a = gem(
        [
            (2140, 0.055, 0.62),
            (2680, 0.040, 0.28),
            (4120, 0.048, 0.42),
            (5380, 0.032, 0.22),
            (7460, 0.022, 0.12),
            (10240, 0.014, 0.06),
        ],
        glide=1.008,
    )
    gem_b = gem(
        [
            (1965, 0.062, 0.58),
            (2910, 0.044, 0.26),
            (4580, 0.050, 0.38),
            (6010, 0.030, 0.16),
            (8120, 0.018, 0.09),
            (11480, 0.012, 0.05),
        ],
        glide=0.991,
    )

    # Second stone answers 19ms later (two objects colliding)
    delay = int(0.019 * SR)
    b_shift = np.zeros(n)
    b_shift[delay:] = gem_b[: n - delay]

    # Hard contact transients — stone faces, not a sine chirp
    def strike(offset: float, seed: int) -> np.ndarray:
        x = rng.standard_normal(n)
        x = fft_band(x, 1600.0, 9800.0)
        tt = np.clip(t - offset, 0, None)
        return x * np.exp(-tt / 0.0038) * (t >= offset)

    impact = 0.34 * strike(0.0, 1) + 0.32 * strike(0.019, 2)

    # Short bright shimmer (~90ms), not a lingering chime
    shimmer_n = np.random.default_rng(8).standard_normal(n)
    shimmer = fft_band(shimmer_n, 5200.0, 13500.0)
    sh_env = np.clip((t - 0.016) / 0.012, 0, 1) * np.exp(-np.clip(t - 0.022, 0, None) / 0.055)
    shimmer *= sh_env * 0.16

    # Micro roughness while facets slide (~40ms)
    grit = fft_band(rng.standard_normal(n), 2800.0, 9000.0)
    grit *= np.clip((t - 0.008) / 0.018, 0, 1) * np.exp(-np.clip(t - 0.02, 0, None) / 0.04) * 0.07

    mono = 0.72 * gem_a + 0.78 * b_shift + impact + shimmer + grit
    left = 0.86 * mono + 0.22 * gem_a
    right = 0.86 * mono + 0.22 * b_shift
    audio = np.column_stack([left, right])
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio *= 0.90 / peak
    audio[:6] *= np.linspace(0.0, 1.0, 6)[:, None]
    audio[-int(0.018 * SR) :] *= np.linspace(1.0, 0.0, int(0.018 * SR))[:, None]
    return audio


def master(wav: str, mp3: str, lufs: float, extra: str = "") -> None:
    # Close, punchy, clear, phone-speaker forward. No washed hall reverb.
    filt = (
        "highpass=f=82,lowpass=f=13800,"
        "equalizer=f=220:t=q:w=0.8:g=-2.0,"
        "equalizer=f=1650:t=q:w=0.9:g=2.4,"
        "equalizer=f=3100:t=q:w=1.15:g=-1.6,"
        "equalizer=f=6800:t=q:w=1.3:g=-2.2,"
        "acompressor=threshold=-16dB:ratio=2.4:attack=7:release=70:makeup=1.5,"
        "crystalizer=i=1.2,"
        "extrastereo=m=1.12,"
        f"loudnorm=I={lufs}:TP=-1.3:LRA=8:linear=true"
    )
    if extra:
        filt = extra + "," + filt
    staged = wav.replace(".wav", "-m.wav")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af", filt, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s16le", staged])
    os.replace(staged, wav)
    run(
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
            "256k",
            "-ar",
            "48000",
            "-ac",
            "2",
            mp3,
        ]
    )


def peak_normalize(audio: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = float(np.max(np.abs(audio)))
    if m > 0:
        audio = audio * (peak / m)
    return audio


def main() -> None:
    os.makedirs(WORK, exist_ok=True)
    jobs = (
        ("lobby", assemble_lobby, -14.2),
        ("battle", assemble_battle, -15.2),
        ("victory", assemble_victory, -14.0),
        ("defeat", assemble_defeat, -14.6),
    )
    for kind, fn, lufs in jobs:
        print("assembling", kind, flush=True)
        audio = peak_normalize(fn())
        wav = os.path.join(OUT, f"proto-{kind}.wav")
        mp3 = os.path.join(OUT, f"proto-{kind}.mp3")
        write_wav(wav, audio)
        master(wav, mp3, lufs)
        print("  wrote", mp3, os.path.getsize(mp3), "dur", f"{len(audio)/SR:.1f}s", flush=True)

    swipe = render_swipe()
    swipe_path = os.path.join(OUT, "proto-swipe.wav")
    write_wav(swipe_path, swipe)
    # Dry, close crystal — no loudnorm wash. Light presence only.
    staged = os.path.join(WORK, "swipe-m.wav")
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            swipe_path,
            "-af",
            "highpass=f=400,lowpass=f=15000,equalizer=f=2400:t=q:w=1.0:g=1.8,equalizer=f=5200:t=q:w=1.2:g=1.2,equalizer=f=3300:t=q:w=2.0:g=-2.5",
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            staged,
        ]
    )
    os.replace(staged, swipe_path)
    print("wrote", swipe_path, os.path.getsize(swipe_path), flush=True)


if __name__ == "__main__":
    main()
