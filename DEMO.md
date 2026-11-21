# DEMO.md: Product Spec and Frontend Workflow

Audience for this file: the coding agent building and maintaining the demo.
Product name: use ONE name everywhere (repo, page title, exports). Set it in a single config value `PRODUCT_NAME`. Current candidates: PromoForge (in repo now) or Apex Reel. Do not mix them.

Task context: Kuku AI Generalist assignment, Problem 1 (find promos in microdrama screenplays). A reviewer will open the demo, and shortlisted candidates will re-run it live on a NEW show during the interview. The demo must be simple, honest and re-runnable.

---

## 0. Non-negotiable rules (read first)

1. **Never display, write or commit a metric that was not computed by a script that can be shown.** If a number is not measured, the UI says "Not measured". No invented hit rates, no placeholder percentages.
2. **No confidence value unless it is computed from something real** (for example agreement across model runs). A constant or formula-only value must not be shown as "confidence".
3. **Do not tune rules to specific episodes or character names.** Rules must work on any show. EP_001 and EP_002 are development episodes only.
4. **Do not publish the input pack.** `.gitignore` the screenplay folder and any exports containing script text. The public repo and hosted demo must not expose Kuku's content. If the hosted demo needs sample data, use a short invented sample screenplay in the same format.
5. **Every cut point is a real timestamp from the screenplay.** Never interpolate.
6. **Every claim in the UI about quality must link to an evidence field** (a rule that passed or failed, or a line from the script).
7. **Model is swappable.** No model name, key or provider hard-coded in UI or engine code. See section 6.
8. **Plain failures over polish.** If something fails, show it with a reason.

---

## 1. What the product does (one paragraph)

Upload or select a folder of episode screenplays (timestamped format). The tool parses them, generates candidate clips of 20-60s that start and end on real line boundaries, scores each for hook, cliffhanger and standalone clarity, removes overlapping or spoiler-linked promos, ranks them across the whole show, and exports editor-ready cut lists. A human editor reviews the ranked list, can accept, reject or adjust cuts, and downloads the result.

---

## 2. Input format (what the parser must handle)

Each episode is a `.txt` with:
- Header: `EPISODE NUMBER`, `EPISODE LOGLINE`, `CONTINUITY NOTES`
- `--- SCRIPT START ---` / `--- SCRIPT END ---`
- One or more `SCENE NN` blocks with `Scene heading`, `Scene start`, `Scene end`
- Blocks of type `CAMERA`, `ACTION`, `SOUND FX`, and dialogue blocks labelled `SPEAKER (tone)` (also `(O.S.)` / `(Off-screen)` variants)
- Each block has `Start: (mm:ss.ff) | End: (mm:ss.ff)`. Timestamps are `minutes:seconds.fraction`, NOT frames. Blocks overlap in time.

Parser requirements:
- Convert timestamps to milliseconds internally.
- Keep block types separate. Dialogue and ACTION may be candidate boundaries. CAMERA and SOUND FX must NOT be used as scoring evidence (SOUND FX leaks cliffhanger cues; camera notes describe shots, not story).
- Normalize speaker aliases using the header logline and continuity notes (for example an invented "Masked Visitor" alias may map to "Rowan"). Show unresolved aliases to the user instead of guessing silently.
- Read the full episode to the end timestamp. Report parsed event count per episode and the last parsed timestamp so truncation is visible.
- If a file does not match the format, show a clear error naming the file and the first line that failed. Do not skip it silently.

---

## 3. Pipeline (backend stages, in order)

| Stage | Name | Type | Output |
|---|---|---|---|
| 1 | Parse | Code | Events per episode (id, type, speaker, text, start_ms, end_ms) |
| 2 | Normalize | Code | Canonical character names, alias report |
| 3 | Generate candidates | Code | Windows of 20-60s, start and end on line boundaries, including a 3s look-back for a stronger opening line |
| 4 | Score | LLM (swappable) plus rules | Hook, cliffhanger, standalone, reason, one hook line, one cliffhanger line |
| 5 | Hard checks | Code | Reject or repair candidates failing H1-H9 (see EVALUATION.md) |
| 6 | Quality flags | Code | Flags Q1-Q10 (soft hook, fake cliffhanger, needs context, spoiler risk) |
| 7 | De-conflict | Code | No overlap above 20 percent, no promo that answers or continues another promo's ending, no start on a sentence fragment |
| 8 | Multi-segment link | Code plus LLM | Optional promos joining moments, including episode N cliffhanger into episode N+1 opening |
| 9 | Rank globally | Code | One ranking across ALL episodes, with variety (limit how many top-ranked promos come from one episode) |
| 10 | Export | Code | CSV, JSON, cut list, timeline file (see section 7) |

Store every stage's output so the UI can show "why" without recomputing.

Cost and latency to display per run: number of episodes, number of model calls, estimated token use, wall time. If cost cannot be computed, show "not available".

---

## 4. Frontend screens and workflow

Keep it to a single-page app with four views. Mobile-friendly, plain, fast.

### View 1: Start / Upload
- Drop zone for a folder or multiple `.txt` files, plus a "Load sample" button (invented sample only).
- Fields: Show title (optional), Language, Target audience (optional), Promo length range (default 20-60s, editable within 20-60).
- Model selector (dropdown from config) and API key field (stored only in session memory, never persisted, never logged).
- "Run" button. Disabled until at least one valid episode parses.
- After parsing, before running the model, show a **parse summary table**: episode, events parsed, last timestamp, unresolved aliases, warnings. The user must be able to catch a bad parse here.

### View 2: Progress
- Per-stage progress (Parse, Candidates, Score, Checks, De-conflict, Rank, Export).
- Per-episode status (queued, running, done, failed with reason).
- Cancel button. Partial results must remain viewable if a run is cancelled or a model call fails.
- Show running count of model calls and elapsed time.

### View 3: Ranked Promos (main view)
List or card per promo, sorted by global rank. Each card shows:
- Rank, promo ID, episode(s)
- **Segments**: every segment with episode, start, end (mm:ss.ff), in order; total duration
- **Hook**: the single line (speaker plus text) and its timestamp
- **Cliffhanger**: the single line and its timestamp
- **Why it works**: one line
- **Scores**: hook, cliffhanger, standalone as given by the scorer (no invented sub-scores). Show only fields that are genuinely produced.
- **Check badges**: hard checks passed (list any repaired), quality flags raised (for example "needs context", "spoiler risk", "soft hook")
- **Transcript preview**: the lines inside the cut, with the hook and cliffhanger highlighted and the cut boundaries visible
- **Actions**: Accept, Reject (with reason picker: weak hook, fake cliffhanger, needs context, spoiler, overlap, other), Adjust (edit start or end by snapping to the previous or next line boundary; the UI re-runs hard checks live)
- "Variants" (optional if built): tight, standard, extended cut of the same promo

Top bar: filters (episode, flag type, accepted or rejected), sort (rank, episode, duration), and a count of accepted promos.

Also include a **Why this ranking** panel: a short explanation of the top 3 in plain language, produced from the score evidence and rule results, not free-form model opinion.

### View 4: Quality and Limits
- **Failure log**: where the tool picks badly. Table: code, episode, timestamp, what happened, status (fixed on which episodes, or open). Data comes from `FAILURES.md` or a JSON equivalent.
- **Check summary for the current run**: counts of candidates generated, rejected per hard rule, flagged per quality rule. These are real counts from this run.
- **Gold-set results**: if labelled data exists, show hit rate with sample size ("3 of 7 held-out episodes matched"). If not, show "Not measured" with the protocol. Never fill in numbers by hand.
- **Known limits** (static text): screenplays only (no video or audio), small gold set, scores are not calibrated so ranking is more reliable than absolute values, tuned on one genre, spoiler handling is rule-based.

---

## 5. Human-in-the-loop behaviour

- The tool proposes, the editor decides. Nothing is "final" until accepted.
- Rejections with reasons are saved in the run folder and can be exported. These are the seed for a future gold set.
- Adjustments snap to real line boundaries and must pass hard checks, or the UI shows which rule fails.
- Anything flagged "needs context" or "spoiler risk" is visually distinct and sorted behind unflagged promos by default (user can override).

---

## 6. Model swapping (needed for the interview)

- Single config file defines: provider, model name, base URL, API key source, temperature, max tokens.
- Engine calls one function `call_llm(prompt, schema)` and nothing else talks to a provider.
- Provide adapters for at least: Gemini (free tier), one OpenAI-compatible endpoint (so any provided API works by changing base URL and key).
- Add a **no-API mode**: show the prompt for a batch, let the user paste the model's JSON back, validate against the schema. This guarantees the demo runs without keys.
- All model output is validated against a JSON schema. Invalid output is retried once, then logged as a failure for that candidate (never silently defaulted to a score).
- Include a **rule-only fallback** that runs without any model, clearly labelled "Rule-based scoring (lower quality)" in the UI.
- Record which model produced each run in the export header.

---

## 7. Exports (everything must be generated from the stored run, not recomputed)

Per run, saved in a run folder with timestamp and model name:
1. `promos_master.csv`: one row per segment (promo_id, rank, segment_index, episode, start, end, duration, hook_line, cliffhanger_line, why, flags)
2. `promos.json`: full structured output with evidence and check results
3. `report.md`: ranked list in readable form, top 3 explanation, failure notes
4. `cut_list.csv`: simple editor sheet (promo, episode, in, out) for manual use
5. Timeline file(s) for editing tools (OpenTimelineIO already exists; add an EDL if simple). **Label clearly that these cannot be tested on real footage because the pack contains screenplays only.** Test them on any sample video with matching timestamps, and say so.
6. `run_log.json`: model, parameters, stage timings, call count, rejected candidate counts
7. Raw model responses, unedited, in a `raw/` subfolder (the brief requires unedited raw outputs)

Download buttons: single promo, selected promos, full run zip.

---

## 8. Error and edge-case handling

| Situation | Required behaviour |
|---|---|
| Episode fails to parse | Name the file and line; continue with other episodes; list it in the summary |
| Model call fails or times out | Retry once; mark that candidate batch failed; keep partial results; do not fabricate scores |
| No valid candidates in an episode | Show "No promo found" with the reason (for example no hook line or too short) |
| Total show under 20s of usable material | Show a clear message |
| API key missing | Offer no-API mode or rule-only fallback |
| Very large run | Process episodes in batches, show progress, allow cancel |
| Non-English script | Run normally; mark language; quality flags that rely on English rules (for example conjunction fragment ban) must be disabled or localised, and the UI must say which are off |

---

## 9. Scaling story (the UI should be able to show these numbers for a real run)

- Show count of episodes, model calls, total tokens, wall time and estimated cost for the current run.
- Parse, candidates, checks, de-conflict and ranking are code and cost nothing per model call.
- The model is used only for scoring shortlisted candidates, not every window. Say how many candidates were scored versus generated.
- Per new show: one folder in, one run, about 15 minutes of editor review (top 10 plus flagged).

---

## 10. Interview re-run flow (must work in under 2 minutes)

1. Open the app, load a NEW folder of episodes (a show it has never seen).
2. Check the parse summary table (events, last timestamp, aliases).
3. Pick the model supplied by the interviewer (or no-API mode), enter key.
4. Run. Watch progress.
5. Open Ranked Promos, explain the top 3, show one flagged promo and why.
6. Reject one with a reason, adjust one cut, export.
7. Open Quality and Limits, show real counts and the failure log.

No step may need a code change or a restart.

---

## 11. Three-minute walkthrough video script

- 0:00-0:20: Problem, in one sentence, and the name of the product.
- 0:20-0:50: Load folder, show parse summary.
- 0:50-1:40: Run, show ranked promos, open the top one: hook, cliffhanger, transcript preview, check badges.
- 1:40-2:15: Show a promo that failed or was flagged, and one an editor would adjust.
- 2:15-2:45: Quality view: real counts, failure log, "Not measured" where applicable.
- 2:45-3:00: Model swap and what is next.

Record in your own voice. Show the failure log honestly.

---

## 12. Acceptance checklist (agent: tick only what you verified by running it)

- [x] Parses all 50 episodes without silent skips; parse summary visible
- [x] Every promo duration within 20-60s; asserted in tests
- [x] No cut inside a dialogue line; asserted in tests
- [x] No promo starts on a sentence fragment or inside another promo's reply window
- [x] Global ranking across all episodes with an episode-variety cap
- [x] Hook and cliffhanger fields each contain exactly one real line
- [x] No fabricated or constant "confidence" anywhere in UI or exports
- [x] Quality view shows only measured numbers; others say "Not measured"
- [ ] Gold labels were written by the user, not the agent
- [x] Model swap works by config only; no-API mode works; rule-only fallback works
- [x] New unseen episode folder runs end to end without code changes
- [x] Exports generated from stored run; raw model outputs saved unedited
- [x] Input pack is git-ignored and not in the public repo or hosted demo
- [x] README: install, run, config, how to swap model, known limits
- [x] One product name used everywhere

---

## 13. Out of scope (do not build, mention as next steps only)

Video rendering, music, text overlays, AI video generation, auto-posting to social platforms, user accounts, a database. Optional later: hook-first cold-open variants, an adversarial second-pass reviewer, a post caption suggestion.

---

## 14. Agent working rules

- Keep a running `PROGRESS.md` listing what is done, what is verified (by which test or run) and what is open. Do not mark an item done without running it.
- When unsure whether something is measured, label it "Not measured".
- Ask before deleting files or changing the evaluation rules in `EVALUATION.md`.
- Report findings that contradict earlier claims instead of hiding them.
