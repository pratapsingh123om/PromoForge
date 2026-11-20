# PromoForge — AI Editorial Intelligence Engine

PromoForge is an AI-assisted editorial intelligence engine that transforms full-length episodic drama screenplays into source-grounded, high-retention vertical video promo cuts (TikTok, Reels, Shorts).

Deterministic code enforces hard timing constraints, dialogue integrity, and ranking arithmetic; AI interprets narrative meaning, emotional hooks, and unresolved cliffhangers.

---

## Quick Start (Single-Command Run)

### 1. Run the Entire 50-Episode Batch Pipeline
To analyze all 50 episodes and export raw cut sheets (JSON, CSV, TXT, OTIO) in one command:

```bash
# Ingest, analyze, rank, and export all 50 episodes into ./exports
python run_batch.py
```

To run a specific episode (e.g. Episode 2):
```bash
python run_batch.py --episode EP_002
```

### 2. Start the Interactive Editorial Studio (Web App)
- **Backend API**:
  ```bash
  cd backend
  uvicorn app.main:app --port 8000 --reload
  ```
- **Frontend App**:
  ```bash
  pnpm dev
  ```
  Open `http://localhost:8443` (or the Vite dev server port) to use the visual Promo Studio, Cut Boundary Editor, Campaign Lab, and NLE Export panel.

---

## Architecture & Configuration

### Swapping AI Models & Providers
Model providers and credentials are never hard-coded. They are configured via environment variables or `.env`:

```env
# .env
LLM_PROVIDER=gemini        # 'gemini' for Google Gemini API, or 'rule_based' for deterministic fallback
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=your_gemini_api_key_here
```

When no API key is present or when running offline, PromoForge automatically falls back to the deterministic `RuleBasedNarrativeProvider` with zero data loss or downtime.

---

## Hard Constraints & Automated Invariants

| Constraint | Implementation & Guarantee | Code Enforcement |
| :--- | :--- | :--- |
| **Duration: 20–60 Seconds** | Every candidate promo must strictly sum between 20.0s and 60.0s. | `assert MIN_DURATION_MS <= candidate.duration_ms <= MAX_DURATION_MS` |
| **Real Timestamps (No Frame Confusion)** | `mm:ss.ff` is converted to integer milliseconds (e.g. `01:15.00` = `75,000ms`, `.80` = `800ms`, not frames). | `timestamp_to_ms()` in `app/engines/ingestion.py` |
| **Never Slice a Line of Dialogue** | All cut boundaries (`start_ms`, `end_ms`) snap to verified dialogue/action event boundaries. No cut ever falls between an event's start and end time. | `validate_candidate()` in `app/engines/promos.py` |
| **Bounds & Chronology** | `0 <= start_ms < end_ms <= episode_duration_ms`. Segments never overlap within an episode. | `validate_candidate()` and `temporal_iou` |
| **Deduplication** | Overlapping proposals with Temporal IoU $\ge 0.65$ are suppressed by higher-scoring candidates. | Non-maximum suppression in `discover_promo_candidates()` |

---

## Where the AI Picks Badly (Real Failure Modes & Guardrails)

During initial runs, pure LLM generation and naive time-window searches exhibited three critical failure modes that PromoForge specifically prevents:

1. **Silent Camera Openings (The "Dead Air" Hook Failure)**:
   - *Example:* In Episode 1 (`00:00.00`–`00:11.30`), the script opens with establishing camera moves inside the chapel. A naive 30-second window starting at `00:00.00` yields 11 seconds of dead silence before any line is spoken. On TikTok, 11 seconds of silent camera work causes immediate drop-off.
   - *PromoForge Guardrail:* Hooks are restricted to verified dialogue or high-intensity action events. Episode 1's winning cut starts at `00:33.80` or `00:11.30` ("You should turn around, Juliana."), ensuring an active hook within the first 3 seconds.

2. **Mid-Line Dialogue Slicing**:
   - *Example:* A standard 40-second fixed window ending at `00:30.00` in Episode 2 cut Juliana's line mid-sentence: `"Father..."` was truncated before her plea was completed.
   - *PromoForge Guardrail:* Candidates strictly lock their in- and out-points to parser event boundaries. `validate_candidate()` asserts that neither the start nor end boundary slices an active event (`event.start_ms < boundary < event.end_ms`).

3. **Cliffhanger Resolution Leakage**:
   - *Example:* In Episode 1, if a promo extends past `01:14.30`, it includes the groom's admission of his affair with Juliana's sister. This resolves the central curiosity gap too early, eliminating the viewer's motive to watch the full episode.
   - *PromoForge Guardrail:* Events identified as `resolves_question = True` immediately invalidate a candidate if included in the cliffhanger beat, guaranteeing the promo ends on an unresolved question or threat.

---

## Raw Unedited Outputs

Running `python run_batch.py` generates the following unedited production assets in `./exports/`:
- `promos_master.csv`: Comprehensive tabular inventory of all 50 episodes with rank, timecodes, score, hook event ID, and "why it works".
- `promos_master.txt`: NLE editor cut sheet formatted for offline cutting in Premiere, Resolve, or Avid.
- `{episode_key}_cut_sheet.json`: Full structured JSON metadata per episode with score breakdowns, rationale, cautions, and evidence arrays.
- `{episode_key}_promos.otio`: Native OpenTimelineIO timeline track ready for direct import into professional video editing software.
