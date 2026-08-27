"""Fit scoring.yaml constants to external reference scores (SKELETON).

Given a CSV of (fixture_page, external_score) — a trusted third-party score per
page, filled in by hand later — and a CSV of detected per-page check counts,
this least-squares-fits each check's `max_impact` (and optionally `worst_value`)
so our computed page scores line up with the external ones.

It NEVER writes scoring.yaml. It prints a proposed unified-diff-style change set
for a human to review and apply. With no data it explains what to provide.

Usage:
    python calibration/fit.py --scores scores.csv --counts counts.csv

  scores.csv:  fixture_page,external_score
               contrast.html,72
  counts.csv:  fixture_page,check_id,count
               contrast.html,color-contrast,1
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parent.parent
SCORING_YAML = _REPO_ROOT / "backend" / "app" / "config" / "scoring.yaml"


def _load_pairs(path: Path) -> dict[str, float]:
    out: dict[str, float] = {}
    with path.open() as f:
        for row in csv.DictReader(f):
            out[row["fixture_page"]] = float(row["external_score"])
    return out


def _load_counts(path: Path) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    with path.open() as f:
        for row in csv.DictReader(f):
            out.setdefault(row["fixture_page"], {})[row["check_id"]] = float(row["count"])
    return out


def _current_max_impacts(scoring: dict) -> dict[str, float]:
    """Effective max_impact per check id, from quality_checks + check_overrides."""
    out: dict[str, float] = {}
    for cid, q in (scoring.get("quality_checks") or {}).items():
        out[cid] = float(q.get("max_impact", scoring["check_defaults"]["max_impact"]))
    for cid, o in (scoring.get("check_overrides") or {}).items():
        if "max_impact" in o:
            out[cid] = float(o["max_impact"])
    return out


def _predicted_score(counts: dict[str, float], max_impacts: dict[str, float], worst: dict[str, float]) -> float:
    """Simplified linear-ish model: each present check removes up to its
    max_impact, scaled by min(count/worst, 1). Mirrors the engine's shape
    closely enough to fit the caps; clamp at 0."""
    penalty = 0.0
    for cid, n in counts.items():
        if n <= 0 or cid not in max_impacts:
            continue
        severity = min(n / max(worst.get(cid, 4.0), 1e-6), 1.0)
        penalty += max_impacts[cid] * severity
    return max(0.0, 100.0 - penalty)


def _sse(pages: list[str], scores: dict[str, float], counts: dict[str, dict[str, float]],
         max_impacts: dict[str, float], worst: dict[str, float]) -> float:
    return sum((_predicted_score(counts.get(p, {}), max_impacts, worst) - scores[p]) ** 2 for p in pages)


def fit(scores: dict[str, float], counts: dict[str, dict[str, float]], scoring: dict,
        iterations: int = 200, step: float = 1.0) -> dict[str, float]:
    """Coordinate-descent least-squares over each check's max_impact.

    numpy-free on purpose: nudges each constant up/down by `step`, keeps changes
    that reduce the total squared error, shrinking `step` as it converges."""
    pages = [p for p in scores if p in counts]
    max_impacts = dict(_current_max_impacts(scoring))
    worst = {cid: float(q.get("worst_value", 4.0)) for cid, q in (scoring.get("quality_checks") or {}).items()}
    tunable = sorted({cid for p in pages for cid in counts[p] if cid in max_impacts})
    if not pages or not tunable:
        return max_impacts

    s = step
    for _ in range(iterations):
        improved = False
        base = _sse(pages, scores, counts, max_impacts, worst)
        for cid in tunable:
            for delta in (s, -s):
                trial = dict(max_impacts)
                trial[cid] = max(0.0, min(60.0, trial[cid] + delta))
                if _sse(pages, scores, counts, trial, worst) < base - 1e-9:
                    max_impacts = trial
                    base = _sse(pages, scores, counts, max_impacts, worst)
                    improved = True
        if not improved:
            s /= 2
            if s < 0.05:
                break
    return max_impacts


def propose_diff(scoring: dict, fitted: dict[str, float]) -> str:
    current = _current_max_impacts(scoring)
    lines = ["# Proposed scoring.yaml changes (NOT applied — review and edit by hand):", ""]
    changed = False
    for cid in sorted(fitted):
        before, after = current.get(cid), round(fitted[cid], 1)
        if before is None or abs(before - after) < 0.1:
            continue
        changed = True
        lines.append(f"  {cid}.max_impact:  {before}  ->  {after}")
    if not changed:
        lines.append("  (no changes — current caps already minimize the error)")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="Fit scoring.yaml caps to external scores (proposes a diff; never writes).")
    ap.add_argument("--scores", type=Path, help="CSV: fixture_page,external_score")
    ap.add_argument("--counts", type=Path, help="CSV: fixture_page,check_id,count")
    args = ap.parse_args()

    if not args.scores or not args.counts:
        print(__doc__)
        print("\nNo data provided. Supply --scores and --counts CSVs to run a fit.")
        sys.exit(0)

    scoring = yaml.safe_load(SCORING_YAML.read_text())
    scores = _load_pairs(args.scores)
    counts = _load_counts(args.counts)
    fitted = fit(scores, counts, scoring)
    print(propose_diff(scoring, fitted))
    print("\n(Review the above and edit backend/app/config/scoring.yaml manually.)")


if __name__ == "__main__":
    main()
