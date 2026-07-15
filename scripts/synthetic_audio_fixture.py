"""Create a deterministic, non-speech WAV fixture for local release checks."""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 16_000
DURATION_SECONDS = 1


def synthetic_tone_frames() -> bytes:
    """Return one second of mono 440 Hz PCM; it contains no speech or customer data."""
    return b"".join(
        struct.pack("<h", int(7_500 * math.sin(2 * math.pi * 440 * index / SAMPLE_RATE)))
        for index in range(SAMPLE_RATE * DURATION_SECONDS)
    )


def write_fixture(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(synthetic_tone_frames())
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(".release-check/synthetic-tone.wav"))
    args = parser.parse_args()
    write_fixture(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
