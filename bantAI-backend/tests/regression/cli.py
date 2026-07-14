"""Command-line interface for the BantAI safety regression benchmark."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from .env import load_backend_env
from .report import Console, print_case, print_summary, write_json_report
from .runner import DatasetError, load_dataset, run_cases
from .statistics import build_statistics

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_URL = "http://localhost:3000/api/analyze"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark BantAI's /api/analyze safety endpoint.")
    parser.add_argument("dataset", nargs="?", choices=("standard", "messenger"), default="standard", help="Bundled dataset to run (default: standard).")
    parser.add_argument("--dataset-file", type=Path, help="Path to a compatible JSON dataset; overrides dataset.")
    parser.add_argument("--url", default=os.getenv("SAFETY_REGRESSION_URL", os.getenv("BANTAI_ANALYZE_URL", DEFAULT_URL)), help="Analyze endpoint URL (or SAFETY_REGRESSION_URL/BANTAI_ANALYZE_URL).")
    parser.add_argument("--timeout", type=float, default=float(os.getenv("SAFETY_REGRESSION_TIMEOUT", "30")), help="Per-request timeout in seconds (default: 30).")
    parser.add_argument("--json-report", type=Path, help="Write the detailed JSON report to this file.")
    parser.add_argument("--no-color", action="store_true", help="Disable colored PASS/FAIL output.")
    parser.add_argument("--quiet", action="store_true", help="Only print the final scorecard.")
    return parser


def main(argv: list[str] | None = None) -> int:
    load_backend_env()
    args = build_parser().parse_args(argv)
    if args.timeout <= 0:
        raise SystemExit("--timeout must be greater than zero.")
    dataset = args.dataset_file or BACKEND_ROOT / "tests" / f"safety-regression-{args.dataset}.json"
    try:
        _metadata, cases = load_dataset(dataset)
    except DatasetError as exc:
        print(f"Dataset error: {exc}")
        return 2
    console = Console(not args.no_color)
    print(f"Running {len(cases)} safety regression cases from {dataset.name}")
    print(f"Endpoint: {args.url}")
    results = run_cases(cases, args.url, args.timeout)
    if not args.quiet:
        for result in results:
            print_case(result, console)
    stats = build_statistics(results)
    print_summary(stats, console, os.getenv("LOCAL_LLM_MODEL_NAME", "Unknown"))
    if args.json_report:
        write_json_report(args.json_report, dataset, args.url, stats, results)
        print(f"JSON report written to: {args.json_report}")
    return 0 if stats["cases"]["passed"] == stats["cases"]["total"] else 1
