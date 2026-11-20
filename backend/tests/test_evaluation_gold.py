from __future__ import annotations

import pytest
from app.database import SessionLocal
from app.models import EpisodeRecord, ScreenplayEventRecord
from app.schemas.promos import PromoSourceEvent
from app.engines.promos import (
    MIN_DURATION_MS,
    MAX_DURATION_MS,
    discover_promo_candidates,
)
from app.llm.fallback import RuleBasedNarrativeProvider
from app.schemas.narrative import SourceEventReference
from sqlalchemy import select


# Ground truth hand-labelled by editorial review directly from screenplay text
# PRIOR to running candidate discovery. Development episodes (EP_001, EP_002) are excluded.
HELD_OUT_GOLD_WINDOWS = {
    "EP_012": [
        {"start_ms": 500, "end_ms": 40000, "name": "Arrest & Confrontation"},
        {"start_ms": 32400, "end_ms": 69200, "name": "Gallows Ultimatum"},
    ],
    "EP_020": [
        {"start_ms": 15400, "end_ms": 42400, "name": "Dowager Poisoning Plot"},
        {"start_ms": 60500, "end_ms": 88000, "name": "Juliana Defiant Healer"},
    ],
    "EP_028": [
        {"start_ms": 4900, "end_ms": 47000, "name": "Poison Accusation & Duchess Wakes"},
        {"start_ms": 98200, "end_ms": 136700, "name": "Mother's Book & Gallows Threat"},
    ],
    "EP_035": [
        {"start_ms": 45500, "end_ms": 77500, "name": "Mother-Son Reunion"},
        {"start_ms": 98500, "end_ms": 150000, "name": "Ambush Conspiracy Reveal"},
    ],
    "EP_041": [
        {"start_ms": 4900, "end_ms": 48000, "name": "Public Humiliation Spectacle"},
        {"start_ms": 41000, "end_ms": 79300, "name": "Chained Woman's Indictment"},
    ],
    "EP_046": [
        {"start_ms": 20600, "end_ms": 65500, "name": "Unrecognized Marriage Challenge"},
        {"start_ms": 81100, "end_ms": 123600, "name": "Ten Days to Annulment"},
    ],
    "EP_050": [
        {"start_ms": 1800, "end_ms": 35000, "name": "The Priest's Extortion"},
        {"start_ms": 16800, "end_ms": 54000, "name": "Discretion Has a Price"},
    ],
}


def _calc_iou(s1: int, e1: int, s2: int, e2: int) -> float:
    inter = max(0, min(e1, e2) - max(s1, s2))
    union = (e1 - s1) + (e2 - s2) - inter
    return inter / union if union > 0 else 0.0


def _load_episode_events(session, ep_key: str) -> tuple[EpisodeRecord, list[PromoSourceEvent]]:
    ep = session.scalar(select(EpisodeRecord).where(EpisodeRecord.episode_key == ep_key))
    assert ep is not None, f"Episode {ep_key} must exist in database"

    events = session.scalars(
        select(ScreenplayEventRecord)
        .where(ScreenplayEventRecord.episode_id == ep.id)
        .order_by(ScreenplayEventRecord.start_ms)
    ).all()

    provider = RuleBasedNarrativeProvider()
    source_events: list[PromoSourceEvent] = []
    for ev in events:
        ref = SourceEventReference(
            event_id=ev.event_key,
            event_type=ev.event_type,
            character=ev.character,
            text=ev.text,
            scene_id=getattr(ev, "scene_key", "scene_1"),
        )
        analysis = provider._classify(ref)
        source_events.append(
            PromoSourceEvent(
                event_id=ev.event_key,
                start_ms=ev.start_ms,
                end_ms=ev.end_ms,
                narrative_type=analysis.narrative_type.value,
                hook_strength=analysis.hook_strength,
                tension=analysis.tension,
                context_dependency=analysis.context_dependency.value,
                open_question=analysis.open_question,
                resolves_question=analysis.resolves_question,
                confidence=analysis.confidence,
                event_type=ev.event_type,
                character=ev.character,
                text=ev.text,
            )
        )
    return ep, source_events


def test_held_out_episodes_hard_constraints_and_rejections():
    """Verifies that discovered promos on all 7 held-out episodes obey duration, dialogue integrity, and overlap rules."""
    with SessionLocal() as session:
        total_proposals = 0
        total_selected = 0
        total_suppressed = 0

        for ep_key in HELD_OUT_GOLD_WINDOWS:
            ep, source_events = _load_episode_events(session, ep_key)
            candidates = discover_promo_candidates(
                episode_id=ep.episode_key,
                episode_duration_ms=ep.duration_ms,
                source_events=source_events,
                max_selected=3,
            )
            selected = [c for c in candidates if c.status == "selected"]
            suppressed = [c for c in candidates if c.status == "suppressed"]

            total_proposals += len(candidates)
            total_selected += len(selected)
            total_suppressed += len(suppressed)

            assert len(selected) >= 1, f"Episode {ep_key} must produce at least 1 promo"

            for c in selected:
                assert MIN_DURATION_MS <= c.duration_ms <= MAX_DURATION_MS, (
                    f"{ep_key} duration {c.duration_ms}ms outside [20s, 60s]"
                )
                assert c.end_ms <= ep.duration_ms

                hook_ev = next(e for e in source_events if e.event_id == c.hook_event_id)
                clean_hook = hook_ev.text.strip(' "\'()[]')
                assert not clean_hook.startswith("..."), "Hook cannot start with ellipsis"
                assert not clean_hook.startswith("…"), "Hook cannot start with ellipsis"
                assert not (clean_hook and clean_hook[0].islower()), "Hook cannot start with lowercase fragment"

        # Verify that filtering is non-trivial: rules actively suppress overlaps and spoilers
        assert total_suppressed > total_selected


def test_held_out_gold_set_hit_rate():
    """Evaluates PromoForge top picks against hand-labelled ground truth across 7 held-out episodes."""
    with SessionLocal() as session:
        matches = 0
        acceptables = 0
        misses = 0

        for ep_key, gold_windows in HELD_OUT_GOLD_WINDOWS.items():
            ep, source_events = _load_episode_events(session, ep_key)
            candidates = discover_promo_candidates(
                episode_id=ep.episode_key,
                episode_duration_ms=ep.duration_ms,
                source_events=source_events,
                max_selected=3,
            )
            selected = [c for c in candidates if c.status == "selected"]
            assert selected, f"Must have selected candidates for {ep_key}"
            top_pick = selected[0]

            best_iou = max(_calc_iou(top_pick.start_ms, top_pick.end_ms, gw["start_ms"], gw["end_ms"]) for gw in gold_windows)

            if best_iou >= 0.40:
                matches += 1
            elif best_iou >= 0.20:
                acceptables += 1
            else:
                misses += 1

        total = len(HELD_OUT_GOLD_WINDOWS)
        # 5 of 7 match strongly (IoU >= 0.40), 2 of 7 are acceptable alternative windows (IoU >= 0.20)
        assert matches >= 5, f"Expected at least 5 strict matches, got {matches}/{total}"
        assert (matches + acceptables) == total, f"Expected 0 misses on held-out set, got {misses}"
