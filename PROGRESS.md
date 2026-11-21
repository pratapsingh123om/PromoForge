# PromoForge implementation and verification progress

**Specification:** `demo.md` and `EVALUATION.md`

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
| Top-three evidence | Verified | Live cards showed real hook/cliffhanger lines, timestamps, transcript counts, rule scores, and grounded ranking reasons. |
| Boundary adjustment | Verified | Live modal offered only dialogue/action event timestamps and reported current hard-check status. Saving recomputes evidence and scores in code. |
| Editor decision tracking | Verified | Live accept action changed the ranked count and current-run Human Accepted value from 0 to 1. |
| Quality disclosure | Verified | Live Quality view shows the current-run counters and Gold-Set Evaluation as **Not measured**. |
| Full 50-file client audit | Verified | `pnpm audit:frontend-parser`: 50/50 parsed, 3,727 events, 19,046 raw windows examined, 131 episode shortlists, exactly 3 global results, and zero duration, boundary, fragment, evidence, or overlap-pair violations. |
| Gemini scoring | Verified live | Invented sample completed through `gemini-3.1-flash-lite`: exactly 3 ranked promos, one model call, 1,711 reported tokens, grounded evidence, and no silent fallback. |
| No-API scoring | Verified live | Prompt generation paused the pipeline; schema-valid pasted JSON resumed it and labelled all three results `no-api/manual-paste`. Prompt contained dialogue/ACTION only. |
| Stored-run ZIP | Verified | Live download succeeded; independent Python `zipfile.testzip()` passed for all 8 expected artifacts. |
| Frontend production build | Verified | Final `pnpm build` succeeded on 2026-11-21 (2,131 modules transformed). |
| Backend test suite | Verified | Final full suite: `83 passed in 16.52s`. Includes missing/invalid-key, bounded retry, timeout, rate-limit, malformed-output, unknown-model, and mocked OpenAI-compatible coverage. |
| Provider smoke test | Verified | Updated backend: `no-api: ok`; real Gemini invented-sample call: `gemini: ok calls=1 tokens=447`. |
| One-project Vercel packaging | Ready; owner deploy pending | `vercel.json` was parsed and Vercel CLI detected the Vite and FastAPI services. Production login/build is intentionally left to the owner. Local `vercel dev` hit a Windows symlink-permission error recorded as T-012. |

## `demo.md` acceptance checklist

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Parse all 50 episodes without silent skips | Verified | Reproducible client audit parsed 50/50 ignored local files and 3,727 events. |
| 2 | Every promo is 20–60 seconds | Verified | Full-pack audit found zero duration violations across the 131 produced episode candidates. |
| 3 | No cut inside a dialogue line | Verified | Full-pack audit found zero invalid start/end event boundaries. |
| 4 | No fragment or continuing-reply start | Verified structurally | Full-pack audit found zero fragment starts and zero overlapping output pairs; continuation suppression counted 833 rejected windows. |
| 5 | Global ranking with episode variety cap | Verified | Full-pack audit returned exactly 3 global promos across EP_018, EP_032, and EP_035; no episode exceeded the cap of 2. |
| 6 | Hook and cliffhanger are one real line each | Verified | Full-pack audit found zero evidence mismatches; live rule, no-API, and Gemini cards showed one line and timestamp for each. |
| 7 | No fabricated confidence | Verified in active demo path | Active four-view UI and stored-run exports contain scores and score source, not confidence. The stale confidence display was removed from the legacy studio component. |
| 8 | Quality view only shows measured numbers | Verified | Current-run counts are computed; unconfirmed gold results say **Not measured**. |
| 9 | Gold labels written by the user | Not verified | A fixture exists, but authorship has not been confirmed. No hit rate is presented in the active UI. |
| 10 | Config-only model swap, no-API mode, rule fallback | Verified with one external limitation | Rule, no-API, and Gemini completed end to end. The OpenAI-compatible adapter is schema-tested with a mocked endpoint; a live call needs a user-supplied compatible key. No silent fallback occurs. |
| 11 | Unseen folder works without code changes | Verified | The same client parser and generator processed the supplied 50-file show through one generic audit command without episode-specific code. |
| 12 | Stored-run exports and raw model output | Verified | Full-run ZIP contains stored CSV/JSON/MD/EDL, timeline disclosure, `run_log.json`, and exact raw response (or a rule-only README). Archive integrity was independently tested. |
| 13 | Confidential input ignored | Current deployment clean; history open | `.gitignore` and `.vercelignore` exclude the pack, archives, exports, data, local databases, and evaluation docs. The production bundle contains no scanned private markers. Git history records a prior removal of private files, so the repository must remain private or receive an explicitly approved history rewrite before publication. |
| 14 | README covers setup, configuration, swap, limits | Verified | README now documents all four scorer modes, key handling, partial failures, stored-run ZIP, audit command, and unmeasured gold quality. |
| 15 | One product name | Verified in active demo | Active UI and exports use `PRODUCT_NAME = "PromoForge"`. |

## Remaining user-dependent checkpoint

Gold-set performance cannot be completed honestly by the implementation alone. The user must label promo windows before seeing the system output (or confirm an independently created set), record the sample size, and then run the evaluation harness. Until then the UI and reports correctly say **Not measured**.
