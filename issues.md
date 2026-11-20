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
| PF-004 | P0 | Open | Discover → Studio | Real persisted candidates cannot yet open in the actual editor timeline |
| PF-005 | P0 | Open | Analyze → Results | Queuing analysis does not run an orchestrated worker through narrative and promo generation |
| PF-006 | P0 | Open | Studio → Campaign | Campaign Lab still reads a local mock shortlist instead of persisted approved candidates |
| PF-007 | P0 | Open | Approval → Export | Export files are demo browser downloads, not validated backend artifacts |
| PF-008 | P1 | Partial | New episode → Analysis job | A new episode is persisted but existing jobs/checkpoints do not automatically include it |
| PF-009 | P1 | Open | Analysis request → Job | The frontend uses a timestamp idempotency key, so repeated clicks can create duplicate jobs |
| PF-010 | P1 | Open | Series naming | Similar typos can create near-duplicate series because names have no normalized unique database key |
| PF-011 | P1 | Open | Evaluation → Resume | A browser refresh does not automatically reopen the last active evaluation session |
| PF-012 | P1 | Open | Reviewer → Identity | Reviewer IDs are local strings and are not authenticated accounts |
| PF-013 | P1 | Open | Settings → Runtime | Model and project selectors still contain hard-coded fictional values |
| PF-014 | P2 | Fixed | Active context | The top series switcher cycled through three hard-coded demo projects |
| PF-015 | P2 | Open | Persisted context | A stale local active-episode value is not revalidated against the backend on startup |
| PF-016 | P2 | Open | Code ownership | Dead legacy mock Projects and Evaluation components remain in `src/App.tsx` |
| PF-017 | P2 | Open | Product language | Several pages still call the model “Prometheus” although the configured provider is Gemini/fallback |

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

Status: **Open**

The persisted candidate list exposes grounded boundaries and score components,
but Promo Studio still accepts the legacy `Promo` mock type. Implement a typed
editor document sourced from `PromoCandidateRecord`, source events, and review
state. The editor must preserve project/job/episode/candidate IDs on save.

Exit checks:

- Open a real candidate from Discover.
- Timeline boundaries match persisted milliseconds.
- Approve/reject writes to backend state and survives refresh.
- No fallback to `initialPromos` occurs for a real episode.

### PF-005 — Analysis orchestration

Status: **Open**

`POST /projects/{id}/analyze` creates durable checkpoints but no running worker
currently carries a queued job through narrative extraction and promo discovery.

Exit checks:

- A newly uploaded episode transitions queued → running → completed/failed.
- Restart resumes incomplete checkpoints.
- Successful narrative analysis automatically invokes candidate discovery.
- Frontend polls real progress and reports recoverable errors.

### PF-006 — Persisted campaign inputs

Status: **Open**

Campaign Lab uses `pf-shortlist` and mock promo IDs. Replace it with persisted,
approved candidate IDs scoped to one project/campaign. Cross-project mixing must
require an explicit campaign configuration.

### PF-007 — Production exports

Status: **Open / M7**

Current JSON, CSV, TXT, and timeline controls assemble browser-side demo content.
They must call backend export records, enforce validation/approval state, include
source evidence, and return checksummed artifacts.

### PF-008 — Appending episodes to existing jobs

Status: **Partial**

The episode joins the correct project immediately, but already-created analysis
jobs retain their original checkpoint set. The Series Library exposes **Analyze**
to create a fresh job; automatic incremental-job creation is still pending.

Decision required: either create a dedicated incremental job per upload or add a
new pending checkpoint to the latest resumable project job under transaction.

### PF-009 — Duplicate analysis jobs

Status: **Open**

The frontend currently uses `analysis-${Date.now()}` as its idempotency key.
Replace it with a stable source/config hash and disable repeat submission while a
matching queued/running job exists.

### PF-010 — Series-name collision

Status: **Open**

Exact case-insensitive names match, but punctuation or spelling variants can
create duplicate projects. Add a stored normalized name/slug with a unique index
and show a confirmation when a new name is similar to an existing series.

### PF-011 — Evaluation-session resume

Status: **Open**

Evaluation sessions are persisted, but the frontend keeps the selected session
only in component state. Add a session-list/current-session endpoint and restore
the latest active session after reload.

### PF-012 — Reviewer authentication

Status: **Open / deployment hardening**

Assignment ownership is enforced by reviewer string, not authenticated identity.
Connect reviewer IDs to real accounts before multi-user production deployment.

### PF-013, PF-015, PF-016, PF-017 — Frontend cleanup

Status: **Open**

- Replace hard-coded Settings projects/models with backend capabilities.
- Revalidate `pf-active-episode` at startup and clear missing records.
- Remove dead legacy mock page implementations and mock adapter calls.
- Replace “Prometheus” claims with actual provider/model metadata or neutral
  “editorial estimate” wording.

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
