# PromoForge — AI Editorial Intelligence Engine

PromoForge is an AI-assisted editorial intelligence engine that transforms full-length episodic drama screenplays into source-grounded, high-retention vertical video promo cuts (TikTok, Reels, Shorts).

Deterministic code enforces hard timing constraints, dialogue integrity, and ranking arithmetic; AI interprets narrative meaning, emotional hooks, and unresolved cliffhangers.

---

## Quick Start (Single-Command Run)

### Install once

```powershell
pnpm install
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
```

On macOS/Linux, activate `backend/.venv` and use its `python`/`pip` equivalents. A Gemini key is optional because the invented sample and rule-only mode run offline.

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
  .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload
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

The four-view frontend supports four scorer modes from `src/config.ts`:

- **Gemini:** schema-validated through the backend; the key may come from `backend/.env` or the in-memory browser field.
- **OpenAI-compatible:** change base URL, model, and key in the run panel; the adapter uses the standard `/chat/completions` JSON response shape.
- **No-API:** copy the generated prompt to any model, paste its JSON response, and continue after schema and candidate-ID validation.
- **Rule-only:** an offline, explicitly lower-quality fallback.

Provider failures are shown as partial runs. PromoForge never silently substitutes rule scores after a model provider was selected.

API keys belong in `backend/.env` or the deployment provider's encrypted environment settings, never in committed files. The frontend contains no API-key input and never sends provider credentials. Reviewers can demonstrate model swapping through server-approved Gemini model names, rule-only scoring, or the no-API prompt/JSON workflow.

### One-project Vercel deployment

`vercel.json` deploys the Vite frontend and FastAPI backend as two services inside one Vercel project and one public domain. Browser requests use `/api`, so production does not depend on a localhost URL or cross-origin configuration.

Configure these Vercel environment variables for Production and Preview:

```env
PROMOFORGE_ENV=production
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=your_key_here
PROVIDER_TIMEOUT_SECONDS=50
```

Then deploy from the repository root:

```bash
npx vercel@latest
npx vercel@latest --prod
```

For local development, the backend port is controlled by `PROMOFORGE_PORT`; the frontend port is controlled by `PORT`. If either default port is busy, set a different value before starting that process. Install `backend/requirements-dev.txt` when running migrations or tests; `backend/requirements.txt` is the production runtime set.

### Current demo status

The verified frontend path is:

1. Load timestamped `.txt` screenplays, a folder, a `.zip` containing a series, or the invented sample. ZIP files are unpacked and validated entirely in the browser.
2. Inspect the parse summary and explicit per-file errors.
3. Choose Gemini, OpenAI-compatible, no-API JSON paste, or offline rule-only scoring.
4. In episode mode, review the top three candidates. In series mode, review every candidate above the quality threshold (normally 15–25 for a 50-episode series), with the top ten highlighted and rank #1 recommended for downstream production.
5. Optionally accept, reject, or adjust a cut on real line boundaries.
6. Download individual artifacts or a stored-run ZIP containing CSV, JSON, Markdown, EDL, `run_log.json`, timeline notes, and the exact raw model response when a model was called.

The **Library** opens with a completed, invented two-episode example so a public reviewer can inspect the product without uploading private material. Completed runs added during the browser session also appear there, and moving between Library, Upload, Run status, Promos, and Quality preserves each page's in-progress UI state. This demo library is session-only; it is not a shared database and must not be treated as durable storage.

Verified on 2026-11-21: the current client parser handled all 50 ignored local screenplay files with no silent skips, the invented sample completed live in Gemini and no-API modes, and the generated ZIP passed an independent archive integrity check. Run `pnpm audit:frontend-parser` to repeat the structural audit without printing screenplay text.

See `PROGRESS.md` for the distinction between verified, partial, and open checkpoints. Gold-set quality metrics remain **Not measured** until the labels are confirmed as user-authored and the evaluation script is rerun.

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

## Where the AI Picks Badly (Invented Examples & Guardrails)

The invented fixtures reproduce three common editorial failure modes without exposing private screenplay text:

1. **Dead-air openings:** a naive fixed window can begin on camera direction before anyone speaks. Hooks are therefore restricted to verified dialogue or high-intensity action evidence.
2. **Mid-line dialogue slicing:** fixed-duration windows can cut a speaker mid-sentence. Every boundary is snapped to a parsed event boundary and revalidated after manual adjustment.
3. **Cliffhanger resolution leakage:** a cut can continue into the answer to its own mystery. Candidate generation penalizes or rejects windows that immediately resolve the final curiosity gap.

See [CONTENT_NOTICE.md](CONTENT_NOTICE.md) for the data and screenplay exclusion notice.

---

## Raw Unedited Outputs

Running `python run_batch.py` generates the following unedited production assets in `./exports/`:
- `promos_master.csv`: Comprehensive tabular inventory of all 50 episodes with rank, timecodes, score, hook event ID, and "why it works".
- `promos_master.txt`: NLE editor cut sheet formatted for offline cutting in Premiere, Resolve, or Avid.
- `{episode_key}_cut_sheet.json`: Full structured JSON metadata per episode with score breakdowns, rationale, cautions, and evidence arrays.
- `{episode_key}_promos.otio`: Native OpenTimelineIO timeline track ready for direct import into professional video editing software.
