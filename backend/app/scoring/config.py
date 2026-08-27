"""Load and validate the scoring model from config/scoring.yaml."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "scoring.yaml"


@dataclass(frozen=True)
class Band:
    max: int
    label: str


@dataclass(frozen=True)
class CategoryDef:
    key: str
    label: str
    active: bool


@dataclass(frozen=True)
class QualityCheckDef:
    check_id: str
    category: str
    subcategory: str
    worst_value: float
    max_impact: float


@dataclass(frozen=True)
class GrammarConfig:
    enabled: bool
    worst_value: float
    max_impact: float


@dataclass(frozen=True)
class ScoringConfig:
    scoring_standard: str
    blend_pct: float
    blend_severity: float
    default_worst_value: float
    default_max_impact: float
    impact_weights: dict[str, float]
    level_weights: dict[str, float]
    check_overrides: dict[str, dict]
    grammar: GrammarConfig
    error_page_max_score: int
    bands: list[Band]
    categories: dict[str, CategoryDef] = field(default_factory=dict)
    quality_checks: dict[str, QualityCheckDef] = field(default_factory=dict)

    def worst_value(self, check_id: str) -> float:
        # `grammar` is configured under quality_checks like every other quality
        # check. It used to be read from a top-level `grammar:` section that the
        # YAML does not define, so it silently fell back to the built-in
        # defaults and saturated at 4 issues/page — scoring 0 on any real page.
        # GrammarConfig is still consulted for `enabled`.
        if check_id in self.quality_checks:
            return self.quality_checks[check_id].worst_value
        return float(self.check_overrides.get(check_id, {}).get("worst_value", self.default_worst_value))

    def max_impact(self, check_id: str) -> float:
        if check_id in self.quality_checks:
            return self.quality_checks[check_id].max_impact
        return float(self.check_overrides.get(check_id, {}).get("max_impact", self.default_max_impact))

    def active_categories(self) -> list[str]:
        return [k for k, c in self.categories.items() if c.active]

    def is_active(self, category: str) -> bool:
        cat = self.categories.get(category)
        return cat.active if cat else False

    def impact_weight(self, impact: str | None) -> float:
        return float(self.impact_weights.get(impact or "moderate", 0.5))

    def level_weight(self, level: str | None, is_best_practice: bool) -> float:
        if level and level in self.level_weights:
            return float(self.level_weights[level])
        if is_best_practice:
            return float(self.level_weights.get("best-practice", 0.1))
        return float(self.level_weights.get("best-practice", 0.1))

    def band_for(self, score: int) -> str:
        for band in self.bands:
            if score <= band.max:
                return band.label
        return self.bands[-1].label if self.bands else ""


@lru_cache(maxsize=1)
def load_scoring_config() -> ScoringConfig:
    raw = yaml.safe_load(_CONFIG_PATH.read_text(encoding="utf-8"))
    blend = raw.get("blend", {})
    defaults = raw.get("check_defaults", {})
    return ScoringConfig(
        scoring_standard=str(raw.get("scoring_standard", "2.2")),
        blend_pct=float(blend.get("pct", 0.6)),
        blend_severity=float(blend.get("severity", 0.4)),
        default_worst_value=float(defaults.get("worst_value", 4.0)),
        default_max_impact=float(defaults.get("max_impact", 12.0)),
        impact_weights=dict(raw.get("impact_weights", {})),
        level_weights=dict(raw.get("level_weights", {})),
        check_overrides=dict(raw.get("check_overrides", {})),
        grammar=GrammarConfig(
            enabled=bool(raw.get("grammar", {}).get("enabled", True)),
            worst_value=float(raw.get("grammar", {}).get("worst_value", 4.0)),
            max_impact=float(raw.get("grammar", {}).get("max_impact", 12.0)),
        ),
        error_page_max_score=int(raw.get("penalty_overrides", {}).get("error_page_max_score", 5)),
        bands=[Band(max=int(b["max"]), label=str(b["label"])) for b in raw.get("bands", [])],
        categories={
            key: CategoryDef(key=key, label=str(c.get("label", key)), active=bool(c.get("active", False)))
            for key, c in raw.get("categories", {}).items()
        },
        quality_checks={
            key: QualityCheckDef(
                check_id=key,
                category=str(q.get("category", "content")),
                subcategory=str(q.get("subcategory", "")),
                worst_value=float(q.get("worst_value", 4.0)),
                max_impact=float(q.get("max_impact", 12.0)),
            )
            for key, q in raw.get("quality_checks", {}).items()
        },
    )
