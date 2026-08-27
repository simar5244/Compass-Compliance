"""Which groups of people a failing WCAG criterion affects.

The overview reports failing checks by the kind of barrier they create, so an
editor can see whether the site's problems fall mainly on people who cannot see
it, cannot hear it, cannot use a mouse, or find it hard to follow.

The grouping is editorial reference data, taken from how W3C's "How People with
Disabilities Use the Web" and the WCAG Understanding documents describe who each
success criterion serves. A criterion commonly serves more than one group, so it
counts once per group it appears in — the four totals deliberately overlap and
do not sum to the number of failing checks.
"""

from __future__ import annotations

#: Criteria whose failure most affects people who are blind, have low vision, or
#: do not distinguish colour: anything conveyed only visually, or unreachable by
#: a screen reader.
VISUAL: frozenset[str] = frozenset({
    "1.1.1", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.3.6",
    "1.4.1", "1.4.3", "1.4.4", "1.4.5", "1.4.6", "1.4.8", "1.4.9",
    "1.4.10", "1.4.11", "1.4.12", "1.4.13",
    "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7",
    "2.4.9", "2.4.10", "2.4.11",
    "3.1.1", "3.1.2", "3.2.1", "3.2.2", "3.3.1", "3.3.2",
    "4.1.2", "4.1.3",
})

#: Criteria for people who are deaf or hard of hearing: audio without a text
#: alternative, and sound they cannot turn off or separate from speech.
AUDITORY: frozenset[str] = frozenset({
    "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7", "1.2.8", "1.2.9",
    "1.4.2", "1.4.7",
})

#: Criteria for people with limited dexterity or who do not use a mouse:
#: keyboard traps, small or crowded targets, and time limits.
MOTOR: frozenset[str] = frozenset({
    "2.1.1", "2.1.2", "2.1.3", "2.1.4",
    "2.2.1", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6",
    "2.4.1", "2.4.3", "2.4.7", "2.4.11", "2.4.12", "2.4.13",
    "2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.5", "2.5.6", "2.5.7", "2.5.8",
    "3.2.1", "3.2.2", "3.3.2",
})

#: Criteria for people with learning difficulties, attention or memory
#: differences: dense or unpredictable content, and unforgiving forms.
COGNITIVE: frozenset[str] = frozenset({
    "1.3.1", "1.4.8", "1.4.12",
    "2.2.1", "2.2.2", "2.2.6",
    "2.4.2", "2.4.5", "2.4.6",
    "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6",
    "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.6",
    "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.7", "3.3.8",
})

#: Presented in this order on the overview.
DISABILITY_GROUPS: tuple[tuple[str, frozenset[str]], ...] = (
    ("Visual", VISUAL),
    ("Auditory", AUDITORY),
    ("Motor", MOTOR),
    ("Cognitive", COGNITIVE),
)


def groups_for(criterion_id: str | None) -> tuple[str, ...]:
    """The groups a criterion serves; empty when it is unmapped or absent."""
    if not criterion_id:
        return ()
    return tuple(name for name, members in DISABILITY_GROUPS if criterion_id in members)
