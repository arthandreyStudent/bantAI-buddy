"""Accuracy, language, and latency statistics for regression results."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Iterable

from .models import CaseResult


def percentile(values: Iterable[float], percentile_value: float) -> float:
    """Calculate an interpolated percentile, matching common benchmark reporting."""
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * percentile_value / 100
    lower, upper = math.floor(position), math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def build_statistics(results: list[CaseResult]) -> dict[str, Any]:
    """Build machine-readable aggregate statistics from every attempted case."""
    total_cases = len(results)
    passed_cases = sum(result.passed for result in results)
    total_assertions = sum(len(result.assertions) for result in results)
    passed_assertions = sum(result.passed_assertions for result in results)
    latencies = [result.latency_ms for result in results]
    groups: dict[str, list[CaseResult]] = defaultdict(list)
    for result in results:
        language = str(result.case.expected.get("language", "Unspecified"))
        groups[language].append(result)

    scorecard = []
    for language in sorted(groups):
        group = groups[language]
        group_assertions = sum(len(item.assertions) for item in group)
        scorecard.append({
            "language": language,
            "cases": len(group),
            "passedCases": sum(item.passed for item in group),
            "caseAccuracy": 100 * sum(item.passed for item in group) / len(group),
            "assertionAccuracy": 100 * sum(item.passed_assertions for item in group) / group_assertions if group_assertions else 0.0,
            "requestErrors": sum(item.error is not None for item in group),
            "averageLatencyMs": sum(item.latency_ms for item in group) / len(group),
        })
    return {
        "cases": {"total": total_cases, "passed": passed_cases, "accuracy": 100 * passed_cases / total_cases if total_cases else 0.0},
        "assertions": {"total": total_assertions, "passed": passed_assertions, "accuracy": 100 * passed_assertions / total_assertions if total_assertions else 0.0},
        "requestErrors": sum(result.error is not None for result in results),
        "latencyMs": {"min": min(latencies, default=0.0), "p50": percentile(latencies, 50), "p95": percentile(latencies, 95), "average": sum(latencies) / len(latencies) if latencies else 0.0, "max": max(latencies, default=0.0)},
        "languageScorecard": scorecard,
    }
