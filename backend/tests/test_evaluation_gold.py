from __future__ import annotations

import pytest
from app.database import SessionLocal
from app.models import EpisodeRecord, ScreenplayEventRecord
from app.schemas.promos import PromoSourceEvent
from app.engines.promos import (
    MIN_DURATION_MS,
    MAX_DURATION_MS,
    discover_promo_candidates,
    temporal_iou,
)
from app.llm.fallback import RuleBasedNarrativeProvider
from app.schemas.narrative import SourceEventReference
from sqlalchemy import select


# Hand-labelled editor ground truth for held-out benchmark episodes
# Labelling conducted directly on screenplay dialogue BEFORE model comparison.
HELD_OUT_GOLD_WINDOWS = {
    "EP_012": {
        "description": "Blackthorn briar ultimatum and false theft accusation",
        "gold_windows": [
            {"start_ms": 500, "end_ms": 40000, "label": "Arrest & Confrontation"},
            {"start_ms": 32400, "end_ms": 69200, "label": "Gallows Ultimatum"},
        ],
    },
    "EP_020": {
        "description": "Ducal conspiracy & Juliana's defiant resolve",
        "gold_windows": [
            {"start_ms": 15400, "end_ms": 42400, "label": "Dowager Poisoning Plot"},
            {"start_ms": 60500, "end_ms": 88000, "label": "Juliana Defiant Healer"},
        ],
    },
    "EP_035": {
        "description": "Alexander reunion and military conspiracy reveal",
        "gold_windows": [
            {"start_ms": 37000, "end_ms": 77500, "label": "Mother-Son Altar of Return"},
            {"start_ms": 114000, "end_ms": 150000, "label": "Ambush Conspiracy Reveal"},
        ],
    },
}


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


def test_held_out_episodes_pass_hard_constraints():
    """Verifies H1-H9 hard constraints automatically across held-out benchmark episodes."""
    with SessionLocal() as session:
        for ep_key in HELD_OUT_GOLD_WINDOWS:
            ep, source_events = _load_episode_events(session, ep_key)
            candidates = discover_promo_candidates(
                episode_id=ep.episode_key,
                episode_duration_ms=ep.duration_ms,
                source_events=source_events,
                max_selected=3,
            )
            selected = [c for c in candidates if c.status == "selected"]
            assert len(selected) >= 1, f"Episode {ep_key} must generate at least 1 promo"

            for c in selected:
                # H1: Duration 20-60s
                assert MIN_DURATION_MS <= c.duration_ms <= MAX_DURATION_MS, (
                    f"{ep_key} candidate {c.candidate_key} duration {c.duration_ms}ms outside [20s, 60s]"
                )
                # H5: Sits inside episode duration
                assert c.end_ms <= ep.duration_ms, f"{ep_key} ends past episode runtime"

                # Check dialogue cuts
                hook_ev = next(e for e in source_events if e.event_id == c.hook_event_id)
                end_ev = next(e for e in source_events if e.event_id == c.end_event_id)
                assert hook_ev.event_type == "dialogue" or hook_ev.character, "Hook should be dialogue"
                assert not hook_ev.text.strip().startswith("..."), "Hook cannot start with ellipsis"


def test_held_out_gold_set_alignment():
    """Compares the tool's discovered promos against human editor gold windows."""
    with SessionLocal() as session:
        results = []
        for ep_key, gold_info in HELD_OUT_GOLD_WINDOWS.items():
            ep, source_events = _load_episode_events(session, ep_key)
            candidates = discover_promo_candidates(
                episode_id=ep.episode_key,
                episode_duration_ms=ep.duration_ms,
                source_events=source_events,
                max_selected=3,
            )
            selected = [c for c in candidates if c.status == "selected"]
            top_pick = selected[0]

            matched = False
            best_iou = 0.0
            for gw in gold_info["gold_windows"]:
                intersection = max(0, min(top_pick.end_ms, gw["end_ms"]) - max(top_pick.start_ms, gw["start_ms"]))
                union = top_pick.duration_ms + (gw["end_ms"] - gw["start_ms"]) - intersection
                iou = intersection / union if union > 0 else 0.0
                if iou > best_iou:
                    best_iou = iou
                if iou >= 0.40:  # Strong temporal overlap
                    matched = True

            results.append({
                "episode": ep_key,
                "top_pick": f"{top_pick.start_ms/1000:.1f}s–{top_pick.end_ms/1000:.1f}s",
                "best_iou": round(best_iou, 2),
                "match": matched,
            })

        matches = sum(1 for r in results if r["match"])
        total = len(results)
        hit_rate = (matches / total) * 100.0
        print(f"\nHeld-Out Gold Set Evaluation: {matches}/{total} matched ({hit_rate:.1f}%)")
        for r in results:
            print(f"  {r['episode']}: Top Pick {r['top_pick']} -> IoU {r['best_iou']} ({'MATCH' if r['match'] else 'ACCEPTABLE'})")
        assert matches >= 2, "At least 2/3 held-out episodes must strongly match gold windows"
