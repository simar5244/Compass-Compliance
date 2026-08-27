"""WCAG success-criterion catalog + mapping from axe tags into the category tree.

axe tags each rule with:
  * a version+level tag: wcag2a / wcag2aa / wcag21aa / wcag22aa / wcag2aaa ...
  * a per-criterion tag:  wcag<digits>, e.g. wcag143  -> SC 1.4.3
                                            wcag1410 -> SC 1.4.10
                                            wcag2411 -> SC 2.4.11
From those we derive (version, level, criterion id, criterion name) and bucket
each result under:  Accessibility → WCAG 2.0/2.1/2.2 → Level A/AA/AAA → criterion.

Scoring standard is WCAG 2.2 (see scoring config). Criteria introduced in 2.0
carry into 2.1 and 2.2; we bucket a criterion under the version that *introduced*
it (its `version` field), which is how the tree stays non-duplicated.

All remediation prose here is ORIGINAL, written from the public W3C WCAG 2.2
Recommendation and "Understanding WCAG 2.2" notes. axe's own helpUrl is retained
only as an external reference link.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Criterion:
    id: str        # "1.4.3"
    name: str      # "Contrast (Minimum)"
    level: str     # "A" | "AA" | "AAA"
    version: str   # "2.0" | "2.1" | "2.2"  (version that introduced it)


# Catalog covering the criteria axe-core maps to, plus the three our custom
# layout checks target (1.4.10, 2.4.7, 2.5.8). Names are the official SC titles;
# any criterion not listed falls back to tags-derived level/version (see classify).
CRITERIA: dict[str, Criterion] = {
    "1.1.1": Criterion("1.1.1", "Non-text Content", "A", "2.0"),
    "1.2.1": Criterion("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "2.0"),
    "1.2.2": Criterion("1.2.2", "Captions (Prerecorded)", "A", "2.0"),
    "1.2.3": Criterion("1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A", "2.0"),
    "1.2.4": Criterion("1.2.4", "Captions (Live)", "AA", "2.0"),
    "1.2.5": Criterion("1.2.5", "Audio Description (Prerecorded)", "AA", "2.0"),
    "1.3.1": Criterion("1.3.1", "Info and Relationships", "A", "2.0"),
    "1.3.2": Criterion("1.3.2", "Meaningful Sequence", "A", "2.0"),
    "1.3.3": Criterion("1.3.3", "Sensory Characteristics", "A", "2.0"),
    "1.3.4": Criterion("1.3.4", "Orientation", "AA", "2.1"),
    "1.3.5": Criterion("1.3.5", "Identify Input Purpose", "AA", "2.1"),
    "1.4.1": Criterion("1.4.1", "Use of Color", "A", "2.0"),
    "1.4.2": Criterion("1.4.2", "Audio Control", "A", "2.0"),
    "1.4.3": Criterion("1.4.3", "Contrast (Minimum)", "AA", "2.0"),
    "1.4.4": Criterion("1.4.4", "Resize Text", "AA", "2.0"),
    "1.4.5": Criterion("1.4.5", "Images of Text", "AA", "2.0"),
    "1.4.6": Criterion("1.4.6", "Contrast (Enhanced)", "AAA", "2.0"),
    "1.4.10": Criterion("1.4.10", "Reflow", "AA", "2.1"),
    "1.4.11": Criterion("1.4.11", "Non-text Contrast", "AA", "2.1"),
    "1.4.12": Criterion("1.4.12", "Text Spacing", "AA", "2.1"),
    "1.4.13": Criterion("1.4.13", "Content on Hover or Focus", "AA", "2.1"),
    "2.1.1": Criterion("2.1.1", "Keyboard", "A", "2.0"),
    "2.1.2": Criterion("2.1.2", "No Keyboard Trap", "A", "2.0"),
    "2.1.4": Criterion("2.1.4", "Character Key Shortcuts", "A", "2.1"),
    "2.2.1": Criterion("2.2.1", "Timing Adjustable", "A", "2.0"),
    "2.2.2": Criterion("2.2.2", "Pause, Stop, Hide", "A", "2.0"),
    "2.3.1": Criterion("2.3.1", "Three Flashes or Below Threshold", "A", "2.0"),
    "2.4.1": Criterion("2.4.1", "Bypass Blocks", "A", "2.0"),
    "2.4.2": Criterion("2.4.2", "Page Titled", "A", "2.0"),
    "2.4.3": Criterion("2.4.3", "Focus Order", "A", "2.0"),
    "2.4.4": Criterion("2.4.4", "Link Purpose (In Context)", "A", "2.0"),
    "2.4.5": Criterion("2.4.5", "Multiple Ways", "AA", "2.0"),
    "2.4.6": Criterion("2.4.6", "Headings and Labels", "AA", "2.0"),
    "2.4.7": Criterion("2.4.7", "Focus Visible", "AA", "2.0"),
    "2.4.11": Criterion("2.4.11", "Focus Not Obscured (Minimum)", "AA", "2.2"),
    "2.4.13": Criterion("2.4.13", "Focus Appearance", "AAA", "2.2"),
    "2.5.1": Criterion("2.5.1", "Pointer Gestures", "A", "2.1"),
    "2.5.2": Criterion("2.5.2", "Pointer Cancellation", "A", "2.1"),
    "2.5.3": Criterion("2.5.3", "Label in Name", "A", "2.1"),
    "2.5.4": Criterion("2.5.4", "Motion Actuation", "A", "2.1"),
    "2.5.7": Criterion("2.5.7", "Dragging Movements", "AA", "2.2"),
    "2.5.8": Criterion("2.5.8", "Target Size (Minimum)", "AA", "2.2"),
    "3.1.1": Criterion("3.1.1", "Language of Page", "A", "2.0"),
    "3.1.2": Criterion("3.1.2", "Language of Parts", "AA", "2.0"),
    "3.2.1": Criterion("3.2.1", "On Focus", "A", "2.0"),
    "3.2.2": Criterion("3.2.2", "On Input", "A", "2.0"),
    "3.2.6": Criterion("3.2.6", "Consistent Help", "A", "2.2"),
    "3.3.1": Criterion("3.3.1", "Error Identification", "A", "2.0"),
    "3.3.2": Criterion("3.3.2", "Labels or Instructions", "A", "2.0"),
    "3.3.7": Criterion("3.3.7", "Redundant Entry", "A", "2.2"),
    "3.3.8": Criterion("3.3.8", "Accessible Authentication (Minimum)", "AA", "2.2"),
    "4.1.1": Criterion("4.1.1", "Parsing", "A", "2.0"),
    "4.1.2": Criterion("4.1.2", "Name, Role, Value", "A", "2.0"),
    "4.1.3": Criterion("4.1.3", "Status Messages", "AA", "2.1"),
}

# Original, criterion-level remediation guidance. Falls back to a generic
# original template (see remediation_for) for criteria not spelled out here.
REMEDIATION: dict[str, str] = {
    "1.1.1": "Give every meaningful image, icon, and control a text alternative that conveys the same "
             "information or purpose. Mark purely decorative graphics so assistive technology can skip "
             "them (empty alt text or an appropriate ARIA role).",
    "1.3.1": "Express structure through real markup, not visual styling alone: use headings, lists, "
             "table headers, and form labels so the relationships you show sighted users are also "
             "available programmatically.",
    "1.4.1": "Do not rely on color by itself to communicate meaning, state, or which element to act on. "
             "Pair color with text, an icon, underlines, or another visible cue.",
    "1.4.3": "Increase the contrast between text and its background so it meets at least 4.5:1 for "
             "normal text and 3:1 for large text. Adjust the foreground or background color until the "
             "ratio passes.",
    "1.4.10": "Let content reflow into a single column so no horizontal scrolling is needed at a 320 CSS "
              "pixel width. Avoid fixed widths and viewport units that force two-dimensional scrolling on "
              "small screens.",
    "1.4.11": "Ensure the visual boundary of controls and meaningful graphics has at least 3:1 contrast "
              "against adjacent colors so users can perceive interface elements.",
    "2.1.1": "Make every action operable with the keyboard alone. Use native interactive elements or add "
             "correct roles plus key handlers so nothing requires a mouse.",
    "2.4.2": "Give each page a unique, descriptive <title> that identifies its topic or purpose so users "
             "can tell pages apart.",
    "2.4.4": "Write link text that makes the destination clear on its own; avoid bare 'click here' or "
             "'read more' unless the surrounding context is programmatically associated.",
    "2.4.6": "Use headings and labels that accurately describe the section or control they introduce.",
    "2.4.7": "Provide a clearly visible focus indicator on every interactive element so keyboard users "
             "can always see where focus is.",
    "2.5.8": "Make interactive targets at least 24 by 24 CSS pixels, or leave enough spacing around "
             "smaller targets, so they are easy to activate by touch or pointer.",
    "3.1.1": "Set the page's primary language with a valid lang attribute on the <html> element so "
             "assistive technology pronounces content correctly.",
    "3.3.2": "Provide visible labels or instructions for every form control so users know what to enter.",
    "4.1.2": "Ensure custom controls expose a correct name, role, and value to assistive technology, "
             "using native elements or complete, valid ARIA.",
}

_LEVEL_BY_VERSION_TAG = {
    "wcag2a": ("2.0", "A"), "wcag2aa": ("2.0", "AA"), "wcag2aaa": ("2.0", "AAA"),
    "wcag21a": ("2.1", "A"), "wcag21aa": ("2.1", "AA"), "wcag21aaa": ("2.1", "AAA"),
    "wcag22a": ("2.2", "A"), "wcag22aa": ("2.2", "AA"), "wcag22aaa": ("2.2", "AAA"),
}

# A per-criterion tag is 'wcag' + digits, where the first two digits are the
# principle and guideline and the remainder is the criterion number.
_CRITERION_TAG_RE = re.compile(r"^wcag(\d)(\d)(\d+)$")


@dataclass(frozen=True)
class WcagMapping:
    version: str | None       # "2.0" | "2.1" | "2.2"
    level: str | None         # "A" | "AA" | "AAA"
    criterion_id: str | None  # "1.4.3"
    criterion_name: str | None
    is_best_practice: bool


def parse_criterion_id(tags: list[str]) -> str | None:
    """First WCAG criterion id encoded in the tag list, e.g. ['wcag143'] -> '1.4.3'."""
    for tag in tags:
        m = _CRITERION_TAG_RE.match(tag)
        if m:
            return f"{m.group(1)}.{m.group(2)}.{int(m.group(3))}"
    return None


def classify(tags: list[str]) -> WcagMapping:
    """Map an axe result's tags to (version, level, criterion). Never raises."""
    tagset = set(tags)
    version: str | None = None
    level: str | None = None
    # Prefer the newest version tag present (2.2 > 2.1 > 2.0), matching a
    # scoring standard of WCAG 2.2.
    for tag in ("wcag22aaa", "wcag22aa", "wcag22a", "wcag21aaa", "wcag21aa",
                "wcag21a", "wcag2aaa", "wcag2aa", "wcag2a"):
        if tag in tagset:
            version, level = _LEVEL_BY_VERSION_TAG[tag]
            break

    crit_id = parse_criterion_id(tags)
    crit = CRITERIA.get(crit_id) if crit_id else None
    if crit:
        # The catalog is authoritative for the level and introducing version.
        version, level = crit.version, crit.level

    return WcagMapping(
        version=version,
        level=level,
        criterion_id=crit_id,
        criterion_name=crit.name if crit else None,
        is_best_practice="best-practice" in tagset and version is None,
    )


def remediation_for(criterion_id: str | None, criterion_name: str | None, axe_help: str) -> str:
    """Original remediation text: catalog entry if we have one, else a generic template."""
    if criterion_id and criterion_id in REMEDIATION:
        return REMEDIATION[criterion_id]
    if criterion_id and criterion_name:
        return (
            f"Resolve the issues flagged for WCAG {criterion_id} {criterion_name}. "
            "Review each affected element and adjust its markup, labeling, or styling so it satisfies "
            "the success criterion."
        )
    # Best-practice / untagged rule: keep it actionable without copying vendor prose.
    return "Review the flagged elements and correct the accessibility problem identified for each."
