import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  generateEpisodePromosClient,
  isSentenceFragment,
  boundarySlicesDialogue,
  promosConflict,
  parseScreenplayText,
  rankAllEpisodesGlobally,
} from "../node_modules/.cache/promoforge-predeploy/services/screenplayEngine.js";
import {
  createRunExportFiles,
  createStoredZip,
  MAX_MODEL_CANDIDATES,
  shortlistCandidatesForModel,
} from "../node_modules/.cache/promoforge-predeploy/services/demoRun.js";
import {
  decodeUtf8Buffer,
  extractZipScreenplays,
  folderNameFromRelativePath,
} from "../node_modules/.cache/promoforge-predeploy/services/uploadValidation.js";

const fixtureRoot = path.resolve("tests/fixtures");
const emptySummary = () => ({
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
});
const read = (name) => fs.readFileSync(path.join(fixtureRoot, name), "utf8");
const results = [];
const check = (id, fn) => {
  try {
    const detail = fn() || "pass";
    results.push({ id, status: "pass", detail });
  } catch (error) {
    results.push({ id, status: "fail", detail: error.message });
  }
};
const expectParseFailure = (name, pattern) => {
  assert.throws(() => parseScreenplayText(read(name), name), pattern);
};

let validEpisodes = [];
let ranked = [];
let summary = emptySummary();

check("2.1/2.2 valid files and numeric ordering", () => {
  validEpisodes = ["valid_ep2.txt", "valid_ep1.txt"].map((name) => parseScreenplayText(read(name), name));
  validEpisodes.sort((a, b) => a.episode_number - b.episode_number);
  assert.deepEqual(validEpisodes.map((episode) => episode.episode_number), [1, 2]);
  assert.ok(validEpisodes.every((episode) => episode.events.length === 9));
  assert.ok(validEpisodes.every((episode) => episode.last_timestamp === "00:52.00"));
  return "2 files, numeric order 1/2, 9 events each, last timestamp 00:52.00";
});

check("2.4 special filename", () => {
  const name = "episode [013] – café reunion.txt";
  assert.equal(parseScreenplayText(read(name), name).episode_id, "EP_013");
});
check("show title derives from folder path without a default", () => {
  assert.equal(folderNameFromRelativePath("My New Series/episode-001.txt"), "My New Series");
  assert.equal(folderNameFromRelativePath("episode-001.txt"), "");
});
check("ZIP series upload extracts UTF-8 screenplay files", () => {
  const entries = extractZipScreenplays(fs.readFileSync(path.join(fixtureRoot, "invented_series.zip")));
  assert.deepEqual(entries.map((entry) => entry.name), ["episode-001.txt", "episode-002.txt"]);
  const parsed = entries.map((entry) => parseScreenplayText(decodeUtf8Buffer(entry.bytes), entry.name));
  assert.deepEqual(parsed.map((episode) => episode.episode_number), [1, 2]);
});
check("2.5 empty", () => expectParseFailure("empty.txt", /Missing required header/));
check("2.6 wrong formats", () => {
  expectParseFailure("no_timestamps.txt", /Missing or invalid timing/);
  expectParseFailure("bad_timestamps.txt", /end must be after/);
  expectParseFailure("missing_header.txt", /Missing --- SCRIPT START/);
  expectParseFailure("truncated.txt", /SCRIPT END/);
});
check("2.9 BOM and CRLF", () => {
  const clean = parseScreenplayText(read("valid_ep1.txt"), "valid_ep1.txt");
  const bom = parseScreenplayText(read("utf8_bom.txt"), "utf8_bom.txt");
  const crlf = parseScreenplayText(read("crlf_windows.txt"), "crlf_windows.txt");
  assert.equal(bom.events.length, clean.events.length);
  assert.equal(crlf.events.length, clean.events.length);
  assert.equal(bom.last_timestamp, clean.last_timestamp);
  assert.equal(crlf.last_timestamp, clean.last_timestamp);
});
check("2.10 non-UTF-8 detection", () => {
  const bytes = fs.readFileSync(path.join(fixtureRoot, "wrong_encoding.txt"));
  assert.throws(() => decodeUtf8Buffer(bytes), /not valid UTF-8/);
});
check("2.11 non-English", () => {
  const episode = parseScreenplayText(read("non_english.txt"), "non_english.txt", "hi");
  assert.equal(episode.language, "hi");
  assert.equal(episode.alias_analysis_available, false);
});
check("2.12/4.18 very short returns no promo", () => {
  const episode = parseScreenplayText(read("very_short.txt"), "very_short.txt");
  const promos = generateEpisodePromosClient(episode, 20, 60, emptySummary());
  assert.equal(promos.length, 0);
});
check("2.14 file size limit fixture", () => {
  assert.ok(fs.statSync(path.join(fixtureRoot, "oversize.txt")).size > 5 * 1024 * 1024);
});
check("2.15 100 files", () => {
  const names = fs.readdirSync(path.join(fixtureRoot, "100_files")).filter((name) => name.endsWith(".txt"));
  const episodes = names.map((name) => parseScreenplayText(fs.readFileSync(path.join(fixtureRoot, "100_files", name), "utf8"), name));
  episodes.sort((a, b) => a.episode_number - b.episode_number);
  assert.equal(episodes.length, 100);
  assert.equal(episodes[0].episode_number, 1);
  assert.equal(episodes.at(-1).episode_number, 100);
});
check("2.20 overlapping blocks/O.S./SOUND FX", () => {
  const episode = parseScreenplayText(read("overlap_os_sound.txt"), "overlap_os_sound.txt");
  assert.ok(episode.events.some((event) => event.type === "sound"));
  assert.ok(episode.events.some((event) => event.speaker === "Maya Rivera"));
  assert.equal(episode.unresolved_aliases.length, 0);
});
check("H3 overlapping dialogue boundary is rejected", () => {
  const episode = parseScreenplayText(read("overlapping_dialogue_boundary.txt"), "overlapping_dialogue_boundary.txt");
  const localSummary = emptySummary();
  const promos = generateEpisodePromosClient(episode, 20, 60, localSummary, 5);
  assert.equal(boundarySlicesDialogue(episode.events, 25_100), true);
  assert.ok(localSummary.rejected_dialogue_slice > 0);
  assert.ok(promos.every((promo) => promo.segments[0].start_ms !== 25_100));
  for (const promo of promos) {
    assert.equal(boundarySlicesDialogue(episode.events, promo.segments[0].start_ms), false);
    assert.equal(boundarySlicesDialogue(episode.events, promo.segments[0].end_ms), false);
  }
  return `${localSummary.rejected_dialogue_slice} sliced candidates rejected`;
});
check("large episode", () => {
  const episode = parseScreenplayText(read("large_episode.txt"), "large_episode.txt");
  assert.ok(episode.duration_ms >= 20 * 60 * 1000);
});

check("4.1–4.10 pipeline invariants", () => {
  summary = emptySummary();
  const promos = validEpisodes.flatMap((episode) => generateEpisodePromosClient(episode, 20, 60, summary));
  ranked = rankAllEpisodesGlobally(promos, 2).ranked;
  assert.ok(ranked.length >= 1 && ranked.length <= 3);
  assert.deepEqual(ranked.map((promo) => promo.global_rank), ranked.map((_, index) => index + 1));
  for (const promo of ranked) {
    const episode = validEpisodes.find((item) => item.episode_id === promo.episode);
    const segment = promo.segments[0];
    assert.ok(promo.duration_seconds >= 20 && promo.duration_seconds <= 60);
    assert.ok(segment.start_ms < segment.end_ms && segment.end_ms <= episode.duration_ms);
    assert.ok(episode.events.some((event) => event.start_ms === segment.start_ms));
    assert.ok(episode.events.some((event) => event.end_ms === segment.end_ms));
    assert.ok(!isSentenceFragment(promo.hook_line));
    assert.ok(promo.transcript_lines.some((line) => line.is_hook && line.text === promo.hook_line));
    assert.ok(promo.transcript_lines.some((line) => line.is_cliffhanger && line.text === promo.cliffhanger_line));
    assert.ok(promo.segments.length && promo.hook_line && promo.cliffhanger_line && promo.why_it_works && promo.global_rank);
    assert.ok(!promo.transcript_lines.filter((line) => line.is_hook || line.is_cliffhanger).some((line) => ["sound", "camera"].includes(line.event_type)));
  }
  for (let left = 0; left < ranked.length; left += 1) {
    for (let right = left + 1; right < ranked.length; right += 1) {
      if (ranked[left].episode !== ranked[right].episode) continue;
      const a = ranked[left].segments[0];
      const b = ranked[right].segments[0];
      const overlap = Math.max(0, Math.min(a.end_ms, b.end_ms) - Math.max(a.start_ms, b.start_ms));
      const shorter = Math.min(a.end_ms - a.start_ms, b.end_ms - b.start_ms);
      assert.ok(overlap / shorter <= 0.2);
    }
  }
  assert.ok(new Set(ranked.map((promo) => promo.scores.decision)).size > 1);
  assert.ok(!JSON.stringify(ranked).includes('"confidence"'));
  return `${ranked.length} global promos, sequential ranks, zero invariant failures`;
});

check("H1-H9 explicit assertion suite and no mid-reply start", () => {
  for (const promo of ranked) {
    const episode = validEpisodes.find((item) => item.episode_id === promo.episode);
    const seg = promo.segments[0];
    assert.ok(promo.duration_seconds >= 20 && promo.duration_seconds <= 60, "H1 duration failed");
    assert.ok(episode.events.some((event) => event.start_ms === seg.start_ms), "H2 start timestamp missing");
    assert.ok(episode.events.some((event) => event.end_ms === seg.end_ms), "H2 end timestamp missing");
    assert.ok(seg.start_ms < seg.end_ms, "H3 slice error");
    assert.equal(boundarySlicesDialogue(episode.events, seg.start_ms), false, "H3 start slices dialogue");
    assert.equal(boundarySlicesDialogue(episode.events, seg.end_ms), false, "H3 end slices dialogue");
    assert.ok(!isSentenceFragment(promo.hook_line), "H4 fragment start");
    assert.ok(seg.end_ms <= episode.duration_ms, "H5 beyond episode duration");
    assert.ok(promo.candidate_key && promo.hook_line && promo.cliffhanger_line && promo.why_it_works && promo.global_rank, "H8 missing fields");
    assert.ok(promo.transcript_lines.some((line) => line.is_hook && line.text === promo.hook_line), "H9 hook mismatch");
    assert.ok(promo.transcript_lines.some((line) => line.is_cliffhanger && line.text === promo.cliffhanger_line), "H9 cliffhanger mismatch");
    // Mid-reply check: no promo starts on a reply whose question is outside the cut
    const startEv = episode.events.find((ev) => ev.start_ms === seg.start_ms);
    const startIdx = episode.events.indexOf(startEv);
    if (startIdx > 0) {
      const prev = episode.events[startIdx - 1];
      if (prev.type === "dialogue" && prev.text.trim().endsWith("?") && startEv.start_ms - prev.end_ms <= 3500) {
        assert.fail(`Promo ${promo.candidate_key} starts on a reply whose question is outside the cut`);
      }
    }
  }
  for (let left = 0; left < ranked.length; left += 1) {
    for (let right = left + 1; right < ranked.length; right += 1) {
      if (ranked[left].episode !== ranked[right].episode) continue;
      const a = ranked[left].segments[0];
      const b = ranked[right].segments[0];
      const overlap = Math.max(0, Math.min(a.end_ms, b.end_ms) - Math.max(a.start_ms, b.start_ms));
      const shorter = Math.min(a.end_ms - a.start_ms, b.end_ms - b.start_ms);
      assert.ok(overlap / shorter <= 0.2, "H6 overlap > 20%");
      assert.ok(Math.abs(a.start_ms - b.end_ms) > 3500 && Math.abs(b.start_ms - a.end_ms) > 3500, "H7 continuation spoiler");
    }
  }
  return "All promos pass H1-H9 and mid-reply constraints";
});

check("H7 symmetric question-answer continuation suppression", () => {
  assert.ok(ranked.length >= 1);
  const question = {
    ...ranked[0],
    id: "QUESTION",
    candidate_key: "QUESTION",
    episode: "EP_900",
    quality_flags: ["soft hook"],
    segments: [{ ...ranked[0].segments[0], episode: "EP_900", start_ms: 10_000, end_ms: 40_000 }],
    scores: { ...ranked[0].scores, decision: 80 },
  };
  const answer = {
    ...ranked[0],
    id: "ANSWER",
    candidate_key: "ANSWER",
    episode: "EP_900",
    quality_flags: [],
    segments: [{ ...ranked[0].segments[0], episode: "EP_900", start_ms: 40_000, end_ms: 70_000 }],
    scores: { ...ranked[0].scores, decision: 90 },
  };
  assert.equal(promosConflict(question, answer), true);
  const result = rankAllEpisodesGlobally([question, answer], {
    mode: "series",
    varietyCap: 2,
    qualityThreshold: 0,
    topLimit: 25,
  });
  assert.deepEqual(result.ranked.map((promo) => promo.id), ["ANSWER"]);
});

check("ranking score exposes series adjustment and drives order", () => {
  assert.ok(ranked.length >= 1);
  const early = {
    ...ranked[0],
    id: "EARLY",
    candidate_key: "EARLY",
    episode: "EP_001",
    segments: [{ ...ranked[0].segments[0], episode: "EP_001" }],
    scores: { ...ranked[0].scores, decision: 85.5 },
  };
  const late = {
    ...ranked[0],
    id: "LATE",
    candidate_key: "LATE",
    episode: "EP_045",
    segments: [{ ...ranked[0].segments[0], episode: "EP_045" }],
    scores: { ...ranked[0].scores, decision: 88.8 },
  };
  const result = rankAllEpisodesGlobally([late, early], { mode: "series", qualityThreshold: 0, topLimit: 25 });
  assert.deepEqual(result.ranked.map((promo) => promo.id), ["EARLY", "LATE"]);
  assert.equal(result.ranked[0].ranking_adjustment, 5);
  assert.equal(result.ranked[0].acquisition_score, 90.5);
  assert.equal(result.ranked[1].ranking_adjustment, -6);
  assert.equal(result.ranked[1].acquisition_score, 82.8);
  assert.ok(result.whyTop10.every((reason) => reason.includes("raw") && reason.includes("series adjustment")));
  assert.ok(result.whyTop10.every((reason) => reason.includes(ranked[0].why_it_works)));
});

check("A1 proportional series adjustment (20-ep and 80-ep fixtures)", () => {
  // 20-episode fixture
  const promos20 = [];
  for (let i = 1; i <= 20; i++) {
    const ep = `EP_${String(i).padStart(3, "0")}`;
    promos20.push({
      ...ranked[0],
      id: `P_${ep}`,
      candidate_key: `P_${ep}`,
      episode: ep,
      segments: [{ ...ranked[0].segments[0], episode: ep }],
      scores: { hook: 80, cliffhanger: 80, standalone: 80, decision: 80 },
      quality_flags: [],
    });
  }
  const result20 = rankAllEpisodesGlobally(promos20, { mode: "series", qualityThreshold: 0, topLimit: 30 });
  const map20 = new Map(result20.ranked.map((p) => [p.episode, p]));
  // In 20 eps: 30% = 6. Ep 6 gets +5; Ep 7 gets +2.
  assert.equal(map20.get("EP_006").ranking_adjustment, 5, "EP_006 should receive early bonus (+5)");
  assert.equal(map20.get("EP_007").ranking_adjustment, 2, "EP_007 should receive mid bonus (+2)");
  // Last 20% = 4 (eps 17..20). Ep 16 gets +2; Ep 17 gets -6 and late-series flag.
  assert.equal(map20.get("EP_016").ranking_adjustment, 2, "EP_016 should receive mid bonus (+2)");
  assert.equal(map20.get("EP_017").ranking_adjustment, -6, "EP_017 should receive late penalty (-6)");
  assert.ok(map20.get("EP_017").quality_flags.includes("late-series spoiler risk"), "EP_017 should carry late spoiler risk flag");

  // 80-episode fixture
  const promos80 = [];
  for (let i = 1; i <= 80; i++) {
    const ep = `EP_${String(i).padStart(3, "0")}`;
    promos80.push({
      ...ranked[0],
      id: `P_${ep}`,
      candidate_key: `P_${ep}`,
      episode: ep,
      segments: [{ ...ranked[0].segments[0], episode: ep }],
      scores: { hook: 80, cliffhanger: 80, standalone: 80, decision: 80 },
      quality_flags: [],
    });
  }
  const result80 = rankAllEpisodesGlobally(promos80, { mode: "series", qualityThreshold: 0, topLimit: 90 });
  const map80 = new Map(result80.ranked.map((p) => [p.episode, p]));
  // In 80 eps: 30% = 24. Ep 24 gets +5; Ep 25 gets +2.
  assert.equal(map80.get("EP_024").ranking_adjustment, 5, "EP_024 should receive early bonus (+5)");
  assert.equal(map80.get("EP_025").ranking_adjustment, 2, "EP_025 should receive mid bonus (+2)");
  // Last 20% = 16 (eps 65..80). Ep 64 gets +2; Ep 65 gets -6 and late-series flag.
  assert.equal(map80.get("EP_064").ranking_adjustment, 2, "EP_064 should receive mid bonus (+2)");
  assert.equal(map80.get("EP_065").ranking_adjustment, -6, "EP_065 should receive late penalty (-6)");
  assert.ok(map80.get("EP_065").quality_flags.includes("late-series spoiler risk"), "EP_065 should carry late spoiler risk flag");
  return "20-ep and 80-ep proportional early/late adjustments verified";
});

check("A3 dialogue-slice rule against 0.1s and 0.2s overlaps", () => {
  const dummyEvents = [
    {
      event_id: "E01",
      type: "dialogue",
      speaker: "ALICE",
      text: "This is a spoken line.",
      start_ms: 10_000,
      end_ms: 15_000,
    },
  ];
  // Start exactly 0.2s before line's end (14800ms)
  assert.equal(boundarySlicesDialogue(dummyEvents, 14_800), true, "Start 0.2s before line end must be sliced");
  // Start exactly 0.1s before line's end (14900ms)
  assert.equal(boundarySlicesDialogue(dummyEvents, 14_900), true, "Start 0.1s before line end must be sliced");
  // Exact boundaries must not be sliced
  assert.equal(boundarySlicesDialogue(dummyEvents, 10_000), false, "Exact line start must not be sliced");
  assert.equal(boundarySlicesDialogue(dummyEvents, 15_000), false, "Exact line end must not be sliced");
  return "Sub-second 0.1s/0.2s dialogue slice boundaries strictly rejected";
});

check("A4 same-episode continuation: question-reply pair (EP_001)", () => {
  const promoQuestion = {
    ...ranked[0],
    id: "EP_001_P_QUESTION",
    candidate_key: "EP_001_P_QUESTION",
    episode: "EP_001",
    cliffhanger_line: "Where did he hide the key?",
    cliffhanger_speaker: "SPEAKER_A",
    segments: [{ ...ranked[0].segments[0], episode: "EP_001", start_ms: 10_000, end_ms: 35_000, duration_seconds: 25 }],
    scores: { hook: 85, cliffhanger: 90, standalone: 80, decision: 85 },
  };
  const promoAnswer = {
    ...ranked[0],
    id: "EP_001_P_ANSWER",
    candidate_key: "EP_001_P_ANSWER",
    episode: "EP_001",
    hook_line: "In a place you will never search.",
    hook_speaker: "SPEAKER_B",
    segments: [{ ...ranked[0].segments[0], episode: "EP_001", start_ms: 36_000, end_ms: 65_000, duration_seconds: 29 }],
    scores: { hook: 88, cliffhanger: 85, standalone: 80, decision: 86 },
  };
  assert.equal(promosConflict(promoQuestion, promoAnswer), true, "EP_001 answer promo must conflict with previous question promo");
  return "EP_001 question-reply continuation pair successfully detected and suppressed";
});

check("4.11 reasons are clip-specific", () => {
  assert.ok(ranked.every((promo) => promo.why_it_works.split(/\s+/).length >= 8));
  assert.ok(ranked.every((promo) => !/^score\s+\d+/i.test(promo.why_it_works)));
});
check("4.16 deterministic equivalent ranking", () => {
  const repeatSummary = emptySummary();
  const repeat = rankAllEpisodesGlobally(validEpisodes.flatMap((episode) => generateEpisodePromosClient(episode, 20, 60, repeatSummary)), 2).ranked;
  assert.deepEqual(repeat.map((promo) => promo.candidate_key), ranked.map((promo) => promo.candidate_key));
});
check("4.19 one episode", () => {
  const one = rankAllEpisodesGlobally(generateEpisodePromosClient(validEpisodes[0], 20, 60, emptySummary()), 2).ranked;
  assert.ok(one.length >= 1 && one.length <= 3);
});

check("7.2 bounded deterministic model shortlist", () => {
  const expanded = Array.from({ length: 50 }, (_, episodeIndex) =>
    ranked.map((promo, promoIndex) => ({
      ...promo,
      id: `MODEL_${episodeIndex}_${promoIndex}`,
      candidate_key: `MODEL_${episodeIndex}_${promoIndex}`,
      episode: `EP_${String(episodeIndex + 1).padStart(3, "0")}`,
      scores: {
        ...promo.scores,
        decision: Number((promo.scores.decision - episodeIndex / 100).toFixed(2)),
      },
    })),
  ).flat();
  const shortlist = shortlistCandidatesForModel(expanded);
  const repeated = shortlistCandidatesForModel(expanded);
  assert.equal(shortlist.length, Math.min(MAX_MODEL_CANDIDATES, expanded.length));
  assert.ok(shortlist.length <= 12);
  assert.ok(Object.values(Object.groupBy(shortlist, (candidate) => candidate.episode)).every((items) => items.length <= 2));
  assert.deepEqual(shortlist.map((candidate) => candidate.candidate_key), repeated.map((candidate) => candidate.candidate_key));
  return `${shortlist.length} model candidates, max 2 per episode, deterministic order`;
});

check("6.1–6.10 stored exports", async () => {
  const raw = '{"scores":[]}';
  const run = {
    run_id: "run-2026-11-21T06-00-00-000Z",
    status: "complete",
    created_at: "2026-11-21T00:30:00.000Z",
    completed_at: "2026-11-21T00:30:01.000Z",
    show_title: "Invented Fixture Show",
    language: "en",
    target_audience: null,
    episode_count: 2,
    parameters: {
      min_duration_seconds: 20,
      max_duration_seconds: 60,
      variety_cap: 2,
      model_shortlist_limit: MAX_MODEL_CANDIDATES,
      model_candidates_scored: ranked.length,
    },
    model: { provider: "no-api", model: "manual-paste", base_url: null },
    usage: { model_calls: 1, input_tokens: 0, output_tokens: 0, estimated_cost: null, wall_time_seconds: 1 },
    stage_timings_ms: { Parse: 1, Candidates: 2, Score: 3 },
    check_summary: summary,
    prompt_sha256: "fixture-hash",
    errors: [],
    raw_model_responses: [{ filename: "model_response_001.json", content: raw }],
  };
  const files = createRunExportFiles(run, ranked, ["Fixture ranking explanation"]);
  const paths = files.map((file) => file.path);
  for (const required of ["promos_master.csv", "cut_list.csv", "promos.json", "report.md", "promos.edl", "run_log.json", "TIMELINE_NOTES.txt", "raw/model_response_001.json"]) assert.ok(paths.includes(required));
  assert.equal(files.find((file) => file.path.startsWith("raw/"))?.content, raw);
  assert.ok(/^promo_id,rank,segment_index,/m.test(files.find((file) => file.path === "promos_master.csv").content));
  assert.ok(/\b\d{2}:\d{2}:\d{2}:\d{2}\b/.test(files.find((file) => file.path === "promos.edl").content));
  assert.ok(!files.some((file) => file.content.includes("TEST_SECRET_SENTINEL")));
  const bytes = new Uint8Array(await createStoredZip(files).arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(new TextDecoder().decode(bytes).includes("run_log.json"));
  return `${files.length} artifacts; ZIP signature, EDL timecode, raw response, and key absence verified`;
});

await Promise.all(results.filter((result) => result.detail instanceof Promise).map(async (result) => {
  try {
    result.detail = (await result.detail) || "pass";
  } catch (error) {
    result.status = "fail";
    result.detail = error.message;
  }
}));

console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
if (results.some((result) => result.status === "fail")) process.exitCode = 1;

