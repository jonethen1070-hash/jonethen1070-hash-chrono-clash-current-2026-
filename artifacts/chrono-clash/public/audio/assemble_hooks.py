#!/usr/bin/env python3
"""Assemble unused CC-BY scratch mixes. Live beds are assemble_chrono_ost.py."""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = "/tmp/cc-hook"
SR = 48000

JOBS = {
    "lobby": {
        "src": os.path.join(SRC, "lostsignal.mp3"),
        "start": 0.0,
        "duration": 72.0,
        "loop": True,
        "lufs": -14.0,
        "fade": 1.6,
    },
    "battle": {
        "src": os.path.join(SRC, "space_fighter_loop.mp3"),
        "start": 0.0,
        "duration": 64.0,
        "loop": True,
        "lufs": -15.0,
        "fade": 1.4,
    },
    "victory": {
        "src": os.path.join(SRC, "take_a_chance.mp3"),
        "start": 0.0,
        "duration": 37.0,
        "loop": False,
        "lufs": -14.0,
        "fade": 0.0,
    },
    "defeat": {
        "src": os.path.join(SRC, "heartbreaking.mp3"),
        "start": 6.0,
        "duration": 40.0,
        "loop": False,
        "lufs": -14.5,
        "fade": 0.0,
    },
}


def extract(src: str, dst: str, start: float, duration: float) -> None:
    subprocess.check_call(
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
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            dst,
        ]
    )


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        assert wf.getframerate() == SR
        ch = wf.getnchannels()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
    return raw.reshape(-1, ch)[:, :2]


def write_wav(path: str, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def loop_crossfade(audio: np.ndarray, fade_s: float) -> np.ndarray:
    fade = min(len(audio) // 5, int(fade_s * SR))
    if fade < 64:
        return audio
    body = audio[:-fade].copy()
    t = np.linspace(0.0, 1.0, fade, endpoint=True)[:, None]
    body[:fade] = audio[:fade] * t + audio[-fade:] * (1.0 - t)
    return body


def fade_edges(audio: np.ndarray, in_s: float = 0.04, out_s: float = 1.4) -> np.ndarray:
    n = len(audio)
    fade_in = min(n // 8, int(in_s * SR))
    fade_out = min(n // 4, int(out_s * SR))
    out = audio.copy()
    if fade_in:
        out[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    if fade_out:
        out[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None]
    return out


def master(src: str, dst: str, lufs: float) -> None:
    filt = (
        f"highpass=f=30,lowpass=f=16000,"
        f"equalizer=f=3000:t=q:w=1.0:g=-1.2,"
        f"equalizer=f=140:t=q:w=0.8:g=1.4,"
        f"loudnorm=I={lufs}:TP=-1.5:LRA=11:linear=true"
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
    raw_dir = os.path.join(OUT, "_raw")
    os.makedirs(raw_dir, exist_ok=True)
    for stem, job in JOBS.items():
        cut = os.path.join(raw_dir, f"{stem}-cut.wav")
        staged = os.path.join(raw_dir, f"{stem}-staged.wav")
        final = os.path.join(OUT, f"music-{stem}.wav")
        extract(job["src"], cut, job["start"], job["duration"])
        audio = read_wav(cut)
        if job["loop"]:
            audio = loop_crossfade(audio, job["fade"])
        else:
            audio = fade_edges(audio)
        write_wav(staged, audio)
        master(staged, final, job["lufs"])
        print(f"wrote {final} {os.path.getsize(final)} bytes")


if __name__ == "__main__":
    main()
