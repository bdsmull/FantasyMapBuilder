"""
Fantasy RPG Map Editor — web server entry point.

Run with:
    python main.py                    # production (serves built React app)
    python main.py --dev              # development mode with auto-reload
    python main.py --data-dir PATH    # store world sets in PATH (default: ./world_sets,
                                      #   or "dataDir" in mapeditor.config.json)

Access:
    Desktop browser: http://localhost:8000
    iPad (same WiFi): http://<your-pc-ip>:8000

Find your PC's LAN IP:
    Windows: ipconfig | findstr IPv4
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure the project root is on sys.path
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    import uvicorn

    dev_mode = "--dev" in sys.argv
    if "--data-dir" in sys.argv:
        # Passed via the environment so the reloader's worker process sees it too
        os.environ["MAPEDITOR_DATA_DIR"] = sys.argv[sys.argv.index("--data-dir") + 1]
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=dev_mode,
        log_level="info",
    )


if __name__ == "__main__":
    main()
