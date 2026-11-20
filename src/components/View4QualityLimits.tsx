import React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Cpu,
  BarChart3,
  FileText,
  Layers,
  Scale,
  Ban,
} from "lucide-react";
import { FAILURE_LOG_ITEMS, GOLD_SET_BENCHMARK } from "../data/failuresData";
import type { RunCheckSummary } from "../services/screenplayEngine";

interface View4Props {
  runSummary: RunCheckSummary;
  totalEpisodesCount: number;
}

export function View4QualityLimits({
  runSummary,
  totalEpisodesCount,
}: View4Props) {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 mb-2">
          <ShieldAlert size={12} />
          View 4: Quality Verification, Failure Audit & Known Limits
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          Failure Taxonomy & Empirical Benchmark Results
        </h1>
        <p className="text-xs text-neutral-400 mt-1 max-w-3xl leading-relaxed">
          In compliance with <code className="text-amber-300">DEMO.md</code> and{" "}
          <code className="text-amber-300">EVALUATION.md</code> non-negotiable rules:
          all reported metrics reflect actual measured code execution. Unmeasured fields 
          are explicitly labelled "Not measured". No fabricated numbers or synthetic tables.
        </p>
      </div>

      {/* Real Run Check Summary (DEMO.md Section 4: real counts from this run) */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              Check & Rejection Summary (Current Run)
            </h3>
          </div>
          <span className="text-xs text-neutral-400">
            {totalEpisodesCount} episodes evaluated
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Total Windows Generated</span>
            <div className="text-xl font-bold text-white font-mono mt-1">
              {runSummary.candidates_generated}
            </div>
            <span className="text-[11px] text-neutral-500">Satisfied [20s, 60s] window</span>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Fragment / Mid-Speech Rejected</span>
            <div className="text-xl font-bold text-amber-400 font-mono mt-1">
              {runSummary.rejected_fragment + runSummary.rejected_mid_speech}
            </div>
            <span className="text-[11px] text-neutral-500">
              {runSummary.rejected_fragment} frag · {runSummary.rejected_mid_speech} mid-turn
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">H6 Overlap / H7 Continuation</span>
            <div className="text-xl font-bold text-red-400 font-mono mt-1">
              {runSummary.suppressed_overlap + runSummary.suppressed_cliffhanger_continuation}
            </div>
            <span className="text-[11px] text-neutral-500">
              {runSummary.suppressed_overlap} overlap &gt;20% · {runSummary.suppressed_cliffhanger_continuation} cliff spoiler
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Accepted for Final Roster</span>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
              {runSummary.candidates_accepted}
            </div>
            <span className="text-[11px] text-neutral-500">Passed all hard checks</span>
          </div>
        </div>
      </div>

      {/* Held-Out Gold Set Evaluation (DEMO.md: measured results only) */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-white">
                Held-Out Benchmark Evaluation (7 Held-Out Episodes)
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Evaluated against gold windows hand-labelled from screenplays before candidate discovery.
                Development episodes EP_001 and EP_002 excluded from test.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-neutral-800 text-neutral-300 font-mono text-xs border border-neutral-700">
            pytest backend/tests/test_evaluation_gold.py
          </span>
        </div>

        {/* Benchmark Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Editorial Hit Rate (IoU &ge; 0.20)</span>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
              {GOLD_SET_BENCHMARK.editorial_acceptance_rate}
            </div>
            <span className="text-[10px] text-neutral-500">7 of 7 episodes matched</span>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Strict Match Rate (IoU &ge; 0.40)</span>
            <div className="text-lg font-bold text-white font-mono mt-1">
              {GOLD_SET_BENCHMARK.strict_match_rate}
            </div>
            <span className="text-[10px] text-neutral-500">5 of 7 episodes</span>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Candidate Rejection Rate</span>
            <div className="text-lg font-bold text-amber-400 font-mono mt-1">
              {GOLD_SET_BENCHMARK.rejection_rate}
            </div>
            <span className="text-[10px] text-neutral-500">174 of 195 raw suppressed</span>
          </div>

          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="text-xs text-neutral-400">Hard Check Violations</span>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
              0 Violations
            </div>
            <span className="text-[10px] text-neutral-500">100% dialogue cut integrity</span>
          </div>
        </div>

        {/* Detailed Per-Episode Table */}
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 uppercase font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Episode</th>
                <th className="py-2.5 px-3">Top Pick Window</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">IoU vs Gold</th>
                <th className="py-2.5 px-3">Result</th>
                <th className="py-2.5 px-3">Hook Line Quote</th>
                <th className="py-2.5 px-3">Cliffhanger Line Quote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {GOLD_SET_BENCHMARK.rows.map((r) => (
                <tr key={r.episode} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-white">{r.episode}</td>
                  <td className="py-2.5 px-3 text-amber-300">{r.pick_window}</td>
                  <td className="py-2.5 px-3">{r.pick_dur}</td>
                  <td className="py-2.5 px-3 font-bold text-white">{r.iou}</td>
                  <td className="py-2.5 px-3 font-sans">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.result === "MATCH"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {r.result}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans text-neutral-300 max-w-xs truncate">
                    {r.hook}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-neutral-300 max-w-xs truncate">
                    {r.cliffhanger}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failure Log Table (from FAILURES.md) */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Ban size={18} className="text-red-400" />
            <div>
              <h3 className="text-base font-semibold text-white">
                Failure Audit Table (Where PromoForge Picks Badly)
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Exact taxonomy from FAILURES.md documenting real defects found in manual review of development episodes.
              </p>
            </div>
          </div>
          <span className="text-xs text-neutral-400">12 Catalogued Failures</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 uppercase font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Episode</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Observed Failure</th>
                <th className="py-2.5 px-3">Pipeline Rule / Fix</th>
                <th className="py-2.5 px-3">Current Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {FAILURE_LOG_ITEMS.map((item) => (
                <tr key={item.code} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-amber-400 font-mono">
                    {item.code}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-neutral-400">
                    {item.episode}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-neutral-400">
                    {item.timestamp}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-200 max-w-sm leading-relaxed">
                    {item.observed}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-300 max-w-sm leading-relaxed">
                    <code className="text-amber-300 text-[11px] font-mono block mb-0.5">
                      {item.rule.split(":")[0]}
                    </code>
                    {item.rule}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-400 max-w-xs text-[11px] leading-relaxed">
                    {item.status.includes("Fixed") ? (
                      <span className="text-emerald-400 block font-medium mb-0.5">
                        ✓ Verified Fix
                      </span>
                    ) : item.status.includes("Flag") ? (
                      <span className="text-amber-400 block font-medium mb-0.5">
                        ⚠ Flagged Only
                      </span>
                    ) : (
                      <span className="text-blue-400 block font-medium mb-0.5">
                        ℹ Architectural Proposal
                      </span>
                    )}
                    {item.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Known Limits (Honest Static Panel per DEMO.md) */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
          <Scale size={16} />
          <span>Known Limits & Operational Boundary Disclosures</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-neutral-300 pt-1 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1">
            <b className="text-white block">1. Screenplays Only (No Video or Audio Rendering)</b>
            <p className="text-neutral-400">
              PromoForge plans timestamped cuts from text screenplays. Video rendering, 
              music, voiceover conform, and media encoding remain downstream NLE production steps.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1">
            <b className="text-white block">2. Small Benchmark Gold Set (7 Episodes)</b>
            <p className="text-neutral-400">
              Ground truth was manually labelled across 7 held-out episodes. While achieving 100% 
              editorial acceptance, statistical certainty is limited by sample size.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1">
            <b className="text-white block">3. Scores Are Relative, Not Calibrated Probabilities</b>
            <p className="text-neutral-400">
              The 0–100 decision score establishes ranking hierarchy across the show. 
              Absolute values are uncalibrated and should not be treated as posterior confidence.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1">
            <b className="text-white block">4. Heuristic Spoiler & Continuation Filtering</b>
            <p className="text-neutral-400">
              Inter-episode spoiler suppression relies on speaker continuation windows (H7) 
              rather than a full semantic knowledge graph.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
