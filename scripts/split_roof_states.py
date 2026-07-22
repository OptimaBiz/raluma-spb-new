#!/usr/bin/env python3
"""Split the supplied vertical roof-state sheet into browser-safe image files.

The source file contains three equal-height photos in this order:
closed, half-open, open.  The generated files are build artifacts placed in
public/ so Astro copies them to the deployed site.
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/images/pergolas/roof-states.webp"
OUTPUTS = (
    ROOT / "public/images/pergolas/roof-closed.webp",
    ROOT / "public/images/pergolas/roof-half-open.webp",
    ROOT / "public/images/pergolas/roof-open.webp",
)


def validate_frame(frame: Image.Image, label: str) -> None:
    grayscale = frame.convert("L")
    extrema = grayscale.getextrema()
    stats = ImageStat.Stat(grayscale)
    mean = float(stats.mean[0])
    deviation = float(stats.stddev[0])

    if extrema is None:
        raise RuntimeError(f"{label}: image has no pixel extrema")

    low, high = extrema
    if high - low < 18 or deviation < 5 or mean < 8:
        raise RuntimeError(
            f"{label}: frame looks blank/dark "
            f"(range={low}..{high}, mean={mean:.2f}, stddev={deviation:.2f})"
        )


def main() -> int:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Roof-state source is missing: {SOURCE}")

    with Image.open(SOURCE) as source:
        source.load()
        image = source.convert("RGB")

    width, height = image.size
    if width < 320 or height < 600 or height % 3 != 0:
        raise RuntimeError(
            f"Unexpected roof-state sheet size: {width}x{height}; "
            "expected one vertical sheet with three equal frames"
        )

    frame_height = height // 3
    for index, output in enumerate(OUTPUTS):
        top = index * frame_height
        frame = image.crop((0, top, width, top + frame_height))
        validate_frame(frame, output.stem)
        output.parent.mkdir(parents=True, exist_ok=True)
        frame.save(output, "WEBP", quality=94, method=6)
        print(f"generated {output.relative_to(ROOT)} ({width}x{frame_height})")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"roof-state generation failed: {exc}", file=sys.stderr)
        raise
