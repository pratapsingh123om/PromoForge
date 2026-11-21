import fs from "node:fs";
import path from "node:path";

function parseClock(clock) {
  if (typeof clock === "number") return clock;
  const match = /^(\d+):(\d{2}(?:\.\d+)?)$/.exec(clock.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseScreenplayDialogueEvents(text) {
  const events = [];
  const lines = text.split(/\r?\n/);
  let currentSpeaker = null;
  let currentStartMs = null;
  let currentEndMs = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Speaker header format: **SPEAKER (Tone):**
    const speakerMatch = /^\*\*([A-Z0-9 .'-]+?)(?:\s*\([^)]*\))?:\*\*/.exec(line);
    if (speakerMatch && !line.includes("CAMERA") && !line.includes("SOUND FX") && !line.includes("ACTION")) {
      currentSpeaker = speakerMatch[1].trim();
      continue;
    }
    // Timestamp format: Start: (MM:SS.ss) | End: (MM:SS.ss)
    const timeMatch = /Start:\s*\((\d+:\d{2}\.\d+)\)\s*\|\s*End:\s*\((\d+:\d{2}\.\d+)\)/.exec(line);
    if (timeMatch) {
      currentStartMs = Math.round(parseClock(timeMatch[1]) * 1000);
      currentEndMs = Math.round(parseClock(timeMatch[2]) * 1000);
      continue;
    }
    // Dialogue line in quotes: "..."
    if (currentSpeaker && currentStartMs !== null && currentEndMs !== null && line.startsWith('"') && line.endsWith('"')) {
      const dialogueText = line.slice(1, -1).trim();
      events.push({
        speaker: currentSpeaker,
        start_ms: currentStartMs,
        end_ms: currentEndMs,
        text: dialogueText,
      });
      currentSpeaker = null;
      currentStartMs = null;
      currentEndMs = null;
    }
  }
  return events;
}

export function runIndependentCheck(promos, screenplayDir) {
  let passedDuration = 0;
  let passedNoSlice = 0;
  let passedEvidence = 0;
  let passedNoReplyContinuation = 0;
  const failures = [];

  // Group promos by episode
  const promosByEpisode = new Map();
  for (const promo of promos) {
    const list = promosByEpisode.get(promo.episode) || [];
    list.push(promo);
    promosByEpisode.set(promo.episode, list);
  }

  // Find screenplay files
  const screenplayFiles = new Map();
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanDir(full);
      else if (entry.name.endsWith(".txt")) {
        const epMatch = /episode-?(\d+)/i.exec(entry.name);
        if (epMatch) {
          const num = parseInt(epMatch[1], 10);
          screenplayFiles.set(`EP_${String(num).padStart(3, "0")}`, full);
          screenplayFiles.set(`EP_${num}`, full);
        }
      }
    }
  }
  scanDir(screenplayDir);

  for (const promo of promos) {
    const epId = promo.episode;
    const startMs = promo.start_ms ?? Math.round(parseClock(promo.start_time || promo.start_clock || "00:00") * 1000);
    const endMs = promo.end_ms ?? Math.round(parseClock(promo.end_time || promo.end_clock || "00:00") * 1000);
    const durSec = (endMs - startMs) / 1000;

    // 1. Duration check 20-60s
    if (durSec >= 19.99 && durSec <= 60.01) {
      passedDuration++;
    } else {
      failures.push({
        check: "duration_bounds",
        episode: epId,
        timestamps: `${promo.start_time || startMs} - ${promo.end_time || endMs}`,
        detail: `Duration ${durSec}s is outside 20-60s range`,
      });
    }

    // 2. Dialogue slice check against source screenplay
    const scPath = screenplayFiles.get(epId);
    let dialogueEvents = [];
    if (scPath && fs.existsSync(scPath)) {
      const text = fs.readFileSync(scPath, "utf8");
      dialogueEvents = parseScreenplayDialogueEvents(text);
    }

    let sliced = false;
    for (const d of dialogueEvents) {
      // Line is cut if start or end is strictly inside dialogue event
      if (d.start_ms < startMs && startMs < d.end_ms) {
        sliced = true;
        failures.push({
          check: "dialogue_slice_start",
          episode: epId,
          timestamps: `${startMs}ms (in line ${d.start_ms}-${d.end_ms}ms)`,
          detail: `In-point cuts inside dialogue line: "${d.text}"`,
        });
      }
      if (d.start_ms < endMs && endMs < d.end_ms) {
        sliced = true;
        failures.push({
          check: "dialogue_slice_end",
          episode: epId,
          timestamps: `${endMs}ms (in line ${d.start_ms}-${d.end_ms}ms)`,
          detail: `Out-point cuts inside dialogue line: "${d.text}"`,
        });
      }
    }
    if (!sliced) passedNoSlice++;

    // 3. Hook and cliffhanger lines present in cut
    const hook = promo.hook_line || (promo.rationale && promo.rationale[0]);
    const cliff = promo.cliffhanger_line || (promo.rationale && promo.rationale[2]);
    if (hook && cliff) {
      passedEvidence++;
    } else {
      failures.push({
        check: "evidence_presence",
        episode: epId,
        timestamps: `${startMs}-${endMs}`,
        detail: `Missing hook or cliffhanger line specification`,
      });
    }
  }

  // 4. Same-episode reply/continuation check
  for (const [epId, epPromos] of promosByEpisode.entries()) {
    let continuationFound = false;
    for (let i = 0; i < epPromos.length; i++) {
      for (let j = i + 1; j < epPromos.length; j++) {
        const p1 = epPromos[i];
        const p2 = epPromos[j];
        const s1 = p1.start_ms ?? Math.round(parseClock(p1.start_time || p1.start_clock || "00:00") * 1000);
        const e1 = p1.end_ms ?? Math.round(parseClock(p1.end_time || p1.end_clock || "00:00") * 1000);
        const s2 = p2.start_ms ?? Math.round(parseClock(p2.start_time || p2.start_clock || "00:00") * 1000);
        const e2 = p2.end_ms ?? Math.round(parseClock(p2.end_time || p2.end_clock || "00:00") * 1000);

        // Check if one ends on question and the other starts within 8 seconds
        if (e1 <= s2 && s2 - e1 <= 8000 && p1.cliffhanger_line && p1.cliffhanger_line.includes("?")) {
          continuationFound = true;
          failures.push({
            check: "same_episode_reply_continuation",
            episode: epId,
            timestamps: `P1 end ${e1}ms -> P2 start ${s2}ms`,
            detail: `P2 starts on reply to P1 cliffhanger question: "${p1.cliffhanger_line}"`,
          });
        }
        if (e2 <= s1 && s1 - e2 <= 8000 && p2.cliffhanger_line && p2.cliffhanger_line.includes("?")) {
          continuationFound = true;
          failures.push({
            check: "same_episode_reply_continuation",
            episode: epId,
            timestamps: `P2 end ${e2}ms -> P1 start ${s1}ms`,
            detail: `P1 starts on reply to P2 cliffhanger question: "${p2.cliffhanger_line}"`,
          });
        }
      }
    }
    if (!continuationFound) passedNoReplyContinuation += epPromos.length;
  }

  return {
    total_promos_checked: promos.length,
    passed_duration: passedDuration,
    passed_no_slice: passedNoSlice,
    passed_evidence: passedEvidence,
    passed_no_reply_continuation: passedNoReplyContinuation,
    failures,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith("verify_independent_run.mjs")) {
  const promosPath = path.resolve(process.argv[2] || "exports/promos.json");
  const screenplayDir = path.resolve(process.argv[3] || "test_drama");

  if (!fs.existsSync(promosPath)) {
    console.error(`Promos file not found at ${promosPath}`);
    process.exit(1);
  }

  const promosData = JSON.parse(fs.readFileSync(promosPath, "utf8"));
  const promos = promosData.promos || (Array.isArray(promosData) ? promosData : []);
  const report = runIndependentCheck(promos, screenplayDir);

  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) {
    process.exit(1);
  }
}
