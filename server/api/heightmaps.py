"""
Heightmap image conversion for game engines (see server/heightmap_image.py).

The editor does the height math (sampling, range, quantizing); these endpoints
only pack and unpack images, which browsers can't do at 16 bits. Nothing is stored.

Endpoints
---------
POST /api/heightmaps/png      Multipart: ``values`` (little-endian uint16, row-major),
                              ``width``, ``height``, optional ``info`` (JSON text kept
                              in the PNG). Returns a 16-bit grayscale PNG.
POST /api/heightmaps/decode   Multipart: ``file`` (PNG, TIFF, ...). Returns the samples
                              as binary; headers ``X-Heightmap-Width`` / ``-Height``
                              give the size and ``X-Heightmap-Info`` (ASCII JSON) the
                              sample layout and any embedded metadata.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from server import heightmap_image as hi

router = APIRouter(tags=["heightmaps"])

_HEADERS = ("X-Heightmap-Width", "X-Heightmap-Height", "X-Heightmap-Info")


@router.post("/heightmaps/png")
async def encode_png(
    values: UploadFile = File(...),
    width: int = Form(...),
    height: int = Form(...),
    info: Optional[str] = Form(None),
):
    meta = None
    if info:
        try:
            meta = json.loads(info)
        except ValueError:
            raise HTTPException(status_code=400, detail="info must be JSON") from None
        if not isinstance(meta, dict):
            raise HTTPException(status_code=400, detail="info must be a JSON object")
    try:
        png = hi.encode_png(width, height, await values.read(), meta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return Response(content=png, media_type="image/png")


@router.post("/heightmaps/decode")
async def decode(file: UploadFile = File(...)):
    try:
        width, height, samples, info = hi.decode_image(await file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return Response(
        content=samples,
        media_type="application/octet-stream",
        headers={
            "X-Heightmap-Width": str(width),
            "X-Heightmap-Height": str(height),
            "X-Heightmap-Info": json.dumps(info),  # ensure_ascii: safe as a header
            "Access-Control-Expose-Headers": ", ".join(_HEADERS),
        },
    )
