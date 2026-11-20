from __future__ import annotations

from collections import Counter, defaultdict
from itertools import combinations
from statistics import mean
from typing import TypeVar

from app.schemas.evaluation import (
    CandidateEvaluationResult,
    EditorReview,
    EvaluationDatasetSummary,
    EvaluationPolicy,
    PromoCandidate,
    PromoEvaluationReport,
    PromoEvaluationRequest,
    ReviewDecision,
    RubricCriterion,
    RubricDefinition,
    SourceEpisodeReference,
    SystemEvaluationMetrics,
    SystemEvaluationSummary,
)


class EvaluationInputError(ValueError):
    pass


ItemT = TypeVar("ItemT")


RUBRIC = RubricDefinition(
    criteria=[
        RubricCriterion(key="hook", label="Hook", question="Does it capture attention immediately?"),
        RubricCriterion(key="curiosity", label="Curiosity", question="Does it create a reason to keep watching?"),
        RubricCriterion(key="clarity", label="Clarity", question="Can it be understood without excessive context?"),
        RubricCriterion(key="emotion", label="Emotion", question="Does it create tension, surprise, empathy, or excitement?"),
        RubricCriterion(key="coherence", label="Coherence", question="Do the moments form a logical mini-story?"),
        RubricCriterion(key="spoiler_safety", label="Spoiler safety", question="Does it avoid revealing the payoff?"),
        RubricCriterion(key="editability", label="Editability", question="Could an editor turn it into a polished promo?"),
        RubricCriterion(key="brand_fit", label="Brand fit", question="Does it represent the show accurately?"),
    ],
    decisions=[decision.value for decision in ReviewDecision],
    instructions=[
        "Hide system and model identity from reviewers.",
        "Review candidates in a randomized order.",
        "Score the supplied footage selection, not the model explanation.",
        "Use at least two independent reviewers per candidate.",
    ],
)


def get_rubric() -> RubricDefinition:
    return RUBRIC.model_copy(deep=True)


def _unique_index(items: list[ItemT], key_name: str, label: str) -> dict[str, ItemT]:
    result: dict[str, ItemT] = {}
    for item in items:
        key = str(getattr(item, key_name))
        if key in result:
            raise EvaluationInputError(f"duplicate {label}: {key}")
        result[key] = item
    return result


def _majority(values: list[bool]) -> bool | None:
    positives = sum(values)
    negatives = len(values) - positives
    if positives == negatives:
        return None
    return positives > negatives


def _consensus_decision(reviews: list[EditorReview]) -> str:
    counts = Counter(review.decision.value for review in reviews)
    leaders = [decision for decision, count in counts.items() if count == max(counts.values())]
    return leaders[0] if len(leaders) == 1 else "split"


def _merged_intervals(candidate: PromoCandidate) -> dict[str, list[tuple[int, int]]]:
    by_episode: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for segment in candidate.segments:
        by_episode[segment.episode_id].append((segment.start_ms, segment.end_ms))

    merged: dict[str, list[tuple[int, int]]] = {}
    for episode_id, intervals in by_episode.items():
        collapsed: list[tuple[int, int]] = []
        for start, end in sorted(intervals):
            if collapsed and start <= collapsed[-1][1]:
                collapsed[-1] = (collapsed[-1][0], max(collapsed[-1][1], end))
            else:
                collapsed.append((start, end))
        merged[episode_id] = collapsed
    return merged


def temporal_iou(left: PromoCandidate, right: PromoCandidate) -> float:
    left_intervals = _merged_intervals(left)
    right_intervals = _merged_intervals(right)
    left_duration = sum(end - start for rows in left_intervals.values() for start, end in rows)
    right_duration = sum(end - start for rows in right_intervals.values() for start, end in rows)
    intersection = 0

    for episode_id in left_intervals.keys() & right_intervals.keys():
        left_rows = left_intervals[episode_id]
        right_rows = right_intervals[episode_id]
        left_index = right_index = 0
        while left_index < len(left_rows) and right_index < len(right_rows):
            left_start, left_end = left_rows[left_index]
            right_start, right_end = right_rows[right_index]
            intersection += max(0, min(left_end, right_end) - max(left_start, right_start))
            if left_end <= right_end:
                left_index += 1
            else:
                right_index += 1

    union = left_duration + right_duration - intersection
    return intersection / union if union else 0.0


def _candidate_issues(
    candidate: PromoCandidate,
    sources: dict[str, SourceEpisodeReference],
    policy: EvaluationPolicy,
) -> tuple[int, list[str]]:
    duration_ms = sum(segment.end_ms - segment.start_ms for segment in candidate.segments)
    issues: set[str] = set()
    if duration_ms < policy.min_duration_ms:
        issues.add("duration_too_short")
    if duration_ms > policy.max_duration_ms:
        issues.add("duration_too_long")

    chronology: list[tuple[int, int, int]] = []
    for segment in candidate.segments:
        source = sources.get(segment.episode_id)
        if source is None:
            issues.add("unknown_episode")
            continue
        chronology.append((source.episode_number, segment.start_ms, segment.end_ms))
        if segment.end_ms > source.duration_ms:
            issues.add("segment_out_of_bounds")
        if set(segment.evidence_event_ids) - set(source.event_ids):
            issues.add("unknown_evidence_event")
        if set(segment.evidence_event_ids) & set(source.spoiler_event_ids):
            issues.add("spoiler_evidence")

    for previous, current in zip(chronology, chronology[1:]):
        previous_episode, _, previous_end = previous
        current_episode, current_start, _ = current
        if current_episode < previous_episode or (
            current_episode == previous_episode and current_start < previous_end
        ):
            issues.add("non_chronological_segments")
            break

    return duration_ms, sorted(issues)


def _agreement(reviews_by_candidate: dict[str, list[EditorReview]]) -> float | None:
    comparisons = 0
    agreements = 0
    for reviews in reviews_by_candidate.values():
        for left, right in combinations(reviews, 2):
            comparisons += 1
            agreements += left.decision == right.decision
    return agreements / comparisons if comparisons else None


def _build_system_metrics(
    *,
    candidates: list[CandidateEvaluationResult],
    reviews_by_candidate: dict[str, list[EditorReview]],
    policy: EvaluationPolicy,
) -> SystemEvaluationMetrics:
    candidate_count = len(candidates)
    valid_count = sum(candidate.automatically_valid for candidate in candidates)
    fully_reviewed = [
        candidate
        for candidate in candidates
        if candidate.review_count >= policy.min_reviews_per_candidate
    ]
    top_candidates = sorted(candidates, key=lambda candidate: candidate.rank)[: policy.top_k]
    precision_complete = bool(top_candidates) and all(
        candidate.usable is not None for candidate in top_candidates
    )
    precision = (
        sum(candidate.usable is True for candidate in top_candidates) / len(top_candidates)
        if precision_complete
        else None
    )
    accepted = [
        candidate.editor_accepted
        for candidate in fully_reviewed
        if candidate.editor_accepted is not None
    ]
    system_reviews = [
        review
        for candidate in candidates
        for review in reviews_by_candidate.get(candidate.candidate_id, [])
    ]
    score_values = [review.scores.mean() for review in system_reviews]
    spoiler_determinations: list[bool] = []
    for candidate in candidates:
        if "spoiler_evidence" in candidate.issues:
            spoiler_determinations.append(True)
        elif candidate.review_count >= policy.min_reviews_per_candidate and candidate.spoiler_safe is not None:
            spoiler_determinations.append(not candidate.spoiler_safe)

    duplicate_pairs = {
        tuple(sorted((candidate.candidate_id, duplicate_id)))
        for candidate in candidates
        for duplicate_id in candidate.duplicate_of
    }
    return SystemEvaluationMetrics(
        candidate_count=candidate_count,
        automatically_valid_count=valid_count,
        automatic_validity_rate=valid_count / candidate_count,
        fully_reviewed_count=len(fully_reviewed),
        review_coverage=len(fully_reviewed) / candidate_count,
        precision_at_k=precision,
        precision_at_k_complete=precision_complete,
        acceptance_rate=sum(accepted) / len(accepted) if accepted else None,
        mean_editor_score=round(mean(score_values), 3) if score_values else None,
        boundary_usable_rate=(
            sum(review.boundary_usable for review in system_reviews) / len(system_reviews)
            if system_reviews
            else None
        ),
        spoiler_violation_rate=(
            sum(spoiler_determinations) / len(spoiler_determinations)
            if spoiler_determinations
            else None
        ),
        duplicate_candidate_rate=(
            sum(bool(candidate.duplicate_of) for candidate in candidates) / candidate_count
        ),
        duplicate_pair_count=len(duplicate_pairs),
        inter_reviewer_agreement=_agreement(
            {
                candidate.candidate_id: reviews_by_candidate.get(candidate.candidate_id, [])
                for candidate in candidates
            }
        ),
    )


def evaluate_promos(payload: PromoEvaluationRequest) -> PromoEvaluationReport:
    sources = _unique_index(payload.source_episodes, "episode_id", "source episode")
    candidates = _unique_index(payload.candidates, "candidate_id", "candidate")
    episode_numbers = [source.episode_number for source in payload.source_episodes]
    if len(episode_numbers) != len(set(episode_numbers)):
        raise EvaluationInputError("source episode numbers must be unique")

    ranks: set[tuple[str, int]] = set()
    for candidate in payload.candidates:
        rank_key = (candidate.system_id, candidate.rank)
        if rank_key in ranks:
            raise EvaluationInputError(
                f"duplicate rank {candidate.rank} for system {candidate.system_id}"
            )
        ranks.add(rank_key)

    reviews_by_candidate: dict[str, list[EditorReview]] = defaultdict(list)
    review_keys: set[tuple[str, str]] = set()
    for review in payload.reviews:
        if review.candidate_id not in candidates:
            raise EvaluationInputError(f"review references unknown candidate: {review.candidate_id}")
        review_key = (review.candidate_id, review.reviewer_id)
        if review_key in review_keys:
            raise EvaluationInputError(
                f"duplicate review for candidate {review.candidate_id} by {review.reviewer_id}"
            )
        review_keys.add(review_key)
        reviews_by_candidate[review.candidate_id].append(review)

    duplicates: dict[str, list[str]] = defaultdict(list)
    systems: dict[str, list[PromoCandidate]] = defaultdict(list)
    for candidate in payload.candidates:
        systems[candidate.system_id].append(candidate)
    for system_candidates in systems.values():
        ranked = sorted(system_candidates, key=lambda candidate: candidate.rank)
        for higher_index, higher in enumerate(ranked):
            for lower in ranked[higher_index + 1 :]:
                if temporal_iou(higher, lower) >= payload.policy.duplicate_iou_threshold:
                    duplicates[lower.candidate_id].append(higher.candidate_id)

    results: list[CandidateEvaluationResult] = []
    for candidate in payload.candidates:
        duration_ms, issues = _candidate_issues(
            candidate,
            sources,
            payload.policy,
        )
        reviews = reviews_by_candidate.get(candidate.candidate_id, [])
        has_enough_reviews = len(reviews) >= payload.policy.min_reviews_per_candidate
        consensus_decision = _consensus_decision(reviews) if has_enough_reviews else None
        editor_accepted = (
            _majority([review.decision != ReviewDecision.REJECT for review in reviews])
            if has_enough_reviews
            else None
        )
        boundary_usable = (
            _majority([review.boundary_usable for review in reviews])
            if has_enough_reviews
            else None
        )
        spoiler_safe = (
            _majority([review.spoiler_safe for review in reviews])
            if has_enough_reviews
            else None
        )
        automatically_valid = not issues
        decisions_complete = all(
            value is not None for value in (editor_accepted, boundary_usable, spoiler_safe)
        )
        usable = (
            automatically_valid
            and editor_accepted is True
            and boundary_usable is True
            and spoiler_safe is True
            if decisions_complete
            else None
        )
        results.append(
            CandidateEvaluationResult(
                candidate_id=candidate.candidate_id,
                system_id=candidate.system_id,
                rank=candidate.rank,
                duration_ms=duration_ms,
                automatically_valid=automatically_valid,
                issues=issues,
                duplicate_of=duplicates.get(candidate.candidate_id, []),
                review_count=len(reviews),
                mean_editor_score=(
                    round(mean(review.scores.mean() for review in reviews), 3)
                    if reviews
                    else None
                ),
                consensus_decision=consensus_decision,
                editor_accepted=editor_accepted,
                boundary_usable=boundary_usable,
                spoiler_safe=spoiler_safe,
                usable=usable,
            )
        )

    summaries = []
    for system_id in sorted(systems):
        system_results = sorted(
            [result for result in results if result.system_id == system_id],
            key=lambda result: result.rank,
        )
        summaries.append(
            SystemEvaluationSummary(
                system_id=system_id,
                metrics=_build_system_metrics(
                    candidates=system_results,
                    reviews_by_candidate=reviews_by_candidate,
                    policy=payload.policy,
                ),
            )
        )

    return PromoEvaluationReport(
        policy=payload.policy,
        dataset=EvaluationDatasetSummary(
            candidate_count=len(payload.candidates),
            review_count=len(payload.reviews),
            reviewer_count=len({review.reviewer_id for review in payload.reviews}),
            system_count=len(systems),
        ),
        systems=summaries,
        candidates=sorted(results, key=lambda result: (result.system_id, result.rank)),
    )
