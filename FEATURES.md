# FEATURES.md: Final Feature List (source of truth)

If this file conflicts with DEMO.md, EVALUATION.md or TESTS.md, **this file wins**. Those files still apply for detail (check rules, test list, failure codes).

Product: finds 20-60s promo clips in microdrama screenplays. Input is a folder of timestamped episode `.txt` files. Output is a ranked, editor-ready list of promos.
Name: use one name everywhere via a single config value `PRODUCT_NAME`. Default: PromoForge (current repo name). Do not use any other name.

---

## 0. Rules that never change

1. Show only numbers that a script measured. Anything else says "Not measured".
2. No default or constant "confidence" value anywhere.
3. No rules tuned to EP_001, EP_002, EP_003 or to character names. Rules must work on any show.
4. Every cut point is a real timestamp from the screenplay. Never interpolate.
5. Never publish the input pack. Git-ignore it and any export containing script text. The hosted demo uses an invented sample only.
6. The model is swappable by config. No provider, model name or key in code.
7. The show title comes from the folder name or user input. Never a default like "The Sterling Takeover". If unknown, leave blank.

---

## 1. Modes (decided by input)

| Input | Mode | Behaviour |
|---|---|---|
| 1 file | **Episode mode** | Rank within that episode. Return the best 3. |
| 2+ files or a folder | **Series mode** | Rank across ALL episodes. No "top 3" truncation. See section 2. |

The UI shows the active mode: "Series mode: 50 episodes".

---

## 2. Series mode: required behaviour (the main fix)

1. **Per-episode candidates (code, no model):** generate windows, apply hard checks, de-overlap inside the episode, keep the best 4-5 per episode by rule score.
2. **Series context built once:** one alias map from all loglines and continuity notes, reused for every episode. Pass the series premise and each episode's logline to the model.
3. **Model scoring on a larger shortlist:** score about 60-80 candidates in batches of about 10 per call. Report scored versus generated.
4. **Global ranking:**
   - Return every candidate above a quality threshold. Expected size for 50 episodes: about 15-25. No fixed top 3.
   - Max 2 promos per episode.
   - No overlap above 20% and no promo that answers or continues another promo's cliffhanger.
   - **Acquisition weighting:** prefer early and mid-series episodes and self-contained moments. Flag "spoiler risk" for late-series episodes (last 20%) and "needs context" when the clip depends on earlier episodes. The flags must lower rank.
   - **Variety:** deduplicate near-identical moment types so the list covers different hooks.
5. **Two views from the same run (no extra model calls):**
   - **Series ranking:** global list, top 10 highlighted, short "why this order" for the top 3.
   - **Per-episode drill-down:** best 2-3 candidates for any chosen episode.
6. **Cross-episode link (stretch goal, build only if everything else is done):** join the cliffhanger at the end of episode N to the opening of episode N+1 as one multi-segment promo (total at most 60s).

---

## 3. Must-have features (ship all of these)

**Input**
- Upload multiple `.txt` files or a folder. Sort episodes numerically (1, 2, 10).
- "Load sample" button using an invented sample screenplay. Works with no key.
- Fields: show title (optional), language, promo length range (within 20-60s).
- Parse summary table before running: episode, events parsed, last timestamp, unresolved aliases, warnings. Bad files are named with the failing line. No silent skipping.

**Parsing**
- Handles CAMERA, ACTION, SOUND FX and dialogue blocks, overlapping times, speaker variants (O.S., Off-screen), BOM and Windows line endings.
- CAMERA and SOUND FX are never scoring evidence.
- Reads to the end of each episode.

**Candidate generation and checks (code)**
- Windows of 20-60s starting and ending on line boundaries, with a 3s look-back for a stronger opening line.
- Hard checks: duration, real timestamps, no mid-line cut, no fragment start, no mid-reply start, no overlap, no resolution of another promo's cliffhanger.
- Real rejection counts per rule saved in the run log.

**Scoring**
- Model returns, per candidate: hook, cliffhanger, standalone, a concrete one-line reason (what happens in the clip, not a score recital), exactly one hook line and one cliffhanger line.
- Output validated against a JSON schema. One retry, then logged as a failure. No fabricated scores.
- Rule-only fallback with no model, labelled "Rule-based scoring (lower quality)".

**Output per promo**
- Global rank (unique, sequential), promo ID, episode(s)
- Every segment: episode, start, end, in order, plus total duration
- Hook line (speaker, text, timestamp)
- Cliffhanger line (speaker, text, timestamp)
- One-line reason
- Scores: hook, cliffhanger, standalone
- Flags: needs context, spoiler risk, soft hook, fake cliffhanger
- Transcript preview with hook and cliffhanger highlighted and the cut boundaries marked

**Review actions**
- Accept, Reject (with a reason picker), Adjust (snap start or end to the previous or next line boundary; hard checks re-run live).

**Model settings**
- Provider, model name, base URL and key entered in config or at runtime. Key stays in session memory only and is never logged or exported.
- Adapters: Gemini and any OpenAI-compatible endpoint.

**Exports** (generated from the stored run)
- `promos_master.csv` (one row per segment), `promos.json`, `report.md`, `cut_list.csv`, timeline file (EDL and OTIO), `run_log.json`, and `raw/` with unedited model responses.
- Download single promo, selected promos, or a zip of the full run.
- Timeline files carry a note: not tested on footage because the pack is screenplays only.

**Run log (real numbers only)**
- Episodes, candidates generated, rejected per rule, scored by the model, model calls, tokens, wall time, model name, prompt hash.
- Fix the existing bug where `candidates_accepted` shows 0 when promos were selected.

**Quality and Limits view**
- Failure log: code, episode, timestamp, what happened, fixed on which episodes or open.
- Check counts from this run.
- Hit rate against hand labels with sample size, or "Not measured".
- Known limits, in plain text.

**Reliability (see TESTS.md sections 1-3 and 9)**
- Health check on load, "waking up the server" state for cold starts, clear errors for a missing or wrong key, partial results kept after a cancel or failure.

---

## 4. Should-have (only after section 3 is done and tested)

- No-API mode: show the prompt, let the user paste the model's JSON back, validate it.
- Cross-episode link (section 2 item 6).
- Tight, standard and extended cut variants for a promo.
- Second-model pass that flags promos needing context.

## 5. Cut (do not build; one line each in the doc under "next steps")

Video rendering, AI video generation, music, text overlays, captions, auto-posting, accounts, a database, a polished design system, multi-language rule sets.

---

## 6. Definition of done

- [ ] A full 50-episode run in series mode returns 15-25 ranked promos (not 3), max 2 per episode, from at least 10 different episodes
- [ ] Show title is correct, or blank
- [ ] Every promo passes H1-H9 in a script that asserts it
- [ ] No promo starts on a reply whose question is outside the cut
- [ ] Late-episode promos are flagged and ranked lower when they need context
- [ ] Per-episode drill-down works from the same run
- [ ] All exports open; timestamps match the UI
- [ ] Raw model responses saved unedited with the model name
- [ ] Rule-only fallback and "Load sample" work with no key
- [ ] The hosted demo contains no Kuku script text
- [ ] No unmeasured number appears anywhere
- [ ] Failure log has at least 5 real entries with timestamps, found by hand-checking the top 10

## 7. Agent working rules

- Keep `PROGRESS.md`: done, verified (how), open.
- Tick an item only after running it.
- If something here is unclear, choose the simpler option, note it in `PROGRESS.md` and continue. Don't stall.
- Do not add features that are not in sections 3-4.
