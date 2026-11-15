"""
.mapset packages: a whole world set as one file, for moving it between computers
and projects (see docs/file-format.md, ".mapset packages").

A .mapset is a plain zip:

    mapset.json                       manifest
    <World set>/<World set>.worldset.json
    <World set>/maps/*.tmj
    <World set>/tilesets/*.tsj, *.png
    <World set>/heights/*.tif         (later)

Extracting it by hand gives a normal world set folder that Tiled can open.
Images and height files are stored uncompressed so readers can seek into them.

Endpoints
---------
GET  /api/mapsets/{world_set}   Download a world set as <name>.mapset
POST /api/mapsets               Import a .mapset (multipart: file, optional name).
                                409 if a world set with that name already exists.
"""

from __future__ import annotations

import io
import json
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import Response

from server import data_dir as dd

router = APIRouter(tags=["mapsets"])

MANIFEST = "mapset.json"
FORMAT_NAME = "mapset"
FORMAT_VERSION = 1

# Already-compressed or seekable formats are stored, everything else deflated.
_STORED_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff"}
# Guard against zip bombs: limit on the total uncompressed size of an import.
MAX_UNCOMPRESSED_BYTES = 2 * 1024 ** 3


def _package_files(folder: Path) -> list[Path]:
    """Files in a world set folder to package (hidden files and folders skipped)."""
    return sorted(
        p for p in folder.rglob("*")
        if p.is_file() and not any(part.startswith(".") for part in p.relative_to(folder).parts)
    )


def build_mapset(folder: Path) -> bytes:
    """Zip a world set folder into .mapset bytes."""
    files = _package_files(folder)
    manifest = {
        "format": FORMAT_NAME,
        "formatVersion": FORMAT_VERSION,
        "worldSet": folder.name,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": [f"{folder.name}/{p.relative_to(folder).as_posix()}" for p in files],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr(MANIFEST, json.dumps(manifest, indent=2, ensure_ascii=False), compress_type=zipfile.ZIP_DEFLATED)
        for path, arcname in zip(files, manifest["files"]):
            stored = path.suffix.lower() in _STORED_SUFFIXES
            zf.write(path, arcname, compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
    return buffer.getvalue()


@router.get("/mapsets/{world_set}")
def export_mapset(world_set: str):
    """Download a world set as a .mapset file."""
    folder = dd.existing_world_set_dir(world_set)
    filename = f"{folder.name}.mapset"
    return Response(
        content=build_mapset(folder),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=f"Not a valid .mapset: {detail}")


def _read_manifest(zf: zipfile.ZipFile) -> dict:
    try:
        manifest = json.loads(zf.read(MANIFEST))
    except KeyError:
        raise _bad(f"no {MANIFEST}") from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise _bad(f"{MANIFEST} is not JSON") from None
    if manifest.get("format") != FORMAT_NAME:
        raise _bad("wrong format")
    if manifest.get("formatVersion") != FORMAT_VERSION:
        raise _bad(f"unsupported format version {manifest.get('formatVersion')!r}")
    if not isinstance(manifest.get("worldSet"), str):
        raise _bad("manifest has no world set name")
    return manifest


def _member_paths(zf: zipfile.ZipFile, source_name: str) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """(entry, path inside the world set folder) for every file entry; rejects
    anything outside <source_name>/ or that would escape the folder."""
    members = []
    total = 0
    for info in zf.infolist():
        if info.is_dir() or info.filename == MANIFEST:
            continue
        path = PurePosixPath(info.filename.replace("\\", "/"))
        if path.is_absolute() or ".." in path.parts or len(path.parts) < 2 or path.parts[0] != source_name:
            raise _bad(f"unexpected entry {info.filename!r}")
        if any(part.startswith(".") for part in path.parts[1:]):
            continue  # hidden files are never packaged; ignore them if present
        total += info.file_size
        if total > MAX_UNCOMPRESSED_BYTES:
            raise _bad("contents are too large")
        members.append((info, PurePosixPath(*path.parts[1:])))
    return members


def open_mapset(data: bytes) -> tuple[zipfile.ZipFile, str, list]:
    """Validate .mapset bytes. Returns (zip, world set name in the package, members)."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise _bad("not a zip file") from None
    try:
        manifest = _read_manifest(zf)
        source_name = dd.check_name(manifest["worldSet"], "world set")
        members = _member_paths(zf, source_name)
        worldset_file = PurePosixPath(f"{source_name}{dd.WORLD_SET_SUFFIX}")
        if worldset_file not in {p for _, p in members}:
            raise _bad(f"no {worldset_file}")
    except Exception:
        zf.close()
        raise
    return zf, source_name, members


def extract_members(zf: zipfile.ZipFile, members: list, folder: Path) -> None:
    """Write validated package members into ``folder`` (a world set folder)."""
    for info, rel in members:
        out = folder.joinpath(*rel.parts)
        out.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)
    (folder / "maps").mkdir(exist_ok=True)


@router.post("/mapsets", status_code=201)
async def import_mapset(file: UploadFile, name: Optional[str] = Form(default=None)):
    """Import a .mapset as a new world set, optionally under a different name."""
    zf, source_name, members = open_mapset(await file.read())
    with zf:
        target_name = dd.check_name((name or source_name).strip(), "world set")
        target = dd.world_set_dir(target_name)
        if target.exists():
            raise HTTPException(status_code=409, detail=f"A world set named '{target_name}' already exists")

        # Unpack into a temporary folder first so a failure leaves nothing behind.
        staging = Path(tempfile.mkdtemp(prefix=".import-", dir=dd.data_dir()))
        try:
            extract_members(zf, members, staging)

            # Rename the world set file (and its "name") to the target name
            ws_path = staging / f"{source_name}{dd.WORLD_SET_SUFFIX}"
            data = json.loads(ws_path.read_text(encoding="utf-8"))
            data["name"] = target_name
            ws_path.unlink()
            (staging / f"{target_name}{dd.WORLD_SET_SUFFIX}").write_text(
                json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8",
            )
            staging.rename(target)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise

    return {"imported": target_name, "maps": sorted(p.stem for p in (target / "maps").glob("*.tmj"))}
