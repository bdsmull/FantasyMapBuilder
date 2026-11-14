"""
Location of the world set data folder.

Each world set is a self-contained folder inside the data folder:

    <data folder>/<World set>/<World set>.worldset.json
    <data folder>/<World set>/maps/*.tmj

The data folder is resolved once at startup, in this order:

1. ``MAPEDITOR_DATA_DIR`` environment variable (``main.py --data-dir`` sets it)
2. ``dataDir`` in ``mapeditor.config.json`` at the project root
3. ``<project root>/world_sets``

Relative paths are resolved against the project root.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import HTTPException

_PROJECT_ROOT = Path(__file__).parent.parent
_CONFIG_FILE = _PROJECT_ROOT / "mapeditor.config.json"
_ENV_VAR = "MAPEDITOR_DATA_DIR"

# World set and map names: letters, digits, underscore, dot, hyphen, space,
# apostrophe; must not start with a dot (reserved for e.g. .trash).
_SAFE_NAME_RE = re.compile(r"^(?!\.)[\w\-. ']+$")

WORLD_SET_SUFFIX = ".worldset.json"


def _resolve_data_dir() -> Path:
    configured = os.environ.get(_ENV_VAR)
    if not configured and _CONFIG_FILE.is_file():
        configured = json.loads(_CONFIG_FILE.read_text(encoding="utf-8")).get("dataDir")
    path = Path(configured) if configured else Path("world_sets")
    if not path.is_absolute():
        path = _PROJECT_ROOT / path
    return path.resolve()


# Patched by tests to a temporary directory.
DATA_DIR = _resolve_data_dir()


def data_dir() -> Path:
    """Return the data folder, creating it if needed."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def check_name(name: str, kind: str) -> str:
    """Return *name* if it is a safe file/folder name, else raise 400."""
    if not _SAFE_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail=f"Invalid {kind} name")
    return name


def world_set_dir(name: str) -> Path:
    """Folder of world set *name* (may not exist yet)."""
    return data_dir() / check_name(name.removesuffix(WORLD_SET_SUFFIX), "world set")


def existing_world_set_dir(name: str) -> Path:
    """Folder of an existing world set, else 404."""
    folder = world_set_dir(name)
    if not (folder / f"{folder.name}{WORLD_SET_SUFFIX}").is_file():
        raise HTTPException(status_code=404, detail=f"World set '{name}' not found")
    return folder


def world_set_names() -> list[str]:
    """Names of all world sets (folders holding a matching .worldset.json)."""
    return sorted(
        p.name for p in data_dir().iterdir()
        if p.is_dir() and not p.name.startswith(".") and (p / f"{p.name}{WORLD_SET_SUFFIX}").is_file()
    )
