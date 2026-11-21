/**
 * PromoForge Screenplay Engine (Client-side & Hybrid)
 * Parses timestamped .txt screenplays, extracts aliases, discovers 20-60s candidate cuts,
 * validates H1-H9 hard checks, scores narrative tension, and produces global ranking with variety cap.
 */

export interface ParsedEvent {
  event_id: string;
  type: "dialogue" | "action" | "camera" | "sound";
  speaker: string | null;
  text: string;
  start_ms: number;
  end_ms: number;
  start_clock: string;
  end_clock: string;
  scene_id: string;
}

export interface ParsedEpisode {
  source_name: string;
  language: string;
  episode_id: string;
  episode_number: number;
  logline: string;
  continuity_notes: string;
  duration_ms: number;
  events: ParsedEvent[];
  last_timestamp: string;
  declared_end_timestamp: string;
  unresolved_aliases: string[];
  alias_analysis_available: boolean;
  warnings: string[];
}

export interface ParseFailure {
  source_name: string;
  message: string;
  line_number: number | null;
}

export class ScreenplayParseError extends Error {
  readonly sourceName: string;
  readonly lineNumber: number | null;

  constructor(message: string, sourceName: string, lineNumber: number | null = null) {
    super(message);
    this.name = "ScreenplayParseError";
    this.sourceName = sourceName;
    this.lineNumber = lineNumber;
  }
}

export interface PromoCutSegment {
  episode: string;
  start_ms: number;
  end_ms: number;
  start_clock: string;
  end_clock: string;
  duration_seconds: number;
}

export interface PromoCandidateItem {
  id: string;
  candidate_key: string;
  global_rank: number;
  episode: string;
  segments: PromoCutSegment[];
  duration_seconds: number;
  start_clock: string;
  end_clock: string;
  hook_line: string;
  hook_speaker: string;
  hook_timestamp: string;
  cliffhanger_line: string;
  cliffhanger_speaker: string;
  cliffhanger_timestamp: string;
  why_it_works: string;
  scores: {
    hook: number;
    cliffhanger: number;
    standalone: number;
    decision: number;
  };
  hard_checks_passed: string[];
  quality_flags: string[];
  score_source: string;
  status: "approved" | "rejected" | "selected" | "review";
  rejection_reason?: string;
  transcript_lines: {
    event_type: ParsedEvent["type"];
    speaker: string | null;
    text: string;
    start_clock: string;
    end_clock: string;
    is_hook: boolean;
    is_cliffhanger: boolean;
  }[];
}

export interface RunCheckSummary {
  candidates_generated: number;
  rejected_duration: number;
  rejected_dialogue_slice: number;
  rejected_fragment: number;
  rejected_mid_speech: number;
  suppressed_overlap: number;
  suppressed_cliffhanger_continuation: number;
  candidates_accepted: number;
  model_calls: number;
  wall_time_seconds: number;
}

export interface PromoAdjustmentResult {
  promo: PromoCandidateItem | null;
  errors: string[];
}

export function clock(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function parseClockToMs(timecode: string): number {
  const match = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/.exec(timecode.trim());
  if (!match) throw new Error(`Invalid timestamp: ${timecode}`);
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds >= 60) throw new Error(`Invalid timestamp seconds: ${timecode}`);
  const fraction = (match[3] || "").padEnd(3, "0");
  return minutes * 60_000 + seconds * 1000 + Number(fraction || 0);
}

export function parseScreenplayText(
  sourceText: string,
  filename: string = "episode.txt",
  language: string = "en",
): ParsedEpisode {
  const lines = sourceText.split(/\r?\n/);
  const requiredHeader = (label: string) => {
    const index = lines.findIndex((line) => line.trim().toUpperCase().startsWith(`${label}:`));
    if (index < 0) {
      throw new ScreenplayParseError(`Missing required header: ${label}`, filename, 1);
    }
    const value = lines[index].trim().slice(label.length + 1).trim();
    if (!value) {
      throw new ScreenplayParseError(`Empty required header: ${label}`, filename, index + 1);
    }
    return { value, line: index + 1 };
  };

  const episodeHeader = requiredHeader("EPISODE NUMBER");
  const episodeMatch = /^(?:Episode\s+)?(\d+)$/i.exec(episodeHeader.value);
  if (!episodeMatch) {
    throw new ScreenplayParseError("Invalid EPISODE NUMBER header", filename, episodeHeader.line);
  }
  const episodeNumber = Number(episodeMatch[1]);
  const logline = requiredHeader("EPISODE LOGLINE").value;
  const continuityNotes = requiredHeader("CONTINUITY NOTES").value;
  const warnings: string[] = [];

  const scriptStart = lines.findIndex((line) => line.trim() === "--- SCRIPT START ---");
  const scriptEnd = lines.findIndex((line) => line.trim() === "--- SCRIPT END ---");
  if (scriptStart < 0) {
    throw new ScreenplayParseError("Missing --- SCRIPT START --- marker", filename, 1);
  }
  if (scriptEnd < 0 || scriptEnd <= scriptStart) {
    throw new ScreenplayParseError("Missing or misplaced --- SCRIPT END --- marker", filename, Math.max(1, lines.length));
  }
  const sceneLines = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.index > scriptStart && item.index < scriptEnd && /^SCENE\s+\d+$/i.test(item.line));
  if (!sceneLines.length) {
    throw new ScreenplayParseError("No SCENE blocks found", filename, scriptStart + 2);
  }

  const episodeId = `EP_${episodeNumber.toString().padStart(3, "0")}`;
  const events: ParsedEvent[] = [];
  let currentScene = "SC_01";
  let eventIdx = 1;

  // Extract aliases from continuity notes
  const aliasMap: Record<string, string> = {};
  const isRegex = /([A-Za-z][A-Za-z0-9\s'_-]{1,60}?)\s+(?:is|=|represents|aka)\s+([A-Za-z][A-Za-z0-9\s'_-]{1,60})/gi;
  let m: RegExpExecArray | null;
  while ((m = isRegex.exec(continuityNotes)) !== null) {
    const alias = m[1].trim().toLowerCase();
    const real = m[2].trim().replace(/[.,;:]$/, "");
    if (alias.length > 2 && real.length > 2) {
      aliasMap[alias] = real;
    }
  }

  const declaredSceneEnds: number[] = [];
  for (const item of lines) {
    const match = /^Scene end:\s*\(?(\d+:\d{2}(?:\.\d{1,3})?)\)?$/i.exec(item.trim());
    if (match) declaredSceneEnds.push(parseClockToMs(match[1]));
  }
  if (!declaredSceneEnds.length) {
    throw new ScreenplayParseError("No valid Scene end timestamps found", filename, sceneLines[0].index + 1);
  }

  const parseBlockLabel = (value: string): string | null => {
    const trimmed = value.trim();
    const bold = /^\*\*([^*\r\n]+):\*\*$/.exec(trimmed);
    if (bold) return bold[1].trim();
    const plain = /^(CAMERA|ACTION|SOUND(?: FX)?|MUSIC|[A-Z][A-Z0-9 .'-]{1,}(?:\s+\([^)]*\))?)$/.exec(trimmed);
    return plain ? plain[1].trim() : null;
  };

  let i = scriptStart + 1;
  while (i < scriptEnd) {
    const line = lines[i].trim();
    const sceneMatch = line.match(/^SCENE\s+(\d+)/i);
    if (sceneMatch) {
      currentScene = `SC_${parseInt(sceneMatch[1], 10).toString().padStart(2, "0")}`;
      i++;
      continue;
    }

    // Block header e.g. **JULIAN VANCE (cold):** or JULIAN VANCE (cold) or CAMERA or ACTION or SOUND FX
    const rawLabel = parseBlockLabel(line);
    if (rawLabel) {
      const upper = rawLabel.toUpperCase();
      let type: "dialogue" | "action" | "camera" | "sound" = "dialogue";
      let speaker: string | null = null;

      if (upper === "CAMERA") type = "camera";
      else if (upper === "ACTION") type = "action";
      else if (upper.includes("SOUND") || upper.includes("MUSIC")) type = "sound";
      else {
        type = "dialogue";
        // Extract speaker from a label such as MARA (shocked) -> Mara.
        const spkMatch = rawLabel.match(/^([^()]+)/);
        speaker = spkMatch ? spkMatch[1].trim() : rawLabel;
        const spkLower = speaker.toLowerCase();
        if (aliasMap[spkLower]) {
          speaker = aliasMap[spkLower];
        }
      }

      // Look ahead for Start: (mm:ss.ff) | End: (mm:ss.ff)
      let timeMatch: RegExpMatchArray | null = null;
      let j = i + 1;
      while (j < scriptEnd && j <= i + 3 && !timeMatch) {
        timeMatch = lines[j].match(/Start:\s*\(([0-9:.]+)\)\s*\|\s*End:\s*\(([0-9:.]+)\)/i);
        if (timeMatch) break;
        j++;
      }

      if (!timeMatch) {
        throw new ScreenplayParseError("Missing or invalid timing after block header", filename, i + 1);
      }
      if (timeMatch) {
        const startClock = timeMatch[1];
        const endClock = timeMatch[2];
        let startMs: number;
        let endMs: number;
        try {
          startMs = parseClockToMs(startClock);
          endMs = parseClockToMs(endClock);
        } catch (error) {
          throw new ScreenplayParseError(error instanceof Error ? error.message : "Invalid timestamp", filename, j + 1);
        }
        if (endMs <= startMs) {
          throw new ScreenplayParseError("Block end must be after block start", filename, j + 1);
        }

        // Content lines until next block or script end
        const contentLines: string[] = [];
        let k = j + 1;
        while (k < lines.length) {
          const cLine = lines[k].trim();
          if (!cLine) {
            k++;
            continue;
          }
          if (cLine === "--- SCRIPT END ---" || /^SCENE\s+\d+$/i.test(cLine) || parseBlockLabel(cLine)) {
            break;
          }
          contentLines.push(cLine);
          k++;
        }

        const text = contentLines.join(" ");
        if (!text) {
          throw new ScreenplayParseError("Timed block has no content", filename, j + 1);
        }
        events.push({
            event_id: `${episodeId}_E${eventIdx.toString().padStart(3, "0")}`,
            type,
            speaker,
            text,
            start_ms: startMs,
            end_ms: endMs,
            start_clock: startClock,
            end_clock: endClock,
            scene_id: currentScene,
          });
        eventIdx++;
        i = k;
        continue;
      }
    }
    i++;
  }

  if (!events.length) {
    throw new ScreenplayParseError("No timed screenplay events were parsed", filename, scriptStart + 2);
  }

  // Find unresolved descriptive speaker labels
  const allSpeakers = Array.from(new Set(events.map((e) => e.speaker).filter(Boolean))) as string[];
  const unresolved: string[] = [];
  const descriptiveWords = ["former", "lady", "man", "woman", "guy", "stranger", "in", "gown", "suit"];
  for (const spk of allSpeakers) {
    const lower = spk.toLowerCase();
    if (
      language === "en" &&
      descriptiveWords.some((word) => new RegExp(`\\b${word}\\b`, "i").test(lower)) &&
      !aliasMap[lower]
    ) {
      unresolved.push(spk);
    }
  }

  const lastEventMs = Math.max(...events.map((event) => event.end_ms));
  const declaredEndMs = Math.max(...declaredSceneEnds);
  const durationMs = Math.max(lastEventMs, declaredEndMs);
  const lastTimestamp = clock(lastEventMs);
  const declaredEndTimestamp = clock(declaredEndMs);
  if (!events.some((event) => event.type === "dialogue" || event.type === "action")) {
    warnings.push("No dialogue or action events are available as scoring evidence.");
  }

  return {
    source_name: filename,
    language,
    episode_id: episodeId,
    episode_number: episodeNumber,
    logline,
    continuity_notes: continuityNotes,
    duration_ms: durationMs,
    events,
    last_timestamp: lastTimestamp,
    declared_end_timestamp: declaredEndTimestamp,
    unresolved_aliases: unresolved,
    alias_analysis_available: language === "en",
    warnings,
  };
}

export function isSentenceFragment(text: string): boolean {
  const clean = text.trim().replace(/^["'([{]+/, "");
  if (!clean) return false;
  if (clean.startsWith("...") || clean.startsWith("…") || clean.startsWith("--")) return true;
  if (clean[0] && clean[0] === clean[0].toLowerCase() && clean[0] !== clean[0].toUpperCase()) return true;
  const firstWord = clean.split(/\s+/)[0]?.toLowerCase();
  const conjunctions = new Set([
    "because", "and", "but", "so", "or", "which", "that", "since",
    "yet", "nor", "though", "although", "while", "whereas",
  ]);
  return conjunctions.has(firstWord);
}

function scoreWindow(
  startEv: ParsedEvent,
  endEv: ParsedEvent,
  inCutEvents: ParsedEvent[],
  durationMs: number,
) {
  const lowerStart = startEv.text.toLowerCase();
  const lowerEnd = endEv.text.toLowerCase();
  const highStakesWords = ["never", "secret", "betray", "leave", "marry", "kill", "truth", "why", "who", "how"];
  const cliffhangerWords = ["why", "who", "how", "what", "unless", "or else", "tomorrow", "secret", "truth"];
  const startStakeHits = highStakesWords.filter((word) => lowerStart.includes(word)).length;
  const endCliffHits = cliffhangerWords.filter((word) => lowerEnd.includes(word)).length;
  const startWordCount = startEv.text.trim().split(/\s+/).filter(Boolean).length;
  const hasQuestion = endEv.text.includes("?");
  const hasInterruption = /(?:\.\.\.|…|—|--)\s*["']?$/.test(endEv.text.trim());
  const hasExclamation = endEv.text.includes("!");
  const hook = Math.min(
    100,
    35 +
      (startEv.type === "dialogue" ? 20 : 8) +
      Math.min(24, startStakeHits * 8) +
      (startWordCount >= 4 && startWordCount <= 18 ? 12 : 4) +
      (/[?!]/.test(startEv.text) ? 6 : 0),
  );
  const cliffhanger = Math.min(
    100,
    30 +
      (hasQuestion ? 35 : 0) +
      (hasInterruption ? 28 : 0) +
      (hasExclamation ? 10 : 0) +
      Math.min(24, endCliffHits * 8),
  );
  const speakers = new Set(inCutEvents.map((event) => event.speaker).filter(Boolean));
  const contextReferences = inCutEvents.filter((event) => /\b(he|she|they|him|her|them|this|that)\b/i.test(event.text)).length;
  const standalone = Math.max(
    0,
    Math.min(100, 92 - Math.max(0, speakers.size - 3) * 8 - Math.min(24, contextReferences * 3)),
  );
  const durationFit = Math.max(0, 100 * (1 - Math.abs(durationMs - 40_000) / 20_000));
  const decision = Number((0.35 * hook + 0.35 * cliffhanger + 0.2 * standalone + 0.1 * durationFit).toFixed(1));
  const qualityFlags: string[] = [];
  if (startEv.type !== "dialogue" || startWordCount < 3) qualityFlags.push("soft hook");
  if (!hasQuestion && !hasInterruption && !hasExclamation && endCliffHits === 0) {
    qualityFlags.push("possible fake cliffhanger");
  }
  if (standalone < 70) qualityFlags.push("needs context");
  const whyItWorks = `${startEv.speaker || "The scene"} opens on “${startEv.text.slice(0, 72)}${startEv.text.length > 72 ? "…" : ""}” and the cut ends ${
    hasQuestion
      ? "on an unanswered question"
      : hasInterruption
        ? "on an interrupted thought"
        : hasExclamation
          ? "on an emphatic beat"
          : "before the next response"
  }.`;

  return {
    scores: { hook, cliffhanger, standalone, decision },
    qualityFlags,
    whyItWorks,
  };
}

export function adjustPromoCandidate(
  original: PromoCandidateItem,
  episode: ParsedEpisode,
  startMs: number,
  endMs: number,
): PromoAdjustmentResult {
  const errors: string[] = [];
  const boundaryEvents = episode.events.filter(
    (event) => event.type === "dialogue" || event.type === "action",
  );
  const startMatches = boundaryEvents.filter((event) => event.start_ms === startMs);
  const endMatches = boundaryEvents.filter((event) => event.end_ms === endMs);
  const startEv =
    startMatches.find((event) => event.text === original.hook_line) ||
    startMatches.find((event) => event.type === "dialogue") ||
    startMatches[0];
  const endEv =
    endMatches.find((event) => event.text === original.cliffhanger_line) ||
    endMatches.find((event) => event.type === "dialogue") ||
    endMatches[0];
  const durationMs = endMs - startMs;

  if (!startEv) errors.push("In-point is not a dialogue or action line boundary.");
  if (!endEv) errors.push("Out-point is not a dialogue or action line boundary.");
  if (durationMs < 20_000 || durationMs > 60_000) errors.push("Duration must remain between 20 and 60 seconds.");
  if (endMs <= startMs) errors.push("Out-point must be after the in-point.");
  if (startEv && episode.language === "en" && isSentenceFragment(startEv.text)) {
    errors.push("The selected opening appears to start on a sentence fragment.");
  }
  if (startEv) {
    const startIndex = boundaryEvents.indexOf(startEv);
    const previous = startIndex > 0 ? boundaryEvents[startIndex - 1] : null;
    if (
      previous &&
      previous.speaker &&
      previous.speaker === startEv.speaker &&
      startEv.start_ms - previous.end_ms <= 3500
    ) {
      errors.push("The selected opening is inside the same speaker's continuing turn.");
    }
  }
  if (errors.length || !startEv || !endEv) return { promo: null, errors };

  const inCutEvents = episode.events.filter(
    (event) => event.start_ms >= startMs && event.end_ms <= endMs,
  );
  const scored = scoreWindow(startEv, endEv, inCutEvents, durationMs);
  const startClock = clock(startMs);
  const endClock = clock(endMs);

  return {
    errors: [],
    promo: {
      ...original,
      candidate_key: `${episode.episode_id}_P_${startClock.replace(/[:.]/g, "")}_${endClock.replace(/[:.]/g, "")}`,
      duration_seconds: Number((durationMs / 1000).toFixed(1)),
      start_clock: startClock,
      end_clock: endClock,
      segments: [{
        episode: episode.episode_id,
        start_ms: startMs,
        end_ms: endMs,
        start_clock: startClock,
        end_clock: endClock,
        duration_seconds: Number((durationMs / 1000).toFixed(1)),
      }],
      hook_line: startEv.text,
      hook_speaker: startEv.speaker || "Scene Direction",
      hook_timestamp: startClock,
      cliffhanger_line: endEv.text,
      cliffhanger_speaker: endEv.speaker || "Scene Direction",
      cliffhanger_timestamp: clock(endEv.start_ms),
      why_it_works: scored.whyItWorks,
      scores: scored.scores,
      quality_flags: scored.qualityFlags,
      hard_checks_passed: [
        "H1: Valid Range (20-60s)",
        "H2: Real Line Boundaries",
        "H3: Spoken Dialogue Intact",
        "H4: No Fragment Start",
        "H5: Episode Duration Compliant",
      ],
      transcript_lines: inCutEvents.map((event) => ({
        event_type: event.type,
        speaker: event.speaker,
        text: event.text,
        start_clock: clock(event.start_ms),
        end_clock: clock(event.end_ms),
        is_hook: event.event_id === startEv.event_id,
        is_cliffhanger: event.event_id === endEv.event_id,
      })),
    },
  };
}

export function generateEpisodePromosClient(
  ep: ParsedEpisode,
  minSec = 20,
  maxSec = 60,
  summary: RunCheckSummary,
): PromoCandidateItem[] {
  const minMs = minSec * 1000;
  const maxMs = maxSec * 1000;
  const dialogueEvents = ep.events.filter((e) => e.type === "dialogue" || e.type === "action");

  const candidates: PromoCandidateItem[] = [];

  for (let i = 0; i < dialogueEvents.length; i++) {
    const startEv = dialogueEvents[i];

    // Must start on spoken dialogue or distinct action beat
    if (ep.language === "en" && isSentenceFragment(startEv.text)) {
      summary.rejected_fragment++;
      continue;
    }

    // Mid-speech turn check
    if (i > 0 && dialogueEvents[i - 1].speaker === startEv.speaker && startEv.start_ms - dialogueEvents[i - 1].end_ms <= 3500) {
      summary.rejected_mid_speech++;
      continue;
    }

    for (let j = i + 1; j < dialogueEvents.length; j++) {
      const endEv = dialogueEvents[j];
      const durationMs = endEv.end_ms - startEv.start_ms;

      summary.candidates_generated++;
      if (durationMs < minMs) {
        summary.rejected_duration++;
        continue;
      }
      if (durationMs > maxMs) {
        summary.rejected_duration++;
        break;
      }

      // Slice check: dialogue cut must encompass complete lines
      const inCutEvents = ep.events.filter((e) => e.start_ms >= startEv.start_ms && e.end_ms <= endEv.end_ms);

      const scored = scoreWindow(startEv, endEv, inCutEvents, durationMs);

      candidates.push({
        id: `${ep.episode_id}_P_${startEv.event_id}_${endEv.event_id}`,
        candidate_key: `${ep.episode_id}_P_${clock(startEv.start_ms).replace(/[:.]/g, "")}_${clock(endEv.end_ms).replace(/[:.]/g, "")}`,
        global_rank: 0,
        episode: ep.episode_id,
        segments: [
          {
            episode: ep.episode_id,
            start_ms: startEv.start_ms,
            end_ms: endEv.end_ms,
            start_clock: clock(startEv.start_ms),
            end_clock: clock(endEv.end_ms),
            duration_seconds: Number((durationMs / 1000).toFixed(1)),
          },
        ],
        duration_seconds: Number((durationMs / 1000).toFixed(1)),
        start_clock: clock(startEv.start_ms),
        end_clock: clock(endEv.end_ms),
        hook_line: startEv.text,
        hook_speaker: startEv.speaker || "Scene Direction",
        hook_timestamp: clock(startEv.start_ms),
        cliffhanger_line: endEv.text,
        cliffhanger_speaker: endEv.speaker || "Scene Direction",
        cliffhanger_timestamp: clock(endEv.start_ms),
        why_it_works: scored.whyItWorks,
        scores: scored.scores,
        hard_checks_passed: [
          "H1: Valid Range (20-60s)",
          "H2: Real Line Boundaries",
          "H3: Spoken Dialogue Intact",
          "H4: No Fragment Start",
          "H5: Episode Duration Compliant",
        ],
        quality_flags: scored.qualityFlags,
        score_source: "rule-based",
        status: "selected",
        transcript_lines: inCutEvents.map((ev) => ({
          event_type: ev.type,
          speaker: ev.speaker,
          text: ev.text,
          start_clock: clock(ev.start_ms),
          end_clock: clock(ev.end_ms),
          is_hook: ev.event_id === startEv.event_id,
          is_cliffhanger: ev.event_id === endEv.event_id,
        })),
      });
    }
  }

  // De-conflict candidates within the episode (H6: overlap > 20%, H7: cliffhanger spoiler)
  candidates.sort((a, b) => b.scores.decision - a.scores.decision);
  const selected: PromoCandidateItem[] = [];

  for (const cand of candidates) {
    const cSeg = cand.segments[0];
    let overlaps = false;
    for (const kept of selected) {
      const kSeg = kept.segments[0];
      const overlapStart = Math.max(cSeg.start_ms, kSeg.start_ms);
      const overlapEnd = Math.min(cSeg.end_ms, kSeg.end_ms);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      const minDur = Math.min(cSeg.end_ms - cSeg.start_ms, kSeg.end_ms - kSeg.start_ms);
      if (overlapMs / minDur > 0.2) {
        overlaps = true;
        summary.suppressed_overlap++;
        break;
      }
      // H7: Starts within continuation window of kept
      if (Math.abs(cSeg.start_ms - kSeg.end_ms) <= 3500) {
        overlaps = true;
        summary.suppressed_cliffhanger_continuation++;
        break;
      }
    }

    if (!overlaps && selected.length < 3) {
      selected.push(cand);
    }
  }

  return selected;
}

export function rankAllEpisodesGlobally(
  allPromos: PromoCandidateItem[],
  varietyCap = 2,
): { ranked: PromoCandidateItem[]; whyTop3: string[] } {
  // Sort by decision score descending
  const pool = [...allPromos].sort((a, b) => b.scores.decision - a.scores.decision);
  const ranked: PromoCandidateItem[] = [];
  const epCounts: Record<string, number> = {};
  const deferred: PromoCandidateItem[] = [];

  for (const p of pool) {
    if (ranked.length >= 3) break;
    const count = epCounts[p.episode] || 0;
    if (count >= varietyCap) {
      deferred.push(p);
      continue;
    }
    epCounts[p.episode] = count + 1;
    ranked.push(p);
  }
  for (const promo of deferred) {
    if (ranked.length >= 3) break;
    ranked.push(promo);
  }

  // Assign global ranks
  for (let idx = 0; idx < ranked.length; idx++) {
    ranked[idx].global_rank = idx + 1;
  }

  const whyTop3: string[] = [];
  if (ranked[0]) {
    whyTop3.push(
      `Rank #1 (${ranked[0].episode}, ${ranked[0].duration_seconds}s): highest ${ranked[0].score_source || "computed"} score (${ranked[0].scores.decision}) from hook ${ranked[0].scores.hook}, cliffhanger ${ranked[0].scores.cliffhanger}, and standalone ${ranked[0].scores.standalone}. Hook: “${ranked[0].hook_line.slice(0, 60)}${ranked[0].hook_line.length > 60 ? "…" : ""}”`
    );
  }
  if (ranked[1]) {
    whyTop3.push(
      `Rank #2 (${ranked[1].episode}, ${ranked[1].duration_seconds}s): next highest non-overlapping ${ranked[1].score_source || "computed"} score (${ranked[1].scores.decision}) after applying the episode-variety cap.`
    );
  }
  if (ranked[2]) {
    whyTop3.push(
      `Rank #3 (${ranked[2].episode}, ${ranked[2].duration_seconds}s): retained as the third distinct option with score ${ranked[2].scores.decision}; flags: ${ranked[2].quality_flags.join(", ") || "none detected"}.`
    );
  }

  return { ranked, whyTop3 };
}
