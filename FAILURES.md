# PromoForge — Failure Audit Log (`FAILURES.md`)

This failure log documents defects identified during development and maps them to the current safeguards. It does **not** claim editorial quality or gold-set performance. The 50-file parser and structural-invariant audit is reproducible with `pnpm audit:frontend-parser`; editorial hit rate remains **Not measured** until the user supplies or confirms labels created before seeing system output.

---

## 1. Failure Audit Table

| Code | Episode | Timestamp | Observed Failure | Structural Cause | Pipeline Rule / Fix | Current Status & Verification |
| :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **F1** | Fixture 2 | `00:02.80` | Invented fixture opened on a soft physical reaction rather than spoken dialogue. | Action cues scored higher raw intensity than dialogue. | Prefer spoken dialogue openings; give action reactions lower hook weight. | Mitigated in the current client engine; editorial effectiveness is not gold-set measured. |
| **F2** | Fixture 2 | `00:00.00` | Invented fixture omitted a stronger spoken hook immediately before the selected opening. | Overlapping camera cue caused generator start boundary to skip 0.0s. | Boundary search anchors to a dialogue/action event start. | Verified structurally: the 50-file audit found zero invalid boundaries and zero hook-evidence mismatches. |
| **F3** | EP_002 | `01:47.40` | Fake cliffhanger: Promo ended on a speech finale, creating resolution rather than suspense. | Candidate endpoint selected on speech volume rather than an unresolved question or threat. | Rule-only scoring raises a possible-fake-cliffhanger flag; model modes score the supplied final line explicitly. | Partial: semantic resolution detection is still heuristic and requires final editorial judgment before production. |
| **F4** | EP_002 | `00:34.30–00:44.70`<br>`01:19.00–01:19.20` | Inter-promo spoiler, mid-reply cut, and sentence continuation. | Generator lacked speech-turn boundary enforcement, allowed fragment starts, and did not de-conflict related cuts. | Enforce max 20% overlap, continuation suppression, fragment ban, and speech-turn integrity. | Verified structurally across all 50 files: zero fragment starts and zero overlap-pair violations in the produced episode shortlists. |
| **F5** | EP_001/002 | Global | Flat/default scores and a static value labelled confidence. | Sub-scores were mapped to uniform bucket constants without linguistic variance. | Active demo shows scorer-produced hook/cliffhanger/standalone values and a deterministic ranking blend; it does not display confidence. | Fixed in the active four-view demo and exports. Scores remain uncalibrated ranking signals, not probabilities. |
| **F6** | Fixture 1 | `00:33.80` | A one-word question received too much opening-hook weight. | Scoring treated `?` as an opening shock signal. | Separate opening-hook and ending-cliffhanger features. | Mitigated in model scoring; punctuation still contributes a small signal in rule-only mode. |
| **F7** | EP_001 | `02:13.80` | Missed non-dialogue moments: Final defiant close-up was omitted. | Candidate endpoints were originally restricted to dialogue events. | ACTION events are valid boundaries; CAMERA remains excluded because it is not story evidence. | Intentional limitation under the current evidence policy. |
| **F8** | EP_001 | `01:14.30` | Event list appeared to stop mid-episode in terminal output. | Terminal display truncation during inspection. | Parser reports event count, last parsed timestamp, and declared scene end. | Verified across 50 files: all parsed successfully, totaling 3,727 events. |
| **F9** | EP_001/002 | Global | Variable speaker identities: characters can appear under descriptive labels. | Screenplay uses aliases across scenes. | Heuristic alias normalization uses continuity notes and exposes unresolved labels. | Partial: unresolved aliases remain visible instead of being guessed silently. |
| **F10** | Multi-ep | Cross-ep | Missing context for new characters. | Character appears without prior role introduction within the clip. | Flagged as `context_dependency: high` to signal human editorial review. | Flag only; automated backstory insertion not implemented. |
| **F11** | EP_001 | `02:15.00` | Cue leakage: a SOUND FX description leaked a dramatic turn. | SOUND FX was included in narrative scoring input. | Only dialogue and ACTION events are sent as scoring evidence. | Verified in the live no-API prompt; SOUND FX and CAMERA were absent. |
| **F12** | EP_001/002 | `02:18.00` | Cross-episode stitching opportunity: Altar cliffhanger in Ep 1 resolves into Ep 2 opening. | Single-episode windowing evaluates screenplays in isolation. | Sequential episodic bridge links end of Episode 1 directly to opening of Episode 2. | Architectural proposal; not implemented in core single-episode pipeline. |

---

## 2. Verified Structural Audit (50 Files)

Run `pnpm audit:frontend-parser` from the repository root. The script reads the ignored local screenplay pack and prints JSON without publishing source lines.

| Measured field | Result |
| :--- | ---: |
| Files discovered / parsed | 50 / 50 |
| Total parsed events | 3,727 |
| Raw start/end windows examined | 19,046 |
| Episode-level candidates after filtering | 131 |
| Globally ranked demo output | 3 |
| Duration violations | 0 |
| Invalid event-boundary cuts | 0 |
| Fragment starts | 0 |
| Hook/cliffhanger evidence mismatches | 0 |
| Overlap-pair violations | 0 |

These are structural checks, not an editorial-quality benchmark. Gold-window match rate, recall, and human acceptance remain **Not measured**.
