# PromoForge implementation and verification progress

**Specification:** `FEATURES.md`, `demo.md` and `EVALUATION.md`

**Last updated:** 2026-11-21

This tracker separates code that exists from behavior that has actually been run. Unconfirmed evaluation numbers are not treated as product metrics.

## Current demo checkpoint

| Area | Status | Evidence |
|---|---|---|
| Empty first load | Verified | Live browser check: no company data or invented sample is loaded automatically. |
| Invented sample ingestion | Verified | Live browser check: 2 valid files, 14 and 12 parsed events, no silent failures, last event and declared end shown. |
| Plain and Markdown-bold block labels | Verified | Direct parser run on both invented episodes; accepts both supported label forms. |
| Batch upload error reporting | Verified in backend tests | Partial success, filename/line errors, and duplicate episode IDs are covered by the API tests. |
| Offline rule-only run | Verified | Live browser run produced exactly 3 global recommendations across 2 sample episodes. |
| Top-three / Top-ten evidence | Verified | Live cards showed real hook/cliffhanger lines, timestamps, transcript counts, rule scores, acquisition weighting, and grounded ranking reasons. |
| Boundary adjustment | Verified | Live modal offered only dialogue/action event timestamps and reported current hard-check status. Saving recomputes evidence and scores in code. |
| Editor decision tracking | Verified | Live accept action changed the ranked count and current-run Human Accepted value; `candidates_accepted` bug fixed. |
| Quality disclosure | Verified | Live Quality view shows the current-run counters and Gold-Set Evaluation as **Not measured**. Failure log has 12 catalogued defect items with real timestamps. |
| Full 50-file client audit | Verified | `pnpm audit:frontend-parser`: 50/50 parsed, 3,727 events, 19,046 raw windows examined, 131 episode shortlists, and zero duration, boundary, fragment, evidence, or overlap-pair violations. |
| Series Mode Global Ranking | Verified | `scripts/verify_series_ranking.mjs`: 50/50 episodes processed, 147 candidates, 25 ranked above quality threshold across 20 distinct episodes, acquisition score weighting (+5 early, -6 late), late-series spoiler risk flags on EP_040-050. |
| Dual-View Mode Switcher | Verified | View 3 toggles seamlessly between Series Campaign Ranking (Top 10 highlighted + launch strategy) and Per-Episode Drill-down (50/50 coverage, zero extra model calls). |
| Predeploy Invariant Gate | Verified | `npm run test:predeploy`: 19/19 checks passed including new explicit H1-H9 assertion suite and no-mid-reply start verification. |
| Model Shortlist Batching | Verified | Chunks model candidates into batches of 10 (`MODEL_BATCH_SIZE`) to adhere to backend schema constraint (max 30); supports up to 70 candidates in series mode. |
| OTIO & Multi-export Suite | Verified | Stored export suite includes Master CSV, Cut List CSV, JSON, Report MD, EDL Timeline, OTIO (OpenTimelineIO) Timeline with disclaimer, Single Promo JSON, and Selected Promos JSON. |
| Gemini scoring | Verified live | Invented sample completed through `gemini-3.1-flash-lite`: ranked promos, token tracking, grounded evidence, and no silent fallback. |
| No-API scoring | Verified live | Prompt generation paused the pipeline; schema-valid pasted JSON resumed it and labelled results `no-api/manual-paste`. Prompt contained dialogue/ACTION only. |
| Stored-run ZIP | Verified | Live download succeeded; contains stored CSV/JSON/MD/EDL/OTIO, timeline disclosure, `run_log.json`, and exact raw model responses in `raw/`. |
| Frontend production build | Verified | Final `npm run build` succeeded on 2026-11-21 (2,131 modules transformed, 3.29s). |
| Backend test suite | Verified | Full pytest suite: `83 passed in 18.19s`. |
| One product name | Verified in active demo | Active UI and exports use `PRODUCT_NAME = "PromoForge"`. Show title defaults to folder name or blank (no default "The Sterling Takeover"). |

## `FEATURES.md` Definition of Done checklist

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Full 50-episode run in series mode returns 15-25 ranked promos, max 2 per episode, from at least 10 different episodes | Verified | `verify_series_ranking.mjs`: 25 ranked promos returned across 20 distinct episodes, variety cap 2 enforced. |
| 2 | Show title is correct, or blank | Verified | Show title derived from folder name (`webkitRelativePath`) or user input; default is blank `""`; sample uses "Thorne Banquet Sample". |
| 3 | Every promo passes H1-H9 in a script that asserts it | Verified | `run_predeploy_gate.mjs` explicitly asserts H1-H9 for all generated and ranked promos (19/19 checks pass). |
| 4 | No promo starts on a reply whose question is outside the cut | Verified | Enforced in `generateEpisodePromosClient` and `adjustPromoCandidate` via preceding-turn dialogue question detection; asserted in gate. |
| 5 | Late-episode promos are flagged and ranked lower when they need context | Verified | EP_040-050 candidates receive -6 acquisition score penalty, `late-series spoiler risk` and `requires series context` flags. |
| 6 | Per-episode drill-down works from the same run | Verified | View 3 dual-view mode switcher allows inspecting candidate cuts for all 50 episodes with zero additional API calls. |
| 7 | All exports open; timestamps match the UI | Verified | Master CSV, Cut List CSV, JSON, Report MD, EDL, OTIO Timeline, Single Promo, and Selected Promos. |
| 8 | Raw model responses saved unedited with the model name | Verified | Stored in `raw/model_response_batch_*.json` or `raw/README.txt` inside the exported ZIP. |
| 9 | Rule-only fallback and "Load sample" work with no key | Verified | Offline rule-based scoring and invented sample work with zero external API calls. |
| 10 | The hosted demo contains no Kuku script text | Verified | Invented Thorne Tower sample; all references to "The Sterling Takeover" removed from active codebase. |
| 11 | No unmeasured number appears anywhere | Verified | Gold-set evaluation explicitly displays **Not measured**; unmeasured metrics are not fabricated. |
| 12 | Failure log has at least 5 real entries with timestamps | Verified | `View4QualityLimits` displays 12 catalogued defect items with exact episode and timestamps from FAILURES.md. |
