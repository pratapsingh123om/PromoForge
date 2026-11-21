import type { PromoCandidateItem, RunCheckSummary } from "./screenplayEngine";
import { PRODUCT_NAME } from "../config.js";

export const MAX_MODEL_CANDIDATES = 12;

export function shortlistCandidatesForModel(
  candidates: PromoCandidateItem[],
  limit = MAX_MODEL_CANDIDATES,
  perEpisodeLimit = 2,
): PromoCandidateItem[] {
  if (limit <= 0 || perEpisodeLimit <= 0) return [];
  const episodeCounts = new Map<string, number>();
  return [...candidates]
    .sort((left, right) => {
      const scoreDifference = right.scores.decision - left.scores.decision;
      if (scoreDifference !== 0) return scoreDifference;
      const episodeDifference = left.episode.localeCompare(right.episode, undefined, {
        numeric: true,
      });
      if (episodeDifference !== 0) return episodeDifference;
      return left.candidate_key.localeCompare(right.candidate_key);
    })
    .filter((candidate) => {
      const count = episodeCounts.get(candidate.episode) ?? 0;
      if (count >= perEpisodeLimit) return false;
      episodeCounts.set(candidate.episode, count + 1);
      return true;
    })
    .slice(0, limit);
}

export interface DemoRunRecord {
  run_id: string;
  status: "complete" | "cancelled" | "partial_model_failure";
  created_at: string;
  completed_at: string;
  show_title: string;
  language: string;
  target_audience: string | null;
  episode_count: number;
  parameters: {
    min_duration_seconds: number;
    max_duration_seconds: number;
    variety_cap: number;
    model_shortlist_limit: number;
    model_candidates_scored: number;
  };
  model: {
    provider: string;
    model: string;
    base_url: string | null;
  };
  usage: {
    model_calls: number;
    input_tokens: number | null;
    output_tokens: number | null;
    estimated_cost: number | null;
    wall_time_seconds: number;
  };
  stage_timings_ms: Record<string, number>;
  check_summary: RunCheckSummary;
  prompt_sha256: string | null;
  errors: string[];
  raw_model_responses: Array<{
    filename: string;
    content: string;
  }>;
}

export interface RunExportFile {
  path: string;
  content: string;
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function screenplayClockToEdl(clock: string, fps = 30): string {
  const match = /^(\d+):(\d{2})\.(\d{1,3})$/.exec(clock);
  if (!match) throw new Error(`Invalid screenplay timestamp for EDL export: ${clock}`);
  const totalMinutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = Number(`0.${match[3]}`);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const frames = Math.min(fps - 1, Math.floor(fraction * fps));
  return [hours, minutes, seconds, frames]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function createRunExportFiles(
  run: DemoRunRecord,
  promos: PromoCandidateItem[],
  whyTop3: string[],
): RunExportFile[] {
  const masterHeader = [
    "promo_id",
    "rank",
    "segment_index",
    "episode",
    "start",
    "end",
    "duration_seconds",
    "hook_line",
    "cliffhanger_line",
    "why",
    "flags",
    "score_source",
    "status",
  ].join(",");
  const masterRows = promos.flatMap((promo) =>
    promo.segments.map((segment, index) =>
      [
        promo.candidate_key,
        promo.global_rank,
        index + 1,
        segment.episode,
        segment.start_clock,
        segment.end_clock,
        segment.duration_seconds,
        promo.hook_line,
        promo.cliffhanger_line,
        promo.why_it_works,
        promo.quality_flags.join(" | "),
        promo.score_source || "unknown",
        promo.status,
      ].map(csvCell).join(","),
    ),
  );
  const cutHeader = "promo_id,segment_index,episode,in_time,out_time,duration_seconds";
  const cutRows = promos.flatMap((promo) =>
    promo.segments.map((segment, index) =>
      [
        promo.candidate_key,
        index + 1,
        segment.episode,
        segment.start_clock,
        segment.end_clock,
        segment.duration_seconds,
      ].map(csvCell).join(","),
    ),
  );

  let report = `# ${PRODUCT_NAME} editorial production report\n\n`;
  report += `**Run:** ${run.run_id}  \n**Series:** ${run.show_title}  \n`;
  report += `**Scorer:** ${run.model.provider} / ${run.model.model}  \n`;
  report += `**Status:** ${run.status}  \n\n## Why this ranking\n\n`;
  whyTop3.forEach((reason) => { report += `- ${reason}\n`; });
  report += "\n## Ranked promos\n\n";
  promos.forEach((promo) => {
    report += `### #${promo.global_rank} ${promo.candidate_key}\n\n`;
    report += `- Window: ${promo.start_clock}–${promo.end_clock} (${promo.duration_seconds}s)\n`;
    report += `- Hook: ${promo.hook_speaker}: “${promo.hook_line}”\n`;
    report += `- Cliffhanger: ${promo.cliffhanger_speaker}: “${promo.cliffhanger_line}”\n`;
    report += `- Why: ${promo.why_it_works}\n- Flags: ${promo.quality_flags.join(", ") || "none"}\n\n`;
  });

  let edl = `TITLE: ${PRODUCT_NAME.toUpperCase()}_${run.run_id}\nFCM: NON-DROP FRAME\n\n`;
  let eventIndex = 1;
  promos.forEach((promo) => {
    promo.segments.forEach((segment) => {
      const start = screenplayClockToEdl(segment.start_clock);
      const end = screenplayClockToEdl(segment.end_clock);
      edl += `${String(eventIndex).padStart(3, "0")}  AX       V     C        ${start} ${end} ${start} ${end}\n`;
      edl += `* SCREENPLAY-ONLY PLAN: ${promo.candidate_key} (${segment.episode})\n\n`;
      eventIndex += 1;
    });
  });

  const fullOutput = {
    product: PRODUCT_NAME,
    run,
    why_top_3_ranking: whyTop3,
    promos,
  };
  const files: RunExportFile[] = [
    { path: "promos_master.csv", content: `${masterHeader}\n${masterRows.join("\n")}\n` },
    { path: "cut_list.csv", content: `${cutHeader}\n${cutRows.join("\n")}\n` },
    { path: "promos.json", content: JSON.stringify(fullOutput, null, 2) },
    { path: "report.md", content: report },
    { path: "promos.edl", content: edl },
    { path: "run_log.json", content: JSON.stringify(run, null, 2) },
    {
      path: "TIMELINE_NOTES.txt",
      content: "Screenplay-only cut plan. The source pack contains no video or audio, so this EDL has not been conformed against production footage.\n",
    },
  ];
  if (run.raw_model_responses.length === 0) {
    files.push({
      path: "raw/README.txt",
      content: "No model was called for this rule-only run, so there is no raw model response.\n",
    });
  } else {
    run.raw_model_responses.forEach((raw) => {
      files.push({ path: `raw/${raw.filename}`, content: raw.content });
    });
  }
  return files;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

export function createStoredZip(files: RunExportFile[]): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const now = dosDateTime(new Date());
  let localOffset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.path.replace(/\\/g, "/"));
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, now.time, true);
    localView.setUint16(12, now.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, now.time, true);
    centralView.setUint16(14, now.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralChunks.push(central);
    localOffset += local.length;
  });

  const locals = concatBytes(localChunks);
  const central = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, locals.length, true);
  endView.setUint16(20, 0, true);
  const archive = concatBytes([locals, central, end]);
  const blobBuffer = new ArrayBuffer(archive.length);
  new Uint8Array(blobBuffer).set(archive);
  return new Blob([blobBuffer], { type: "application/zip" });
}
