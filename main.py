"""
Fantasy RPG Map Editor — entry point.

Run with:
    python main.py
"""

import sys
from pathlib import Path

# Ensure the project root is on sys.path when run directly
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    from PyQt6.QtWidgets import QApplication

    from map_editor.ui.main_window import MainWindow

    app = QApplication(sys.argv)
    app.setApplicationName("Fantasy RPG Map Editor")
    app.setOrganizationName("MapEditor")

    window = MainWindow()
    window.resize(1280, 800)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
