"""Minimal `.env.local` loader for the regression runner.

The Python runner should mirror the backend's environment contract without
requiring an extra dependency. This parser intentionally supports the common
`.env` forms used by BantAI:

- blank lines
- comments beginning with `#`
- `KEY=value`
- quoted values
- inline comments after unquoted values
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_ROOT / ".env.local"


def _strip_inline_comment(value: str) -> str:
    """Remove an inline comment from an unquoted value."""
    if "#" not in value:
        return value.strip()
    head, _, _tail = value.partition("#")
    return head.rstrip()


def _parse_value(raw_value: str) -> str:
    """Parse a `.env` value while preserving intentional whitespace in quotes."""
    value = raw_value.strip()
    if not value:
        return ""

    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]

    return _strip_inline_comment(value)


def load_env_file(path: Path = DEFAULT_ENV_FILE, *, override: bool = False) -> None:
    """Load environment variables from a `.env`-style file if it exists."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        if not override and key in os.environ:
            continue

        os.environ[key] = _parse_value(raw_value)


def load_backend_env() -> None:
    """Load BantAI's backend environment contract from `.env.local`."""
    load_env_file(DEFAULT_ENV_FILE)
