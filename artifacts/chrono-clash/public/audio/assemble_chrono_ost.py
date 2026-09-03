#!/usr/bin/env python3
"""Assemble Chrono Clash electronic beds from one OFDN loop-pack family.

Lobby    Cruiser — stylish, slightly mysterious electronic
Gameplay Force Field — energetic groove with a real intro → drop
Victory  What We Do — rewarding, catchy, not childish
Defeat   Wraghstep peak — dark rematch energy, never sad
Draw     Voltage — unresolved electronic sting

All tracks: Of Far Different Nature, CC-BY 4.0
https://fardifferent.carrd.co/
"""
from __future__ import annotations

import os
import subprocess
import wave

import numpy as np

OUT = os.path.dirname(os.path.abspath(__file__))
EL = os.environ.get("CHRONO_EL_DIR", "/tmp/cc-el")
BOX = os.path.join(EL, "box2", "Of Far Different Nature - LOOP PACK #2 (CC-BY) - OGG files")
SR = 48000

JOBS = {
    "lobby": {
        "src": os.path.join(BOX, "Of Far Different Nature - Cruiser (CC-BY).ogg"),
        "start": 0.0,
        "duration": 48.6,
        "loop": True,
        "lufs": -15.5,
        "loop_start": 0.0,
    },
    "battle": {
        "src": os.path.join(BOX, "Of Far Different Nature - Force Field (CC-BY).ogg"),
        "start": 0.0,
        "duration": 90.0,
        "loop": True,
        "lufs": -16.5,
        "loop_start": 8.0,
        "loop_end": 72.0,
    },
    "victory": {
        "src": os.path.join(BOX, "Of Far Different Nature - What We Do (CC-BY).ogg"),
        "start": 16.0,
        "duration": 14.0,
        "loop": False,
        "lufs": -14.5,
    },
    "defeat": {
        "src": os.path.join(BOX, "Of Far Different Nature - Wraghstep [v2] (CC-BY).ogg"),
        "start": 36.0,
        "duration": 16.5,
        "loop": False,
        "lufs": -15.0,
    },
    "draw": {
        "src": os.path.join(BOX, "Of Far Different Nature - Voltage (CC-BY).ogg"),
        "start": 0.0,
        "duration": 16.0,
        "loop": False,
        "lufs": -15.5,
    },
}


def run(cmd: list[str]) -> None:
    subprocess.check_call(cmd)


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
        audio = np.column_stack([raw, raw]) if ch == 1 else raw.reshape(-1, ch)[:, :2]
    return audio, sr


def write_wav(path: str, audio: np.ndarray, sr: int = SR) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def extract_bed(src: str, dst: str, start: float, duration: float) -> None:
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
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            dst,
        ]
    )


def loop_crossfade(
    audio: np.ndarray,
    fade_s: float = 1.4,
    loop_start: float = 0.0,
    loop_end: float | None = None,
) -> np.ndarray:
    """Blend the loop tail toward the loop-in so WebAudio wrap is seamless.

    The intro / first pass of the loop-in stays clean. Only the last `fade_s`
    seconds before loop_end are rewritten to match loop_start.
    """
    start = int(loop_start * SR)
    end = int(loop_end * SR) if loop_end is not None else len(audio)
    end = min(end, len(audio))
    fade = min((end - start) // 6, int(fade_s * SR))
    if fade < 64 or start + fade > end:
        return audio
    out = audio.copy()
    ramp = np.linspace(0.0, 1.0, fade, endpoint=True)[:, None]
    out[end - fade : end] = audio[end - fade : end] * (1.0 - ramp) + audio[start : start + fade] * ramp
    return out


def fade_io(audio: np.ndarray, fade_in: float = 0.03, fade_out: float = 1.8) -> np.ndarray:
    out = audio.copy()
    n_in = min(len(out) // 8, int(fade_in * SR))
    n_out = min(len(out) // 3, int(fade_out * SR))
    if n_in > 8:
        out[:n_in] *= np.linspace(0.0, 1.0, n_in)[:, None]
    if n_out > 8:
        out[-n_out:] *= np.linspace(1.0, 0.0, n_out)[:, None]
    return out


def master(src: str, dst: str, lufs: float) -> None:
    # Phone-first: move energy out of inaudible sub and into the 0.6–2.5 kHz
    # pocket speakers actually reproduce. Cut fatiguing air, then loudnorm.
    filt = (
        "highpass=f=100:poles=2,"
        "equalizer=f=70:t=q:w=0.6:g=-6.0,"
        "equalizer=f=140:t=q:w=0.7:g=-2.2,"
        "equalizer=f=650:t=q:w=0.8:g=2.8,"
        "equalizer=f=1400:t=q:w=0.7:g=3.6,"
        "equalizer=f=2400:t=q:w=0.9:g=1.4,"
        "equalizer=f=3800:t=q:w=1.0:g=-1.8,"
        "equalizer=f=7500:t=q:w=1.1:g=-3.5,"
        "lowpass=f=11500,"
        f"loudnorm=I={lufs}:TP=-1.8:LRA=10:linear=true"
    )
    run(
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


def write_mp3(wav: str, mp3: str) -> None:
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
            str(SR),
            "-ac",
            "2",
            mp3,
        ]
    )


def main() -> None:
    raw = os.path.join(OUT, "_raw")
    os.makedirs(raw, exist_ok=True)
    for stem, job in JOBS.items():
        if not os.path.exists(job["src"]):
            raise SystemExit(f"Missing licensed bed {job['src']}")
        bed_wav = os.path.join(raw, f"{stem}-bed.wav")
        extract_bed(job["src"], bed_wav, job["start"], job["duration"])
        audio, sr = read_wav(bed_wav)
        if sr != SR:
            raise SystemExit(f"{stem} sample rate {sr}")
        if job["loop"]:
            audio = loop_crossfade(
                audio,
                1.5,
                float(job.get("loop_start") or 0.0),
                job.get("loop_end"),
            )
            if stem == "battle":
                audio = fade_io(audio, 0.02, 0.04)
        else:
            audio = fade_io(audio, 0.02, 1.6 if stem != "draw" else 1.2)
        staged = os.path.join(raw, f"{stem}-staged.wav")
        write_wav(staged, audio)
        final_wav = os.path.join(OUT, f"music-{stem}.wav")
        final_mp3 = os.path.join(OUT, f"music-{stem}.mp3")
        master(staged, final_wav, job["lufs"])
        write_mp3(final_wav, final_mp3)
        print(f"wrote {final_wav} {os.path.getsize(final_wav)}  {final_mp3} {os.path.getsize(final_mp3)}")


if __name__ == "__main__":
    main()
