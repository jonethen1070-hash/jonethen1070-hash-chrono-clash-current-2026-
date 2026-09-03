#!/usr/bin/env python3
"""Original Chrono Clash MIDI sketches. Live beds are assembled by assemble_chrono_ost.py."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from mido import Message, MetaMessage, MidiFile, MidiTrack, bpm2tempo

OUT = os.path.dirname(os.path.abspath(__file__))
TPB = 480

# GM programs (no choir / voice / synth-voice)
PIANO = 0
EP = 4
CELESTA = 8
GLOCK = 9
MUSICBOX = 10
MARIMBA = 12
CHURCH_ORGAN = 19
NYLON_GUITAR = 24
FINGER_BASS = 33
SYNTH_BASS = 38
VIOLIN = 40
CELLO = 42
HARP = 46
TIMPANI = 47
STRINGS = 48
SLOW_STR = 49
SYNTH_STR = 50
BRASS = 61
FRENCH_HORN = 60
WARM_PAD = 89
POLY_PAD = 90
SWEEP_PAD = 95
CRYSTAL = 98
ATMOSPHERE = 99
BRIGHTNESS = 100


def beats(n: float) -> int:
    return int(round(n * TPB))


@dataclass
class Score:
    bpm: float
    events: list[tuple[int, int, object]] = field(default_factory=list)
    seq: int = 0

    def meta(self, tick: int, msg: MetaMessage) -> None:
        self.seq += 1
        self.events.append((tick, self.seq, msg))

    def cc(self, tick: int, ch: int, control: int, value: int) -> None:
        self.seq += 1
        self.events.append((tick, self.seq, Message("control_change", channel=ch, control=control, value=value)))

    def program(self, tick: int, ch: int, program: int) -> None:
        self.seq += 1
        self.events.append((tick, self.seq, Message("program_change", channel=ch, program=program)))

    def note(self, ch: int, start: float, dur: float, key: int, vel: int) -> None:
        on = beats(start)
        off = on + max(beats(dur), 8)
        vel = max(1, min(127, int(vel)))
        key = max(0, min(127, int(key)))
        self.seq += 1
        self.events.append((on, self.seq, Message("note_on", channel=ch, note=key, velocity=vel)))
        self.seq += 1
        self.events.append((off, self.seq, Message("note_off", channel=ch, note=key, velocity=0)))

    def setup(self, ch: int, program: int, vol: int = 90, pan: int = 64, reverb: int = 74, chorus: int = 40) -> None:
        self.program(0, ch, program)
        self.cc(0, ch, 7, vol)
        self.cc(0, ch, 10, pan)
        self.cc(0, ch, 11, 110)
        self.cc(0, ch, 91, reverb)
        self.cc(0, ch, 93, chorus)

    def save(self, path: str) -> None:
        mid = MidiFile(ticks_per_beat=TPB, type=1)
        track = MidiTrack()
        mid.tracks.append(track)
        track.append(MetaMessage("set_tempo", tempo=bpm2tempo(self.bpm), time=0))
        track.append(MetaMessage("time_signature", numerator=4, denominator=4, time=0))
        last = 0
        for tick, _seq, msg in sorted(self.events, key=lambda x: (x[0], x[1])):
            delta = max(0, tick - last)
            track.append(msg.copy(time=delta))
            last = tick
        end = max(last, beats(1))
        track.append(MetaMessage("end_of_track", time=max(0, end - last + beats(2))))
        mid.save(path)


# --- voicings ---
def chord(root: int, quality: str) -> list[int]:
    q = {
        "m": [0, 3, 7],
        "m7": [0, 3, 7, 10],
        "m9": [0, 3, 7, 10, 14],
        "M": [0, 4, 7],
        "M7": [0, 4, 7, 11],
        "add9": [0, 4, 7, 14],
        "6": [0, 4, 7, 9],
        "sus2": [0, 2, 7],
        "dim": [0, 3, 6],
    }[quality]
    return [root + i for i in q]


def pad_chord(s: Score, ch: int, start: float, dur: float, notes: list[int], vel: int) -> None:
    for i, n in enumerate(notes):
        s.note(ch, start, dur, n, vel - i * 3)


def arp(s: Score, ch: int, start: float, dur: float, notes: list[int], step: float, vel: int) -> None:
    t = start
    i = 0
    while t < start + dur - 0.01:
        s.note(ch, t, step * 0.92, notes[i % len(notes)], vel + (i % 3) * 2)
        t += step
        i += 1


def phrase(s: Score, ch: int, start: float, notes: list[tuple[float, int, float, int]]) -> None:
    """notes: (offset_beats, midi, duration, vel)"""
    for off, key, dur, vel in notes:
        s.note(ch, start + off, dur, key, vel)


def motif_lobby(s: Score, ch: int, start: float, vel: int = 78) -> None:
    # A3 C4 E4 D4  — slow, beautiful
    phrase(
        s,
        ch,
        start,
        [
            (0.0, 57, 1.5, vel),
            (1.5, 60, 1.5, vel + 4),
            (3.0, 64, 2.0, vel + 6),
            (5.0, 62, 1.5, vel),
            (6.5, 64, 1.5, vel + 2),
        ],
    )


def motif_battle(s: Score, ch: int, start: float, vel: int = 86) -> None:
    # D4 F4 A4 G4  — same contour, tense
    phrase(
        s,
        ch,
        start,
        [
            (0.0, 62, 0.5, vel),
            (0.5, 65, 0.5, vel + 4),
            (1.0, 69, 0.75, vel + 8),
            (1.75, 67, 0.75, vel + 2),
            (2.5, 65, 0.5, vel),
            (3.0, 62, 1.0, vel - 4),
        ],
    )


def motif_victory(s: Score, ch: int, start: float, vel: int = 92) -> None:
    # A4 C#5 E5 A5  — major lift
    phrase(
        s,
        ch,
        start,
        [
            (0.0, 69, 0.75, vel),
            (0.75, 73, 0.75, vel + 4),
            (1.5, 76, 1.0, vel + 6),
            (2.5, 81, 1.5, vel + 8),
        ],
    )


def motif_defeat(s: Score, ch: int, start: float, vel: int = 70) -> None:
    # retrograde of lobby motif, down an octave at the end
    phrase(
        s,
        ch,
        start,
        [
            (0.0, 64, 1.5, vel),
            (1.5, 62, 1.5, vel - 2),
            (3.0, 60, 2.0, vel - 4),
            (5.0, 57, 3.0, vel - 6),
        ],
    )


def write_lobby(path: str) -> None:
    """Mysterious, beautiful, cosmic, calm. 16 bars @ 68 BPM."""
    s = Score(68)
    s.setup(0, WARM_PAD, vol=52, pan=64, reverb=96, chorus=55)
    s.setup(1, STRINGS, vol=48, pan=54, reverb=90, chorus=30)
    s.setup(2, PIANO, vol=112, pan=62, reverb=72, chorus=18)
    s.setup(3, HARP, vol=48, pan=78, reverb=88, chorus=22)
    s.setup(4, FINGER_BASS, vol=64, pan=64, reverb=40, chorus=8)
    s.setup(5, CELESTA, vol=70, pan=86, reverb=92, chorus=35)
    s.setup(6, ATMOSPHERE, vol=36, pan=40, reverb=100, chorus=40)
    s.setup(7, CELLO, vol=72, pan=44, reverb=80, chorus=12)

    # 8-bar progression, played twice (second time a little brighter)
    prog = [
        (45, "m7"),   # Am7  A2
        (41, "M7"),   # Fmaj7
        (48, "add9"), # Cadd9
        (43, "6"),    # G6
        (45, "m9"),   # Am9
        (41, "M7"),
        (40, "m7"),   # Em7
        (45, "m"),
    ]
    for cycle, vel_add in ((0, 0), (8, 6)):
        for i, (root, q) in enumerate(prog):
            bar = (cycle + i) * 4.0
            notes = chord(root, q)
            pad_chord(s, 0, bar, 4.2, [n + 12 for n in notes[:4]], 38 + vel_add)
            pad_chord(s, 1, bar, 4.1, notes[:3], 36 + vel_add)
            s.note(4, bar, 3.4, root, 58 + vel_add)
            s.note(4, bar + 2.0, 1.6, root + 7, 44 + vel_add)
            arp_notes = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 24]
            arp(s, 3, bar, 4.0, arp_notes, 0.5, 42 + vel_add // 2)
            # crystalline sparkle on bars 1, 5, 9, 13
            if i % 4 == 0:
                s.note(5, bar + 1.0, 1.2, notes[-1] + 24, 46)
                s.note(5, bar + 2.5, 1.4, notes[1] + 24, 40)
            s.note(6, bar, 4.0, root + 19, 32)

    # Primary lobby melody — piano, bars 0–8 then answering phrase 8–16
    motif_lobby(s, 2, 0.0, 96)
    phrase(
        s,
        2,
        8.0,
        [
            (0.0, 67, 1.0, 76),
            (1.0, 69, 1.0, 80),
            (2.0, 72, 2.0, 84),
            (4.0, 71, 1.0, 78),
            (5.0, 69, 1.5, 74),
            (6.5, 67, 1.5, 70),
        ],
    )
    motif_lobby(s, 2, 16.0, 98)
    phrase(
        s,
        2,
        24.0,
        [
            (0.0, 72, 1.0, 82),
            (1.0, 74, 1.0, 84),
            (2.0, 76, 2.0, 88),
            (4.0, 74, 1.0, 80),
            (5.0, 72, 1.0, 76),
            (6.0, 69, 2.0, 72),
        ],
    )
    # cello countermelody, bars 8–16
    phrase(
        s,
        7,
        32.0,
        [
            (0.0, 45, 4.0, 58),
            (4.0, 48, 4.0, 60),
            (8.0, 52, 4.0, 62),
            (12.0, 50, 4.0, 56),
            (16.0, 45, 8.0, 52),
        ],
    )
    # last bar lands on Am so the loop is seamless
    pad_chord(s, 0, 60.0, 4.4, chord(45, "m7"), 50)
    s.note(2, 62.0, 2.0, 57, 64)
    s.save(path)


def write_battle(path: str) -> None:
    """Energetic, tense, futuristic, melodic. 32 bars @ 104 BPM."""
    s = Score(104)
    s.setup(0, SYNTH_BASS, vol=76, pan=64, reverb=36, chorus=10)
    s.setup(1, STRINGS, vol=56, pan=50, reverb=70, chorus=24)
    s.setup(2, VIOLIN, vol=112, pan=68, reverb=64, chorus=16)
    s.setup(3, POLY_PAD, vol=44, pan=80, reverb=86, chorus=44)
    s.setup(4, BRASS, vol=62, pan=40, reverb=58, chorus=12)
    s.setup(5, PIANO, vol=70, pan=60, reverb=48, chorus=8)
    s.setup(6, CRYSTAL, vol=52, pan=90, reverb=80, chorus=30)
    # electronic kit on ch 9
    s.program(0, 9, 24)
    s.cc(0, 9, 7, 50)
    s.cc(0, 9, 10, 64)
    s.cc(0, 9, 91, 30)

    # Dm | Bb | F | C | Dm | Gm | A | Dm   x4
    prog = [
        (50, "m"),    # Dm
        (46, "M"),    # Bb
        (53, "M"),    # F
        (48, "M"),    # C
        (50, "m"),
        (43, "m"),    # Gm
        (45, "M"),    # A (dominant tension)
        (50, "m"),
    ]
    for cycle in range(4):
        for i, (root, q) in enumerate(prog):
            bar = (cycle * 8 + i) * 4.0
            notes = chord(root, q)
            # pulse bass
            for beat in (0.0, 1.0, 2.0, 3.0):
                s.note(0, bar + beat, 0.45, root, 78 if beat in (0.0, 2.0) else 62)
            pad_chord(s, 1, bar, 4.0, notes, 46 + cycle * 3)
            pad_chord(s, 3, bar, 4.0, [n + 12 for n in notes[:3]], 40)
            # subtle percussion — kick on 1+3, hat on offbeats, rim on 4
            s.note(9, bar, 0.2, 36, 78)          # kick
            s.note(9, bar + 2.0, 0.2, 36, 70)
            s.note(9, bar + 1.0, 0.12, 42, 42)   # hat
            s.note(9, bar + 1.5, 0.12, 42, 34)
            s.note(9, bar + 3.0, 0.12, 42, 40)
            s.note(9, bar + 3.5, 0.12, 42, 36)
            s.note(9, bar + 3.0, 0.15, 37, 52)   # side stick
            if i % 4 == 3:
                s.note(9, bar + 2.0, 0.4, 49, 48)  # crash, restrained
            # piano stabs on the backbeat
            s.note(5, bar + 1.5, 0.35, notes[0] + 12, 58)
            s.note(5, bar + 1.5, 0.35, notes[2] + 12, 54)
            if cycle >= 1 and i % 2 == 0:
                s.note(6, bar + 0.5, 0.4, notes[2] + 24, 44)

    # Violin melody — 8-bar sentences, different from lobby
    for start, vel in ((0.0, 84), (32.0, 90), (64.0, 88), (96.0, 92)):
        motif_battle(s, 2, start, vel)
        phrase(
            s,
            2,
            start + 4.0,
            [
                (0.0, 69, 0.5, vel),
                (0.5, 70, 0.5, vel + 2),
                (1.0, 72, 1.0, vel + 4),
                (2.0, 70, 0.5, vel),
                (2.5, 69, 0.5, vel - 2),
                (3.0, 65, 1.0, vel - 4),
            ],
        )
        phrase(
            s,
            2,
            start + 8.0,
            [
                (0.0, 74, 0.75, vel + 4),
                (0.75, 72, 0.75, vel),
                (1.5, 70, 0.5, vel - 2),
                (2.0, 69, 1.0, vel),
                (3.0, 65, 1.0, vel - 2),
            ],
        )
        phrase(
            s,
            2,
            start + 12.0,
            [
                (0.0, 62, 1.0, vel - 2),
                (1.0, 65, 1.0, vel),
                (2.0, 69, 1.0, vel + 4),
                (3.0, 67, 1.0, vel),
            ],
        )
    # brass hits on the last 8 bars
    for i, root in enumerate([50, 46, 53, 48, 50, 43, 45, 50]):
        bar = 96.0 + i * 4.0
        s.note(4, bar, 0.4, root + 12, 70)
        s.note(4, bar, 0.4, root + 19, 66)
    s.save(path)


def write_victory(path: str) -> None:
    """Triumphant, powerful, emotional. 12 bars @ 92 BPM, one-shot."""
    s = Score(92)
    s.setup(0, BRASS, vol=82, pan=58, reverb=70, chorus=18)
    s.setup(1, STRINGS, vol=78, pan=70, reverb=82, chorus=28)
    s.setup(2, PIANO, vol=108, pan=64, reverb=60, chorus=10)
    s.setup(3, HARP, vol=70, pan=82, reverb=78, chorus=16)
    s.setup(4, TIMPANI, vol=80, pan=50, reverb=55, chorus=0)
    s.setup(5, FRENCH_HORN, vol=84, pan=46, reverb=74, chorus=14)
    s.setup(6, CELESTA, vol=62, pan=88, reverb=86, chorus=24)
    s.setup(7, FINGER_BASS, vol=76, pan=64, reverb=30, chorus=0)

    # A | D | E | A | F#m | D | E | A | A | D | E | A
    prog = [
        (45, "M"),
        (50, "M"),
        (52, "M"),
        (45, "M"),
        (42, "m"),
        (50, "M"),
        (52, "M"),
        (45, "M"),
        (45, "M7"),
        (50, "add9"),
        (52, "M"),
        (45, "M"),
    ]
    for i, (root, q) in enumerate(prog):
        bar = i * 4.0
        notes = chord(root, q)
        pad_chord(s, 1, bar, 4.1, notes, 62 + min(i, 6))
        s.note(7, bar, 3.5, root, 70)
        if i in (0, 3, 7, 11):
            s.note(4, bar, 0.8, 45, 86)  # timpani A
            s.note(0, bar, 1.2, root + 12, 88)
            s.note(0, bar, 1.2, root + 19, 84)
        arp(s, 3, bar, 4.0, [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24], 0.5, 50)

    motif_victory(s, 2, 0.0, 94)
    motif_victory(s, 5, 0.5, 80)
    phrase(
        s,
        2,
        8.0,
        [
            (0.0, 76, 1.0, 90),
            (1.0, 81, 1.0, 94),
            (2.0, 83, 2.0, 96),
            (4.0, 81, 1.0, 90),
            (5.0, 76, 1.0, 86),
            (6.0, 73, 2.0, 82),
        ],
    )
    # final statement + sparkle
    motif_victory(s, 2, 32.0, 98)
    s.note(2, 36.0, 4.0, 81, 96)
    s.note(1, 36.0, 6.0, 57, 80)
    s.note(1, 36.0, 6.0, 61, 78)
    s.note(1, 36.0, 6.0, 64, 76)
    s.note(1, 36.0, 6.0, 69, 74)
    s.note(6, 37.0, 2.0, 93, 70)
    s.note(6, 38.5, 2.5, 88, 64)
    s.note(4, 36.0, 1.2, 45, 90)
    s.save(path)


def write_defeat(path: str) -> None:
    """Atmospheric, emotional, restrained. 8 bars @ 54 BPM, one-shot."""
    s = Score(54)
    s.setup(0, PIANO, vol=92, pan=64, reverb=88, chorus=8)
    s.setup(1, SLOW_STR, vol=68, pan=50, reverb=96, chorus=20)
    s.setup(2, CELLO, vol=74, pan=44, reverb=84, chorus=6)
    s.setup(3, WARM_PAD, vol=58, pan=72, reverb=100, chorus=36)
    s.setup(4, ATMOSPHERE, vol=40, pan=88, reverb=100, chorus=30)

    prog = [
        (45, "m"),
        (40, "m7"),
        (41, "M7"),
        (45, "m"),
        (50, "m"),
        (43, "M"),
        (40, "m"),
        (45, "m"),
    ]
    for i, (root, q) in enumerate(prog):
        bar = i * 4.0
        notes = chord(root, q)
        pad_chord(s, 1, bar, 4.3, notes, 42)
        pad_chord(s, 3, bar, 4.3, [n + 12 for n in notes[:3]], 36)
        s.note(4, bar, 4.0, root + 24, 28)

    motif_defeat(s, 0, 0.0, 72)
    phrase(
        s,
        0,
        8.0,
        [
            (0.0, 60, 2.0, 68),
            (2.0, 64, 2.0, 70),
            (4.0, 67, 2.0, 66),
            (6.0, 64, 2.0, 62),
        ],
    )
    motif_defeat(s, 0, 16.0, 68)
    phrase(
        s,
        0,
        24.0,
        [
            (0.0, 57, 2.0, 64),
            (2.0, 55, 2.0, 60),
            (4.0, 53, 4.0, 56),
        ],
    )
    # cello shadow of the motif
    phrase(
        s,
        2,
        4.0,
        [
            (0.0, 45, 4.0, 58),
            (4.0, 47, 4.0, 54),
            (8.0, 48, 4.0, 52),
            (12.0, 45, 8.0, 48),
        ],
    )
    # last held Am
    pad_chord(s, 1, 28.0, 8.0, chord(45, "m"), 36)
    s.note(0, 30.0, 5.0, 57, 48)
    s.save(path)


def write_draw(path: str) -> None:
    """Neutral unresolved fifths, same universe. 4 bars @ 76 BPM."""
    s = Score(76)
    s.setup(0, PIANO, vol=80, pan=64, reverb=80, chorus=10)
    s.setup(1, WARM_PAD, vol=64, pan=58, reverb=92, chorus=28)
    s.setup(2, STRINGS, vol=58, pan=72, reverb=86, chorus=18)
    pad_chord(s, 1, 0.0, 16.0, [45, 52, 57], 48)
    pad_chord(s, 2, 0.0, 16.0, [52, 57, 64], 42)
    phrase(
        s,
        0,
        0.0,
        [
            (0.0, 57, 2.0, 70),
            (2.0, 64, 2.0, 68),
            (4.0, 62, 2.0, 66),
            (6.0, 64, 2.0, 64),
            (8.0, 57, 4.0, 60),
            (12.0, 52, 4.0, 52),
        ],
    )
    s.save(path)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    jobs = {
        "music-lobby.mid": write_lobby,
        "music-battle.mid": write_battle,
        "music-victory.mid": write_victory,
        "music-defeat.mid": write_defeat,
        "music-draw.mid": write_draw,
    }
    for name, fn in jobs.items():
        path = os.path.join(OUT, name)
        fn(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
