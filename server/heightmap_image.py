"""
Heightmap images for game engines (#46): 16-bit grayscale PNGs out, any grayscale
image in.

The editor stores heights as 32-bit centimeter TIFFs (server/heights.py). Engines
import a 16-bit heightmap plus a vertical range, so the editor quantizes heights
itself and asks the server only to wrap the values in a PNG, or to unpack an
image someone made elsewhere. Browsers can't do either at 16 bits.

The PNG carries the numbers needed to restore real heights as a ``heightmap``
text chunk (JSON), so an exported file imports back without its .json sidecar.
"""

from __future__ import annotations

import array
import io
import json
import sys
from typing import Optional

from PIL import Image, PngImagePlugin

INFO_KEY = "heightmap"
_MAX_SIDE = 8193


def _little_endian(values: array.array) -> bytes:
    if sys.byteorder == "big":
        values = array.array(values.typecode, values)
        values.byteswap()
    return values.tobytes()


def encode_png(width: int, height: int, values_le: bytes, info: Optional[dict] = None) -> bytes:
    """A 16-bit grayscale PNG from little-endian uint16 samples (row-major, top row first)."""
    if not (0 < width <= _MAX_SIDE and 0 < height <= _MAX_SIDE):
        raise ValueError(f"Heightmap size {width}x{height} is out of range (1 to {_MAX_SIDE})")
    if len(values_le) != width * height * 2:
        raise ValueError(f"Expected {width * height * 2} bytes for {width}x{height}, got {len(values_le)}")
    image = Image.frombytes("I;16", (width, height), values_le)
    meta = PngImagePlugin.PngInfo()
    if info:
        meta.add_text(INFO_KEY, json.dumps(info))
    out = io.BytesIO()
    image.save(out, "PNG", pnginfo=meta)
    return out.getvalue()


def _embedded_info(image: Image.Image) -> Optional[dict]:
    text = image.info.get(INFO_KEY)
    if not isinstance(text, str):
        return None
    try:
        value = json.loads(text)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def decode_image(data: bytes) -> tuple[int, int, bytes, dict]:
    """
    Unpack a grayscale heightmap image.

    Returns (width, height, samples, info). ``info["sample"]`` says how the samples
    are laid out (row-major, top row first, little-endian):

    - ``"u8"``: one byte each, full scale 255 (8-bit images; color is read as luminance)
    - ``"u16"``: two bytes each, full scale 65535 (16-bit images)
    - ``"f32"``: float32 fractions 0..1 of the image's own range (32-bit integer or
      float images), which is reported as ``rawMin`` / ``rawMax``

    ``info["metadata"]`` is the PNG's embedded heightmap text (see encode_png), or None.
    """
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:  # Pillow raises many types for unreadable files
        raise ValueError("Not an image file the server can read") from exc
    width, height = image.size
    if width > _MAX_SIDE or height > _MAX_SIDE:
        raise ValueError(f"Heightmap {width}x{height} is too large (at most {_MAX_SIDE} per side)")
    info: dict = {"metadata": _embedded_info(image)}
    mode = image.mode
    if mode.startswith("I;16"):
        big = mode == "I;16B" or (mode == "I;16N" and sys.byteorder == "big")
        values = array.array("H", image.tobytes("raw", mode))
        if big != (sys.byteorder == "big"):
            values.byteswap()  # now native order
        info["sample"] = "u16"
        return width, height, _little_endian(values), info
    if mode in ("I", "F"):
        values = array.array("i" if mode == "I" else "f", image.tobytes("raw", mode))
        lo, hi = (min(values), max(values)) if len(values) else (0, 0)
        if mode == "I" and image.format == "PNG" and lo >= 0 and hi <= 65535:
            # Older Pillow opens 16-bit PNGs as 32-bit integers
            info["sample"] = "u16"
            return width, height, _little_endian(array.array("H", values)), info
        info.update(sample="f32", rawMin=lo, rawMax=hi)
        span = (hi - lo) or 1
        return width, height, _little_endian(array.array("f", ((v - lo) / span for v in values))), info
    info["sample"] = "u8"
    return width, height, image.convert("L").tobytes(), info
