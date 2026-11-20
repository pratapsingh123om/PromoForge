from __future__ import annotations

import hashlib
from statistics import mean

from app.schemas.promos import (
    PromoCandidateDraft,
    PromoScoreComponents,
    PromoSourceEvent,
)


GENERATOR_VERSION = "continuous-promo-v1"
MIN_DURATION_MS = 20_000
MAX_DURATION_MS = 60_000
TARGET_DURATION_MS = 40_000
MIN_HOOK_STRENGTH = 55
MIN_ENDING_STRENGTH = 60
DUPLICATE_IOU_THRESHOLD = 0.65
MAX_ENDINGS_PER_HOOK = 2
MAX_SELECTED_CANDIDATES = 3


class PromoDiscoveryError(ValueError):
    pass


def _candidate_key(
    episode_id: str,
    start_ms: int,
    end_ms: int,
    hook_event_id: str,
    end_event_id: str,
) -> str:
    material = (
        f"{GENERATOR_VERSION}|{episode_id}|{start_ms}|{end_ms}|"
        f"{hook_event_id}|{end_event_id}"
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:12].upper()
    return f"{episode_id}_P_{digest}"


def _duration_fit(duration_ms: int) -> float:
    maximum_distance = max(
        TARGET_DURATION_MS - MIN_DURATION_MS,
        MAX_DURATION_MS - TARGET_DURATION_MS,
    )
    return max(0.0, 100.0 * (1 - abs(duration_ms - TARGET_DURATION_MS) / maximum_distance))


def is_fragment_or_continuation(text: str) -> bool:
    """Returns True if text is a sentence continuation or fragment that cannot open a standalone promo."""
    clean = text.strip(' "\'()[]')
    if not clean:
        return False
    if clean.startswith("...") or clean.startswith("…") or clean.startswith("--"):
        return True
    if clean[0].islower():
        return True
    first_word = clean.split()[0].lower()
    conjunctions = {
        "because", "and", "but", "so", "or", "which", "that", "since",
        "yet", "nor", "though", "although", "while", "whereas"
    }
    if first_word in conjunctions:
        return True
    return False


def is_mid_speech_turn(events: list[PromoSourceEvent], idx: int) -> bool:
    """Returns True if the event is the continuation of a character's multi-sentence dialogue turn."""
    current = events[idx]
    if not current.character or current.event_type != "dialogue":
        return False
    if idx == 0:
        return False
    for prev_idx in range(idx - 1, -1, -1):
        prev = events[prev_idx]
        if prev.character == current.character and prev.event_type == "dialogue":
            # If the gap between parts of the same speech is short (<= 3.5s) without another speaker
            if current.start_ms - prev.end_ms <= 3500:
                return True
            break
        if prev.character and prev.character != current.character and prev.event_type == "dialogue":
            break
    return False


def is_cliffhanger_continuation_or_spoiler(
    proposal: PromoCandidateDraft,
    kept: PromoCandidateDraft,
    events_by_id: dict[str, PromoSourceEvent],
) -> bool:
    """H7 check: promo cannot spoil another promo's cliffhanger or continue its sentence."""
    # 1. Proposal plays through the resolution of kept's cliffhanger
    if proposal.start_ms <= kept.end_ms < proposal.end_ms:
        return True

    # 2. Proposal starts immediately adjacent (within 3.5s) to kept's ending
    if 0 <= proposal.start_ms - kept.end_ms <= 3500:
        kept_end = events_by_id.get(kept.end_event_id)
        prop_start = events_by_id.get(proposal.hook_event_id)
        if kept_end and prop_start:
            clean_end = kept_end.text.strip(' "\'()[]')
            # If kept ended in an open question or unfinished sentence
            if clean_end.endswith("?") or clean_end.endswith("...") or clean_end.endswith("…"):
                return True
            if is_fragment_or_continuation(prop_start.text):
                return True
            # If proposal opens on an immediate direct answer to kept's line
            if kept_end.character and prop_start.character and kept_end.character != prop_start.character:
                if prop_start.start_ms - kept_end.end_ms <= 2500:
                    return True
    return False


def _score_candidate(
    start: PromoSourceEvent,
    end: PromoSourceEvent,
    evidence: list[PromoSourceEvent],
    duration_ms: int,
) -> tuple[float, PromoScoreComponents]:
    tensions = [float(e.tension) for e in evidence]
    max_tension = max(tensions)
    avg_tension = mean(tensions)
    trajectory_bonus = 3.0 if (len(tensions) >= 3 and tensions[-1] >= tensions[0]) else 0.0
    tension = round(min(100.0, max(40.0, avg_tension * 0.4 + max_tension * 0.6 + trajectory_bonus)), 1)

    clean_end = end.text.strip(' "\'()[]')
    has_open_question = any(event.open_question for event in evidence)
    if end.open_question or clean_end.endswith("?"):
        curiosity = round(min(98.0, 78.0 + end.hook_strength * 0.12 + max_tension * 0.08), 1)
    elif clean_end.endswith("...") or clean_end.endswith("…"):
        curiosity = round(min(92.0, 70.0 + end.hook_strength * 0.10 + max_tension * 0.10), 1)
    elif has_open_question:
        curiosity = round(min(84.0, 60.0 + max_tension * 0.22), 1)
    else:
        curiosity = round(max(45.0, min(75.0, float(end.tension) * 0.65 + float(end.hook_strength) * 0.2)), 1)

    clean_end_bonus = 8.0 if (clean_end.endswith("?") or clean_end.endswith("...")) else 0.0
    ending = round(min(100.0, max(40.0, end.tension * 0.55 + end.hook_strength * 0.35 + clean_end_bonus)), 1)

    clean_start = start.text.strip(' "\'()[]')
    word_count = len(clean_start.split())
    punchiness = 4.0 if 3 <= word_count <= 12 else (0.0 if word_count <= 20 else -4.0)
    hook = round(min(100.0, max(40.0, float(start.hook_strength) + punchiness)), 1)

    raw_conf = mean(event.confidence for event in evidence) * 100.0
    confidence = round(min(98.0, max(50.0, raw_conf)), 1)
    duration_fit = round(_duration_fit(duration_ms), 1)

    components = PromoScoreComponents(
        hook=hook,
        tension=tension,
        curiosity=curiosity,
        ending=ending,
        confidence=confidence,
        duration_fit=duration_fit,
    )
    score = (
        components.hook * 0.25
        + components.tension * 0.25
        + components.curiosity * 0.20
        + components.ending * 0.15
        + components.confidence * 0.10
        + components.duration_fit * 0.05
    )
    return round(score, 3), components


def validate_candidate(
    candidate: PromoCandidateDraft,
    *,
    episode_duration_ms: int,
    source_events: list[PromoSourceEvent],
) -> list[str]:
    issues: set[str] = set()
    source_by_id = {event.event_id: event for event in source_events}
    evidence = [source_by_id[event_id] for event_id in candidate.evidence_event_ids if event_id in source_by_id]

    if candidate.duration_ms != candidate.end_ms - candidate.start_ms:
        issues.add("duration_mismatch")
    if candidate.duration_ms < MIN_DURATION_MS:
        issues.add("duration_too_short")
    if candidate.duration_ms > MAX_DURATION_MS:
        issues.add("duration_too_long")
    if candidate.end_ms > episode_duration_ms:
        issues.add("segment_out_of_bounds")
    if len(evidence) != len(candidate.evidence_event_ids):
        issues.add("unknown_evidence_event")
    if candidate.hook_event_id not in candidate.evidence_event_ids:
        issues.add("missing_hook_evidence")
    if candidate.end_event_id not in candidate.evidence_event_ids:
        issues.add("missing_end_evidence")
    if any(
        event.start_ms < candidate.start_ms or event.end_ms > candidate.end_ms
        for event in evidence
    ):
        issues.add("evidence_outside_segment")
    if any(event.resolves_question for event in evidence):
        issues.add("contains_resolution")

    # Hard constraint: cuts must never slice a line of dialogue
    for event in source_events:
        if event.event_type == "dialogue" or event.character:
            if event.start_ms < candidate.start_ms < event.end_ms:
                issues.add("slices_event_at_start")
            if event.start_ms < candidate.end_ms < event.end_ms:
                issues.add("slices_event_at_end")

    hook = source_by_id.get(candidate.hook_event_id)
    ending = source_by_id.get(candidate.end_event_id)
    if hook is None or hook.start_ms != candidate.start_ms:
        issues.add("invalid_hook_boundary")
    if ending is None or ending.end_ms != candidate.end_ms:
        issues.add("invalid_end_boundary")
    if hook is not None and hook.hook_strength < MIN_HOOK_STRENGTH:
        issues.add("weak_hook")
    if hook is not None and (hook.start_ms - candidate.start_ms > 3000):
        issues.add("hook_not_in_first_3_seconds")
    if ending is not None and not (
        ending.open_question
        or ending.tension >= MIN_ENDING_STRENGTH
        or ending.hook_strength >= MIN_ENDING_STRENGTH
    ):
        issues.add("weak_cliffhanger")
    return sorted(issues)


def temporal_iou(left: PromoCandidateDraft, right: PromoCandidateDraft) -> float:
    if left.episode_id != right.episode_id:
        return 0.0
    intersection = max(0, min(left.end_ms, right.end_ms) - max(left.start_ms, right.start_ms))
    union = left.duration_ms + right.duration_ms - intersection
    return intersection / union if union else 0.0


def overlap_ratio(left: PromoCandidateDraft, right: PromoCandidateDraft) -> float:
    """H6 check: ratio of overlap relative to the shorter promo's duration."""
    if left.episode_id != right.episode_id:
        return 0.0
    intersection = max(0, min(left.end_ms, right.end_ms) - max(left.start_ms, right.start_ms))
    shorter = min(left.duration_ms, right.duration_ms)
    return intersection / shorter if shorter > 0 else 0.0


def discover_promo_candidates(
    *,
    episode_id: str,
    episode_duration_ms: int,
    source_events: list[PromoSourceEvent],
    max_selected: int = MAX_SELECTED_CANDIDATES,
) -> list[PromoCandidateDraft]:
    if episode_duration_ms <= 0:
        raise PromoDiscoveryError("episode_duration_ms must be positive")
    if max_selected < 1:
        raise PromoDiscoveryError("max_selected must be at least one")

    events = sorted(source_events, key=lambda event: (event.start_ms, event.end_ms, event.event_id))
    events_by_id = {event.event_id: event for event in events}
    proposals: list[PromoCandidateDraft] = []
    for start_index, start in enumerate(events):
        if start.narrative_type in {"context", "resolution"}:
            continue
        if start.hook_strength < MIN_HOOK_STRENGTH or start.resolves_question:
            continue
        # Ban hooks that are sentence continuation fragments (e.g. starting with "..." or lowercase conjunction)
        if is_fragment_or_continuation(start.text):
            continue
        # Ban hooks that slice into the middle of a character's multi-sentence dialogue turn
        if is_mid_speech_turn(events, start_index):
            continue

        ending_options: list[PromoCandidateDraft] = []
        for end in events[start_index:]:
            duration_ms = end.end_ms - start.start_ms
            if duration_ms < MIN_DURATION_MS:
                continue
            if duration_ms > MAX_DURATION_MS:
                continue
            if end.end_ms > episode_duration_ms or end.resolves_question:
                continue
            if not (
                end.open_question
                or end.tension >= MIN_ENDING_STRENGTH
                or end.hook_strength >= MIN_ENDING_STRENGTH
            ):
                continue

            evidence = [
                event
                for event in events
                if event.start_ms >= start.start_ms and event.end_ms <= end.end_ms
            ]
            if not evidence:
                continue
            score, components = _score_candidate(start, end, evidence, duration_ms)
            candidate = PromoCandidateDraft(
                candidate_key=_candidate_key(
                    episode_id,
                    start.start_ms,
                    end.end_ms,
                    start.event_id,
                    end.event_id,
                ),
                episode_id=episode_id,
                start_ms=start.start_ms,
                end_ms=end.end_ms,
                duration_ms=duration_ms,
                hook_event_id=start.event_id,
                end_event_id=end.event_id,
                evidence_event_ids=[event.event_id for event in evidence],
                score=score,
                score_components=components,
            )
            issues = validate_candidate(
                candidate,
                episode_duration_ms=episode_duration_ms,
                source_events=events,
            )
            if not issues:
                ending_options.append(candidate)

        ending_options.sort(
            key=lambda candidate: (-candidate.score, candidate.end_ms, candidate.candidate_key)
        )
        proposals.extend(ending_options[:MAX_ENDINGS_PER_HOOK])

    proposals.sort(
        key=lambda candidate: (
            -candidate.score,
            candidate.start_ms,
            candidate.end_ms,
            candidate.candidate_key,
        )
    )
    selected: list[PromoCandidateDraft] = []
    final: list[PromoCandidateDraft] = []
    for proposal in proposals:
        # H6: No two promos in the final list overlap by more than 20% of the shorter one
        duplicate = next(
            (
                kept
                for kept in selected
                if overlap_ratio(proposal, kept) > 0.20 or temporal_iou(proposal, kept) > 0.20
            ),
            None,
        )
        if duplicate is not None:
            final.append(
                proposal.model_copy(
                    update={
                        "status": "suppressed",
                        "suppressed_by_key": duplicate.candidate_key,
                    }
                )
            )
            continue

        # H7: No promo contains the answer to another promo's cliffhanger or continues its sentence
        spoils_kept = next(
            (
                kept
                for kept in selected
                if is_cliffhanger_continuation_or_spoiler(proposal, kept, events_by_id)
            ),
            None,
        )
        if spoils_kept is not None:
            final.append(
                proposal.model_copy(
                    update={
                        "status": "suppressed",
                        "suppressed_by_key": spoils_kept.candidate_key,
                    }
                )
            )
            continue

        if len(selected) >= max_selected:
            final.append(proposal.model_copy(update={"status": "not_selected"}))
        else:
            assert MIN_DURATION_MS <= proposal.duration_ms <= MAX_DURATION_MS, (
                f"Promo duration {proposal.duration_ms / 1000.0}s outside hard constraint [20.0s, 60.0s]"
            )
            ranked = proposal.model_copy(
                update={"status": "selected", "rank": len(selected) + 1}
            )
            selected.append(ranked)
            final.append(ranked)
    return final
