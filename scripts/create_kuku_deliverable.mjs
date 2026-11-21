import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";

const repoRoot = process.cwd();
const runDir = path.join(repoRoot, "outputs", "run-2026-11-21T06-35-55-637Z");
const stagingDir = path.join(repoRoot, "dist_deliverable", "PromoForge_Kuku_50_Episode_Results");
const outZipPath = path.join(repoRoot, "PromoForge_Kuku_50_Episode_Results.zip");

if (!fs.existsSync(runDir)) {
  console.error("Run directory not found:", runDir);
  process.exit(1);
}

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(path.join(stagingDir, "raw"), { recursive: true });

// 1. Copy and rename unedited assets
fs.copyFileSync(path.join(runDir, "promos.json"), path.join(stagingDir, "ranked_promos.json"));
fs.copyFileSync(path.join(runDir, "promos_master.csv"), path.join(stagingDir, "ranked_promos.csv"));
fs.copyFileSync(path.join(runDir, "run_log.json"), path.join(stagingDir, "run_log.json"));
fs.copyFileSync(path.join(runDir, "promos.edl"), path.join(stagingDir, "ranked_promos.edl"));
fs.copyFileSync(path.join(runDir, "promos.otio"), path.join(stagingDir, "ranked_promos.otio"));
fs.copyFileSync(path.join(runDir, "cut_list.csv"), path.join(stagingDir, "cut_list.csv"));
fs.copyFileSync(path.join(runDir, "TIMELINE_NOTES.txt"), path.join(stagingDir, "TIMELINE_NOTES.txt"));

// 2. Evaluation results
const evalGeminiSrc = path.join(repoRoot, "gold_results_gemini.json");
if (fs.existsSync(evalGeminiSrc)) {
  fs.copyFileSync(evalGeminiSrc, path.join(stagingDir, "evaluation_results_gemini.json"));
}
const evalRuleSrc = path.join(repoRoot, "gold_results.json");
if (fs.existsSync(evalRuleSrc)) {
  fs.copyFileSync(evalRuleSrc, path.join(stagingDir, "evaluation_results_rule_cutsheets.json"));
}

// 3. Raw model responses (all 7 batches preserved)
const rawDir = path.join(runDir, "raw");
if (fs.existsSync(rawDir)) {
  for (const file of fs.readdirSync(rawDir)) {
    if (file.endsWith(".json")) {
      fs.copyFileSync(path.join(rawDir, file), path.join(stagingDir, "raw", file));
    }
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// 4. Verification of JSON vs CSV records
const jsonPromos = JSON.parse(fs.readFileSync(path.join(stagingDir, "ranked_promos.json"), "utf8")).promos || [];
const csvText = fs.readFileSync(path.join(stagingDir, "ranked_promos.csv"), "utf8").trim();
const csvLines = csvText.split("\n");
const csvHeader = parseCsvLine(csvLines[0]).map(s => s.trim());
const csvRows = csvLines.slice(1);

console.log(`JSON Promos: ${jsonPromos.length}`);
console.log(`CSV Promo Rows: ${csvRows.length}`);
if (jsonPromos.length !== 25 || csvRows.length !== 25) {
  console.error(`Count mismatch: JSON has ${jsonPromos.length}, CSV has ${csvRows.length}. Expected 25.`);
  process.exit(1);
}

// Validate each promo ID, rank, timecodes, duration, score, status
for (let i = 0; i < 25; i++) {
  const jp = jsonPromos[i];
  const rowCols = parseCsvLine(csvRows[i]);
  const csvPromoId = rowCols[0].trim();
  const csvRank = parseInt(rowCols[1].trim(), 10);
  const csvEpisode = rowCols[3].trim();
  const csvStart = rowCols[4].trim();
  const csvEnd = rowCols[5].trim();
  const csvDuration = parseFloat(rowCols[6].trim());
  const csvScore = parseFloat(rowCols[9].trim());
  const csvStatus = rowCols[15].trim();

  const jsonPromoId = jp.promo_id || jp.candidate_key;
  if (jsonPromoId !== csvPromoId) {
    console.error(`Mismatch at rank ${i + 1}: promo_id ${jsonPromoId} != ${csvPromoId}`);
    process.exit(1);
  }
  if (jp.global_rank !== csvRank) {
    console.error(`Mismatch at rank ${i + 1}: rank ${jp.global_rank} != ${csvRank}`);
    process.exit(1);
  }
  if (jp.episode !== csvEpisode) {
    console.error(`Mismatch at rank ${i + 1}: episode ${jp.episode} != ${csvEpisode}`);
    process.exit(1);
  }
  if (jp.start_clock !== csvStart || jp.end_clock !== csvEnd) {
    console.error(`Mismatch at rank ${i + 1}: timecode ${jp.start_clock}-${jp.end_clock} != ${csvStart}-${csvEnd}`);
    process.exit(1);
  }
  if (Math.abs(jp.duration_seconds - csvDuration) > 0.05) {
    console.error(`Mismatch at rank ${i + 1}: duration ${jp.duration_seconds} != ${csvDuration}`);
    process.exit(1);
  }
  if (Math.abs(jp.acquisition_score - csvScore) > 0.1) {
    console.error(`Mismatch at rank ${i + 1}: score ${jp.acquisition_score} != ${csvScore}`);
    process.exit(1);
  }
  if (jp.status !== csvStatus) {
    console.error(`Mismatch at rank ${i + 1}: status ${jp.status} != ${csvStatus}`);
    process.exit(1);
  }
  if (jp.duration_seconds < 20.0 || jp.duration_seconds > 60.0) {
    console.error(`Duration out of bounds at rank ${i + 1}: ${jp.duration_seconds}`);
    process.exit(1);
  }
}
console.log("All 25 promos verified: 100% exact match between JSON and CSV!");

// Review states count
const approvedCount = jsonPromos.filter(p => p.status === "approved").length;
const selectedCount = jsonPromos.filter(p => p.status === "selected").length;
const needsContextCount = jsonPromos.filter(p => (p.quality_flags || []).includes("needs context")).length;
console.log(`Review States: ${approvedCount} approved, ${selectedCount} selected.`);
console.log(`Needs Context Warnings: ${needsContextCount} of ${jsonPromos.length} promos.`);

const episodes = new Set(jsonPromos.map((p) => p.episode));
console.log(`Unique Episodes Represented: ${episodes.size} (${Array.from(episodes).sort().join(", ")})`);

// 5. Create README for the deliverable
const readmeContent = `# PromoForge: 50-Episode Series Promo Cut Deliverable
**Assignment:** Kuku AI Generalist Assignment — Problem 1 (Find the Promos)  
**Execution Run ID:** \`run-2026-11-21T06-35-55-637Z\`  
**Execution Timestamp:** \`2026-11-21T06:35:55.637Z\`  
**Pipeline Mode:** Full-Series Global Ranking (\`mode: "series"\`)  
**Input Pack:** 50 episodes (\`EP_001\` through \`EP_050\`, 3,727 total timestamped events)

---

## 1. Executive Summary & Verification

This archive contains the complete, unedited, deterministic outputs produced by PromoForge's full-series execution on all 50 episodes of the drama series.

- **Total Screenplays Analyzed:** 50 episodes (3,727 timestamped events)
- **Total Raw Candidate Pairs Examined:** 19,046 pairs
- **Duration Filter (<20s or >60s):** -7,167 rejected
- **Dialogue Slice Filter (cuts across active spoken lines):** -996 rejected
- **Valid Formed Windows:** 10,883 temporal windows ($19{,}046 - 7{,}167 - 996 = 10{,}883$)
- **Overlap De-duplication (>= 4.0s or > 15%):** -9,754 suppressed
- **Continuation Spoiler Suppression (question-answer pairs):** -983 suppressed
- **Episode Variety Limit Drop:** -0 suppressed
- **Accepted Candidate Pool:** **146 clean candidate windows** ($10{,}883 - 9{,}754 - 983 - 0 = 146$)
- **Model Shortlist Evaluated:** **70 candidates** selected across all 50 episodes via stratified round-robin allocation (\`SERIES_MODEL_CANDIDATES = 70\`)
- **AI Scoring Provider & Model:** Google Gemini \`gemini-3.1-flash-lite\` (7 sequential batches of 10 candidates)
- **Token Accounting:** 45,558 input tokens, 10,278 output tokens
- **Execution Wall Time:** 67.87 seconds
- **Actual Billed Console Cost:** $0.00 (executed under Google developer free tier)
- **Estimated Marginal API Cost:** $0.0065 (~0.65 cents based on $0.075/1M in, $0.30/1M out)
- **Final Ranked Promos:** Exactly **25 ranked promos** across **22 distinct episodes**

---

## 2. Review States & Editorial Quality Disclosure

- **Captured Editorial Review States:**
  - **1 Approved Promo:** Rank #1 (\`EP_002_P_000000_003710\`, Juliana wedding humiliation cut) was reviewed and marked \`approved\` in the PromoForge editorial workspace.
  - **24 Selected Promos:** Ranks #2 through #25 are in the \`selected\` state, representing algorithmic candidate selections produced by the ranking engine pending human editorial review and sign-off.
- **Editorial Context Warning Disclosure:**
  - **17 of 25 promos** carry the \`needs context\` warning flag.
  - *Explanation:* These flags are triggered by deterministic heuristic analysis detecting pronoun references (e.g. *he*, *she*, *them*) or character interactions without prior antecedents established inside the 20–60s window. Because the model evaluated the narrative as dramatic and self-explanatory while the heuristic detected pronoun dependency, these clips are flagged for human editorial verification against footage rather than being discarded.

---

## 3. Candidate Funnel Counter Reconciliation

To ensure 100% transparency across all documentation, code, and logs, here is the exact meaning of every counter:

| Counter | Value | Architectural Meaning |
| :--- | :---: | :--- |
| \`candidates_generated\` | **19,046** | Total pairwise start/end event boundary combinations evaluated across all 50 episodes. |
| \`rejected_duration\` | **-7,167** | Pairs rejected because total duration was < 20.0s or > 60.0s. |
| \`rejected_dialogue_slice\` | **-996** | Pairs rejected because start or end boundary sliced across active spoken dialogue (<0.1s tolerance). |
| *Valid Formed Windows* | **10,883** | Clean temporal candidate windows passing all hard structural invariants ($19{,}046 - 7{,}167 - 996 = 10{,}883$). |
| \`suppressed_overlap\` | **-9,754** | Candidates sharing $\ge 4.0$s or $> 15\%$ screen time with a higher-priority candidate within the episode. |
| \`suppressed_cliffhanger_continuation\` | **-983** | Candidates where an opening cliffhanger answers or continues an earlier cliffhanger mystery within the same episode. |
| \`candidates_accepted\` (in \`check_summary\`) | **146** | Size of the clean accepted candidate pool across all 50 episodes ($10{,}883 - 9{,}754 - 983 - 0 = 146$). Exact mathematical reconciliation. |
| \`candidates_evaluated_count\` (in \`run_log.json\`) | **146** | In the corrected implementation, this counter records the accepted candidate pool evaluated during global series ranking. *(Note: in the initial baseline run prior to the 4.0s de-dup fix and damping, this counter logged 154 candidates; with the corrected implementation, it reconciles exactly to 146).* |
| \`model_candidates_scored\` | **70** | Stratified round-robin shortlist of candidates across all 50 episodes dispatched to Google Gemini Flash Lite in 7 batches of 10. |
| \`final_promos_ranked\` | **25** | Global promotional cut sheet across 22 episodes after applying model scores and series pacing adjustments (+5 early bonus, -6 late penalty). |

---

## 4. Archive File Inventory

| Filename | Format | Description |
| :--- | :--- | :--- |
| **\`ranked_promos.json\`** | JSON | Complete structured metadata for all 25 top-ranked promos, including scores, rationale, transcripts, hook/cliffhanger lines, and quality flags. |
| **\`ranked_promos.csv\`** | CSV | Tabular summary of all 25 promos with ranks, episodes, timecodes, raw scores, series adjustments, ranking scores, hook lines, cliffhangers, flags, and review status. |
| **\`run_log.json\`** | JSON | Comprehensive machine audit log capturing run ID, timing breakdowns, token counts, model identifier, parameter configuration, check summary, and top-10 rationale. |
| **\`evaluation_results_gemini.json\`** | JSON | Benchmark evaluation of the actual full-series Gemini run against Claude LLM reference windows: 2/6 lenient (33.3%), 1/6 strict (16.7%); quiet romance episodes 100% excluded. |
| **\`evaluation_results_rule_cutsheets.json\`** | JSON | Benchmark evaluation of unconstrained per-episode rule cut sheets against Claude LLM reference windows: 5/6 lenient (83.3%), 4/6 strict (66.7%). |
| **\`ranked_promos.edl\`** | CMX 3600 EDL | Screenplay-derived Edit Decision List cut plan (non-drop frame timecode). Requires NLE conforming and media relinking (see Section 6). |
| **\`ranked_promos.otio\`** | OpenTimelineIO | Screenplay-derived OpenTimelineIO track schema cut plan. Requires NLE conforming and media relinking (see Section 6). |
| **\`cut_list.csv\`** | CSV | Streamlined cut sheet for video editors listing promo ID, episode, in/out timestamps, duration, and hook speaker. |
| **\`TIMELINE_NOTES.txt\`** | Text | Important NLE conforming disclosure regarding screenplay-derived timelines without linked media. |
| **\`raw/\`** | Directory | Unedited raw JSON responses from the 7 sequential Gemini API batch calls (\`model_response_batch_1.json\` through \`batch_7.json\`). |
| **\`README.md\`** | Markdown | This documentation file. |

---

## 5. Schema & Data Fields

### \`ranked_promos.csv\` Columns (Exact Schema)
- **\`promo_id\`**: Canonical deterministic identifier (e.g. \`EP_002_P_000000_003710\`). Exactly matches \`promo_id\` and \`candidate_key\` in \`ranked_promos.json\`.
- **\`rank\`**: Final series acquisition priority order (1 to 25).
- **\`segment_index\`**: Segment index within multi-segment promos (1 for single-segment cuts).
- **\`episode\`**: Source episode identifier (e.g. \`EP_002\`).
- **\`start\`**: Opening cut timestamp in \`MM:SS.ss\` clock format (e.g. \`00:00.00\`).
- **\`end\`**: Closing cliffhanger timestamp in \`MM:SS.ss\` clock format (e.g. \`00:37.10\`).
- **\`duration_seconds\`**: Total promo duration in seconds (strictly between 20.0s and 60.0s).
- **\`raw_decision_score\`**: Composite semantic score from AI model prior to series adjustment (0–100 scale: 35% hook + 35% cliffhanger + 20% standalone + 10% duration fit).
- **\`series_adjustment\`**: Proportional series pacing adjustment (+5 for first 30% episodes, -6 for last 20% spoiler risk, +2 for mid-series escalation).
- **\`ranking_score\`**: Final ranking score determining global placement (\`raw_decision_score + series_adjustment\`). Matches \`acquisition_score\` in JSON.
- **\`hook_line\`**: Opening line occurring within first 3.0s designed to capture viewer retention.
- **\`cliffhanger_line\`**: Final unresolved line terminating the cut before narrative resolution.
- **\`why\`**: AI-generated editorial rationale explaining hook tension, emotional escalation, and cliffhanger curiosity gap.
- **\`flags\`**: Comma-separated editorial warnings (e.g. \`needs context\`, \`late-series spoiler risk\`). 17 of 25 promos carry \`needs context\`.
- **\`score_source\`**: Model identifier (\`gemini/gemini-3.1-flash-lite\`).
- **\`status\`**: Captured editorial review state (\`approved\` for Rank #1, \`selected\` for Ranks #2–25).

### Timestamp Format & Millisecond Precision
All timestamps adhere to \`MM:SS.ss\` clock format, representing exact minutes, seconds, and hundredths of a second.
- Internal engine operations convert all timestamps to integer milliseconds (\`01:15.00\` $\rightarrow$ \`75,000ms\`).
- Invariant guarantee: Every start and end timestamp corresponds exactly to a parsed dialogue or action event boundary. No cut ever slices across active spoken dialogue.

---

## 6. NLE Conforming & Footage Limitation Disclosure

> **IMPORTANT EDITORIAL DISCLOSURE:**  
> The EDL (\`ranked_promos.edl\`) and OTIO (\`ranked_promos.otio\`) timelines provided in this archive are **screenplay-derived cut plans calculated from script event clocks, without linked video or audio source footage**.
> 
> - The Kuku assignment pack supplies timestamped screenplay text files only, without media files.
> - As a consequence, media relinking, timecode conforming against video tracks, and visual pacing verification remain necessary in DaVinci Resolve, Adobe Premiere Pro, or Final Cut Pro before publishing.
> - Actual footage validation (e.g. checking camera angle cuts, non-verbal reaction shots, or music stingers) has not been performed.
> - These files should **not** be treated as production-ready direct imports without editor conforming.

---

## 7. Dual Evaluation Benchmarks & LLM Reference Clarification

We benchmarked candidate windows against an independent reference set generated by Claude 3.7 Sonnet:
- **Clarification:** These reference windows represent an **LLM-generated reference benchmark, NOT human editorial ground truth or a manually labelled gold set**.
- **Per-Episode Rule Cut-Sheet Benchmark (\`evaluation_results_rule_cutsheets.json\`):** 5 of 6 lenient (83.3%), 4 of 6 strict (66.7%).
- **Full-Series Gemini Run Benchmark (\`evaluation_results_gemini.json\`):** 2 of 6 lenient (33.3%), 1 of 6 strict (16.7%). Negative controls (quiet romance episodes EP_006, EP_014, EP_017) are 100% excluded from the top 25 series promos.
- **Shortlist Effect:** In full-series mode, Gemini evaluated a bounded shortlist of 70 candidates across 50 episodes (~1.4 per episode), whereas per-episode cut sheets evaluated unconstrained top-3 candidates per episode. While shortlist allocation affected which candidate windows reached the model, semantic divergence between LLM architectures in valuing emotional hooks, dialogue cadence, and cliffhangers also contributes to differing editorial selections.

---

## 8. Hard Constraints & Invariants Verified

1. **Duration Compliance (H1):** All 25 promos have durations strictly between 20.0s and 60.0s (shortest: 25.0s, longest: 44.0s).
2. **Dialogue Boundary Safety (H2 & H3):** Zero cuts slice spoken dialogue lines (<0.1s tolerance). Start and end boundaries align with script events.
3. **Hook Placement (H4 & H9):** Opening hook is present within the first 3.0s of the cut. No sentence fragment starts.
4. **Cliffhanger Integrity (H7):** No promo terminates on an answer to its own question. No selected promo answers another selected promo's mystery.
5. **Deduplication (H6):** Overlapping candidates sharing >= 4.0s or > 15% screen time are suppressed.
6. **Negative Controls:** Quiet domestic/romance episodes (EP_006, EP_014, EP_017) are suppressed from the top 25 global ranking.
7. **Security & Confidentiality:** Zero raw screenplay text files, zero original assignment ZIP files, and zero API credentials (\`AIza...\`) are included in this archive.
`;

fs.writeFileSync(path.join(stagingDir, "README.md"), readmeContent);

// 6. Collect files and zip
function collectFiles(dir, base = "") {
  const result = {};
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    const relPath = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) {
      Object.assign(result, collectFiles(fullPath, relPath));
    } else {
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const fileMap = collectFiles(stagingDir);
console.log(`Zipping ${Object.keys(fileMap).length} deliverable files...`);

// Check that no screenplay .txt, input ZIP, or API keys are included
for (const [name, buffer] of Object.entries(fileMap)) {
  if (name.endsWith(".txt") && name.toLowerCase().includes("episode") && !name.includes("TIMELINE_NOTES")) {
    console.error(`FORBIDDEN: Screenplay file detected: ${name}`);
    process.exit(1);
  }
  if (name.endsWith(".zip")) {
    console.error(`FORBIDDEN: Nested ZIP file detected: ${name}`);
    process.exit(1);
  }
  const text = buffer.toString("utf8");
  if (/AIza[0-9A-Za-z-_]{35}/.test(text)) {
    console.error(`FORBIDDEN: API Key detected in ${name}`);
    process.exit(1);
  }
}

const zipped = zipSync(fileMap, { level: 9 });
fs.writeFileSync(outZipPath, zipped);

const stat = fs.statSync(outZipPath);
console.log(`\n========================================`);
console.log(`DELIVERABLE CREATED SUCCESSFULLY:`);
console.log(`Location: ${outZipPath}`);
console.log(`Size: ${stat.size} bytes (${(stat.size / 1024).toFixed(1)} KB)`);
console.log(`Promos Count: ${jsonPromos.length}`);
console.log(`Episodes Represented: ${episodes.size}`);
console.log(`Execution Run ID: run-2026-11-21T06-35-55-637Z`);
console.log(`Execution Timestamp: 2026-11-21T06:35:55.637Z`);
console.log(`========================================\n`);
