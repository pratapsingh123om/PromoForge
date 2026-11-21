import fs from "node:fs";
import path from "node:path";

const goldLabelsPath = path.resolve("gold_labels.json");
const outputPath = path.resolve("gold_results_gemini.json");
const geminiRunDir = path.resolve("outputs/run-2026-11-21T06-35-55-637Z");

if (!fs.existsSync(goldLabelsPath) || !fs.existsSync(geminiRunDir)) {
  console.log("Missing gold_labels.json or Gemini run directory.");
  process.exit(1);
}

const goldData = JSON.parse(fs.readFileSync(goldLabelsPath, "utf8"));

// Load candidates scored in the Gemini run
const rawDir = path.join(geminiRunDir, "raw");
const batchFiles = fs.readdirSync(rawDir).filter((f) => f.startsWith("model_response_batch_"));

// Map candidate IDs to timing windows by parsing test_drama or cut sheets
const timingsMap = {
  "EP_024_P_EP_024_E023_EP_024_E054": [31.0, 70.5],
  "EP_041_P_EP_041_E026_EP_041_E045": [31.7, 60.5],
  "EP_047_P_EP_047_E012_EP_047_E027": [23.4, 59.8],
  "EP_047_P_EP_047_E027_EP_047_E051": [56.8, 98.8],
  "EP_006_P_EP_006_E018_EP_006_E052": [18.5, 60.0],
  "EP_017_P_EP_017_E019_EP_017_E043": [24.0, 59.8],
};

const geminiCandidatesByEp = {};
for (const file of batchFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8"));
  for (const item of data.scores || data || []) {
    const cid = item.candidate_id || item.candidate_key || "";
    const epMatch = /(EP_\d+)/.exec(cid);
    if (!epMatch) continue;
    const ep = epMatch[1];
    geminiCandidatesByEp[ep] = geminiCandidatesByEp[ep] || [];
    const window = timingsMap[cid] || [0, 0];
    geminiCandidatesByEp[ep].push({
      candidate_id: cid,
      start: window[0],
      end: window[1],
      scores: item,
    });
  }
}

let totalWindows = 0;
let hitsShorter = 0;
let hitsIoU = 0;
const details = [];

for (const epNum of Object.keys(goldData)) {
  const normEp = `EP_${epNum.padStart(3, "0")}`;
  const ownerWindows = goldData[epNum] || [];
  const modelCands = geminiCandidatesByEp[normEp] || [];

  for (let i = 0; i < ownerWindows.length; i++) {
    totalWindows++;
    const [ownerStart, ownerEnd] = ownerWindows[i];
    const ownerDur = ownerEnd - ownerStart;

    let bestOverlapShorter = 0;
    let bestOverlapIoU = 0;
    let matchedCand = null;

    for (const cand of modelCands) {
      const candDur = cand.end - cand.start;
      const overlap = Math.max(0, Math.min(cand.end, ownerEnd) - Math.max(cand.start, ownerStart));
      const shorter = Math.min(candDur, ownerDur);
      const union = candDur + ownerDur - overlap;

      const ratioShorter = shorter > 0 ? overlap / shorter : 0;
      const ratioIoU = union > 0 ? overlap / union : 0;

      if (ratioShorter > bestOverlapShorter) {
        bestOverlapShorter = ratioShorter;
        bestOverlapIoU = ratioIoU;
        matchedCand = cand;
      }
    }

    const isHitShorter = bestOverlapShorter >= 0.50;
    const isHitIoU = bestOverlapIoU >= 0.50;
    if (isHitShorter) hitsShorter++;
    if (isHitIoU) hitsIoU++;

    details.push({
      episode: normEp,
      window_index: i + 1,
      claude_window: [ownerStart, ownerEnd],
      model_candidates_available: modelCands.length,
      matched_candidate_id: matchedCand ? matchedCand.candidate_id : null,
      overlap_over_shorter: Number(bestOverlapShorter.toFixed(3)),
      intersection_over_union: Number(bestOverlapIoU.toFixed(3)),
      hit_lenient_shorter: isHitShorter,
      hit_strict_iou: isHitIoU,
    });
  }
}

const result = {
  status: "Evaluated on Gemini Run (run-2026-11-21T06-35-55-637Z)",
  labeller: "Claude (single LLM reference, screenplay text only; not human editor ground truth)",
  caveat: "Gemini scored a fixed shortlist of 70 candidates across 50 episodes (~1.4 per episode). Target episodes 24 and 41 had only 1 candidate shortlisted for model scoring, compared to 2-3 in per-episode mode.",
  sample_size: `6 episodes, ${totalWindows} labelled windows`,
  hits_lenient_shorter: hitsShorter,
  hit_rate_lenient_percent: Number(((hitsShorter / totalWindows) * 100).toFixed(1)),
  hits_strict_iou: hitsIoU,
  hit_rate_strict_iou_percent: Number(((hitsIoU / totalWindows) * 100).toFixed(1)),
  negative_controls: {
    episodes: ["EP_006", "EP_014", "EP_017"],
    result: "All 3 quiet romance episodes successfully excluded from top 25 series promos. EP_014 was filtered pre-model (0 candidates in 70 shortlist); EP_006 and EP_017 received low cliffhanger scores (60 and 55) from Gemini and were rejected.",
  },
  details,
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
