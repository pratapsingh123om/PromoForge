import React from "react";
import {
  Clock3,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Coins,
  Timer,
  Users,
  MessagesSquare,
  Clapperboard,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ParsedEpisode } from "../services/screenplayEngine";

export interface EpisodeProgressState {
  episode_id: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string;
  candidates_found: number;
  error?: string;
}

interface View2Props {
  episodes: ParsedEpisode[];
  progressStates: Record<string, EpisodeProgressState>;
  currentStageIndex: number;
  stages: string[];
  elapsedSeconds: number;
  modelCallsCount: number;
  tokenCount: number;
  isRunning: boolean;
  wasCancelled: boolean;
  awaitingManualScore: boolean;
  onCancel: () => void;
  onViewRanked: () => void;
}

interface CharacterProfile {
  name: string;
  initials: string;
  dialogueLines: number;
  episodeCount: number;
  episodeIds: string[];
  spokenMs: number;
}

export const CHARACTER_PALETTES = [
  ["#f59e0b", "#ef4444", "#451a03"],
  ["#8b5cf6", "#ec4899", "#2e1065"],
  ["#06b6d4", "#3b82f6", "#082f49"],
  ["#10b981", "#14b8a6", "#052e16"],
  ["#f97316", "#eab308", "#431407"],
  ["#6366f1", "#a855f7", "#1e1b4b"],
  ["#e11d48", "#f97316", "#4c0519"],
  ["#84cc16", "#22c55e", "#1a2e05"],
] as const;

export function characterSeed(name: string) {
  return Array.from(name).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
}

export function characterInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CharacterAvatar({ name, size = "large" }: { name: string; size?: "small" | "large" }) {
  const seed = characterSeed(name);
  const palette = CHARACTER_PALETTES[seed % CHARACTER_PALETTES.length];
  const angle = 115 + (seed % 85);
  const accentPosition = 18 + (seed % 58);
  const dimension = size === "large" ? "h-16 w-16" : "h-10 w-10";

  return (
    <div
      className={`${dimension} relative shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-lg`}
      style={{
        background: `linear-gradient(${angle}deg, ${palette[2]} 0%, ${palette[0]} 52%, ${palette[1]} 100%)`,
        boxShadow: `0 16px 35px ${palette[0]}22`,
      }}
      aria-label={`${name} generated avatar`}
    >
      <div
        className="absolute h-14 w-14 rounded-full border border-white/20 bg-white/10 blur-[0.2px]"
        style={{ left: `${accentPosition - 28}%`, top: "-42%" }}
      />
      <div
        className="absolute -bottom-5 -right-4 h-12 w-12 rotate-45 border border-white/15 bg-black/20"
      />
      <div className="absolute inset-0 flex items-center justify-center font-black tracking-tight text-white drop-shadow-md">
        <span className={size === "large" ? "text-xl" : "text-sm"}>{characterInitials(name)}</span>
      </div>
      <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-white/70" />
    </div>
  );
}

export function View2Progress({
  episodes,
  progressStates,
  currentStageIndex,
  stages,
  elapsedSeconds,
  modelCallsCount,
  tokenCount,
  isRunning,
  wasCancelled,
  awaitingManualScore,
  onCancel,
  onViewRanked,
}: View2Props) {
  const [showAllCharacters, setShowAllCharacters] = React.useState(false);
  const completedCount = Object.values(progressStates).filter(
    (s) => s.status === "done"
  ).length;
  const totalCandidatesDiscovered = Object.values(progressStates).reduce(
    (sum, s) => sum + (s.candidates_found || 0),
    0
  );
  const progressPercent =
    episodes.length > 0
      ? Math.round((completedCount / episodes.length) * 100)
      : 100;
  const discoveredCharacters = React.useMemo<CharacterProfile[]>(() => {
    const hasStarted = Object.values(progressStates).some((state) => state.status !== "queued");
    const visibleEpisodes = episodes.filter((episode) => {
      const state = progressStates[episode.episode_id];
      return !isRunning || !hasStarted || state?.status === "running" || state?.status === "done";
    });
    const profiles = new Map<string, Omit<CharacterProfile, "initials" | "episodeCount" | "episodeIds"> & { episodes: Set<string> }>();

    visibleEpisodes.forEach((episode) => {
      episode.events.forEach((event) => {
        if (event.type !== "dialogue" || !event.speaker?.trim()) return;
        const name = event.speaker.trim().replace(/\s+/g, " ");
        const key = name.toLocaleUpperCase();
        const current = profiles.get(key) || {
          name,
          dialogueLines: 0,
          spokenMs: 0,
          episodes: new Set<string>(),
        };
        current.dialogueLines += 1;
        current.spokenMs += Math.max(0, event.end_ms - event.start_ms);
        current.episodes.add(episode.episode_id);
        profiles.set(key, current);
      });
    });

    return Array.from(profiles.values())
      .map((profile) => ({
        name: profile.name,
        initials: characterInitials(profile.name),
        dialogueLines: profile.dialogueLines,
        spokenMs: profile.spokenMs,
        episodeCount: profile.episodes.size,
        episodeIds: Array.from(profile.episodes).sort(),
      }))
      .sort((left, right) => right.dialogueLines - left.dialogueLines || left.name.localeCompare(right.name));
  }, [episodes, progressStates, isRunning]);
  const visibleCharacters = showAllCharacters ? discoveredCharacters : discoveredCharacters.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Cpu size={12} />
                View 2: Pipeline Execution & Stage Telemetry
              </div>
              {episodes.length > 1 ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Series Mode ({episodes.length} Episodes)
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  Episode Mode (1 Episode)
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {isRunning ? (
                <>
                  <LoaderCircle className="animate-spin text-amber-400" size={20} />
                  Running Discovery Pipeline…
                </>
              ) : awaitingManualScore ? (
                <>
                  <AlertCircle className="text-blue-400" size={20} />
                  Waiting for No-API JSON
                </>
              ) : wasCancelled ? (
                <>
                  <AlertCircle className="text-amber-400" size={20} />
                  Run Cancelled — Partial Results Retained
                </>
              ) : (
                <>
                  <CheckCircle2 className="text-emerald-400" size={20} />
                  Pipeline Complete
                </>
              )}
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              {awaitingManualScore
                ? "Candidate generation is complete. The run will continue only after the pasted model JSON passes schema and candidate-ID validation."
                : wasCancelled
                ? "Processing stopped at the requested checkpoint. Any candidates already computed remain available."
                : episodes.length > 1
                ? `Series mode: Processing ${episodes.length} episodes through candidate discovery (~${episodes.length * 5} cuts), series alias resolution, model scoring shortlist, and global quality ranking.`
                : `Episode mode: Processing ${episodes.length} episode through candidate discovery, checks, and ranking.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isRunning ? (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-red-400 text-xs font-medium border border-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <XCircle size={15} />
                Cancel Run (Keep Partials)
              </button>
            ) : (
              <button
                type="button"
                onClick={onViewRanked}
                className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <span>View Ranked Promos</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-neutral-800/80">
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/60">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Timer size={13} className="text-amber-400" />
              <span>Elapsed Time</span>
            </div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {elapsedSeconds.toFixed(1)}s
            </div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/60">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Cpu size={13} className="text-purple-400" />
              <span>Model Calls</span>
            </div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {modelCallsCount}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/60">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Coins size={13} className="text-emerald-400" />
              <span>Tokens / Cost</span>
            </div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {modelCallsCount === 0
                ? "$0.00 (no model call)"
                : `${tokenCount || "N/A"} tok · cost N/A`}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/60">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <ShieldCheck size={13} className="text-blue-400" />
              <span>Episodes / Cuts Found</span>
            </div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {completedCount}/{episodes.length} <span className="text-xs text-neutral-400 font-normal">({totalCandidatesDiscovered} cuts)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Flow Indicator */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Pipeline Stages (DEMO.md Section 3)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {stages.map((stg, idx) => {
            const isDone = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex && isRunning;
            return (
              <div
                key={stg}
                className={`p-3 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                  isDone
                    ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                    : isCurrent
                      ? "bg-amber-950/30 border-amber-500/60 text-amber-200 animate-pulse"
                      : "bg-neutral-950 border-neutral-800 text-neutral-500"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-neutral-500">
                    0{idx + 1}
                  </span>
                  {isDone ? (
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  ) : isCurrent ? (
                    <LoaderCircle size={13} className="animate-spin text-amber-400" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-neutral-800" />
                  )}
                </div>
                <div className="font-semibold">{stg}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Episode Status Grid */}
      <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-800 bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-transparent p-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              <Users size={14} />
              Character intelligence
            </div>
            <h3 className="text-lg font-semibold text-white">Cast discovered from the screenplay</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">
              Profiles appear as episodes are processed. Visual identities are generated locally from each canonical character name, so they stay distinct and consistent without invented headshots.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-right">
            <div className="text-xl font-bold text-white">{discoveredCharacters.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">characters found</div>
          </div>
        </div>

        {visibleCharacters.length > 0 ? (
          <div className="p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleCharacters.map((character, index) => {
                const role = index < 2
                  ? "Lead voice"
                  : character.episodeCount > 1
                    ? "Recurring"
                    : "Supporting";
                return (
                  <article
                    key={character.name}
                    className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-xl"
                  >
                    <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-white/[0.025] transition-transform group-hover:scale-125" />
                    <div className="relative flex items-start gap-3">
                      <CharacterAvatar name={character.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white" title={character.name}>
                          {character.name}
                        </div>
                        <div className="mt-1 inline-flex rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                          {role}
                        </div>
                      </div>
                    </div>
                    <div className="relative mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-2">
                        <div className="flex items-center gap-1 text-[10px] uppercase text-neutral-500">
                          <MessagesSquare size={11} /> Lines
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-bold text-neutral-200">{character.dialogueLines}</div>
                      </div>
                      <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-2">
                        <div className="flex items-center gap-1 text-[10px] uppercase text-neutral-500">
                          <Clapperboard size={11} /> Episodes
                        </div>
                        <div className="mt-0.5 font-mono text-sm font-bold text-neutral-200">{character.episodeCount}</div>
                      </div>
                    </div>
                    <div className="relative mt-3 truncate text-[10px] text-neutral-500" title={character.episodeIds.join(", ")}>
                      Seen in {character.episodeIds.slice(0, 3).join(", ")}{character.episodeIds.length > 3 ? ` +${character.episodeIds.length - 3}` : ""}
                    </div>
                  </article>
                );
              })}
            </div>

            {discoveredCharacters.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllCharacters((current) => !current)}
                className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
              >
                {showAllCharacters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showAllCharacters ? "Show featured cast" : `Show all ${discoveredCharacters.length} characters`}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-5 text-sm text-neutral-500">
            <div className="flex -space-x-2">
              {["Cast", "Voices", "Roles"].map((label) => (
                <div key={label} className="h-10 w-10 animate-pulse rounded-xl border border-neutral-700 bg-neutral-800" />
              ))}
            </div>
            Characters will appear when screenplay dialogue is indexed.
          </div>
        )}
      </section>

      {/* Per-Episode Status Grid */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            Per-Episode Batch Tracker
          </h3>
          <span className="text-xs text-neutral-400">
            {completedCount} of {episodes.length} episodes completed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {episodes.map((ep) => {
            const state = progressStates[ep.episode_id] || {
              episode_id: ep.episode_id,
              status: "queued",
              stage: "Waiting",
              candidates_found: 0,
            };

            return (
              <div
                key={ep.episode_id}
                className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 text-xs transition-colors ${
                  state.status === "done"
                    ? "bg-neutral-950 border-neutral-800/80"
                    : state.status === "running"
                      ? "bg-amber-500/5 border-amber-500/40"
                      : state.status === "failed"
                        ? "bg-red-500/10 border-red-500/40"
                        : "bg-neutral-950/60 border-neutral-800 text-neutral-500"
                }`}
              >
                <div>
                  <div className="font-bold text-white font-mono text-sm">
                    {ep.episode_id}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    {ep.events.length} events · {ep.last_timestamp}
                  </div>
                </div>

                <div className="text-right">
                  {state.status === "done" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 size={13} />
                      {state.candidates_found} promos
                    </span>
                  ) : state.status === "running" ? (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-medium animate-pulse">
                      <LoaderCircle size={13} className="animate-spin" />
                      {state.stage}
                    </span>
                  ) : state.status === "failed" ? (
                    <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                      <AlertCircle size={13} />
                      Failed
                    </span>
                  ) : (
                    <span className="text-neutral-500">Queued</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
