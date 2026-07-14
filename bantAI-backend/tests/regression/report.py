"""Human-readable and JSON reporting for safety regression runs."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import CaseResult


class Console:
    """Small ANSI formatter that degrades cleanly for redirected output."""
    def __init__(self, color: bool) -> None:
        self.color = color and sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

    def status(self, passed: bool) -> str:
        word = "PASS" if passed else "FAIL"
        if not self.color:
            return word
        return f"\033[32m{word}\033[0m" if passed else f"\033[31m{word}\033[0m"


def print_case(result: CaseResult, console: Console) -> None:
    """Print a JS-runner-style per-case result with failed assertion detail."""
    print(f"{console.status(result.passed)} {result.case.case_id} ({result.latency_ms:.2f}ms)")
    if result.error:
        print(f"  Request error: {result.error}")
    for assertion in result.assertions:
        label = console.status(assertion.passed)
        print(f"  {label} {assertion.name}: {assertion.detail}")


def print_summary(stats: dict[str, Any], console: Console, model_name: str) -> None:
    """Print the final scorecard and latency summary."""
    cases, assertions, latency = stats["cases"], stats["assertions"], stats["latencyMs"]
    print("\n=== Safety Regression Scorecard ===")
    print(f"Model Used: {model_name}")
    print(f"Cases: {cases['passed']}/{cases['total']} passed")
    print(f"Request errors: {stats['requestErrors']}")
    print(f"Overall case accuracy: {cases['accuracy']:.2f}%")
    print(f"Assertion accuracy: {assertions['accuracy']:.2f}% ({assertions['passed']}/{assertions['total']})")
    print(f"Latency: min {latency['min']:.2f}ms | p50 {latency['p50']:.2f}ms | p95 {latency['p95']:.2f}ms | avg {latency['average']:.2f}ms | max {latency['max']:.2f}ms")
    print("\n=== Accuracy by Expected Language ===")
    print(f"{'Language':<12} {'Cases':>7} {'Case Acc.':>11} {'Assert Acc.':>12} {'Errors':>8} {'Avg Latency':>13}")
    for row in stats["languageScorecard"]:
        print(f"{row['language']:<12} {row['cases']:>7} {row['caseAccuracy']:>10.2f}% {row['assertionAccuracy']:>11.2f}% {row['requestErrors']:>8} {row['averageLatencyMs']:>11.2f}ms")


def write_json_report(path: Path, dataset: Path, url: str, stats: dict[str, Any], results: list[CaseResult]) -> None:
    """Persist a complete, portable report without mutating the source dataset."""
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "dataset": str(dataset), "url": url, "statistics": stats, "results": [result.to_dict() for result in results]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
