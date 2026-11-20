# PromoForge Backend Plan

This document is the implementation contract for the PromoForge Intelligence Engine. It turns the proposed architecture into small, testable checkpoints. A milestone is complete only when its exit criteria and tests pass.

## 1. Goal

Build a backend that can ingest a new screenplay, preserve source evidence, discover promotional moments, validate every timing decision, rank and diversify candidates, and export production-ready editorial instructions.

The first target is one synthetic episode working end to end. We scale to real episodes only after that vertical slice is reliable.

## 2. Non-negotiable principles

- AI may interpret narrative meaning; deterministic code owns IDs, timestamps, validation, ranking arithmetic, persistence, and exports.
- AI responses reference parser-issued event IDs. The model never supplies accepted timestamps.
- All internal time values are integer milliseconds.
- Every recommendation includes source evidence, model/provider metadata, confidence, and validation state.
- AI providers sit behind one interface. Business logic must not depend on Gemini, OpenAI, or a local model.
- Failed work is resumable from persisted checkpoints.
- Fallback output is clearly labelled and never presented as model-derived analysis.
- Real screenplays, API keys, databases, and generated exports stay out of source control.

## 3. Initial architecture

- API: FastAPI under `/api`
- Schemas: Pydantic v2
- Persistence: SQLite with SQLAlchemy; PostgreSQL-compatible boundaries
- Jobs: local asynchronous worker with database checkpoints
- AI: provider interface, one production provider, and a labelled rule-based fallback
- Graph and similarity: NetworkX plus TF-IDF/cosine similarity
- Exports: JSON, CSV, TXT, ZIP, and OpenTimelineIO
- Tests: Pytest with deterministic fixtures and golden outputs where appropriate

The prototype is a modular monolith. We will not add Redis, Celery, a vector database, LangChain, or microservices until a measured requirement demands them.

## 4. Canonical data contract

Every extractor must produce the same episode structure:

```json
{
  "episode_id": "EP_003",
  "duration_ms": 95000,
  "language": "en",
  "events": [
    {
      "event_id": "EP_003_E014",
      "start_ms": 12000,
      "end_ms": 15000,
      "type": "dialogue",
      "character": "Emma",
      "text": "Who told you my secret?",
      "scene_id": "SC_02",
      "timing_source": "exact"
    }
  ]
}
```

Required invariants:

- Episode and event IDs are stable and unique.
- Events are ordered by start time. Source tracks such as camera, action, sound,
  and dialogue may overlap; candidate promo segments are validated separately.
- `0 <= start_ms < end_ms <= duration_ms`.
- Inferred timing is explicitly marked.
- Source text is preserved; normalization never silently rewrites evidence.
- Partial parsing returns warnings and unparsed line references.
- Source timing inconsistencies are preserved and reported; the parser never
  silently clips an event to a declared scene boundary.

## 5. Milestones and checkpoints

### M0 — Contract and service foundation

Status: **complete — 2026-11-20**

Build:

- Backend package structure and environment configuration.
- `/api/health` endpoint.
- Canonical screenplay schemas and validation errors.
- First deterministic timestamped-text parser.
- Safe local development configuration and `.env.example`.

Tests:

- Health endpoint returns the service name and version.
- Timestamp conversion is exact for supported formats.
- Parser creates stable IDs and correct event types.
- Invalid, out-of-order, or out-of-bounds events fail validation. Intentional
  source-track overlap is preserved.
- Strict parsing rejects unrecognized non-empty lines.

Exit criteria:

- `python -m pytest backend/tests -q` passes.
- API starts without an AI key or external service.
- No accepted event contains a fabricated timestamp.

Verified result:

- Backend package, configuration, schemas, health route, and text-ingestion route are implemented.
- The parser emits stable source event IDs, integer millisecond timing, source hashes, and explicit warnings.
- The automated M0 suite passes, including malformed input, chronology, overlap, duration, and route-contract cases.
- A live Uvicorn HTTP smoke test passed for both `/api/health` and `/api/ingestion/text`.

### M1 — File ingestion and source provenance

Status: **complete for the supplied company format — 2026-11-20**

Build:

- Timestamped TXT and safe ZIP adapters for the supplied production format.
- PDF and DOCX adapters remain optional until an authorized input requires them.
- File type, size, decompression, and path traversal safeguards.
- Content hashes and source-file records.
- Timestamp inference policy with explicit provenance.
- Synthetic fixtures representing common screenplay formats.

Tests:

- Golden extraction tests for every supported format.
- Malformed and password-protected documents fail clearly.
- ZIP traversal, zip-bomb limits, and unsupported files are rejected.
- Re-uploading identical content produces the same hash and cache key.
- Extracted events retain page/line/source references where available.

Checkpoint: one uploaded episode becomes valid canonical JSON with an extraction report.

Verified company-pack result:

- The archive contains 50 UTF-8 TXT episodes and no unsafe paths.
- All 50 episodes parse without extraction into 100 scenes and 3,727 timed events.
- Event totals: 1,754 camera, 372 action, 1,487 dialogue, and 114 sound events.
- Total declared/observed running time is 6,162,620 milliseconds.
- One source warning is retained: episode 22 contains a sound event ending 300 ms
  after its declared scene boundary. The parser does not alter the supplied time.
- The archive SHA-256 is
  `5d66d780f55480372977e13a278e26537adaed4936215a6afa6b0bcc108b4ccf`.
- A live multipart request to `/api/ingestion/archive/validate` reproduced the
  same counts and warning without extracting or externally transmitting files.
- Single-episode ingestion now requires an explicit series name. An exact,
  case-insensitive name match appends the episode to the existing project; a new
  name creates a project containing that episode.
- Repeat uploads of identical content are idempotent. Different content claiming
  an existing episode ID returns a conflict instead of silently overwriting it.

### M2 — Persistence and resumable jobs

Status: **complete — 2026-11-20**

Build:

- SQLite database, migrations, and repository layer.
- Projects, episodes, events, jobs, model runs, promos, reviews, campaigns, and exports.
- Job state machine: queued, running, completed, failed, cancelling, cancelled.
- Per-episode checkpoints, retries, cancellation, and idempotency keys.

Tests:

- Migration up/down and clean-database startup.
- Repository create/read/update tests.
- Legal and illegal job-state transitions.
- Interrupted work resumes without duplicating completed episodes.
- Concurrent retry requests do not create duplicate work.

Checkpoint: restart the backend during a multi-episode synthetic job and resume from the last completed episode.

Verified result:

- Alembic migration `b57cc4f72031` creates and reverses the initial SQLite schema.
- The gitignored local database contains one project, 50 episodes, 100 scenes,
  3,727 source events, and the single retained ingestion warning.
- The initial analysis job is queued with 50 durable episode checkpoints.
- Re-importing the same archive returns the existing project and job without
  duplicating records.
- Tests prove legal/illegal job transitions, cancellation, retry, persisted
  restart recovery, and preservation of completed episode checkpoints.
- Live API checks passed for project listing, job status, and idempotent job creation.
- The automated suite passes 32 tests.

### M3 — Narrative intelligence and provider boundary

Status: **in progress — Gemini provider verified; concurrency checkpoint remains**

Build:

- `LLMProvider.generate_structured()` interface.
- Prompt and schema versioning.
- One real provider plus labelled deterministic fallback.
- Bounded concurrency, timeouts, retry/backoff, usage tracking, and cache keys.
- Narrative event classification and unresolved-question extraction.

Tests:

- Provider contract tests using a fake provider.
- Invalid JSON/schema output is rejected or retried.
- Unknown event IDs from a model are rejected.
- Timeouts and rate limits produce resumable job failures.
- Cache keys change with source content, model, or prompt version.
- Prompt-injection text remains data and cannot alter system constraints.

Checkpoint: classify one episode while proving every claim points to existing event IDs.

Local checkpoint result:

- Provider-neutral structured-generation interface, versioned prompt, Pydantic
  narrative schemas, bounded retries, request hashing, cache lookup, and audit
  records are implemented.
- A labelled `rule-based-v1` fallback analyzed `EP_001` locally; no source text
  was transmitted outside the machine.
- The run produced 45 narrative classifications from the episode's non-camera
  source events and stored provider, model, prompt version, latency, retry count,
  raw structured output, and confidence.
- Grounding verification found zero unknown primary or evidence event references.
- The durable job is running at 2% with `EP_001` complete and 49 episode
  checkpoints still pending.
- A read endpoint exposes the persisted episode narrative by job and episode.
- Migration `298f2ff1bd0b` adds model-run and narrative-event audit tables.
- The automated suite passes 40 tests.

Authorized Gemini checkpoint result:

- The production `GeminiProvider` uses Google's asynchronous Gen AI SDK,
  schema-constrained JSON responses, a bounded request timeout, typed provider
  errors, and retriable handling for rate limits and temporary server failures.
- The configured free-tier project can access `gemini-3.1-flash-lite`. A live
  smoke test completed with two hard-coded synthetic events only; no company
  screenplay text or archive content was transmitted.
- The live response produced two classifications, preserved every parser-style
  source ID exactly, and passed the backend grounding validator with no unknown
  primary or evidence references.
- Measured smoke-test usage was 106 input tokens, 328 output tokens, and 1,723 ms
  end-to-end provider latency. Billing cost was not inferred from token counts.
- The first live response exposed a useful guardrail: when the model changed the
  synthetic episode ID, deterministic validation rejected the result. The
  corrected test contract now explicitly requires exact ID copying.
- Unit tests cover valid structured output, invalid schema rejection, and
  retriable Gemini server errors. The full backend suite passes 40 tests, and
  backend modules compile successfully.

Remaining before M3 closes:

- Enforce bounded cross-episode concurrency and test timeout propagation through
  the job/checkpoint layer.
- Add retry backoff and prove resumable behavior through a live temporary
  provider failure.
- Record cost measurements only when billing data is available; do not estimate
  billed cost from token counts.

### M4 — Candidate discovery, validation, ranking, and deduplication

Status: **in progress — continuous single-episode checkpoint complete**

Build:

- Hook-to-cliffhanger boundary search.
- Deterministic duration and evidence validation.
- Generator/critic separation.
- Configurable scoring and penalties.
- Temporal IoU deduplication similar to non-maximum suppression.

Tests:

- Boundary search includes valid edge cases at exactly 20 and 60 seconds.
- Invalid duration, missing evidence, resolved cliffhanger, or bad chronology is rejected.
- Ranking arithmetic is reproducible from stored components.
- Temporal IoU is correct for disjoint, partial, identical, and multi-episode segments.
- Higher-scoring duplicates suppress lower-scoring candidates.

Checkpoint: one episode produces ranked, source-grounded, non-duplicate candidates with explainable scores.

Verified continuous-candidate result — 2026-11-20:

- `continuous-promo-v1` discovers 20–60 second hook-to-cliffhanger windows from
  persisted, source-grounded narrative events. It never asks the model to invent
  or approve timestamps.
- Deterministic validation checks exact duration, episode bounds, hook/end event
  boundaries, evidence containment, unknown IDs, minimum hook/cliffhanger
  strength, and resolution leakage before ranking.
- Ranking stores separate hook, tension, curiosity, ending, confidence, and
  duration-fit components. Stable hashes identify candidates independently of
  their rank.
- Temporal intersection-over-union suppresses a lower-scoring proposal when its
  continuous footage substantially overlaps a selected higher-scoring proposal.
- Migration `6e9c24a8310f` adds auditable, job-scoped candidate persistence.
  Re-running the same generator/model-run combination returns the cached rows.
- `POST /api/jobs/{job_id}/episodes/{episode_key}/promos/generate` generates or
  reuses candidates; the companion GET route reads them.
- The evaluation-template endpoint converts selected candidates into the
  blinded editor-review contract without fabricating reviews or quality claims.
- A local run over the existing grounded `EP_001` analysis produced 63 valid
  proposals, selected 9 ranked candidates, and suppressed 54 overlapping
  proposals. All work was local; no screenplay text was sent to Gemini.

Remaining before M4 closes:

- Calibrate score weights and thresholds using blinded editor labels rather than
  the synthetic fixture.
- Add explicit configurable policy versions and retain rejected proposal audit
  records when future generators emit invalid drafts.
- Complete human review of the top candidates and meet the agreed Precision@K,
  spoiler-safety, boundary-usability, and duplication targets.

### M5 — Cross-episode narrative stitching

Status: **in progress — persisted series/episode workflow and evaluation UI connected**

Build:

- Narrative graph with character, conflict, cause, escalation, and resolution edges.
- TF-IDF similarity combined with character and arc overlap.
- Bounded beam search for two- and three-segment chronological sequences.
- Spoiler-resolution rejection.

Tests:

- Related synthetic arcs connect; unrelated arcs remain separated.
- Search respects maximum segments and duration.
- Chronology and shared-conflict constraints are enforced.
- A later event that resolves the central question is rejected.
- Search remains bounded for the 50-episode target fixture.

Checkpoint: generate one coherent cross-episode promo with traceable graph edges and no leaked resolution.

### M6 — Campaign intelligence

Status: **not started**

Build:

- Maximum Marginal Relevance selection.
- Similarity based on footage overlap, appeal, arc, and conflict.
- Configurable quality-diversity lambda.
- Campaign rationale and diversity summary.

Tests:

- `lambda=1` prioritizes quality; lower values increase diversity.
- Duplicate creative angles are penalized.
- Selection is deterministic for tied scores.
- Campaign constraints and requested creative count are enforced.

Checkpoint: recommended campaigns improve measured diversity over naive top-score selection without violating minimum quality.

### M7 — Editorial exports

Status: **not started**

Build:

- JSON, CSV, TXT, ZIP, and OpenTimelineIO exports.
- Frame conversion using explicit source FPS.
- Missing-media and relinking metadata.
- Export records, checksums, and downloadable artifacts.

Tests:

- OTIO write/read round trip preserves order, ranges, duration, and media references.
- JSON validates against the public schema.
- CSV and TXT contain source evidence and review state.
- ZIP contains only expected files and safe paths.
- Unvalidated or unapproved promos cannot be exported as production-ready.

Checkpoint: an approved synthetic promo round-trips through OTIO and the complete package validates.

### M8 — Frontend integration, evaluation, and hardening

Status: **not started**

Build:

- Replace the frontend mock adapter with typed HTTP operations.
- Polling, retry, cancellation, empty states, and error states.
- Baseline/hybrid/full-pipeline evaluation harness.
- Structured logs, request IDs, readiness checks, and deployment configuration.

Tests:

- API contract tests cover every frontend operation.
- Browser smoke test: create project → upload → analyze → review → campaign → export.
- Unauthorized file access and confidential-data paths are rejected.
- Evaluation reports timestamp validity, duration compliance, duplicate rate, latency, token usage, and export validity.
- Human review measures Precision@10, coherence, spoiler safety, and campaign diversity on a blinded sample.

Checkpoint: the frontend completes the full workflow against the real backend with no mock data.

Evaluation harness foundation — 2026-11-20:

- A provider-neutral promo evaluation contract accepts ranked candidates,
  parser-issued evidence IDs, known spoiler events, and independent editor
  reviews without sending source content to an AI provider.
- Deterministic gates reject unsupported duration, out-of-bounds footage,
  unknown evidence, non-chronological segments, and known spoiler evidence.
- Temporal intersection-over-union identifies lower-ranked duplicate footage
  within each compared system.
- The eight-part editor rubric records hook, curiosity, clarity, emotion,
  coherence, spoiler safety, editability, and brand fit on a 1–5 scale.
- Reports calculate Precision@K, review coverage, acceptance, boundary usability,
  spoiler violations, duplication, average editor score, and exact pairwise
  reviewer agreement. Precision@K remains unset until every top-K candidate has
  the configured minimum review count.
- `GET /api/evaluation/rubric` and `POST /api/evaluation/promos` expose the
  workflow. A synthetic fixture and local CLI runner provide a repeatable demo.
- This evaluates supplied candidates; it does not mark M4 candidate generation
  complete or substitute model confidence for editor judgment.

Persisted editorial-review workflow — 2026-11-20:

- Migration `9a71c4d82e16` adds idempotent evaluation sessions, randomized review
  assignments, and immutable editor-review records linked to persisted promo
  candidates.
- Each session freezes the selected candidate set and creates one independently
  ordered assignment per candidate and reviewer. Reviewer responses expose a
  neutral candidate label, source evidence, and cut boundaries while omitting
  candidate rank, generator identity, system ID, and internal scores.
- The backend enforces assignment ownership, one submission per assignment,
  complete-review coverage before finalization, and a new independent reviewer
  for split decisions. Only unresolved candidates are sent to the tiebreaker.
- Finalization stores an auditable report snapshot after every candidate has a
  deterministic usable/rejected result. Reports remain provisional while any
  assignment or consensus decision is unresolved.
- The frontend Evaluation page now discovers review-ready episodes, creates or
  resumes a session, renders the eight-part rubric, switches between reviewer
  queues, tracks coverage, assigns tiebreakers, finalizes consensus, and exports
  the JSON report.
- A live local browser check loaded the existing `EP_001` set, created 18
  randomized assignments for two editors across 9 candidates, and rendered the
  source-evidence review workspace. No editorial answer was submitted during
  implementation verification.
- The backend suite passes 59 tests, the production frontend build succeeds,
  and live HTTP checks pass for health, rubric, and review-ready discovery.

Persisted series/episode workflow — 2026-11-20:

- The Projects screen now reads real projects and episodes from the backend
  instead of manufacturing project rows with timers and fixed episode counts.
- **Add episode** requires a series name and a timestamped UTF-8 TXT file. It
  appends to the matching series or creates a new series when the name is new.
- Project rows expand to persisted episode records. Opening an episode preserves
  project ID, project name, episode ID, and episode number across navigation.
- Discover resolves the selected episode's persisted analysis job and selected
  promo candidates. It shows an explicit empty state when that episode has no
  generated candidates instead of falling back to unrelated demo cards.
- Regression tests cover project matching, new-series creation, idempotent
  re-upload, conflicting episode content, and both import route contracts.
- The backend suite now passes 61 tests and the production frontend build passes.
- Remaining workflow gaps and their acceptance criteria are tracked in
  `issues.md`; the highest-priority open items are durable worker orchestration
  and routing real candidates into Studio.

## 6. Test strategy

### Every commit

- Unit tests for deterministic engines and schemas.
- API tests for success and failure responses.
- Type/schema validation and formatting.

### Every milestone

- Integration test using a temporary SQLite database.
- One end-to-end synthetic fixture.
- Regression fixtures for every confirmed bug.
- Security tests relevant to that milestone.

### Before real-data scale-up

- Run one authorized real episode end to end.
- Review parser coverage and all unparsed lines.
- Manually verify candidate source evidence and boundaries.
- Record model, prompt version, tokens, latency, retries, and cost.
- Obtain explicit approval before processing the complete confidential pack.

AI quality is never proven by the model's own score. Editorial quality requires a human rubric and recorded failure examples.

## 7. Initial API slice

The first implementation exposes only what M0 can defend:

| Method | Endpoint | Result |
| --- | --- | --- |
| `GET` | `/api/health` | Service and version status |
| `POST` | `/api/ingestion/text` | Canonical episode JSON plus parser warnings |
| `POST` | `/api/projects/import` | Persist a validated series archive |
| `POST` | `/api/projects/episodes/import` | Add one named episode to an existing or new series |
| `POST` | `/api/projects/{project_id}/episodes/import` | Add one episode to an explicitly selected series |
| `GET` | `/api/projects/{project_id}/episodes` | List persisted episodes for a series |

Later endpoints are added only with their owning milestone and tests.

## 8. Definition of done

A feature is done when:

- Input, output, and failure schemas are explicit.
- Deterministic behavior has unit tests.
- The API has success and failure-path tests.
- Stored state can survive process restart where applicable.
- Logs identify the request, job, model, prompt, and source version without exposing confidential screenplay text.
- User-visible claims distinguish measured facts, deterministic heuristics, and AI estimates.
- Documentation and the checkpoint status in this file are updated.

## 9. First execution order

1. Complete M0 with a synthetic timestamped TXT episode.
2. Inspect one real authorized episode before generalizing the parser.
3. Complete M1 ingestion and source-provenance safeguards.
4. Add persistence and resumable jobs before calling a paid model.
5. Prove continuous single-episode discovery before cross-episode stitching.
6. Add MMR and OTIO only after candidate validation is reliable.

## 10. Local commands

From the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
.\backend\.venv\Scripts\python.exe backend\run.py
```

The API documentation will be available at `http://127.0.0.1:8000/docs` while the backend is running.

