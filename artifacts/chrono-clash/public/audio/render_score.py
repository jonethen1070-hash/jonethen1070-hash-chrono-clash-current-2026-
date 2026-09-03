#!/usr/bin/env python3
"""Render Chrono Clash MIDI score through GeneralUser GS and master to WAV."""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

from compose_score import OUT, main as compose

SF2 = os.environ.get("CHRONO_SOUNDFONT", "/tmp/sf2/GeneralUser-GS.sf2")
SR = 48000
STEMS = ("lobby", "battle", "victory", "defeat", "draw")
LOOPING = {"lobby", "battle"}


def render_midi(mid: str, wav: str) -> None:
    cmd = [
        "fluidsynth",
        "-ni",
        "-q",
        "-F",
        wav,
        "-r",
        str(SR),
        "-g",
        "0.55",
        "-R",
        "1",
        "-C",
        "1",
        "-o",
        "synth.reverb.active=1",
        "-o",
        "synth.reverb.room-size=0.82",
        "-o",
        "synth.reverb.damp=0.35",
        "-o",
        "synth.reverb.width=0.9",
        "-o",
        "synth.reverb.level=0.72",
        "-o",
        "synth.chorus.active=1",
        "-o",
        "synth.chorus.nr=3",
        "-o",
        "synth.chorus.level=0.42",
        "-o",
        "synth.chorus.speed=0.28",
        "-o",
        "synth.chorus.depth=6.5",
        SF2,
        mid,
    ]
    subprocess.check_call(cmd)


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        n = wf.getnframes()
        sw = wf.getsampwidth()
        raw = wf.readframes(n)
    if sw == 2:
        data = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    else:
        raise RuntimeError(f"unsupported sample width {sw}")
    if ch == 1:
        stereo = np.column_stack([data, data])
    else:
        stereo = data.reshape(-1, ch)[:, :2]
    return stereo, sr


def write_wav(path: str, audio: np.ndarray, sr: int) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def highpass(audio: np.ndarray, sr: int, cutoff: float = 32.0) -> np.ndarray:
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / sr
    a = rc / (rc + dt)
    out = np.zeros_like(audio)
    prev_x = audio[0].copy()
    prev_y = np.zeros(audio.shape[1])
    for i in range(len(audio)):
        prev_y = a * (prev_y + audio[i] - prev_x)
        prev_x = audio[i]
        out[i] = prev_y
    return out


def one_pole_low(audio: np.ndarray, sr: int, cutoff: float) -> np.ndarray:
    x = np.exp(-2 * np.pi * cutoff / sr)
    out = np.zeros_like(audio)
    y = np.zeros(audio.shape[1])
    for i in range(len(audio)):
        y = (1 - x) * audio[i] + x * y
        out[i] = y
    return out


def trim_silence(audio: np.ndarray, sr: int, tail_keep: float = 1.6) -> np.ndarray:
    rms = np.sqrt(np.mean(audio**2, axis=1))
    thresh = max(0.0015, float(np.max(rms)) * 0.004)
    active = np.where(rms > thresh)[0]
    if active.size == 0:
        return audio
    start = max(0, int(active[0]) - int(0.02 * sr))
    end = min(len(audio), int(active[-1]) + int(tail_keep * sr))
    return audio[start:end]


def loop_crossfade(audio: np.ndarray, sr: int, fade_s: float = 1.8) -> np.ndarray:
    fade = min(len(audio) // 5, int(fade_s * sr))
    if fade < 64:
        return audio
    body = audio[:-fade].copy()
    t = np.linspace(0.0, 1.0, fade, endpoint=True)[:, None]
    body[:fade] = audio[:fade] * t + audio[-fade:] * (1.0 - t)
    return body


def stereo_width(audio: np.ndarray, width: float = 1.18) -> np.ndarray:
    mid = (audio[:, 0] + audio[:, 1]) * 0.5
    side = (audio[:, 0] - audio[:, 1]) * 0.5 * width
    left = mid + side
    right = mid - side
    return np.column_stack([left, right])


def peak_normalize(audio: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = float(np.max(np.abs(audio)))
    if m < 1e-8:
        return audio
    return audio * (peak / m)


def ffmpeg_master(src: str, dst: str, lufs: float = -14.0) -> None:
    filt = (
        f"highpass=f=30,lowpass=f=15500,"
        f"equalizer=f=220:t=q:w=1.1:g=-1.5,"
        f"equalizer=f=3200:t=q:w=1.0:g=-2.0,"
        f"equalizer=f=120:t=q:w=0.8:g=1.8,"
        f"equalizer=f=6500:t=q:w=1.2:g=1.2,"
        f"loudnorm=I={lufs}:TP=-1.5:LRA=10:linear=true"
    )
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src,
            "-af",
            filt,
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            dst,
        ]
    )


def main() -> None:
    compose()
    raw_dir = os.path.join(OUT, "_raw")
    os.makedirs(raw_dir, exist_ok=True)
    for stem in STEMS:
        mid = os.path.join(OUT, f"music-{stem}.mid")
        raw = os.path.join(raw_dir, f"music-{stem}.wav")
        staged = os.path.join(raw_dir, f"music-{stem}-staged.wav")
        final = os.path.join(OUT, f"music-{stem}.wav")
        render_midi(mid, raw)
        audio, sr = read_wav(raw)
        if sr != SR:
            raise RuntimeError(f"{stem} sample rate {sr}")
        audio = highpass(audio, sr)
        audio = one_pole_low(audio, sr, 14000)
        audio = trim_silence(audio, sr, tail_keep=2.2 if stem in ("victory", "defeat", "draw") else 0.35)
        if stem in LOOPING:
            audio = loop_crossfade(audio, sr, 1.6)
        audio = stereo_width(audio, 1.16 if stem != "battle" else 1.08)
        audio = peak_normalize(audio, 0.86)
        write_wav(staged, audio, sr)
        lufs = -15.0 if stem == "battle" else -14.0
        ffmpeg_master(staged, final, lufs=lufs)
        print(f"mastered {final} {os.path.getsize(final)} bytes")


if __name__ == "__main__":
    main()
