"""Assertion evaluation for the /api/analyze response contract."""

from __future__ import annotations

from numbers import Real
from typing import Any

from .models import AssertionResult

SUPPORTED_ASSERTIONS = frozenset({
    "shouldBlock", "action", "category", "categoryAnyOf", "severity", "severityMin",
    "confidence", "confidenceMin", "confidenceMax", "language",
})


def _result(name: str, expected: Any, actual: Any, passed: bool, detail: str) -> AssertionResult:
    return AssertionResult(name, expected, actual, passed, detail)


def _number(value: Any) -> float | None:
    """Return finite numeric values while excluding booleans."""
    if isinstance(value, Real) and not isinstance(value, bool):
        return float(value)
    return None


def evaluate_assertions(expected: dict[str, Any], response: dict[str, Any]) -> list[AssertionResult]:
    """Evaluate every declared assertion using the endpoint's nested verdict shape."""
    analysis = response.get("analysis")
    analysis = analysis if isinstance(analysis, dict) else {}
    results: list[AssertionResult] = []

    for name, wanted in expected.items():
        if name not in SUPPORTED_ASSERTIONS:
            results.append(_result(name, wanted, None, False, "unsupported assertion name"))
            continue

        actual = response.get("shouldBlock") if name == "shouldBlock" else analysis.get(
            "category" if name == "categoryAnyOf" else name.removesuffix("Min").removesuffix("Max")
        )
        if name == "categoryAnyOf":
            allowed = wanted if isinstance(wanted, list) else []
            passed = actual in allowed
            detail = f"expected one of {allowed!r}, got {actual!r}"
        elif name.endswith("Min"):
            target, received = _number(wanted), _number(actual)
            passed = target is not None and received is not None and received >= target
            detail = f"expected >= {wanted!r}, got {actual!r}"
        elif name.endswith("Max"):
            target, received = _number(wanted), _number(actual)
            passed = target is not None and received is not None and received <= target
            detail = f"expected <= {wanted!r}, got {actual!r}"
        else:
            passed = actual == wanted
            detail = f"expected {wanted!r}, got {actual!r}"
        results.append(_result(name, wanted, actual, passed, detail))
    return results
