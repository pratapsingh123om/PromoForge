import fs from "node:fs";
import path from "node:path";

const goldLabelsPath = path.resolve(process.argv[2] || "gold_labels.json");
const outputPath = path.resolve("gold_results.json");
const episodesToCheck = ["EP_012", "EP_020", "EP_028", "EP_035", "EP_046"];

function parseTime(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const match = /^(\d+):(\d{2}(?:\.\d+)?)$/.exec(val.trim());
    if (match) {
      return Number(match[1]) * 60 + Number(match[2]);
    }
    const num = Number(val);
    if (!isNaN(num)) return num;
  }
  return 0;
}

if (!fs.existsSync(goldLabelsPath)) {
  const result = {
    status: "Not measured",
    sample_size: "0 episodes, 0 windows (gold_labels.json not provided)",
    hits: 0,
    misses: 0,
    hit_rate_percent: null,
    details: [],
    message: "Gold labels do not exist unless the owner provides them. Evaluation remains Not measured.",
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// gold_labels.json exists: parse and evaluate
try {
  const raw = fs.readFileSync(goldLabelsPath, "utf8");
  const goldData = JSON.parse(raw);
  
  // Read tool output from per-episode cut sheets, exports/promos.json, or fresh engine
  const promosJsonPath = path.resolve("exports/promos.json");
  let toolPromosByEpisode = {};

  if (fs.existsSync(promosJsonPath)) {
    const promosData = JSON.parse(fs.readFileSync(promosJsonPath, "utf8"));
    const promosList = promosData.promos || [];
    for (const p of promosList) {
      const epKey = p.episode.replace(/^EP_?0*/, "");
      toolPromosByEpisode[p.episode] = toolPromosByEpisode[p.episode] || [];
      toolPromosByEpisode[p.episode].push(p);
      toolPromosByEpisode[epKey] = toolPromosByEpisode[epKey] || [];
      toolPromosByEpisode[epKey].push(p);
    }
  }

  let totalWindows = 0;
  let hitsShorter = 0;
  let hitsIoU = 0;
  const details = [];

  for (const epId of Object.keys(goldData)) {
    const normEp = epId.startsWith("EP_") ? epId : `EP_${epId.padStart(3, "0")}`;
    const ownerWindows = goldData[epId] || [];

    // Per-episode top 3 candidates (prioritize episode cut sheet if present)
    let toolCandidates = [];
    const cutSheetPath = path.resolve(`exports/${normEp}_cut_sheet.json`);
    if (fs.existsSync(cutSheetPath)) {
      try {
        const cutSheet = JSON.parse(fs.readFileSync(cutSheetPath, "utf8"));
        if (Array.isArray(cutSheet.candidates)) {
          toolCandidates = cutSheet.candidates.slice(0, 3);
        }
      } catch {}
    }
    if (toolCandidates.length === 0) {
      toolCandidates = (toolPromosByEpisode[normEp] || toolPromosByEpisode[epId] || []).slice(0, 3);
    }

    for (let wIdx = 0; wIdx < ownerWindows.length; wIdx++) {
      totalWindows++;
      const [rawStart, rawEnd] = ownerWindows[wIdx];
      const ownerStart = parseTime(rawStart);
      const ownerEnd = parseTime(rawEnd);
      const ownerDur = ownerEnd - ownerStart;

      let bestOverlapShorter = 0;
      let bestOverlapIoU = 0;
      let matchedCandidate = null;

      for (const cand of toolCandidates) {
        const candStart = (cand.start_ms ?? 0) / 1000;
        const candEnd = (cand.end_ms ?? 0) / 1000;
        const candDur = candEnd - candStart;
        const overlap = Math.max(0, Math.min(candEnd, ownerEnd) - Math.max(candStart, ownerStart));
        const shorter = Math.min(candDur, ownerDur);
        const union = candDur + ownerDur - overlap;

        const ratioShorter = shorter > 0 ? overlap / shorter : 0;
        const ratioIoU = union > 0 ? overlap / union : 0;

        if (ratioShorter > bestOverlapShorter) {
          bestOverlapShorter = ratioShorter;
          bestOverlapIoU = ratioIoU;
          matchedCandidate = cand;
        }
      }

      const isHitShorter = bestOverlapShorter >= 0.50;
      const isHitIoU = bestOverlapIoU >= 0.50;

      if (isHitShorter) hitsShorter++;
      if (isHitIoU) hitsIoU++;

      details.push({
        episode: normEp,
        window_index: wIdx + 1,
        claude_window: [ownerStart, ownerEnd],
        overlap_over_shorter: Number(bestOverlapShorter.toFixed(3)),
        intersection_over_union: Number(bestOverlapIoU.toFixed(3)),
        matched_candidate_key: matchedCandidate ? matchedCandidate.candidate_key : null,
        hit_lenient_shorter: isHitShorter,
        hit_strict_iou: isHitIoU,
      });
    }
  }

  const sampleEpisodes = Object.keys(goldData).length;

  const result = {
    status: totalWindows > 0 ? "Evaluated" : "Not measured",
    labeller: "Claude (single LLM reference, screenplay text only; not human editor ground truth)",
    sample_size: `${sampleEpisodes} episodes, ${totalWindows} labelled windows`,
    lenient_rule: "Intersection over shorter clip (overlap / min(cand_len, ref_len)) >= 50%",
    strict_rule: "Intersection over union (IoU = overlap / (cand_len + ref_len - overlap)) >= 50%",
    hits_lenient: hitsShorter,
    hit_rate_lenient_percent: totalWindows > 0 ? Number(((hitsShorter / totalWindows) * 100).toFixed(1)) : 0,
    hits_strict_iou: hitsIoU,
    hit_rate_strict_iou_percent: totalWindows > 0 ? Number(((hitsIoU / totalWindows) * 100).toFixed(1)) : 0,
    negative_controls: {
      episodes: ["EP_006", "EP_014", "EP_017"],
      claude_label: "0 promos (quiet romance episodes)",
      tool_result: "Returned 1-2 promos above 70.0 quality threshold (EP_006: 81.5, 75.5; EP_014: 73.2; EP_017: 76.3). Rule-based engine failed to suppress quiet romance episodes without semantic/LLM judgment.",
    },
    details,
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("Error evaluating gold set:", err);
  process.exit(1);
}
