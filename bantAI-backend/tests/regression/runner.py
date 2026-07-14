"""Dataset loading and synchronous HTTP execution for safety benchmarks."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .assertions import evaluate_assertions
from .models import AssertionResult, CaseResult, RegressionCase


class DatasetError(ValueError):
    """Raised when a regression dataset cannot be used safely."""


def load_dataset(path: Path) -> tuple[dict[str, Any], list[RegressionCase]]:
    """Load and validate the documented JSON dataset shape."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatasetError(f"Cannot load dataset {path}: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("cases"), list):
        raise DatasetError("Dataset must be an object containing a 'cases' array.")

    cases: list[RegressionCase] = []
    for index, item in enumerate(payload["cases"], start=1):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise DatasetError(f"Case {index} must include a string 'id'.")
        if not isinstance(item.get("text"), str) or not isinstance(item.get("expected"), dict):
            raise DatasetError(f"Case {item['id']!r} must include string 'text' and object 'expected'.")
        if not item["expected"]:
            raise DatasetError(f"Case {item['id']!r} must define at least one assertion.")
        cases.append(RegressionCase(item["id"], item["text"], item["expected"]))
    return payload, cases


def post_analysis(url: str, message_text: str, timeout_seconds: float) -> tuple[dict[str, Any], float]:
    """Send the exact regression payload and return decoded JSON plus elapsed milliseconds."""
    body = json.dumps({"messageText": message_text, "context": "regression"}).encode("utf-8")
    request = Request(url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=timeout_seconds) as raw_response:
            status = raw_response.status
            raw_body = raw_response.read().decode("utf-8")
    except HTTPError as exc:
        raw_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {raw_body}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(f"Request failed: {exc}") from exc
    elapsed_ms = (time.perf_counter() - started) * 1_000
    if not 200 <= status < 300:
        raise RuntimeError(f"HTTP {status}: {raw_body}")
    try:
        decoded = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Endpoint returned invalid JSON: {exc}") from exc
    if not isinstance(decoded, dict):
        raise RuntimeError("Endpoint response must be a JSON object.")
    return decoded, elapsed_ms


def run_case(case: RegressionCase, url: str, timeout_seconds: float) -> CaseResult:
    """Execute one case, recording request failures as failed assertions."""
    started = time.perf_counter()
    try:
        response, latency_ms = post_analysis(url, case.text, timeout_seconds)
        return CaseResult(case, latency_ms, evaluate_assertions(case.expected, response), response)
    except RuntimeError as exc:
        latency_ms = (time.perf_counter() - started) * 1_000
        assertions = [AssertionResult(name, expected, None, False, str(exc)) for name, expected in case.expected.items()]
        return CaseResult(case, latency_ms, assertions, error=str(exc))


def run_cases(cases: list[RegressionCase], url: str, timeout_seconds: float) -> list[CaseResult]:
    """Run cases in dataset order to preserve deterministic terminal output."""
    return [run_case(case, url, timeout_seconds) for case in cases]
