"""Compatibility entry point for the BantAI safety regression runner."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from tests.regression.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
