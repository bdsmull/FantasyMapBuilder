"""
Shared fixtures for IO tests.

A session-scoped QApplication is required for the exporter (which uses
QImage), but write/read tests are pure Python and need no Qt.
"""

import os
import sys
import pytest


@pytest.fixture(scope="session", autouse=True)
def qapp():
    """Session-scoped QApplication using the offscreen platform (no display needed)."""
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

    from PyQt6.QtWidgets import QApplication

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv[:1])
    yield app
