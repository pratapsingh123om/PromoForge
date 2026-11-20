# PromoForge — Failure Audit Log (`FAILURES.md`)

This failure log documents defects identified through manual editorial review of baseline runs on development episodes (EP_001 and EP_002), mapped directly to the taxonomy in `EVALUATION.md`, and subsequently tested against 7 held-out benchmark episodes (EP_012, EP_020, EP_028, EP_035, EP_041, EP_046, EP_050).

---

## 1. Failure Audit Table

| Code | Episode | Timestamp | Observed Failure | Structural Cause | Pipeline Rule / Fix | Current Status & Verification |
| :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **F1** | EP_002 | `00:02.80` | Soft action hook: Promo opened on physical reaction (*"Juliana gasps softly"*) rather than spoken dialogue. | Action cues scored higher raw intensity than dialogue. | `fallback.py`: hooks require spoken dialogue in first 3s; action reactions given lower hook weight. | Fixed on EP_002; verified across held-out episodes (all 7 top picks open on spoken lines). |
| **F2** | EP_002 | `00:00.00` | Hook buried: The true catalytic rejection line `"I cannot marry you, Juliana."` was cut off at 0.0s. | Overlapping camera cue caused generator start boundary to skip 0.0s. | Boundary search anchored to dialogue line start (`00:00.00`). | Fixed and verified on EP_002. |
| **F3** | EP_002 | `01:47.40` | Fake cliffhanger: Promo #3 ended on Juliana's speech finale (`"...I was the one who should be ashamed"`), creating resolution rather than suspense. | Candidate endpoint selected on speech volume rather than unresolved question/threat. | Added `resolves_question = True` detector rejecting acceptance/closure lines. Promo terminates at `01:42.40` on unresolved vow (`"I may leave this chapel without a husband..."`). | Fixed on EP_002; held-out endings verified unresolved. |
| **F4** | EP_002 | `00:34.30–00:44.70`<br>`01:19.00–01:19.20` | Inter-promo spoiler, mid-reply cut, and sentence continuation: Promo #2 started at `00:42.50` on `"Do not disgrace us further."` (second half of father's reply to Juliana's plea at `00:37.10`). Promo #3 started at `01:19.20` on `"...because another woman promised you..."`, completing Promo #2's cliffhanger sentence. | Generator lacked speech-turn boundary enforcement, allowed sentence fragment starts, and did not check if a promo opens inside the resolution/continuation of an earlier promo. | Implemented 4 rules in `promos.py`: (1) H6: max 20% overlap of shorter cut; (2) H7: suppress cuts that continue or answer an earlier cliffhanger; (3) Fragment ban (no starting with `...` or conjunction); (4) Speech-turn integrity (cannot cut into middle of a character's speech). | Fixed on EP_002; held-out test confirms zero fragment starts and 0 mid-speech cuts. |
| **F5** | EP_001/002 | Global | Flat/default scores: Curiosity was flat (100 or 97.6) and confidence was static across candidate cuts. | Sub-scores were mapped to uniform bucket constants without linguistic variance. | Recalibrated continuous scoring based on sentence structure (interrogative question vs. trailing ellipsis vs. confrontation), tension trajectory, and word punchiness. | Fixed on EP_002 and held-out set (scores spread realistically between 76.8 and 85.2). |
| **F6** | EP_001 | `00:33.80` | Question mark treated as hook: Single-word question `"Gerald?"` received an automatic high hook score. | Scoring treated `?` as an opening shock signal. | Separated hook from cliffhanger scoring; `?` now drives cliffhanger curiosity, not opening hook. | Fixed in scoring logic; verified on EP_001. |
| **F7** | EP_001 | `02:13.80` | Missed non-dialogue moments: Final defiant close-up was omitted. | Candidate endpoints were originally restricted to dialogue events. | Visual action/camera events re-enabled as valid segment out-points. | Fixed in boundary validator; verified on EP_001. |
| **F8** | EP_001 | `01:14.30` | Missed best moments: Event list stopped mid-episode in terminal output. | Terminal display/print truncation during log inspection; parser itself ingested all 47 events through 02:18.00. | Verified that parser reads through full episode runtime. | Verified on EP_001. |
| **F9** | EP_001/002 | Global | Variable speaker identities: Same characters appear under different labels (`The Former Groom` vs. `Gerald`; `Lady in Gold Gown` vs. `Clarissa`). | Screenplay uses descriptive labels across scenes. | Alias normalization mapping canonicalizes aliases using continuity notes. | Implemented in preprocessor; verified on EP_001/EP_002. |
| **F10** | Multi-ep | Cross-ep | Missing context for new characters. | Character appears without prior role introduction within the clip. | Flagged as `context_dependency: high` to signal human editorial review. | Flag only; automated backstory insertion not implemented. |
| **F11** | EP_001 | `02:15.00` | Cue leakage: Sound FX line `"ominous cliffhanger peak"` leaked dramatic turn. | SOUND FX was included in narrative scoring input. | SOUND FX blocks excluded from scoring; only spoken dialogue and physical actions drive candidate selection. | Fixed; SOUND FX excluded in feature extractor. |
| **F12** | EP_001/002 | `02:18.00` | Cross-episode stitching opportunity: Altar cliffhanger in Ep 1 resolves into Ep 2 opening. | Single-episode windowing evaluates screenplays in isolation. | Sequential episodic bridge links end of Episode 1 directly to opening of Episode 2. | Architectural proposal; not implemented in core single-episode pipeline. |

---

## 2. Benchmark Metrics: Held-Out Evaluation (7 Episodes)

Evaluated across **7 held-out episodes**: **EP_012, EP_020, EP_028, EP_035, EP_041, EP_046, EP_050** (excluding development episodes EP_001 and EP_002).

Ground truth was hand-labelled directly from screenplay dialogue *before* running candidate discovery.

| Metric | Measured Result | Measurement Detail |
| :--- | :---: | :--- |
| **Evaluated Held-Out Episodes** | **7** | EP_012, EP_020, EP_028, EP_035, EP_041, EP_046, EP_050 |
| **Raw Candidate Proposals Generated** | **195** | Total candidate windows satisfying basic [20s, 60s] duration |
| **Candidate Rejection / Suppression Rate** | **89.2%** (174 / 195) | 174 proposals rejected or suppressed by H6 (overlap >20%), H7 (cliffhanger continuation/spoiler), fragment ban, and mid-speech turn rules |
| **Final Selected Promos** | **21** (~2.1 per ep) | Non-overlapping, standalone promo candidates |
| **Strict Gold Match Rate (IoU $\ge$ 0.40)** | **71.4%** (5 / 7) | 5 of 7 episodes matched the human editor's primary gold window |
| **Editorial Acceptance Rate (IoU $\ge$ 0.20)** | **100.0%** (7 / 7) | All 7 top picks represent strong, standalone editorial windows (2 acceptable secondary arcs) |
| **Hard-Check Violations in Final Picks** | **0** | Zero mid-dialogue cuts, zero durations outside 20–60s, zero overlaps >20% |
| **Spoken-Dialogue Hook Rate** | **100.0%** (7 / 7) | 100% of top picks open on spoken dialogue in the first 3s (zero soft action or camera starts) |
| **Sentence-Fragment Start Rate** | **0.0%** (0 / 7) | Zero picks open on `...`, lowercase text, or coordinating conjunctions |

### Per-Episode Breakdown

| Episode | Duration | Top Pick Window | Duration | IoU vs Gold | Result | Hook Line | Cliffhanger Line |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **EP_012** | 87.2s | `00:12.30–00:52.30` | 40.0s | **0.53** | **MATCH** | *"Then someone put it there!"* | *"My emerald signet ring fell deep into the frozen blackthorn..."* |
| **EP_020** | 114.8s | `00:15.40–00:39.10` | 23.7s | **0.88** | **MATCH** | *"'Practically' is a word for beggars..."* | *"How much longer can the frail thing survive?"* |
| **EP_028** | 138.5s | `01:19.00–01:55.80` | 36.8s | **0.31** | **ACCEPTABLE** | *"A witch has no need for family heirlooms..."* | *"Do not speak about my husband!"* |
| **EP_035** | 157.5s | `00:59.50–01:46.00` | 46.5s | **0.30** | **ACCEPTABLE** | *"They told me you died. They told me your entire regiment..."* | *"And you?"* |
| **EP_041** | 96.1s | `00:34.80–01:19.30` | 44.5s | **0.86** | **MATCH** | *"Not as a bride this time."* | *"Shall we?"* |
| **EP_046** | 143.9s | `00:37.30–01:05.50` | 28.2s | **0.63** | **MATCH** | *"The church married a vagrant to a ruined lady..."* | *"I won't ask it for permission to love."* |
| **EP_050** | 80.0s | `00:12.00–00:56.50` | 44.5s | **0.84** | **MATCH** | *"Then let's stop pretending this was only appetite."* | *"In another room no one uses?"* |

*Reproduce via:* `pytest backend/tests/test_evaluation_gold.py -s -q`
