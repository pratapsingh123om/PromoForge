import fs from "node:fs";
import path from "node:path";

import {
  generateEpisodePromosClient,
  boundarySlicesDialogue,
  isSentenceFragment,
  parseScreenplayText,
  promosConflict,
  rankAllEpisodesGlobally,
} from "../node_modules/.cache/promoforge-audit/screenplayEngine.js";

const inputRoot = path.resolve(process.argv[2] || "test_drama");
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.toLowerCase().endsWith(".txt")) files.push(fullPath);
  }
}

walk(inputRoot);
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
const episodes = [];
const failures = [];
const candidates = [];

for (const file of files) {
  try {
    const episode = parseScreenplayText(
      fs.readFileSync(file, "utf8"),
      path.basename(file),
      "en",
    );
    episodes.push(episode);
    candidates.push(...generateEpisodePromosClient(episode, 20, 60, summary, 5));
  } catch (error) {
    failures.push({
      file: path.basename(file),
      line: error.lineNumber ?? null,
      error: error.message,
    });
  }
}
summary.candidates_accepted = candidates.length;

const episodesById = new Map(episodes.map((episode) => [episode.episode_id, episode]));
let invalidBoundaryCount = 0;
let fragmentStartCount = 0;
let evidenceMismatchCount = 0;
let overlapPairViolations = 0;
let dialogueSliceViolations = 0;
let continuationPairViolations = 0;

for (const candidate of candidates) {
  const episode = episodesById.get(candidate.episode);
  const eligible = episode.events.filter(
    (event) => event.type === "dialogue" || event.type === "action",
  );
  const segment = candidate.segments[0];
  const starts = eligible.filter((event) => event.start_ms === segment.start_ms);
  const ends = eligible.filter((event) => event.end_ms === segment.end_ms);
  if (starts.length === 0 || ends.length === 0) invalidBoundaryCount += 1;
  if (
    boundarySlicesDialogue(episode.events, segment.start_ms) ||
    boundarySlicesDialogue(episode.events, segment.end_ms)
  ) dialogueSliceViolations += 1;
  if (starts.some((event) => isSentenceFragment(event.text))) fragmentStartCount += 1;
  if (
    !starts.some((event) => event.text === candidate.hook_line) ||
    !ends.some((event) => event.text === candidate.cliffhanger_line)
  ) {
    evidenceMismatchCount += 1;
  }
}

const candidatesByEpisode = new Map();
for (const candidate of candidates) {
  const group = candidatesByEpisode.get(candidate.episode) || [];
  group.push(candidate);
  candidatesByEpisode.set(candidate.episode, group);
}
for (const group of candidatesByEpisode.values()) {
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      const first = group[left].segments[0];
      const second = group[right].segments[0];
      const overlap = Math.max(
        0,
        Math.min(first.end_ms, second.end_ms) - Math.max(first.start_ms, second.start_ms),
      );
      const shorter = Math.min(
        first.end_ms - first.start_ms,
        second.end_ms - second.start_ms,
      );
      if (overlap / shorter > 0.2) overlapPairViolations += 1;
      if (promosConflict(group[left], group[right]) && overlap / shorter <= 0.2) {
        continuationPairViolations += 1;
      }
    }
  }
}

const ranked = rankAllEpisodesGlobally(candidates, {
  mode: "series",
  varietyCap: 2,
  qualityThreshold: 70,
  topLimit: 25,
}).ranked;
const topEpisodeCounts = {};
for (const candidate of ranked) {
  topEpisodeCounts[candidate.episode] = (topEpisodeCounts[candidate.episode] || 0) + 1;
}
const durationViolations = candidates.filter(
  (candidate) => candidate.duration_seconds < 20 || candidate.duration_seconds > 60,
).length;
const result = {
  input_root: inputRoot,
  file_count: files.length,
  valid_count: episodes.length,
  failed_count: failures.length,
  total_events: episodes.reduce((total, episode) => total + episode.events.length, 0),
  raw_windows_examined: summary.candidates_generated,
  episode_shortlist_count: candidates.length,
  ranked_count: ranked.length,
  ranked_episode_counts: topEpisodeCounts,
  duration_violations: durationViolations,
  invalid_boundary_count: invalidBoundaryCount,
  dialogue_slice_violation_count: dialogueSliceViolations,
  fragment_start_count: fragmentStartCount,
  evidence_mismatch_count: evidenceMismatchCount,
  overlap_pair_violations: overlapPairViolations,
  continuation_pair_violations: continuationPairViolations,
  rejection_counts: summary,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (
  failures.length ||
  durationViolations ||
  invalidBoundaryCount ||
  dialogueSliceViolations ||
  fragmentStartCount ||
  evidenceMismatchCount ||
  overlapPairViolations ||
  continuationPairViolations ||
  ranked.length < 15 ||
  ranked.length > 25 ||
  Object.keys(topEpisodeCounts).length < 10 ||
  Object.values(topEpisodeCounts).some((count) => count > 2)
) {
  process.exitCode = 1;
}
