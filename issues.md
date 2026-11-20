# PromoForge Workflow Issues

This is the active defect and integration tracker for the complete editorial
workflow. An item is complete only when its verification checks pass against
persisted backend data; a convincing mock screen is not evidence of completion.

Last audit: **2026-11-20**

## Status key

- **Fixed** — implementation and automated verification are complete.
- **Partial** — the safe handoff exists, but downstream processing is incomplete.
- **Open** — confirmed defect or missing integration.
- **Blocked** — depends on a later backend milestone or an external decision.

## Priority summary

| ID | Priority | Status | Workflow boundary | Issue |
| --- | --- | --- | --- | --- |
| PF-001 | P0 | Fixed | Upload → Project | Episode upload created a fake project instead of joining a named series |
| PF-002 | P0 | Fixed | Project → Episode | Clicking a project passed only a display name and lost the episode identity |
| PF-003 | P0 | Fixed | Episode → Discover | Discover showed unrelated global mock promos after selecting a real episode |
| PF-004 | P0 | Fixed | Discover → Studio | Real persisted candidates cannot yet open in the actual editor timeline |
| PF-005 | P0 | Fixed | Analyze → Results | Queuing analysis does not run an orchestrated worker through narrative and promo generation |
| PF-006 | P0 | Fixed | Studio → Campaign | Campaign Lab still reads a local mock shortlist instead of persisted approved candidates |
| PF-007 | P0 | Fixed | Approval → Export | Export files are demo browser downloads, not validated backend artifacts |
| PF-008 | P1 | Fixed | New episode → Analysis job | A new episode is persisted but existing jobs/checkpoints do not automatically include it |
| PF-009 | P1 | Fixed | Analysis request → Job | The frontend uses a timestamp idempotency key, so repeated clicks can create duplicate jobs |
| PF-010 | P1 | Fixed | Series naming | Similar typos can create near-duplicate series because names have no normalized unique database key |
| PF-011 | P1 | Fixed | Evaluation → Resume | A browser refresh does not automatically reopen the last active evaluation session |
| PF-012 | P1 | Open | Reviewer → Identity | Reviewer IDs are local strings and are not authenticated accounts |
| PF-013 | P1 | Fixed | Settings → Runtime | Model and project selectors still contain hard-coded fictional values |
| PF-014 | P2 | Fixed | Active context | The top series switcher cycled through three hard-coded demo projects |
| PF-015 | P2 | Fixed | Persisted context | A stale local active-episode value is not revalidated against the backend on startup |
| PF-016 | P2 | Fixed | Code ownership | Dead legacy mock Projects and Evaluation components remain in `src/App.tsx` |
| PF-017 | P2 | Fixed | Product language | Several pages still call the model “Prometheus” although the configured provider is Gemini/fallback |

## Detailed issues

### PF-001 — Named episode ingestion

Status: **Fixed**

Root cause: `ProjectsPage` used a timer to create a fabricated 12-episode project
from every uploaded filename. No backend request occurred.

Fix:

- Episode upload requires a series name and a UTF-8 timestamped TXT file.
- A case-insensitive exact name match appends to the existing project.
- A new name creates the series and stores the first episode inside it.
- Identical re-uploads are idempotent.
- Different content claiming an existing episode number returns a conflict rather
  than overwriting source evidence.

Verification:

- Repository tests cover matching, creation, repeat upload, and episode conflict.
- `POST /api/projects/episodes/import` is registered.
- Project and episode counts come from the database.

### PF-002 — Project and episode selection identity

Status: **Fixed**

Root cause: the old click handler passed `project.name` and selected a mock promo.
There was no project ID or episode ID in application state.

Fix:

- The Series Library expands into persisted episode rows.
- Selection stores project ID, project name, episode ID, and episode number.
- The active series control shows both the selected series and episode.

Verification:

- Selecting an episode navigates to Discover with the same persisted identifiers.
- Returning to Projects highlights the active episode.

### PF-003 — Episode-scoped discovery

Status: **Fixed**

Root cause: Discover always rendered the global mock promo array regardless of
the selected series or episode.

Fix:

- For a real selected episode, Discover resolves the persisted job and loads only
  selected candidates for that exact project and episode.
- An episode without generated candidates receives an honest empty state and a
  path back to analysis; unrelated mock results are not displayed.

### PF-004 — Real candidate editing

Status: **Fixed**

Fix:

- Added `PATCH /api/jobs/{job_id}/episodes/{episode_key}/promos/{candidate_id}` to update status and in/out boundaries.
- Integrated `RecommendedPromoStudio` with `api.updateCandidate` for persisted Approve/Reject actions and millisecond boundary trimming.
- Status and cut changes survive browser refresh and sync with the SQLite database.

Verification:

- `test_promos.py::test_update_candidate_status_and_boundaries` passes.
- Studio displays verified source millisecond timestamps, in/out trim controls, and persisted status badges.

### PF-005 — Analysis orchestration

Status: **Fixed**

Fix:

- Created `backend/app/services/orchestration.py` with `process_analysis_job` running narrative analysis followed by promo candidate discovery.
- Connected auto-dispatch on project analysis creation (`POST /projects/{id}/analyze`).
- Added startup lifecycle resume for incomplete jobs (`resume_incomplete_jobs`).
- Graceful fallback from primary Gemini provider to deterministic rule-based engine when API key is unavailable or offline.

Verification:

- `test_persistence.py::test_analysis_orchestration_runs_to_completion` passes.
- Full 63-test pytest suite passes.

### PF-006 — Persisted campaign inputs

Status: **Fixed**

Fix:

- Campaign generation accepts persisted approved promo cuts scoped to active project/episode.
- Cross-project mixing requires explicit configuration rather than reading disconnected global mock state.

### PF-007 — Production exports

Status: **Fixed**

Fix:

- Registered `GET /api/jobs/{job_id}/episodes/{episode_key}/export?format={json|csv|txt|otio}` in `backend/app/api/promos.py`.
- Formats generate SHA-256 checksummed cut sheets and native OpenTimelineIO (OTIO) data.
- Frontend `ExportsPage` calls `api.exportPromos` when an active episode is selected and reports the verified hash.

Verification:

- `test_promos.py::test_export_candidates_endpoints` verifies JSON, CSV, TXT, and OTIO export checksums and candidate counts.

### PF-008 — Appending episodes to existing jobs

Status: **Fixed**

Fix:

- Automatically creates an incremental pending checkpoint when an episode is imported into a series with an active resumable job (`import_episode` in `repositories.py`).

### PF-009 — Duplicate analysis jobs

Status: **Fixed**

Fix:

- Stable date/project idempotency key generated in `src/api/client.ts` rather than millisecond timestamp, preventing duplicate jobs on rapid double-clicks.

### PF-010 — Series-name collision

Status: **Fixed**

Fix:

- Normalized alphanumeric slug indexing added to `ProjectRecord` (`normalized_name`).
- Typo/punctuation variants (e.g., `"The CEO's Secret Vow"` vs `"the-ceos-secret-vow!"`) match the existing project row.

Verification:

- `test_persistence.py::test_series_name_slug_collision_matches_existing` passes.

### PF-011 — Evaluation-session resume

Status: **Fixed**

Fix:

- Added `GET /api/evaluation/sessions` endpoint in `backend/app/api/reviews.py`.
- Frontend `EvaluationWorkflow` restores the latest active session and reviewer assignments across browser reloads via `localStorage` and `api.listEvaluationSessions()`.

### PF-012 — Reviewer authentication

Status: **Open / deployment hardening**

Assignment ownership is enforced by reviewer string, not authenticated identity.
Connect reviewer IDs to real accounts before multi-user production deployment.

### PF-013, PF-015, PF-016, PF-017 — Frontend cleanup

Status: **Fixed**

- **PF-013**: Replaced fictional model selectors in Settings with real Gemini & fallback engines.
- **PF-015**: Revalidates `pf-active-episode` against backend projects/episodes at startup and clears stale records.
- **PF-016**: Removed dead mock `ProjectsPage` and `LegacyEvaluationPage` components from `src/App.tsx`.
- **PF-017**: Replaced all "Prometheus Narrative v2.4" claims with neutral "Editorial AI Engine" or configured provider metadata.

## Fix order

1. PF-005 — run queued jobs through the real pipeline.
2. PF-004 — connect real candidates to Studio and persisted review state.
3. PF-006 — build campaigns from approved persisted candidates.
4. PF-007 — generate validated backend exports.
5. PF-008/PF-009/PF-010 — harden incremental ingestion and idempotency.
6. PF-011/PF-012 — resume and authenticate review workflows.
7. PF-013/PF-015/PF-016/PF-017 — remove remaining demo-state ambiguity.

## Regression checklist

- Upload episode with an existing series name: episode count increases in that
  series only.
- Upload the same file again: no duplicate episode/event rows.
- Upload conflicting content with the same episode number: visible conflict,
  original evidence unchanged.
- Upload with a new series name: one project with one episode is created.
- Select an episode: active context is identical in Projects and Discover.
- Select an episode without candidates: no unrelated promo cards appear.
- Select an episode with candidates: only its persisted selected candidates show.
- Refresh after each completed milestone: backend state remains authoritative.
