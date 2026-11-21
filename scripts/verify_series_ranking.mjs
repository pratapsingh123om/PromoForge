import fs from "node:fs";
import path from "node:path";

import {
  parseScreenplayText,
  generateEpisodePromosClient,
  buildSeriesAliasMap,
  applySeriesAliasMapToEpisodes,
  rankAllEpisodesGlobally,
} from "../node_modules/.cache/promoforge-audit/screenplayEngine.js";

const inputRoot = path.resolve("test_drama");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.toLowerCase().endsWith(".txt")) files.push(fullPath);
  }
}

walk(inputRoot);
files.sort((a, b) => {
  const numA = parseInt(path.basename(a).match(/\d+/)?.[0] || "0", 10);
  const numB = parseInt(path.basename(b).match(/\d+/)?.[0] || "0", 10);
  return numA - numB;
});

const episodes = [];
for (const file of files) {
  const episode = parseScreenplayText(
    fs.readFileSync(file, "utf8"),
    path.basename(file),
    "en",
  );
  episodes.push(episode);
}

console.log(`Loaded ${episodes.length} episodes.`);

// Step 1: Build series character alias map once
const seriesAliases = buildSeriesAliasMap(episodes);
console.log(`Series character aliases mapped:`, seriesAliases);
applySeriesAliasMapToEpisodes(episodes, seriesAliases);

// Step 2: Per-episode discovery: 5 cuts per episode
const summary = {
  candidates_generated: 0,
  rejected_duration: 0,
  rejected_dialogue_slice: 0,
  rejected_fragment: 0,
  rejected_mid_speech: 0,
  suppressed_overlap: 0,
  suppressed_cliffhanger_continuation: 0,
  candidates_accepted: 0,
  model_calls: 0,
  wall_time_seconds: 0,
};

const allCandidates = [];
for (const ep of episodes) {
  const cands = generateEpisodePromosClient(ep, 20, 60, summary, 5);
  allCandidates.push(...cands);
}

console.log(`Total rule candidates generated across ${episodes.length} episodes: ${allCandidates.length}`);

// Step 3: Run series ranking
const seriesResult = rankAllEpisodesGlobally(allCandidates, {
  mode: "series",
  varietyCap: 2,
  qualityThreshold: 70.0,
  topLimit: 25,
});

console.log(`\n--- SERIES RANKING SUMMARY ---`);
console.log(`Mode: ${seriesResult.mode}`);
console.log(`Total evaluated: ${seriesResult.totalCandidatesEvaluated}`);
console.log(`Total ranked above quality threshold: ${seriesResult.ranked.length}`);

console.log(`\n--- TOP 10 CAMPAIGN PRIORITIES ---`);
seriesResult.whyTop10.forEach((reason) => {
  console.log(`- ${reason}`);
});

console.log(`\n--- TOP 10 PROMO DETAILS ---`);
seriesResult.ranked.slice(0, 10).forEach((p) => {
  console.log(
    `#${p.global_rank} [${p.post_priority}] ${p.episode} (${p.duration_seconds}s) | Score: ${p.scores.decision} (Acq: ${p.acquisition_score}) | Moment: ${p.moment_type} | Flags: [${p.quality_flags.join(", ")}]`,
  );
  console.log(`   Hook: "${p.hook_line.slice(0, 60)}..."`);
  console.log(`   Cliff: "${p.cliffhanger_line.slice(0, 60)}..."`);
});

// Check EP_045 spoiler detection
const ep45Cuts = seriesResult.allCandidatesByEpisode["EP_045"] || [];
console.log(`\nEP_045 Candidates in pool: ${ep45Cuts.length}`);
ep45Cuts.forEach((c) => {
  console.log(`  Candidate ${c.candidate_key}: Quality Flags:`, c.quality_flags);
});

// Verify per-episode drill-down has cuts for all episodes
const episodesWithCandidates = Object.keys(seriesResult.allCandidatesByEpisode).length;
console.log(`\nPer-episode drill-down coverage: ${episodesWithCandidates} / ${episodes.length} episodes have candidate cuts available.`);
