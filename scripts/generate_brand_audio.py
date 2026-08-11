"""Generate PodFlow's original intro, transition and outro WAV assets."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 48_000
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "audio"


def _envelope(position: float, duration: float, fade_in: float, fade_out: float) -> float:
    attack = min(1.0, position / max(fade_in, 0.001))
    release = min(1.0, max(0.0, duration - position) / max(fade_out, 0.001))
    return max(0.0, min(attack, release)) ** 1.5


def _render(path: Path, duration: float, notes: list[tuple[float, float, float]]) -> None:
    frames: list[bytes] = []
    for index in range(round(SAMPLE_RATE * duration)):
        time = index / SAMPLE_RATE
        value = 0.0
        for frequency, start, length in notes:
            if start <= time < start + length:
                local = time - start
                gain = _envelope(local, length, 0.08, min(0.7, length / 2))
                fundamental = math.sin(2 * math.pi * frequency * local)
                overtone = 0.22 * math.sin(2 * math.pi * frequency * 2 * local)
                value += (fundamental + overtone) * gain
        sample = max(-1.0, min(1.0, value * 0.12))
        frames.append(struct.pack("<h", round(sample * 32767)))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(b"".join(frames))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    _render(
        OUTPUT_DIR / "podflow-intro.wav",
        5.0,
        [(220.0, 0.0, 2.2), (329.63, 0.7, 2.5), (493.88, 1.5, 3.1)],
    )
    _render(
        OUTPUT_DIR / "podflow-transition.wav",
        1.0,
        [(329.63, 0.0, 0.65), (493.88, 0.18, 0.75)],
    )
    _render(
        OUTPUT_DIR / "podflow-outro.wav",
        4.0,
        [(493.88, 0.0, 1.8), (329.63, 0.55, 2.1), (220.0, 1.25, 2.75)],
    )


if __name__ == "__main__":
    main()
