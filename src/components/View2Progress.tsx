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
  const completedCount = Object.values(progressStates).filter(
    (s) => s.status === "done"
  ).length;
  const progressPercent =
    episodes.length > 0
      ? Math.round((completedCount / episodes.length) * 100)
      : 100;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-2">
              <Cpu size={12} />
              View 2: Pipeline Execution & Stage Telemetry
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
                : `Processing ${episodes.length} episode(s) through parse, candidate windowing, hard checks, de-conflict, and global variety ranking.`}
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
              <span>Episodes Done</span>
            </div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {completedCount} / {episodes.length} ({progressPercent}%)
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
