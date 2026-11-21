# PromoForge — AI Editorial Intelligence Engine

PromoForge is an AI-assisted editorial intelligence engine that transforms full-length episodic drama screenplays into source-grounded, high-retention vertical video promo cuts (TikTok, Reels, Shorts).

Deterministic code strictly enforces hard timing constraints, timestamped dialogue-boundary validation (<0.1s slice safety check), and ranking arithmetic; AI models interpret narrative meaning, emotional hooks, and unresolved cliffhangers.

- **Stable Production URL:** [https://promoforge.vercel.app](https://promoforge.vercel.app)
- **GitHub Repository:** [https://github.com/pratapsingh123om/PromoForge](https://github.com/pratapsingh123om/PromoForge)
- **Submission Solution Document (PDF):** [SOLUTION_DOCUMENT.pdf](SOLUTION_DOCUMENT.pdf)

---

## Quick Start (Single-Command Reproduction)

### 1. Verification & Testing

Run the full verification suite directly from the command line:

```bash
# 1. Run all 28 automated pre-deploy invariant tests (timing, slicing, de-duplication, series adjustments)
pnpm test:predeploy

# 2. Run the 50-episode structural parser audit (19,046 candidate pairs, 0 violations)
pnpm audit:frontend-parser

# 3. Compile the production web application
pnpm build
```

### 2. Run the Web Application

```bash
# Start the local development server (accessible via http://localhost:8443)
pnpm dev
```

### 3. Run the Backend API Pipeline (Optional)

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
python run_batch.py
```

---

## Architecture: Deterministic Code vs. AI Semantics

| Task Layer | Engine | Responsibility & Guarantees |
| :--- | :--- | :--- |
| **Parsing & Millisecond Timing** | Deterministic Code | Strict integer millisecond arithmetic (`mm:ss.ff` $\rightarrow$ ms). Never leaves clock math to an LLM. |
| **Duration Enforcement** | Deterministic Code | Hard filter: cuts must strictly sum between 20.0s and 60.0s. |
| **Dialogue Boundary Safety** | Deterministic Code | Timestamped dialogue-boundary validation (<0.1s tolerance; zero cuts inside active dialogue lines). |
| **Overlap & Continuation Suppression** | Deterministic Code | Suppresses clips sharing $\ge 4.0$s or $> 15\%$ screen time; suppresses pairs where clip B answers clip A's question. |
| **Series-Wide Pacing Adjustments** | Deterministic Code | Proportional series bonuses: +5 for first 30% of episodes, -6 penalty & spoiler flags for last 20%. |
| **Narrative Hook Evaluation** | AI (`gemini-3.1-flash-lite`) | Analyzes first 3s for immediate emotional pull, conflict, and curiosity. |
| **Cliffhanger Tension Scoring** | AI (`gemini-3.1-flash-lite`) | Evaluates whether the cut terminates on an urgent, unresolved question. |
| **Standalone Context Scoring** | AI (`gemini-3.1-flash-lite`) | Identifies whether the clip makes sense to a viewer who has never seen the show. |
| **Editorial Curation** | Human Editor | Approve, reject, adjust cut boundaries; resolve `Context Review Needed` badges. |

---

## 50-Episode Candidate Funnel & Scale

Audited on all 50 full-length episodes (3,727 timestamped script events) via `scripts/audit_frontend_parser.mjs`:

```text
Candidates Generated:                  19,046
  ├── Rejected: Duration (<20s or >60s): -7,167
  └── Rejected: Dialogue Slices:           -996
Valid Temporal Windows Formed:         10,883
  ├── Suppressed: Overlap De-dup:      -9,754
  ├── Suppressed: Continuation Spoiler:  -983
  └── Suppressed: Episode Limit Drop:      -0
Stratified Accepted Candidate Pool:       146 clean candidates
```
*(Funnel reconciliation note: In the initial baseline run prior to the 4.0s duplicate fix, overlap suppression was 9,985, continuation was 744, and cap was 1, accepting 153 candidates: $10{,}883 - 9{,}985 - 744 - 1 = 153$. The tightened $\ge 4.0$s duplicate check refined the accepted pool to 146 candidates with 0 cap drop: $10{,}883 - 9{,}754 - 983 - 0 = 146$).*

### Model Performance & Cost Accounting (`gemini-3.1-flash-lite`)
- **Model Identifier:** `gemini-3.1-flash-lite` (verified from `run_log.json` and `backend/.env.example`)
- **Shortlist Selection:** **70 candidates** selected from the 146 accepted pool via stratified per-episode round-robin allocation (`SERIES_MODEL_CANDIDATES = 70` in `src/services/demoRun.ts`)
- **Model Scored:** 70 candidates scored in 7 parallel batch calls (10 candidates per batch)
- **Input Tokens:** 45,558 tokens
- **Output Tokens:** 10,278 tokens
- **Total Wall Time:** 67.87 seconds
- **Actual Billed Console Cost:** **$0.00** (run executed under developer free tier)
- **Estimated Marginal Cost:** **$0.0065 per show** (derived from token usage at public pricing: $0.075 / 1M input, $0.30 / 1M output). Never conflate estimated marginal costs with actual billed expenditure.
- **Final Selected Promos:** 25 ranked promos selected across 22 episodes after applying model scores and series pacing adjustments (+5 early bonus, -6 late penalty)

---

## Quality Evaluation: Dual Overlap Metrics Against Independent Reference

To ensure transparent reporting, PromoForge benchmarks against an independently generated reference set (Claude 3.7 Sonnet). **Note:** These are **LLM-generated reference cuts, not human editorial ground truth or a manually labeled gold set**. Both lenient and strict evaluation criteria are reported side-by-side:

| Benchmark Metric | Threshold Criterion | Independent Reference Result |
| :--- | :--- | :---: |
| **Lenient Overlap** | Overlap $\ge 50\%$ of shorter clip | **5 of 6 (83.3%)** |
| **Strict Overlap (IoU)** | Temporal Intersection-over-Union $\ge 50\%$ | **4 of 6 (66.7%)** |

---

## Summary of Major Fixes & Changelog

1. **Reconciled Context Disagreements (2A):** When the AI scores standalone clarity $\ge 75$ but heuristics detect missing pronouns/context, the system surfaces `Context Review Needed (AI Disagreement)` with an explanatory pill instead of corrupting the decision score.
2. **Stratified Per-Episode Allocation (2B):** Replaced global top-70 candidate truncation with a stratified round-robin allocation, ensuring all 50 episodes receive candidate evaluation without starving middle or late episodes.
3. **EP_027 Duplicate Beat Elimination (2C):** Implemented an absolute $\ge 4.0$s overlap suppression threshold alongside relative $> 15\%$ checks, successfully eliminating duplicate 5.4s shared confrontation beats.
4. **Human Review State Separation (2D):** Separated engine candidate acceptance (`candidates_accepted`) from user editorial actions (`user_approved_count`, `user_rejected_count`, `user_pending_count`), preventing editorial clicks from corrupting candidate funnel counts.
5. **Exact Funnel Accounting (2E):** Reconciled the 19,046 pair generation funnel down to accepted candidates with 100% mathematical precision ($10{,}883 - 9{,}754 - 983 - 0 = 146$).
6. **Proportional Late-Series Spoiler Guard (2F):** Replaced hardcoded episode numbers with dynamic proportions (+5 for first 30%, -6 and `late-series spoiler risk` flags for last 20% of series length).
7. **Quiet Episode Damping (2G):** Added soft dialogue damping to suppress low-stakes conversational episodes (EP_006, EP_014, EP_017) from entering the top 25 global ranking.
8. **Multi-Segment Promo Constructor (Section 4):** Created `createMultiSegmentPromo` supporting cross-episode multi-segment assembly with independent dialogue boundary validation, total duration constraints (20–60s), and sequential EDL timecode export.

---

## Honest Limitations

1. **Text-Only Screenplay Modality Limitation:** PromoForge analyzes written screenplays. Dialogue boundaries are validated against parsed script event timestamps (`01:15.00`), not acoustic phoneme or audio waveform analysis. Non-verbal visual acting beats and unscripted audio cues require human editor review.
2. **Pronoun Ambiguity False Positives:** Heuristic rules flag 3rd-person pronouns ("he", "she", "they") as context risks, which occasionally flags dramatic lines that are actually self-contained due to immediate vocal delivery. The UI reconciles this with `Context Review Needed (AI Disagreement)`.
3. **Multi-Segment Narrative Coherence:** While the engine mechanically stitches multi-segment promos with valid boundaries, determining whether two disparate scenes form a coherent narrative arc still benefits from human editorial sign-off.
4. **Offline Rule Mode vs AI Variance:** Offline rule-only mode scores based on keyword density and question marks, achieving lower precision than the multi-dimensional Gemini model.
