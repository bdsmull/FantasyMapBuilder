"""Qt test configuration — force offscreen platform before any Qt import."""
import os

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
