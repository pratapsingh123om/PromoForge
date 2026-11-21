# PromoForge: Automated Editorial Intelligence for Drama Promos
**Author:** AI Product & Systems Engineer | **Assignment:** Kuku AI Generalist Assignment — Problem 1 (Find the Promos)  
**Artifact Link:** [github.com/pratapsingh123om/PromoForge](https://github.com/pratapsingh123om/PromoForge) | **Production App:** [promoforge.vercel.app](https://promoforge.vercel.app)  
**Stack:** Vite 8 + React 19 + Tailwind CSS v4 + FastAPI + Python 3.12 + Google Gemini API

---

## 1. Problem Choice & Operational Framing

### Why Problem 1 (Find the Promos)?
I chose **Problem 1 (Find the Promos)** because discovering high-converting promotional cut points is the single most urgent operational bottleneck in vertical drama streaming. While other challenges drift toward speculative end-to-end video synthesis, promo selection is an immediate, business-critical editorial workflow with clear evaluation criteria:

1. **Immediate Operational Bottleneck:** Editing teams manually comb through hours of episodic drama to find 30–60s acquisition hooks for TikTok, Reels, and YouTube Shorts under weekly release deadlines.
2. **Directly Measurable Business Impact:** Top-of-funnel promo retention and click-through directly drive initial coin unlocks and subscriber acquisition curves.
3. **Realistic Series-Scale Verifiability:** The 50 supplied episodes (~3,727 events) permit rigorous full-series stress testing against real-world production scale rather than isolated toy demos.
4. **Clean Division of Labor:** High-precision deterministic code guarantees timing invariants and boundary physics, while AI evaluates narrative tension, dramatic pacing, and curiosity gaps.
5. **Scoped for Editorial Utility:** Focuses on solving candidate discovery and NLE cut-sheet generation rather than ungrounded "virality" hype or synthetic video hallucinations.

### Hard Editorial Invariants & Operating Boundaries
- **Duration Bounds:** Strictly bounded to 20.0s – 60.0s total runtime.
- **Dialogue Boundary Validation:** Zero cuts inside spoken lines (<0.1s tolerance against script event clocks; text-only boundary check).
- **Curiosity Hook & Cliffhanger:** Opening hook in first 3.0s; ends on maximum unresolved curiosity/tension without answering its own premise.
- **Confidentiality Guarantee:** Zero proprietary screenplay dialogue committed to public git or leaked to public models.
- **Human-in-the-Loop Workflow:** AI proposes, ranks, and annotates; editors retain final review, boundary trimming, and NLE export control.

---

## 2. System Architecture: Five-Layer Runtime & Division of Labor

PromoForge enforces a strict five-layer runtime architecture that separates deterministic time-boundary mechanics from semantic narrative interpretation:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BROWSER RUNTIME • TypeScript / React 19 / Vite (Deployed on Vercel)                    │
│                                                                                        │
│  ┌─────────────────────────┐  Events   ┌───────────────────────────┐                   │
│  │ LAYER 1: FRONTEND UI    │──────────▶│ LAYER 2: DETERMINISTIC    │                   │
│  │ • React 19, TS, Vite    │           │ • screenplayEngine.ts     │                   │
│  │ • 50-Ep Intake & Upload │           │ • Integer-ms clock math   │                   │
│  │ • Real-time progress    │           │ • [20s, 60s] window gen   │                   │
│  │ • State orchestration   │           │ • Dialogue check (<0.1s)  │                   │
│  └─────────────────────────┘           │ • Overlap & de-dup filter │                   │
│                                        │ • 146 pool ──▶ 70 model   │                   │
│                                        └─────────────┬─────────────┘                   │
│                                                      │                                 │
│  ┌───────────────────────────────────────────────────┼──────────────────────────────┐  │
│  │ LAYER 5: EDITORIAL REVIEW WORKSPACE               │                              │  │
│  │ • Matches JSON scores by candidate ID             │                              │  │
│  │ • Deterministic series adjustments (+5 early, -6 late)                           │  │
│  │ • "Context Review Needed" AI-heuristic disagreement flags                        │  │
│  │ • Human review: Approve / Reject / Dialogue boundary nudge                       │  │
│  │ • Multi-format NLE export: CMX 3600 EDL, OpenTimelineIO (OTIO), CSV, JSON        │  │
│  └───────────────────────────────────────────────────┼──────────────────────────────┘  │
└──────────────────────────────────────────────────────┼─────────────────────────────────┘
                                                       │
                           HTTP POST /api/demo/scoring/run (Shortlist batches)
                                                       │
                                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVERLESS BACKEND & CLOUD AI • Python FastAPI / Google Gemini API                     │
│                                                                                        │
│  ┌──────────────────────────────┐  Batch Dispatch   ┌───────────────────────────────┐  │
│  │ LAYER 3: BACKEND API SERVICE │──────────────────▶│ LAYER 4: AI SCORING           │  │
│  │ • FastAPI • Python 3.12      │                   │ • gemini-3.1-flash-lite       │  │
│  │ • Vercel rewrite: /api/*     │◀──────────────────│ • 70 cands in 7 batches       │  │
│  │ • POST /api/demo/scoring/run │   JSON Scores     │ • Hook Potency (0-100)        │  │
│  │ • Pydantic schema validation │                   │ • Cliffhanger Urgency (0-100) │  │
│  │ • Secure credential injection│                   │ • Standalone Clarity (0-100)  │  │
│  │ • Error handling & dispatch  │                   │ • ZERO clock arithmetic       │  │
│  └──────────────┬───────────────┘                   └───────────────────────────────┘  │
│                 │                                                                      │
│                 └───────────────────────────────────┐                                  │
└─────────────────────────────────────────────────────┼──────────────────────────────────┘
                                                      │
                       Structured JSON Response (Returned through FastAPI)
                                                      │
                                                      ▼
                                       (To Layer 5 Editorial Workspace)
```

> **Design principle:** deterministic code owns correctness, AI evaluates narrative meaning, and editors retain creative control.

### Clear Division of Responsibilities

| Subsystem | Owner Technology | Core Responsibilities (What It Owns) | What It Must NEVER Do |
| :--- | :--- | :--- | :--- |
| **Browser / Client Engine** | TypeScript 5.7 / `screenplayEngine.ts` | Integer-ms timing calculations, boundary validation (<0.1s tolerance), candidate window generation [20s, 60s], overlap suppression (≥4.0s or >15%), continuation de-duplication, shortlist stratification (146 pool → 70 model), NLE export formatting (EDL, OTIO). | Never evaluate narrative subtext, emotional tension, or pronoun ambiguity. |
| **Backend API** | FastAPI / Python 3.12 (Vercel `/api/*`) | HTTP routing via `vercel.json`, Pydantic request/response schema validation, server-side API credential isolation, provider dispatch, batch orchestration, rate limit handling. | Never expose raw Gemini API keys to the browser; never perform client UI rendering. |
| **AI Semantic Evaluator** | Google Gemini (`gemini-3.1-flash-lite`) | Narrative Hook Potency (0–100), Cliffhanger Unresolvedness & Urgency (0–100), Standalone Clarity & Context Audit (0–100), evidence-grounded rationale generation. | **Zero arithmetic responsibility:** Never calculate durations, subtract timestamps, or filter overlaps. |
| **Human Editor** | Editorial Review Workspace (React 19) | Final creative judgment, reviewing "Context Review Needed" AI-heuristic disagreement flags, line-boundary trim nudging on real dialogue events, Approve/Reject review, NLE export trigger. | Never bypassed by full-autonomous publishing; retains 100% final editorial authority. |

---

## 3. Scale, Performance & Cost Breakdown

All numbers are measured directly from the 50-episode execution run (`outputs/run-2026-11-21T06-35-55-637Z` and `scripts/audit_frontend_parser.mjs`):

### The 50-Episode Candidate Funnel
The engine audited all 50 screenplay files (3,727 total timestamped events) and evaluated 19,046 candidate start/end event combinations:
- **Raw Pairs Examined:** 19,046
- **Duration Filter (< 20s or > 60s):** -7,167 rejected
- **Dialogue Slice Filter (boundary cuts inside spoken dialogue):** -996 rejected
- **Valid Formed Windows:** 10,883 clean temporal windows ($19{,}046 - 7{,}167 - 996 = 10{,}883$)
- **Overlap De-duplication (suppressed by higher-scoring window):** -9,754 suppressed
- **Continuation Spoiler Suppression (ends/starts on resolved question):** -983 suppressed
- **Episode Variety Cap Drop:** -0 suppressed
- **Stratified Accepted Candidate Pool:** **146 clean accepted candidates** across all 50 episodes ($10{,}883 - 9{,}754 - 983 - 0 = 146$). Exact 100% mathematical reconciliation.
*(Note on funnel evolution: In the initial baseline run prior to the 4.0s duplicate fix, overlap suppression was 9,985, continuation was 744, and cap drop was 1, accepting 153 candidates: $10{,}883 - 9{,}985 - 744 - 1 = 153$. The tightened $\ge 4.0$s duplicate suppression and soft damping refined the accepted pool to 146 candidates with 0 cap drop).*

### Shortlist Allocation, Inference Cost & Throughput
From the 146 clean candidates in the accepted pool, PromoForge selected a bounded, stratified shortlist of **70 candidates** across all 50 episodes (`SERIES_MODEL_CANDIDATES = 70` in `src/services/demoRun.ts`) to be evaluated by the LLM. These 70 candidates were scored using **Google Gemini (`gemini-3.1-flash-lite`)** in 7 parallel batches (10 candidates per batch):
- **Model Identifier:** `gemini-3.1-flash-lite` (verified from `run_log.json` and `backend/.env.example`)
- **Candidates Scored by Model:** 70 candidates across all 50 episodes (in 7 parallel batch calls)
- **Total Input Tokens:** 45,558 tokens
- **Total Output Tokens:** 10,278 tokens
- **Total Wall Time:** 67.87 seconds
- **Actual Billed Console Cost:** **$0.00** (executed under Google developer free tier)
- **Estimated Marginal API Cost:** **$0.0065** for the 50-episode show (calculated from official Gemini Flash Lite pricing: $0.075 / 1M input tokens = $0.0034; $0.30 / 1M output tokens = $0.0031). Never conflate estimated marginal costs with actual billed expenditure.
- **Final Ranked Global Promos:** 25 ranked promos selected across 22 episodes after applying model scores and series pacing adjustments (+5 early bonus, -6 late penalty).

---

## 4. Quality Evaluation: How I Know It's Good & Where It Fails

### Dual Benchmark Against Independent Reference Set (Claude LLM)
To benchmark performance, generated cuts were evaluated against an independent reference set generated by an external LLM (Claude 3.7 Sonnet). **Important editorial distinction:** These reference windows represent an **LLM-generated reference benchmark, not human editorial ground truth or a manually labeled gold set**.

We report two separate evaluation benchmarks side-by-side to ensure complete transparency:

1. **Per-Episode Rule Cut-Sheet Benchmark (`gold_results.json`):** Evaluates unconstrained per-episode candidate generation (top 3 per episode).
   - **Lenient Metric (Overlap $\ge 50\%$ of shorter clip):** **5 of 6 (83.3%)**
   - **Strict Metric (Temporal IoU $\ge 50\%$):** **4 of 6 (66.7%)**
2. **Actual Full-Series Gemini-Scored Run (`gold_results_gemini.json`):** Evaluates the final series-wide model run (`promos.json`) across all 50 episodes.
   - **Lenient Metric (Overlap $\ge 50\%$ of shorter clip):** **2 of 6 (33.3%)**
   - **Strict Metric (Temporal IoU $\ge 50\%$):** **1 of 6 (16.7%)**
   - **Negative Controls (Quiet Episodes EP_006, EP_014, EP_017):** 100% excluded from top 25 series promos.

| Episode & Target Cut | Reference (Claude LLM) | Rule-Based Cut-Sheet Match | Full-Series Gemini Run Match |
| :--- | :--- | :---: | :---: |
| **EP_024 Cut 1** | 00:22.50 – 00:48.00 | **66.7%** Lenient / 35.4% Strict | **66.7%** Lenient / 35.4% Strict |
| **EP_024 Cut 2** | 00:06.80 – 00:32.50 | **87.6%** Lenient / **69.1%** Strict | 5.8% Lenient / 2.4% Strict |
| **EP_041 Cut 1** | 00:58.00 – 01:24.00 | 9.6% Lenient / 4.8% Strict | 9.6% Lenient / 4.8% Strict |
| **EP_041 Cut 2** | 00:00.00 – 00:31.00 | **100.0%** Lenient / **83.1%** Strict | *(Not in 70-model shortlist)* |
| **EP_047 Cut 1** | 00:00.00 – 00:42.50 | **68.3%** Lenient / **51.2%** Strict | *(Not in 70-model shortlist)* |
| **EP_047 Cut 2** | 00:42.50 – 01:05.00 | **100.0%** Lenient / **100.0%** Strict | *(Not in 70-model shortlist)* |

**Analysis of the Gap:** In full-series mode, Gemini scored a bounded shortlist of 70 candidates across 50 episodes (~1.4 per episode), whereas the per-episode rule benchmark evaluated unconstrained cut sheets (top 3 per episode). While shortlist allocation directly affected which candidate windows reached the model for scoring, it does not conclusively explain the entire performance gap; semantic divergence between LLM architectures in valuing emotional hooks, dialogue cadence, and cliffhanger urgency also contributes to differing editorial selections.

### Where the System Failed & How It Was Fixed
1. **The Standalone Disagreement Bug:** 17 of 25 promos had high AI standalone scores ($\ge 80$) but were flagged with heuristic "needs context" because regexes flagged missing pronouns.  
   *Root Cause:* Pronoun heuristics flagged missing antecedent names; the LLM saw the drama was self-explanatory.  
   *Fix:* The UI now surfaces `Context Review Needed (AI Disagreement)` with an explanatory pill rather than a blunt penalty.
2. **Duplicate Beat Reuse (EP_027):** Two promo cuts in EP_027 both included a 5.4s confrontation beat because relative overlap was $14.7\% \le 20\%$.  
   *Fix:* Enforced absolute overlap suppression: any two clips sharing $\ge 4.0$s of screen time are treated as conflicts.
3. **Quiet Episodes in Top Ranks:** EP_006, EP_014, and EP_017 featured low-stakes domestic conversations that snuck into rule-based ranks.  
   *Fix:* Added soft dialogue damping: clips with romance markers and zero escalation words receive a damping penalty, eliminating them from the top 25.
4. **Approval State Corruption:** Approving one promo in the frontend set `candidates_accepted = 1`, corrupting the engine's 25 accepted count.  
   *Fix:* Separated engine accepted inventory (`candidates_accepted`) from editorial workflow counters (`user_approved_count`, `user_rejected_count`, `user_pending_count`).

---

## 5. Tools Used & Where AI Got It Wrong

### Tooling Stack
- **Languages & Frameworks:** TypeScript 5.7, React 19, Tailwind CSS v4, Vite 8, Python 3.12, FastAPI.
- **AI Models:** Google Gemini (`gemini-3.1-flash-lite`), OpenAI-compatible schema adapter, offline rule-based fallback.
- **NLE Interop:** OpenTimelineIO (OTIO) and CMX 3600 Edit Decision Lists (EDL).

### Honest Account: Where AI Got It Wrong
1. **Clock Arithmetic Hallucination:** When asked to calculate duration from `01:12.40` to `01:45.10`, LLMs occasionally outputted `33.3s` instead of `32.7s` or misread frame fractions as decimal hundredths.  
   *Solution:* Removed all timestamp arithmetic from AI prompts. Timestamps are exclusively calculated in integer milliseconds by TypeScript/Python engines.
2. **Confidence Score Sycophancy:** In early iterations, the model scored 90% of candidates between 88 and 96, compressing variance and making ranking useless.  
   *Solution:* Enforced structured criteria rubrics with explicit failure penalties (e.g., -15 for unresolved pronoun subjects, -20 for resolved cliffhangers).
3. **Dialogue Leakage:** During automated report generation, an agent copied dialogue lines into public markdown files.  
   *Solution:* Implemented automated redaction gates and pre-commit checks ensuring zero proprietary screenplay lines enter repository commits.

---

## 6. Next Steps & Production Limitations

1. **Text-Only Modality Limitation:** PromoForge operates strictly on parsed timestamped screenplay text. Dialogue boundary safety is validated against script event start and end clocks, not direct audio waveform or acoustic phoneme analysis. Non-verbal visual acting beats and unscripted audio cues require human editor review.
2. **Audio-Visual Multimodal Grounding:** Future roadmap will ingest proxy video alongside screenplays to correlate dialogue with facial close-ups, vocal loudness spikes, and scene cuts via Whisper timestamps.
3. **Automated Multi-Segment Story Stitching:** Productionize the built-in `createMultiSegmentPromo` constructor to automatically pair Episode 1 curiosity hooks with Episode 15 cliffhangers into seamless 45-second composite teasers.
4. **Real-Time Retention Feedback Loop:** Connect TikTok/Reels retention curve APIs via webhook to continuously tune hook scoring weights against real audience drop-off data.
