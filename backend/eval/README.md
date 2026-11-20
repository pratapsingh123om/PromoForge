# Promo quality evaluation

This harness answers a narrow question: **did a ranked system choose promos that
editors consider usable?** Model confidence is never used as the answer.

## Protocol

1. Freeze the candidate list before review.
2. Replace provider/system names with neutral codes such as `A` and `B`.
3. Randomize the viewing order outside this evaluator.
4. Give every candidate to at least two independent editors.
5. Editors score hook, curiosity, clarity, emotion, coherence, spoiler safety,
   editability, and brand fit from 1–5, then choose approve, approve with
   changes, or reject.
6. Submit the source contract, candidates, and reviews to the evaluator.
7. Resolve split decisions with an additional reviewer instead of forcing a
   favorable result.

Do not show model explanations, provider names, ranks, or internal scores to
reviewers. Reviewers judge the proposed footage selection.

## Automatic gates

A candidate is automatically invalid when it has an unsupported duration,
unknown episode or evidence ID, out-of-bounds segment, non-chronological
segments, or evidence marked as a known resolution/spoiler. Near-duplicates are
reported separately using temporal intersection-over-union; they do not make a
good individual clip bad, but they do reduce campaign diversity.

A candidate is counted as usable only when it passes every automatic gate and
the reviewer majority accepts it, considers its boundaries usable, and marks it
spoiler-safe. Tied reviewer votes remain unresolved.

## Metrics

- `precision_at_k`: usable candidates among the system's top K. It is `null`
  until every top-K candidate has enough reviews.
- `acceptance_rate`: candidates accepted by the editor majority.
- `automatic_validity_rate`: candidates passing all deterministic gates.
- `boundary_usable_rate`: share of reviews marking edit boundaries usable.
- `spoiler_violation_rate`: known or reviewer-confirmed spoiler violations.
- `duplicate_candidate_rate`: lower-ranked candidates duplicating a higher rank.
- `inter_reviewer_agreement`: exact decision agreement across reviewer pairs.
- `review_coverage`: candidates meeting the minimum independent-review count.

## Run the synthetic example

From the repository root:

```powershell
.\backend\.venv\Scripts\python.exe backend\scripts\run_promo_evaluation.py
```

To evaluate another JSON dataset:

```powershell
.\backend\.venv\Scripts\python.exe backend\scripts\run_promo_evaluation.py path\to\dataset.json
```

The same operations are available through:

- `GET /api/evaluation/rubric`
- `POST /api/evaluation/promos`

The included fixture is entirely synthetic. Never upload confidential footage
or screenplay text to third-party evaluation services without authorization.
