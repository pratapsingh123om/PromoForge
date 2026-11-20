# Apex Reel: Evaluation Strategy

Purpose: decide whether a promo is good, find where the tool picks badly, and map each failure to a fix.
Scope: Problem 1 (find promos in microdrama screenplays). No code here, only checks, rules and procedures.

Evidence base: failures observed in real runs on Episode 1 and Episode 2 (timestamps cited below).

---

## 1. Principles

1. **Hard rules are checked by code, judgment is checked by humans.** Anything with a yes/no answer (duration, overlap, cut placement) is automatic. Anything subjective (is this a good hook?) is checked against a small hand-labelled set.
2. **Report failures, not just scores.** A failure log with timestamps is worth more than a high average.
3. **Every failure maps to one fix.** If a failure has no owner in the pipeline, it is not understood yet.
4. **Small and honest beats large and vague.** 10 hand-checked promos are enough if the method is clear.

---

## 2. Layer A: Hard checks (automatic, every promo, every run)

A promo that fails any hard check is **rejected or repaired before ranking**. Log the count of rejections per run.

| ID | Rule | Source of the rule |
|----|------|--------------------|
| H1 | Total duration (sum of all segments) is 20-60s | Brief |
| H2 | Every segment start and end is a real timestamp from the screenplay | Brief |
| H3 | No cut falls inside a line of dialogue (start at or before a line start, end at or after a line end) | Observed: risk in all candidates |
| H4 | Segments are in order and don't overlap each other | Brief |
| H5 | Segments sit inside the episode's length | Brief |
| H6 | **No two promos in the final list overlap by more than 20% of the shorter one** | Observed: Ep 2 #1/#2 share 2.8s, #2/#3 share 7s |
| H7 | **No promo contains the answer to another promo's cliffhanger** | Observed: Ep 2 #2 includes the father's reply that resolves #1 |
| H8 | Required fields present: episode, segments, hook, cliffhanger, one-line reason | Brief |
| H9 | The hook field and cliffhanger field each quote **one** line that exists in the segment, not a merge of two | Observed: Ep 2 #1 merged "Father..." and the later plea |

---

## 3. Layer B: Rule-based quality checks (automatic, flags for review)

These can't prove a promo is good but they catch the failures we've actually seen. A flag lowers rank or marks "needs human review".

| ID | Check | Failure it catches |
|----|-------|--------------------|
| Q1 | **Hook line is spoken dialogue or a visible event inside the first 3s of the clip**, not a camera move or a soft action description | Ep 2 #1: opened on "Juliana gasps softly" at 2.8s |
| Q2 | **Earlier-start test:** if a line within 3s before the start is a stronger hook (statement of rejection, reveal, threat), prefer starting there | Ep 2 #1 cut off "I cannot marry you, Juliana." at 0.0s |
| Q3 | **Cliffhanger type test:** final line must be a question, a threat, an interrupted sentence (ends in "..."), or a new reveal. A closing statement, resolution or speech finale is a fail | Ep 2 #3 ends on Juliana's triumphant final line; "I may leave this chapel without a husband..." (1:42.4) is the better end |
| Q4 | **Resolution test:** does the last segment's final 5 seconds include an answer, reply or decision? If yes, move the end earlier | Ep 2 #3 and #1 |
| Q5 | **Standalone test:** every named character in the clip is introduced by role within the clip, or the promo is flagged "needs context" | Risk in cross-episode shows |
| Q6 | **Spoiler test:** flag promos from the final 10% of a show's episodes, or that contain a flagged twist | Not yet observed; add before scaling |
| Q7 | **Score spread test:** if more than 80% of promos share the same sub-score (e.g. curiosity gap = 100), that sub-score is uninformative; drop or recalibrate it | Observed: curiosity gap 100 on all three |
| Q8 | **Confidence test:** a confidence value that is identical across events (55% in Ep 1 and Ep 2) is a default, not a measurement. Remove it or compute it from model agreement | Observed in both runs |
| Q9 | **Speaker normalization test:** one character must not appear under multiple labels (Lady in Gold Gown / Clarissa; The Former Groom / Gerald; Blond Nobleman / Father) | Observed across both episodes |
| Q10 | **Silent-start test:** promo does not begin with more than 3s of camera or action lines with no dialogue | Ep 1 first 11s are mostly camera |

---

## 4. Layer C: Human gold set (small, hand-labelled)

Goal: measure whether the tool's picks match human judgment, with numbers you can state in the doc.

### Procedure
1. **Choose 10 episodes**: spread across the run (e.g. 1, 2, 5, 12, 20, 28, 35, 41, 46, 50). Include one late episode to test spoilers.
2. **Label before looking at the tool's output**, to avoid anchoring. For each chosen episode, mark your top 2 promo windows (start, end) using only the screenplay and the brief's three criteria.
3. **Compare with the tool's top 3 for that episode.** Score each tool promo:
   - **Match:** overlaps your window by 50% or more
   - **Acceptable:** a different window you'd still post
   - **Miss:** you would not post it
4. **Record why** for each miss, using the failure codes in Section 5.

### Numbers to report
- **Hit rate:** share of tool top-3 that are Match or Acceptable (target is honest reporting, not a fixed number)
- **Recall of your picks:** share of your windows that appear in the tool's top 5
- **Hard-check rejection rate:** share of raw candidates rejected by H1-H9
- **Cliffhanger pass rate:** share of promos passing Q3 and Q4
- **Hook pass rate:** share passing Q1 and Q2

State sample size next to every number (10 episodes is small; say so).

### Optional second labeller
If a friend can label 3 of the same episodes, report agreement. It shows whether "good promo" is consistent or personal.

---

## 5. Failure taxonomy (use these codes in the log)

| Code | Failure | Example from our runs | Fix owner |
|------|---------|-----------------------|-----------|
| F1 | Soft hook (action or camera line as hook) | Ep 2 #1 at 2.8s | Candidate generator: score start points by spoken lines first; run Q1/Q2 |
| F2 | Hook buried: a stronger line sits just before the start | Ep 2 "I cannot marry you" at 0.0s | Start-point search window of 3s before the chosen start |
| F3 | Fake cliffhanger (ends on payoff or closing statement) | Ep 2 #3 end at 1:47.4 | End-point rule: prefer last question, threat or unfinished sentence; run Q3/Q4 |
| F4 | Promos overlap or spoil each other | Ep 2 #1/#2/#3 | Ranking step: de-overlap plus H6/H7 |
| F5 | Flat or default scores | Curiosity 100 everywhere; confidence 55% | Scoring: prompt asks for relative ranking within the episode; drop uninformative fields |
| F6 | Question mark treated as hook | Ep 1 "Gerald?" scored hook 80 | Scoring: separate hook (shock) from cliffhanger (open question); a question is an end-point signal |
| F7 | Missed non-dialogue moments | Ep 1 silent defiant close-up at 2:13.8 | Parser: include ACTION and CAMERA events as candidate end points |
| F8 | Missed best moments entirely | Ep 1 events list stopped at 1:14.3 | Parser: check that event extraction covers the full episode length |
| F9 | Speaker identity not resolved | Gerald / Former Groom; Clarissa / Lady in Gold Gown | Pre-processing: build a character map from LOGLINE and CONTINUITY NOTES |
| F10 | Needs prior context | Not yet measured | Standalone test Q5; allow a setup segment from an earlier episode |
| F11 | Leaks from the screenplay's own cues | SOUND FX line "ominous cliffhanger peak" | Remove SOUND FX and camera notes from scoring input |
| F12 | Cross-episode opportunities ignored | Ep 1 end into Ep 2 start | Multi-segment pass that links a cliffhanger to the next episode's opening |

---

## 6. Run protocol (each time the tool runs)

1. Run the full pack and save **unedited** outputs to the raw-outputs folder.
2. Run Layer A and Layer B checks. Save the check report next to the outputs.
3. Review the top 10 promos overall plus the 5 lowest-ranked that passed all hard checks.
4. For each problem found, write one line in `FAILURES.md`: `code | episode | timestamp | what happened | fix applied or not`.
5. Apply fixes in this priority order (highest impact first): **F4 > F3 > F1/F2 > F5/F6 > F9 > F7/F8 > F11/F12**.
6. **Re-run and compare before and after** on the same 10 gold-set episodes. Keep both runs in the raw-outputs folder.

---

## 7. Before and after table (put this in the 2-page doc)

| Metric (on 10 gold-set episodes) | First run | After fixes |
|---|---|---|
| Hard-check rejections | | |
| Overlapping promos in top 10 | | |
| Cliffhanger pass rate (Q3/Q4) | | |
| Hook pass rate (Q1/Q2) | | |
| Hit rate against hand labels | | |

Fill with real numbers only. If a number got worse, say so.

---

## 8. Known limits (state these in the doc)

- The pack is **screenplays only**, so there is no check on video, audio delivery or visuals; "hook" is judged from text and timestamps.
- Gold set is small (10 episodes, one labeller). Treat numbers as indicative.
- Scores from an LLM are not calibrated; ranking is more trustworthy than absolute values.
- The tool was tuned on one show and one genre (revenge-romance microdrama). Behaviour on other genres or languages is untested.
- Late-show spoilers (Q6) are only flagged by a rule, not understood.

---

## 9. Scaling to every show

- **Cheap checks first:** run Layers A and B on every promo for every show at no model cost.
- **Human time per show:** about 15 minutes to review the top 10 and 5 flagged promos; no full gold set needed per show, only a spot-check of 3 episodes.
- **Drift watch:** track hard-check rejection rate and Q3/Q4 pass rate per show; a sudden drop means the screenplay format or genre changed.
- **Model swap:** re-run the same gold set whenever the model changes and compare hit rate before accepting the swap.
