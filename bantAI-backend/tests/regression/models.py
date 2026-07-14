"""Typed domain models shared by the safety regression runner."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class RegressionCase:
    """One dataset input and its expected endpoint assertions."""

    case_id: str
    text: str
    expected: dict[str, Any]


@dataclass(frozen=True)
class AssertionResult:
    """Result of evaluating one expected field against an API verdict."""

    name: str
    expected: Any
    actual: Any
    passed: bool
    detail: str


@dataclass
class CaseResult:
    """Request, verdict, and assertions recorded for a single case."""

    case: RegressionCase
    latency_ms: float
    assertions: list[AssertionResult] = field(default_factory=list)
    response: dict[str, Any] | None = None
    error: str | None = None

    @property
    def passed(self) -> bool:
        return self.error is None and bool(self.assertions) and all(item.passed for item in self.assertions)

    @property
    def passed_assertions(self) -> int:
        return sum(item.passed for item in self.assertions)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-safe representation suitable for report export."""
        return {
            "id": self.case.case_id,
            "text": self.case.text,
            "expected": self.case.expected,
            "passed": self.passed,
            "latencyMs": self.latency_ms,
            "error": self.error,
            "response": self.response,
            "assertions": [asdict(assertion) for assertion in self.assertions],
        }
