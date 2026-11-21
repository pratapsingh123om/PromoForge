import {
  generateEpisodePromosClient,
  parseScreenplayText,
  rankAllEpisodesGlobally,
  type PromoCandidateItem,
  type ParsedEpisode,
  type RunCheckSummary,
} from "./screenplayEngine";
import type { DemoRunRecord } from "./demoRun";
import {
  SAMPLE_EPISODE_1,
  SAMPLE_EPISODE_2,
  SAMPLE_SHOW_NAME,
} from "../data/sampleScreenplay";

export interface SeriesLibraryEntry {
  id: string;
  title: string;
  saved_at: string;
  episodes: ParsedEpisode[];
  promos: PromoCandidateItem[];
  why_top_3: string[];
  why_top_10: string[];
  candidates_by_episode: Record<string, PromoCandidateItem[]>;
  run_summary: RunCheckSummary;
  run_record: DemoRunRecord;
}

export const INVENTED_LIBRARY_ID = "invented-sample-library";

function createInventedLibraryEntry(): SeriesLibraryEntry {
  const episodes = [
    parseScreenplayText(SAMPLE_EPISODE_1, "SAMPLE_EP_001.txt", "en"),
    parseScreenplayText(SAMPLE_EPISODE_2, "SAMPLE_EP_002.txt", "en"),
  ];
  const summary: RunCheckSummary = {
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
  const candidates = episodes.flatMap((episode) =>
    generateEpisodePromosClient(episode, 20, 60, summary, 5),
  );
  const result = rankAllEpisodesGlobally(candidates, {
    mode: "series",
    varietyCap: 2,
    qualityThreshold: 0,
    topLimit: 25,
  });
  summary.candidates_accepted = result.ranked.length;
  const timestamp = "2026-11-21T00:00:00.000Z";
  const runRecord: DemoRunRecord = {
    run_id: INVENTED_LIBRARY_ID,
    status: "complete",
    created_at: timestamp,
    completed_at: timestamp,
    show_title: SAMPLE_SHOW_NAME,
    language: "en",
    target_audience: null,
    episode_count: episodes.length,
    mode: "series",
    why_top_10: result.whyTop10,
    candidates_evaluated_count: candidates.length,
    parameters: {
      min_duration_seconds: 20,
      max_duration_seconds: 60,
      variety_cap: 2,
      model_shortlist_limit: 70,
      model_candidates_scored: 0,
    },
    model: { provider: "fallback", model: "rule-based", base_url: null },
    usage: {
      model_calls: 0,
      input_tokens: null,
      output_tokens: null,
      estimated_cost: null,
      wall_time_seconds: 0,
    },
    stage_timings_ms: {},
    check_summary: summary,
    prompt_sha256: null,
    errors: [],
    raw_model_responses: [],
  };
  return {
    id: INVENTED_LIBRARY_ID,
    title: SAMPLE_SHOW_NAME,
    saved_at: timestamp,
    episodes,
    promos: result.ranked,
    why_top_3: result.whyTop3,
    why_top_10: result.whyTop10,
    candidates_by_episode: result.allCandidatesByEpisode,
    run_summary: summary,
    run_record: runRecord,
  };
}

export function loadSeriesLibrary(): SeriesLibraryEntry[] {
  const invented = createInventedLibraryEntry();
  try {
    const stored = JSON.parse(sessionStorage.getItem("pf-series-library") || "[]") as SeriesLibraryEntry[];
    // Rebuild the bundled invented run from current engine logic so a previous
    // session cannot preserve stale scores, reasoning, or display fields.
    return [invented, ...stored.filter((entry) => entry.id !== INVENTED_LIBRARY_ID)];
  } catch {
    return [invented];
  }
}

export function persistSeriesLibrary(entries: SeriesLibraryEntry[]): void {
  try {
    sessionStorage.setItem("pf-series-library", JSON.stringify(entries));
  } catch {
    // The active series remains available even when browser session quota is exhausted.
  }
}
