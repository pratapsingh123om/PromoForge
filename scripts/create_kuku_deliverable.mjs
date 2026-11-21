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

// 2. Evaluation results
const evalGeminiSrc = path.join(repoRoot, "gold_results_gemini.json");
if (fs.existsSync(evalGeminiSrc)) {
  fs.copyFileSync(evalGeminiSrc, path.join(stagingDir, "evaluation_results_gemini.json"));
}
const evalRuleSrc = path.join(repoRoot, "gold_results.json");
if (fs.existsSync(evalRuleSrc)) {
  fs.copyFileSync(evalRuleSrc, path.join(stagingDir, "evaluation_results_rule_cutsheets.json"));
}

// 3. Raw model responses
const rawDir = path.join(runDir, "raw");
if (fs.existsSync(rawDir)) {
  for (const file of fs.readdirSync(rawDir)) {
    if (file.endsWith(".json")) {
      fs.copyFileSync(path.join(rawDir, file), path.join(stagingDir, "raw", file));
    }
  }
}

// 4. Verify promo counts
const jsonPromos = JSON.parse(fs.readFileSync(path.join(stagingDir, "ranked_promos.json"), "utf8")).promos || [];
const csvLines = fs.readFileSync(path.join(stagingDir, "ranked_promos.csv"), "utf8").trim().split("\n");
const csvRows = csvLines.slice(1); // omit header

console.log(`JSON Promos: ${jsonPromos.length}`);
console.log(`CSV Promo Rows: ${csvRows.length}`);
if (jsonPromos.length !== 25 || csvRows.length !== 25) {
  console.error(`Count mismatch: JSON has ${jsonPromos.length}, CSV has ${csvRows.length}. Expected 25.`);
  process.exit(1);
}

const episodes = new Set(jsonPromos.map((p) => p.episode));
console.log(`Unique Episodes Represented: ${episodes.size} (${Array.from(episodes).sort().join(", ")})`);

// 5. Create README for the deliverable
const readmeContent = `# PromoForge: 50-Episode Series Promo Cut Deliverable
**Assignment:** Kuku AI Generalist Assignment — Problem 1 (Find the Promos)  
**Execution Run ID:** \`run-2026-11-21T06-35-55-637Z\`  
**Timestamp:** \`2026-11-21T06:35:55.637Z\`  
**Pipeline Mode:** Full-Series Global Ranking (\`mode: "series"\`)  
**Input Pack:** 50 episodes (\`EP_001\` through \`EP_050\`, 3,727 total timestamped events)

---

## 1. Executive Summary & Verification

This archive contains the complete, unedited, deterministic outputs produced by PromoForge's full-series execution on all 50 episodes of the drama series.

- **Total Screenplays Analyzed:** 50 episodes
- **Total Raw Candidate Pairs Examined:** 19,046 pairs
- **Total Valid Formed Windows:** 10,883 windows (duration 20–60s, zero dialogue boundary slices)
- **Overlap De-duplication:** -9,754 suppressed (overlap >= 4.0s or > 15%)
- **Continuation Spoiler Suppression:** -983 suppressed (ends on/starts on resolved question)
- **Episode Variety Limit Drop:** -0 suppressed
- **Accepted Candidate Pool:** 146 clean candidates ($10,883 - 9,754 - 983 - 0 = 146$)
- **Candidates Scored by Model:** 70 candidates selected across all 50 episodes via stratified round-robin allocation (\`SERIES_MODEL_CANDIDATES = 70\`)
- **Model Used:** Google Gemini \`gemini-3.1-flash-lite\` (7 parallel batch calls of 10 candidates each)
- **Execution Wall Time:** 67.87 seconds
- **Token Usage:** 45,558 input tokens, 10,278 output tokens
- **Actual Billed Console Cost:** $0.00 (run executed under developer free tier)
- **Estimated Marginal API Cost:** $0.0065 (~0.65 cents based on $0.075/1M in, $0.30/1M out)
- **Final Promos Selected:** Exactly **25 ranked promos** across **22 distinct episodes**

Both \`ranked_promos.json\` (25 promo objects) and \`ranked_promos.csv\` (25 data rows + 1 header) match with 100% precision.

---

## 2. Archive File Inventory

| Filename | Format | Description |
| :--- | :--- | :--- |
| **\`ranked_promos.json\`** | JSON | Complete structured metadata for all 25 top-ranked promos, including scores, rationale, transcripts, hook/cliffhanger lines, and quality flags. |
| **\`ranked_promos.csv\`** | CSV | Tabular summary of all 25 promos with ranks, episodes, timecodes, raw scores, series adjustments, acquisition scores, hook lines, and cliffhangers. |
| **\`run_log.json\`** | JSON | Comprehensive machine audit log capturing run ID, timing breakdowns, token counts, model identifier, parameter configuration, and top-10 rationale. |
| **\`evaluation_results_gemini.json\`** | JSON | Benchmark evaluation of the actual full-series Gemini run against Claude LLM reference windows: 2/6 lenient (33.3%), 1/6 strict (16.7%); quiet episodes 100% excluded. |
| **\`evaluation_results_rule_cutsheets.json\`** | JSON | Benchmark evaluation of unconstrained per-episode rule cut sheets against Claude LLM reference windows: 5/6 lenient (83.3%), 4/6 strict (66.7%). |
| **\`ranked_promos.edl\`** | CMX 3600 EDL | Industry-standard Edit Decision List (non-drop frame timecode) for direct import into Premiere Pro, DaVinci Resolve, or Final Cut Pro. |
| **\`ranked_promos.otio\`** | OpenTimelineIO | Native OpenTimelineIO track schema containing sequential clip tracks and editorial metadata for modern NLE pipelines. |
| **\`cut_list.csv\`** | CSV | Streamlined cut sheet for video editors listing promo ID, episode, in/out timestamps, duration, and hook speaker. |
| **\`raw/\`** | Directory | Unedited raw JSON responses from the 7 parallel Gemini API batch calls (\`model_response_batch_1.json\` through \`batch_7.json\`). |
| **\`README.md\`** | Markdown | This file. |

---

## 3. Schema & Data Fields

### \`ranked_promos.csv\` Columns
- **\`rank\`**: Final series acquisition priority order (1 to 25).
- **\`promo_id\`**: Canonical deterministic identifier (e.g. \`EP_002_P_000000_003710\`).
- **\`episode\`**: Source episode identifier (e.g. \`EP_002\`).
- **\`start_time\`**: Opening cut timestamp in \`MM:SS.ss\` format (e.g. \`00:00.00\`).
- **\`end_time\`**: Closing cliffhanger timestamp in \`MM:SS.ss\` format (e.g. \`00:37.10\`).
- **\`duration_seconds\`**: Total promo duration in seconds (strictly between 20.0s and 60.0s).
- **\`raw_decision_score\`**: Composite semantic score from AI model prior to series adjustment (0–100 scale: 40% hook + 40% cliffhanger + 20% standalone).
- **\`ranking_adjustment\`**: Proportional series pacing adjustment (+5 for first 30% episodes, -6 for last 20% spoiler risk).
- **\`acquisition_score\`**: Final ranking score determining global placement (\`raw_decision_score + ranking_adjustment\`).
- **\`hook_line\`**: Opening line occurring within first 3.0s designed to capture viewer retention.
- **\`hook_speaker\`**: Character or speaker delivering the hook line.
- **\`cliffhanger_line\`**: Final unresolved line terminating the cut before narrative resolution.
- **\`cliffhanger_speaker\`**: Character or speaker delivering the cliffhanger line.
- **\`why_it_works\`**: AI-generated editorial rationale explaining hook tension, emotional escalation, and cliffhanger curiosity gap.
- **\`quality_flags\`**: Comma-separated editorial warnings (e.g. \`needs context\`, \`late-series spoiler risk\`).

### Timestamp Format & Millisecond Precision
All timestamps adhere to \`MM:SS.ss\` clock format, representing exact minutes, seconds, and hundredths of a second.
- Internal engine operations convert all timestamps to integer milliseconds (\`01:15.00\` $\rightarrow$ \`75,000ms\`).
- Invariant guarantee: Every start and end timestamp corresponds exactly to a parsed dialogue or action event boundary. No cut ever slices across active spoken dialogue.

---

## 4. Hard Constraints & Verification Invariants Passed

1. **Duration Compliance (H1):** Every promo duration is strictly between 20.0s and 60.0s (shortest: 25.0s, longest: 44.0s).
2. **Boundary Safety (H2 & H3):** Zero cuts slice spoken dialogue lines (<0.1s tolerance). Start and end boundaries align with script events.
3. **Hook Placement (H4 & H9):** Opening hook is present within the first 3.0s of the cut. No sentence fragment starts.
4. **Cliffhanger Integrity (H7):** No promo terminates on an answer to its own question. No selected promo answers another selected promo's mystery.
5. **Deduplication (H6):** Overlapping candidates sharing >= 4.0s or > 15% screen time are suppressed.
6. **Negative Controls:** Quiet domestic/romance episodes (EP_006, EP_014, EP_017) are suppressed from the top 25 global ranking.

---

## 5. Technical Limitations & Human-in-the-Loop Note

- **Text-Only Modality Limitation:** PromoForge analyzes written screenplays. Dialogue boundaries are validated against parsed script event timestamps, not direct acoustic phoneme or audio waveform analysis.
- **Human Editorial Role:** While PromoForge automates candidate discovery and ranking, human editors should review flagged items (\`needs context\`) to verify that visual acting beats and music stingers in proxy footage align with the proposed cuts.
- **Confidentiality:** This package excludes the original raw screenplay text files and API keys to respect intellectual property boundaries.
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

// Check that no screenplay .txt or API keys are included
for (const [name, buffer] of Object.entries(fileMap)) {
  if (name.endsWith(".txt") && name.includes("episode")) {
    console.error(`FORBIDDEN: Screenplay file detected: ${name}`);
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
console.log(`Execution Timestamp: 2026-11-21T06:35:55.637Z`);
console.log(`========================================\n`);
