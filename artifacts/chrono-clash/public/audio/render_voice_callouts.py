#!/usr/bin/env python3
"""Render short premium human VO for Chrono Clash gameplay callouts."""

from __future__ import annotations

import asyncio
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "audio"
VOICE = "en-US-AndrewNeural"

LINES = (
    ("locked", "Locked.", "-12%", "-4Hz", "+4%"),
    ("combo", "Combo!", "+6%", "+2Hz", "+8%"),
    ("ultimate", "Ultimate!", "-2%", "-1Hz", "+14%"),
)


async def synth(name: str, text: str, rate: str, pitch: str, volume: str, dest: Path) -> None:
    comm = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, volume=volume)
    await comm.save(str(dest))


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = OUT / "_voice_raw"
    raw.mkdir(exist_ok=True)
    for name, text, rate, pitch, volume in LINES:
        mp3 = raw / f"{name}.mp3"
        await synth(name, text, rate, pitch, volume, mp3)
        wav = OUT / f"voice-{name}.wav"
        mp3_out = OUT / f"voice-{name}.mp3"
        import subprocess

        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(mp3),
                "-af",
                "highpass=f=90,lowpass=f=10500,loudnorm=I=-16:TP=-1.4:LRA=8,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.04",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-c:a",
                "pcm_s16le",
                str(wav),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.check_call(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(wav),
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(mp3_out),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(name, wav.stat().st_size, mp3_out.stat().st_size)


if __name__ == "__main__":
    asyncio.run(main())
