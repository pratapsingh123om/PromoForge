# TESTS.md: Pre-Deploy Gate

Goal: nothing fails in front of a reviewer because of a silly reason (upload broken, backend unreachable, key missing, empty state crashes, link private, cold start timeout).

Rule for the agent: **a box may be ticked only after the test was actually run and the result seen.** Write the result next to it (pass, fail, date/time). Never tick from reading the code. Record every failure in `TEST_LOG.md` with what was done to fix it.

Rule for the owner: do Section 9 (fresh-machine test) yourself, not the agent.

Priority: Section 1, 2, 3, 9 are mandatory. Do the rest in order as time allows.

## Agent execution record — 2026-11-21 06:26 IST

`PASS` means the check was executed and its result observed. `PARTIAL` and `NOT RUN` are intentionally not treated as passes. Section 9 remains entirely owner-run.

| Test | Result |
|---|---|
| 1.1 | NOT RUN — clean-machine/fresh-clone check belongs with the owner deployment pass. |
| 1.2 | PASS — local Chromium view loaded with no console errors. |
| 1.3 | PASS — connected, backend-down, Retry, and recovery states observed. |
| 1.4 | PASS — direct and proxied health endpoints returned JSON 200 with version/provider/model. |
| 1.5 | PARTIAL — production bundle contains same-origin `/api` and no localhost backend URL; deployed network check pending. |
| 1.6–1.8 | NOT RUN — require the owner-built deployment. |
| 1.9 | PARTIAL — health contract reports missing variable names; missing-env deployment startup not run. |
| 1.10 | PASS — frontend/backend ports are configurable and documented. |
| 1.11 | PARTIAL — refresh persistence and interrupted-run message verified; a browser reload during an active model request was not run. |
| 1.12 | PARTIAL — Chromium passed; Safari/Firefox not run. |
| 1.13 | NOT RUN — phone-width check remains for owner deployment pass. |
| 2.1–2.2 | PASS — valid single/multi-file parsing and numeric episode order verified, including a 100-file folder. |
| 2.3 | PARTIAL — click-to-browse passed; synthetic drag-and-drop was not run. |
| 2.4–2.12 | PASS — special filenames, malformed/empty/unsupported/mixed files, BOM/CRLF, encoding, non-English, and short episode states verified. |
| 2.13 | NOT RUN — duplicate handling exists, but the same browser file was not selected twice in this pass. |
| 2.14–2.17 | PASS — limits, 100-file progress, zero-valid disabled state, and cancel/recovery verified. |
| 2.18 | NOT RUN — actual Vercel request limits require deployment. |
| 2.19–2.20 | PASS — invented sample and invented real-pack-structure fixture verified. |
| 3.1 | PASS — no-key rule-only flow and missing-key API response verified. |
| 3.2 | PASS — invalid key returns plain `API key was rejected` without a stack trace and is not retried. |
| 3.3 | PASS — configured Gemini smoke completed in one call (447 tokens in the final run). |
| 3.4 | PASS — key remains React-memory-only; session/export/bundle checks found no key value. |
| 3.5 | PASS — tracked-file and `AIza` history searches found no committed API key. |
| 3.6–3.9 | PASS — 429/server error, timeout, malformed schema/JSON, and empty-output retry paths are covered; retry is bounded to one. |
| 3.10–3.11 | PASS — mocked OpenAI-compatible custom URL/model/key adapter test passed and preserves the raw response. |
| 3.12 | PASS — unknown Gemini model test names the missing model. |
| 3.13 | PASS — rule-only browser run produced explicitly labelled output. |
| 3.14 | PARTIAL — quota/429 retry path passed; a real exhausted account was not used. |
| 3.15 | PARTIAL — network-error handling is implemented through the same bounded retry path; no live connection was interrupted. |
| 3.16 | NOT RUN — hosting-region reachability requires deployment. |
| 4.1–4.10 | PASS — automated invented-fixture and 50-episode structural audits report zero invariant failures. |
| 4.11 | PARTIAL — generated reasons were evidence-specific, but ten human editorial judgments were not performed. |
| 4.12–4.16 | PASS — no confidence field, score variance, cue exclusion, aliases, and repeatability verified. |
| 4.17 | NOT RUN — three owner hand-counts were not performed. |
| 4.18–4.19 | PASS — weak/no-promo, one-episode, and 50-episode runs passed. |
| 4.20 | N/A — multi-segment promos are disabled in this demo. |
| 5.1–5.5 | PASS — empty/loading/partial/error/no-promo states observed. |
| 5.6 | N/A — product intentionally exposes zero to three ranked promos, never 10 or 50 cards. |
| 5.7–5.13 | PASS — evidence cards, transcript, review/adjust, filters, measured-quality view, and failure log verified. |
| 5.14–5.15 | NOT RUN — long-text stress, keyboard traversal, and formal contrast audit remain. |
| 5.16 | PARTIAL — refresh state passed; the single-view app has no route-level back-navigation flow. |
| 6.1 | PASS — CSV, JSON, Markdown, cut list, EDL, and ZIP were downloaded/opened. |
| 6.2 | PARTIAL — strict UTF-8/column validation passed; Excel and Google Sheets were not opened. |
| 6.3 | PASS — three exported promo windows matched the generated UI data. |
| 6.4 | N/A — multi-segment promos are disabled. |
| 6.5 | PARTIAL — EDL syntax/timecodes validated; import into an NLE was not run. |
| 6.6–6.9 | PASS — raw response, run log, ZIP integrity, and key absence verified. |
| 6.10 | PARTIAL — run IDs are timestamp-unique; multiple on-disk overwrite behavior was not stress-tested. |
| 6.11 | PASS — browser/session-only export persistence is stated in the UI. |
| 7.1 | PARTIAL — local 50-episode rule audit took 5.64s with zero model calls; full-pack Gemini was intentionally not sent. |
| 7.2 | PARTIAL — model input is capped at 12 candidates; final sample Gemini usage was 447 tokens, not a full-pack cost estimate. |
| 7.3–7.4 | NOT RUN — deployment concurrency and host timeout checks remain. |
| 7.5 | PARTIAL — local 50-episode memory behavior passed; Vercel memory remains untested. |
| 7.6 | PASS — local backend stop/restart plus frontend Retry recovered cleanly. |
| 7.7 | PARTIAL — full invented browser flow rehearsed once, not twice with a new interviewer model. |
| 8.1 | FAIL — current tree is ignored/clean, but Git history records a prior removal of tracked private files; see `TEST_LOG.md` T-013. |
| 8.2 | PARTIAL — current tree/deploy exclusions pass; old history is not certified clean. |
| 8.3 | PASS — production bundle contains only invented sample data and no scanned private markers. |
| 8.4 | PASS — no committed API key/token pattern found in current tracked files or history search. |
| 8.5–8.6 | PASS — demo parsing is client-side/session-scoped and surfaced errors are sanitized. |
| 8.7 | PASS — `CONTENT_NOTICE.md` explicitly excludes company screenplays and assets. |
| 8.8 | PASS — Git object store is 1.01 MiB and no tracked file exceeds 1 MiB. |
| 9.1–9.13 | NOT RUN — reserved for the owner after deployment, as required. |

---

## 1. Startup and connection (the demo must open and talk to its backend)

| # | Test | Expected |
|---|---|---|
| 1.1 | Start the app from a clean terminal using only README steps | Starts with no errors, no manual edits |
| 1.2 | Open the frontend URL in a browser | Page loads, no blank screen, no console errors |
| 1.3 | Frontend calls backend health endpoint on load | Shows "Connected" or equivalent; if backend is down, shows a clear message naming what to start, never a blank page |
| 1.4 | Backend health endpoint returns status, version and which model is configured | JSON 200 |
| 1.5 | Frontend uses the **deployed** backend URL from config, not `localhost` | Verified by reading the built bundle or network tab on the deployed site |
| 1.6 | CORS: the deployed frontend origin can call the deployed backend | No CORS errors in console |
| 1.7 | HTTPS site calling HTTP backend (mixed content) | Not present; both HTTPS in deployment |
| 1.8 | Cold start: open the deployed site after 15+ minutes idle | Loads within a sensible wait; if backend is waking up, UI shows "Waking up the server, please wait" with a retry, not an error |
| 1.9 | Environment variables | App lists missing required variables at startup with names, and does not crash silently |
| 1.10 | Port or host conflicts | Configurable; documented |
| 1.11 | Reload mid-run | Run state survives or UI says clearly what happened |
| 1.12 | Works in a fresh Chrome profile and in Safari or Firefox | Renders and runs |
| 1.13 | Works on a phone-width window | Usable, no horizontal overflow |

---

## 2. Upload and input handling (the most common silly failure)

Prepare these test files in `tests/fixtures/` (invented content only, never Kuku's pack):

- `valid_ep1.txt`, `valid_ep2.txt` (small invented screenplays in the exact format)
- `empty.txt` (0 bytes)
- `no_timestamps.txt`
- `bad_timestamps.txt` (end before start, malformed `mm:ss.ff`)
- `missing_header.txt` (no `SCRIPT START`)
- `truncated.txt` (stops mid-scene)
- `wrong_encoding.txt` (UTF-16 or Latin-1)
- `utf8_bom.txt` (BOM at start)
- `crlf_windows.txt` (Windows line endings)
- `non_english.txt` (Hindi or Spanish dialogue)
- `very_short.txt` (under 20s total)
- `large_episode.txt` (20+ minutes)
- `not_a_script.pdf` and `image.png`
- `100_files/` folder (100 small episodes)
- Files with spaces, brackets and unicode in names (like the real `episode-001-Episode 1671703.txt`)

| # | Test | Expected |
|---|---|---|
| 2.1 | Upload one valid file | Parse summary shows events parsed and last timestamp |
| 2.2 | Upload a whole folder of valid files | All parsed, listed in episode order (1, 2, 10, not 1, 10, 2) |
| 2.3 | Drag-and-drop and click-to-browse both work | Both work |
| 2.4 | Upload with filenames containing spaces and special characters | Accepted |
| 2.5 | Upload an empty file | Clear error naming the file; other files still process |
| 2.6 | Upload a file in the wrong format | Error names the file and the first failing line |
| 2.7 | Upload an unsupported type (pdf, png) | Rejected with message listing accepted types |
| 2.8 | Upload mix of valid and invalid files | Valid ones proceed; invalid listed with reasons; no silent skip |
| 2.9 | UTF-8 BOM and CRLF files | Parse identically to clean files |
| 2.10 | Non-UTF-8 encoding | Detected or clear error; never garbled output |
| 2.11 | Non-English script | Runs; UI notes which English-only rules are disabled |
| 2.12 | Episode with under 20s of usable material | "No promo possible" message with reason |
| 2.13 | Same file uploaded twice | Deduplicated or warned |
| 2.14 | File size limit | Limit stated in UI; oversize file rejected with message, not a hung request |
| 2.15 | 100 files | Accepted or limit stated; progress shown |
| 2.16 | Upload then press Run with zero valid files | Run button disabled with explanation |
| 2.17 | Cancel an upload midway | UI recovers, can re-upload |
| 2.18 | Hosting platform upload limits (Streamlit, Spaces, Vercel body size, proxy timeouts) | Checked against the actual deployment; if a limit exists, the UI offers "Load sample" and a smaller batch |
| 2.19 | "Load sample" button | Works with no upload and no API key |
| 2.20 | The real pack structure: timestamps overlap between blocks, speaker labels vary (O.S., Off-screen), SOUND FX present | Parsed without error (use a short invented file mirroring this) |

---

## 3. Model and API key (the second most common silly failure)

| # | Test | Expected |
|---|---|---|
| 3.1 | Run with **no API key** | Clear message, offers the rule-only fallback; does not crash or spin forever |
| 3.2 | Run with an **invalid key** | Error says "key rejected" in plain language; no stack trace |
| 3.3 | Run with a **valid key** | Completes |
| 3.4 | Key never appears in logs, exports, URL or browser storage | Verified by searching logs and exports for the key string |
| 3.5 | Key is not committed in the repo | Search git history and files for key patterns |
| 3.6 | Rate limit or 429 from the provider | Retries with backoff; after limit, partial results kept and the user informed |
| 3.7 | Provider timeout | Retry once, then mark the batch failed; others continue |
| 3.8 | Malformed model output (not JSON, wrong fields) | Validation catches it, retries once, logs as a failure for that candidate; no fabricated scores |
| 3.9 | Model returns an empty answer | Handled as above |
| 3.10 | Swap model through config only (Gemini to another OpenAI-compatible endpoint) | Works with no code change; run log records which model |
| 3.11 | Custom base URL and key supplied at runtime (what an interviewer may provide) | Works |
| 3.12 | Unknown model name | Error names the problem |
| 3.13 | Rule-only fallback end to end | Produces output labelled "rule-based, lower quality" |
| 3.14 | Free-tier quota exhausted mid-run | Partial results shown; clear message |
| 3.15 | Network drops mid-run | Run reports failure for affected batches; app stays usable |
| 3.16 | Provider unreachable from the hosting region | Detected on health check and shown |

---

## 4. Pipeline correctness (integrity of output)

Run on the invented fixtures and on at least 3 real episodes locally (real pack stays local).

| # | Test | Expected |
|---|---|---|
| 4.1 | Every promo total duration is 20-60s | Asserted over all promos, zero violations |
| 4.2 | Every segment start and end equals a real timestamp present in the source | Asserted |
| 4.3 | No cut falls inside a dialogue line | Asserted |
| 4.4 | Segments inside a promo are in order, non-overlapping, within episode length | Asserted |
| 4.5 | No two promos overlap by more than 20% | Asserted |
| 4.6 | No promo starts on a sentence fragment (opens with "...", a lowercase word or a conjunction) | Asserted |
| 4.7 | No promo starts inside another promo's reply window | Asserted |
| 4.8 | Hook line and cliffhanger line are each a single real line found inside the promo | Asserted |
| 4.9 | Required fields present for every promo: segments, hook, cliffhanger, reason, rank | Asserted |
| 4.10 | Ranks are unique and sequential across the whole run | Asserted (no repeated "rank 1") |
| 4.11 | "Why it works" is a reason about the clip, not a score recital | Spot-check 10 |
| 4.12 | No constant or default "confidence" value anywhere | Assert no field repeats one value across promos |
| 4.13 | Sub-scores are not all identical across promos | Assert variance exists |
| 4.14 | SOUND FX and camera text never appear as hook or cliffhanger evidence | Asserted |
| 4.15 | Speaker aliases resolved or reported as unresolved | Spot-check |
| 4.16 | Same input twice gives equivalent ranking | Compare two runs; differences stated |
| 4.17 | Parsed event count and last timestamp match the file for 3 hand-checked episodes | Manual |
| 4.18 | An episode with no good promo returns none, not a forced pick | Test with a weak fixture |
| 4.19 | Output with 1 episode only and with 50 episodes | Both work |
| 4.20 | Multi-segment promo (if enabled) totals 60s or less and segments are in story order | Asserted |

---

## 5. Frontend behaviour and states

| # | Test | Expected |
|---|---|---|
| 5.1 | Empty state (no run yet) | Helpful message and sample button |
| 5.2 | Loading state during run | Per-stage progress, elapsed time |
| 5.3 | Partial results after cancel or failure | Viewable |
| 5.4 | Error state | Plain message, retry option, no raw stack trace |
| 5.5 | No-promo-found state | Explains why |
| 5.6 | Ranked list renders 1, 10 and 50 promos | Fast, no layout break |
| 5.7 | Each card shows segments, hook, cliffhanger, reason, flags | Present |
| 5.8 | Transcript preview highlights the hook and cliffhanger lines and the cut boundaries | Correct |
| 5.9 | Accept, Reject (with reason) and Adjust work and persist within the session | Works |
| 5.10 | Adjust snaps to a real line boundary and re-runs hard checks | Invalid adjustments are blocked with the reason |
| 5.11 | Filters and sorting | Work |
| 5.12 | Quality view shows only measured numbers; unmeasured say "Not measured" | Verified |
| 5.13 | Failure log renders | Present |
| 5.14 | Long speaker names and long lines do not break layout | Fine |
| 5.15 | Keyboard navigation and readable contrast | Basic pass |
| 5.16 | Browser back and refresh | No broken state |

---

## 6. Exports and files

| # | Test | Expected |
|---|---|---|
| 6.1 | Download CSV, JSON, report.md, cut list | Files download and open |
| 6.2 | CSV opens in Excel and Google Sheets with correct columns and no garbled characters | Verified (UTF-8) |
| 6.3 | Timestamps in exports match the UI | Verified for 3 promos |
| 6.4 | Export of a multi-segment promo has one row per segment, in order | Verified |
| 6.5 | Timeline file (OTIO or EDL) imports into any free tool or validates with its library | Verified, or stated as not tested |
| 6.6 | Raw model responses saved unedited in the run folder | Present |
| 6.7 | Run log includes model name, parameters, call count, timings, rejected counts | Present |
| 6.8 | Zip download of a full run | Works |
| 6.9 | Exports do not contain the API key | Verified |
| 6.10 | Run folder names are unique and do not overwrite older runs | Verified |
| 6.11 | Disk or storage on the host: exports persist for the session or the app says they do not | Stated in UI |

---

## 7. Load, limits and timing

| # | Test | Expected |
|---|---|---|
| 7.1 | Full 50-episode run time and number of model calls | Recorded (you will quote these in the doc) |
| 7.2 | Estimated cost or token count of the full run | Recorded, or "not available" |
| 7.3 | Two users running at once on the deployed demo | No crash, or concurrency limit stated |
| 7.4 | Request timeouts of the host (many free tiers cut at 30-60s) | Long runs use background processing and polling; no single request exceeds the limit |
| 7.5 | Memory on the free tier | 50-episode run does not exceed it |
| 7.6 | Run resumes or restarts cleanly after server restart | Verified or documented |
| 7.7 | Interview scenario: new unseen folder, new model, full flow in under 2 minutes of user effort | Rehearsed twice |

---

## 8. Security, privacy and repo hygiene

| # | Test | Expected |
|---|---|---|
| 8.1 | Input pack folder is in `.gitignore` and absent from git history | Verified with a history search, not just the working tree |
| 8.2 | Exports containing Kuku script text are not in the public repo or the hosted demo | Verified |
| 8.3 | Hosted demo ships only invented sample data | Verified |
| 8.4 | No secrets, keys or tokens in the repo or history | Scan done |
| 8.5 | Uploaded files are not stored longer than needed or exposed by URL | Checked |
| 8.6 | Error messages do not leak server paths or keys | Checked |
| 8.7 | If the repo must stay public, a LICENSE or note says the screenplays are not included | Present |
| 8.8 | Repo size reasonable, no large binaries | Checked |

---

## 9. Fresh-machine and reviewer test (the owner does this personally)

Do this after deployment, as the last test.

| # | Test | Expected |
|---|---|---|
| 9.1 | Open the prototype link in an **incognito window, logged out** of every account | Opens with no login or access request |
| 9.2 | Open it on a **phone on mobile data** (not your Wi-Fi) | Opens and is usable |
| 9.3 | Send the link to a friend on a different network and ask them to run the sample | They succeed without your help |
| 9.4 | Clone the repo into a **new empty folder** on a clean machine or fresh Colab and follow only the README | Runs; every missing step gets added to the README |
| 9.5 | Check the repo, the PDF, the video and the raw-outputs folder links in incognito | All open for anyone with the link |
| 9.6 | Sharing permission for Drive, Loom and YouTube links is "anyone with the link can view" | Verified |
| 9.7 | The PDF is 2 pages or fewer and opens on a phone | Verified |
| 9.8 | The raw-outputs folder contains unedited outputs from a run on the full pack, with the model name logged | Verified |
| 9.9 | The doc names the tools you used and one real place AI got it wrong | Present |
| 9.10 | The deployed app does not depend on your laptop being on, your VPN, or a local file path | Verified by turning your laptop's server off |
| 9.11 | The deployed app works the morning after (hosts sleep, keys expire, free tiers reset) | Re-test on the submission morning |
| 9.12 | Live interview rehearsal: new folder, supplied model, key pasted at runtime | Passes twice in a row |
| 9.13 | A backup exists if hosting fails: repo with run steps, a screen recording and saved sample outputs | Ready |

---

## 10. Final pre-submit gate (all must be YES)

- [ ] Sections 1, 2, 3 and 9 are fully ticked with real results
- [ ] No test failed without an entry in `TEST_LOG.md`
- [ ] Prototype link, repo, PDF, video and outputs open in incognito
- [ ] No secrets and no Kuku pack in the repo or history
- [ ] README works from a fresh clone
- [ ] Sample runs with no key and no upload
- [ ] The tool never shows a number it did not measure
- [ ] I have rehearsed the interview re-run twice
- [ ] I can state the known limits in one sentence each

---

## 11. Suggested order given limited time (about 90 minutes total)

1. (10 min) Create the fixtures in Section 2 using small invented files.
2. (25 min) Agent runs Sections 2, 3 and 4 and fixes what fails; owner reviews the log.
3. (15 min) Agent runs Sections 1, 5 and 6 on the deployed build.
4. (10 min) Section 8 scans.
5. (30 min) Owner runs Section 9 personally on phone data and incognito.

If time runs out, skip Sections 5.14-5.16, 6.5, 7.3 and 7.6 first. Never skip Sections 1, 2, 3, 8.1 and 9.
