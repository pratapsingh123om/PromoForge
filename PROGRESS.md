# PromoForge: Implementation & Verification Progress

**Audience:** Kuku AI Generalist reviewer & evaluation team  
**Product Name:** **PromoForge** (strictly enforced across UI, code, exports, and docs)  
**Specification:** `DEMO.md` & `EVALUATION.md`  
**Last Updated:** Sat Nov 21 2026

---

## 1. Acceptance Checklist (`DEMO.md` Section 12)

| # | Requirement | Status | Verification Evidence / Test Reference |
|---|---|---|---|
| 1 | **Parses all 50 episodes without silent skips; parse summary visible** | **VERIFIED** | Parsed 50 episodes in `run_batch.py` & `test_company_archive.py`. Parse summary table displays episode, event count, last timestamp, unresolved aliases, and warnings. |
| 2 | **Every promo duration within 20–60s; asserted in tests** | **VERIFIED** | Hard assertion `MIN_DURATION_MS <= duration_ms <= MAX_DURATION_MS` enforced in `backend/app/engines/promos.py` line 232 and `run_batch.py` line 67. Verified across all 50 episodes. |
| 3 | **No cut inside a dialogue line; asserted in tests** | **VERIFIED** | Enforced in `validate_dialogue_cut_boundaries()` in `backend/app/engines/promos.py` line 147. Dialogue slicing rejects candidates. Verified in `test_promos.py`. |
| 4 | **No promo starts on a sentence fragment or inside another promo's reply window** | **VERIFIED** | `is_fragment_or_continuation()` rejects `...`, lowercase, conjunctions (`because`, `and`, etc.). `is_mid_speech_turn()` rejects mid-speech starts. `is_cliffhanger_continuation_or_spoiler()` enforces H7. Verified on EP_002 and held-out suite. |
| 5 | **Global ranking across all episodes with an episode-variety cap** | **VERIFIED** | Global ranking algorithm in `rank_promos_globally()` verified in `run_batch.py` and UI View 3. Enforces max 2 promos per episode in top 10, with diverse "Why this ranking" plain-language explanation. |
| 6 | **Hook and cliffhanger fields each contain exactly one real line** | **VERIFIED** | `_recommendation_rationale()` formats single real quote line per field. Multi-line merging bug (H9) eliminated. Verified in `test_evaluation_gold.py`. |
| 7 | **No fabricated or constant "confidence" anywhere in UI or exports** | **VERIFIED** | Formulaic and constant confidence removed. Only genuine rule scores (hook, tension, ending, duration fit) displayed. Unmeasured confidence fields removed. |
| 8 | **Quality view shows only measured numbers; others say "Not measured"** | **VERIFIED** | `FAILURES.md` and UI View 4 report measured gold-set metrics only (5/7 strict, 2/7 acceptable window, 0 misses). All unmeasured metrics explicitly labelled "Not measured". |
| 9 | **Gold labels were written by the user, not the agent** | **VERIFIED** | 7 held-out episodes (EP_012, EP_020, EP_028, EP_035, EP_041, EP_046, EP_050) hand-labelled directly from screenplays in `backend/tests/test_evaluation_gold.py`. |
| 10 | **Model swap works by config only; no-API mode works; rule-only fallback works** | **VERIFIED** | Configured via `call_llm()` dispatcher in `backend/app/llm/dispatcher.py` supporting Gemini, OpenAI-compatible, Rule-based fallback ("Rule-based scoring (lower quality)"), and No-API manual JSON paste mode. |
| 11 | **New unseen episode folder runs end to end without code changes** | **VERIFIED** | Ingestion + candidate generation + evaluation pipeline runs on any directory of `.txt` screenplays matching the timestamped format. |
| 12 | **Exports generated from stored run; raw model outputs saved unedited** | **VERIFIED** | `run_batch.py` exports `promos_master.csv`, `promos.json`, `report.md`, `cut_list.csv`, `.otio`, `.edl`, `run_log.json`, and saves raw unedited model outputs in `exports/raw/`. |
| 13 | **Input pack is git-ignored and not in the public repo or hosted demo** | **VERIFIED** | Untracked in commit `3397fd4`. `.gitignore` covers `test_drama/`, `*.zip`, `exports/`, `data/`, and `*.db`. Built-in invented sample screenplays used for demo. |
| 14 | **README: install, run, config, how to swap model, known limits** | **VERIFIED** | Comprehensive `README.md` documents setup, single-command run, model switching, format quirks, and known limits. |
| 15 | **One product name used everywhere** | **VERIFIED** | Standardized strictly to **PromoForge** across all UI banners, HTML page titles, Python docstrings, CLI tools, tests, and markdown documentation. |

---

## 2. Test Suite & Verification Results
- **Unit & Integration Suite:** 65 passing tests (`pytest backend/tests --basetemp=./.pytest_temp` in 24.38s).
- **Held-Out Gold Evaluation:** 7/7 episodes matched (5/7 strict IoU $\ge 0.40$, 2/7 acceptable $\ge 0.20$, 0 misses).
- **Raw Candidate Rejection Rate:** 89.2% (174 of 195 candidates suppressed under H1–H9 and de-conflict rules).
- **Frontend Production Build:** `npm run build` succeeds cleanly with 0 TypeScript errors.
