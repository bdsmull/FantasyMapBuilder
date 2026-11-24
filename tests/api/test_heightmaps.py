"""
Heightmap images for game engines (#46): the server packs editor-quantized uint16
samples into a 16-bit PNG, and unpacks heightmap images made elsewhere.
"""
import array
import io
import json
import struct
import sys

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio


def _u16(values):
    data = array.array("H", values)
    if sys.byteorder == "big":
        data.byteswap()
    return data.tobytes()


def _png(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


async def _encode(client, values, width, height, info=None):
    data = {"width": str(width), "height": str(height)}
    if info is not None:
        data["info"] = json.dumps(info)
    return await client.post("/api/heightmaps/png", data=data,
                             files={"values": ("values.bin", _u16(values), "application/octet-stream")})


async def _decode(client, content: bytes, name="h.png"):
    return await client.post("/api/heightmaps/decode", files={"file": (name, content, "application/octet-stream")})


async def test_png_is_16_bit_and_exact(client):
    values = [0, 1, 65535, 32768, 12345, 54321]
    resp = await _encode(client, values, 3, 2, {"minM": 96.0, "maxM": 104.0, "map": "café"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(resp.content)) as image:
        assert image.size == (3, 2)
        assert image.mode.startswith("I")
        got = [image.getpixel((i % 3, i // 3)) for i in range(6)]
        assert got == values
        assert json.loads(image.info["heightmap"])["map"] == "café"


async def test_png_round_trips_through_decode(client):
    values = [0, 1000, 65535, 40000]
    png = (await _encode(client, values, 2, 2, {"minM": -5, "maxM": 20})).content
    resp = await _decode(client, png)
    assert resp.status_code == 200
    assert (resp.headers["X-Heightmap-Width"], resp.headers["X-Heightmap-Height"]) == ("2", "2")
    info = json.loads(resp.headers["X-Heightmap-Info"])
    assert info["sample"] == "u16"
    assert info["metadata"] == {"minM": -5, "maxM": 20}
    assert list(struct.unpack("<4H", resp.content)) == values
    assert "X-Heightmap-Info" in resp.headers["Access-Control-Expose-Headers"]


async def test_png_rejects_wrong_length_and_bad_info(client):
    assert (await _encode(client, [1, 2, 3], 2, 2)).status_code == 400
    resp = await client.post("/api/heightmaps/png", data={"width": "1", "height": "1", "info": "[1]"},
                             files={"values": ("v", _u16([7]), "application/octet-stream")})
    assert resp.status_code == 400


async def test_decode_8_bit_and_color(client):
    gray = Image.frombytes("L", (2, 1), bytes([0, 255]))
    resp = await _decode(client, _png(gray))
    info = json.loads(resp.headers["X-Heightmap-Info"])
    assert info == {"metadata": None, "sample": "u8"}
    assert resp.content == bytes([0, 255])

    rgb = Image.new("RGB", (1, 1), (128, 128, 128))
    resp = await _decode(client, _png(rgb))
    assert json.loads(resp.headers["X-Heightmap-Info"])["sample"] == "u8"
    assert resp.content == bytes([128])


async def test_decode_32_bit_tiff_scales_to_its_own_range(client):
    # The editor's own height files: 32-bit integer centimeters
    image = Image.frombytes("I", (3, 1), struct.pack("<3i", 9600, 10000, 10400), "raw", "I;32")
    out = io.BytesIO()
    image.save(out, "TIFF")
    resp = await _decode(client, out.getvalue(), "h.tif")
    info = json.loads(resp.headers["X-Heightmap-Info"])
    assert info["sample"] == "f32"
    assert (info["rawMin"], info["rawMax"]) == (9600, 10400)
    assert list(struct.unpack("<3f", resp.content)) == pytest.approx([0.0, 0.5, 1.0])


async def test_decode_rejects_non_images(client):
    resp = await _decode(client, b"not an image", "x.png")
    assert resp.status_code == 400
