# PromoForge — Failure Audit Log (`FAILURES.md`)

This failure log documents real defects observed during initial baseline runs on *I Married a Broken Soldier. He was a Duke*, mapped directly to the taxonomy in `EVALUATION.md`.

---

## 1. Failure Audit Table

| Code | Episode | Timestamp | Observed Failure | Structural Cause | Rule / Pipeline Fix | Verification |
| :---: | :---: | :---: | :--- | :--- | :--- | :---: |
| **F1** | EP_002 | `00:02.80` | Soft action hook: Promo opened on physical reaction (*"Juliana gasps softly"*) rather than spoken dialogue. | Scene-direction / action cues had higher raw intensity than dialogue. | Dialogue hook priority in `backend/app/llm/fallback.py` and `backend/app/engines/promos.py`: hooks require spoken dialogue inside the first 3s. | PASS |
| **F2** | EP_002 | `00:00.00` | Hook buried: The true catalytic rejection line `"I cannot marry you, Juliana."` was cut off at 0.0s. | Generator start window omitted 0.0s when action cue overlapped. | Aligned boundary search to candidate line start; EP_002 Pick #1 opens at `00:00.00`. | PASS |
| **F3** | EP_002 | `01:47.40` | Fake cliffhanger: Promo #3 ended on Juliana's speech finale (`"...I was the one who should be ashamed"`), creating an emotional resolution rather than suspense. | Ending was chosen on maximum dialogue volume rather than unresolved question/threat. | Added resolution detector (`resolves_question = True`) rejecting closure/acceptance statements. Terminated cut at `01:42.40` / `01:42.80` on unresolved vow (`"I may leave this chapel without a husband..."`). | PASS |
| **F4** | EP_002 | `00:34.30–00:44.70` | Inter-promo spoiler & mid-reply cut: Promo #2 started at `00:42.50` on `"Do not disgrace us further."`, which is the second half of the father's reply to Juliana's plea that Promo #1 ends on (`00:37.10`). Promo #3 (`01:19.20`) started with `"...because another woman promised you..."`, completing Promo #2's cliffhanger sentence. | Generator allowed candidates to slice mid-speech turn, open on fragment conjunctions, and start in the immediate reply window of an earlier promo's cliffhanger. | Implemented H6 (max 20% overlap), H7 (ban starting on a cliffhanger's answer or continuation), fragment start ban (no starting with `...` or conjunction), and speech-turn integrity (cannot cut into the middle of a speaker's turn). | PASS |
| **F5** | EP_001/002 | Global | Flat/default scores: Curiosity was identical (100 or 97.6) and confidence was static across candidates. | Sub-scores were mapped to uniform bucket constants without linguistic variance. | Recalibrated continuous scoring based on sentence structure (interrogative question vs. trailing ellipsis vs. confrontation), tension trajectory, and word punchiness. | PASS |
| **F6** | EP_001 | `00:11.30` | Question mark treated as hook: Single-word question `"Gerald?"` received an automatic high hook score. | Scoring treated `?` as an opening shock signal. | Separated opening hook scoring from cliffhanger scoring; `?` now drives cliffhanger curiosity, not opening hook. | PASS |
| **F7** | EP_001 | `02:13.80` | Missed non-dialogue moments: Final defiant close-up was omitted because camera tracks were filtered early. | Event extractor filtered camera cues before candidate generation. | Preserved visual action/camera cues as valid cut-out tail boundaries. | PASS |
| **F8** | EP_001 | `01:14.30` | Missed best moments: Event list stopped mid-episode due to early scene cutoff. | Ingestion parser stopped reading on sub-scene transition. | Ingestion parser reads through entire episode length (`02:18.00`). | PASS |
| **F9** | EP_001/002 | Global | Variable speaker identities: Same characters appear under different labels (`The Former Groom` vs. `Gerald`; `Lady in Gold Gown` vs. `Clarissa`). | Screenplay uses descriptive aliases across different scenes. | Preprocessing alias normalization map canonicalizes aliases using continuity notes. | PASS |
| **F10** | Multi-ep | Cross-ep | Missing context for new characters. | Character introduces himself without role explanation. | Flagged as `context_dependency: high` to trigger review. | PASS |
| **F11** | EP_001 | `01:13.00` | Cue leakage: Sound FX line `"ominous cliffhanger peak"` leaked dramatic turn. | SOUND FX was included in narrative scoring input. | SOUND FX blocks excluded from scoring; only spoken dialogue and physical actions drive candidate selection. | PASS |
| **F12** | EP_001/002 | `02:18.00` | Cross-episode stitching opportunity: Altar cliffhanger in Ep 1 resolves into Ep 2 opening. | Single-episode windowing ignored episodic cliffhanger link. | Sequential episodic bridge links end of Episode 1 directly to opening of Episode 2. | PASS |

---

## 2. Benchmark Metrics Status

> [!IMPORTANT]
> **Measurement Policy:** PromoForge reports only metrics computed by automated test scripts against verified data. Synthetic or unmeasured numbers are never reported.

| Metric | Status | Measurement Method |
| :--- | :---: | :--- |
| **Hard-Check Pass Rate (H1–H9)** | **100% verified** | Automated code assertion in `backend/app/engines/promos.py` checking duration [20s, 60s], boundary timestamps, no mid-line cuts, and overlap <= 20%. |
| **Sentence Continuation / Fragment Ban** | **Verified** | Code rejects any candidate opening with `...`, lowercase text, or coordinating/subordinating conjunctions (`because`, `and`, etc.). |
| **Speech-Turn & Mid-Reply Ban** | **Verified** | Code rejects candidates starting mid-speech or in the immediate reply window of another promo's cliffhanger. |
| **Hit Rate Against Hand Labels** | **Not measured** | Requires human editor gold-set labels on held-out episodes. (See Section 3 for held-out evaluation protocol). |
| **Editor Acceptance Rate** | **Not measured** | Requires second editorial pass on production cuts. |

---

## 3. Held-Out Gold Set Evaluation Protocol

To prevent overfitting to development episodes (EP_001 and EP_002):
- **Development set (excluded from gold benchmarking):** EP_001, EP_002.
- **Held-out benchmark set:** EP_012, EP_020, EP_028, EP_035, EP_041, EP_046, EP_050.
- Ground truth windows must be labelled directly from screenplay text *prior* to comparing with tool output.
- Automated evaluation runner: `backend/tests/test_evaluation_gold.py`.
