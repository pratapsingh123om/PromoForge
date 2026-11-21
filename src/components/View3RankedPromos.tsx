import React, { useMemo, useState } from "react";
import {
  Sparkles,
  Check,
  X,
  Sliders,
  Download,
  Filter,
  ArrowUpDown,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  FileJson,
  FileSpreadsheet,
  Share2,
  Undo2,
  Flame,
  HelpCircle,
  Film,
} from "lucide-react";
import {
  adjustPromoCandidate,
  clock,
  type ParsedEpisode,
  type PromoCandidateItem,
} from "../services/screenplayEngine";
import { PRODUCT_NAME } from "../config";
import {
  createRunExportFiles,
  createStoredZip,
  screenplayClockToEdl,
  type DemoRunRecord,
} from "../services/demoRun";

interface View3Props {
  promos: PromoCandidateItem[];
  episodes: ParsedEpisode[];
  whyTop3: string[];
  showTitle: string;
  runRecord: DemoRunRecord | null;
  onUpdatePromoStatus: (
    promoId: string,
    status: PromoCandidateItem["status"],
    rejectionReason?: string
  ) => void;
  onAdjustPromoBoundaries: (promoId: string, startMs: number, endMs: number) => void;
  showToast: (toast: { message: string; type: "success" | "warning" | "info" }) => void;
}

export function View3RankedPromos({
  promos,
  episodes,
  whyTop3,
  showTitle,
  runRecord,
  onUpdatePromoStatus,
  onAdjustPromoBoundaries,
  showToast,
}: View3Props) {
  const [filterEpisode, setFilterEpisode] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFlag, setFilterFlag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"rank" | "duration" | "score">("rank");
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});

  // Reject modal state
  const [rejectingPromoId, setRejectingPromoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("Weak hook in first 3s");

  // Adjust modal state
  const [adjustingPromo, setAdjustingPromo] = useState<PromoCandidateItem | null>(null);
  const [adjStartMs, setAdjStartMs] = useState<number>(0);
  const [adjEndMs, setAdjEndMs] = useState<number>(0);

  const episodesList = useMemo(() => {
    return Array.from(new Set(promos.map((p) => p.episode))).sort();
  }, [promos]);

  const filteredPromos = useMemo(() => {
    return promos
      .filter((p) => {
        if (filterEpisode !== "all" && p.episode !== filterEpisode) return false;
        if (filterStatus !== "all" && p.status !== filterStatus) return false;
        if (filterFlag !== "all") {
          if (filterFlag === "clean" && p.quality_flags.length > 0) return false;
          if (filterFlag !== "clean" && !p.quality_flags.includes(filterFlag)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "rank") return a.global_rank - b.global_rank;
        if (sortBy === "duration") return a.duration_seconds - b.duration_seconds;
        if (sortBy === "score") return b.scores.decision - a.scores.decision;
        return 0;
      });
  }, [promos, filterEpisode, filterStatus, filterFlag, sortBy]);

  const acceptedCount = useMemo(
    () => promos.filter((p) => p.status === "approved").length,
    [promos]
  );

  const adjustingEpisode = useMemo(
    () => episodes.find((episode) => episode.episode_id === adjustingPromo?.episode) || null,
    [episodes, adjustingPromo],
  );
  const boundaryEvents = useMemo(
    () =>
      adjustingEpisode?.events.filter(
        (event) => event.type === "dialogue" || event.type === "action",
      ) || [],
    [adjustingEpisode],
  );
  const adjustmentErrors = useMemo(() => {
    if (!adjustingPromo || !adjustingEpisode) return ["Episode source is not available for this stored result."];
    return adjustPromoCandidate(adjustingPromo, adjustingEpisode, adjStartMs, adjEndMs).errors;
  }, [adjustingPromo, adjustingEpisode, adjStartMs, adjEndMs]);

  const toggleTranscript = (id: string) => {
    setExpandedTranscripts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast({ message: `Downloaded ${filename}`, type: "success" });
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast({ message: `Downloaded ${filename}`, type: "success" });
  };

  const exportFullRunZip = () => {
    if (!runRecord) {
      showToast({ message: "Run metadata is unavailable. Run the pipeline again before exporting a ZIP.", type: "warning" });
      return;
    }
    const files = createRunExportFiles(runRecord, promos, whyTop3);
    downloadBlob(`${runRecord.run_id}.zip`, createStoredZip(files));
  };

  const exportMasterCsv = () => {
    const headers = "promo_id,global_rank,segment_index,episode,start,end,duration_seconds,hook_line,cliffhanger_line,why_it_works,flags,status\n";
    const rows = promos.flatMap((p) => {
      const why = p.why_it_works.replace(/"/g, '""');
      const hook = p.hook_line.replace(/"/g, '""');
      const cliff = p.cliffhanger_line.replace(/"/g, '""');
      const flags = p.quality_flags.join(" | ").replace(/"/g, '""');
      return p.segments.map((segment, index) =>
        `"${p.candidate_key}",${p.global_rank},${index + 1},"${segment.episode}","${segment.start_clock}","${segment.end_clock}",${segment.duration_seconds},"${hook}","${cliff}","${why}","${flags}","${p.status}"`,
      );
    }).join("\n");
    downloadFile("promos_master.csv", headers + rows, "text/csv");
  };

  const exportCutListCsv = () => {
    const headers = "promo_id,segment_index,episode,in_time,out_time,duration_seconds\n";
    const rows = promos.flatMap((p) =>
      p.segments.map((segment, index) =>
        `"${p.candidate_key}",${index + 1},"${segment.episode}","${segment.start_clock}","${segment.end_clock}",${segment.duration_seconds}`,
      ),
    ).join("\n");
    downloadFile("cut_list.csv", headers + rows, "text/csv");
  };

  const exportPromosJson = () => {
    const data = {
      product: PRODUCT_NAME,
      show_title: showTitle,
      export_timestamp: new Date().toISOString(),
      accepted_promos_count: acceptedCount,
      total_promos_count: promos.length,
      why_top_3_ranking: whyTop3,
      promos: promos,
      run: runRecord,
    };
    downloadFile("promos.json", JSON.stringify(data, null, 2), "application/json");
  };

  const exportReportMd = () => {
    let md = `# ${PRODUCT_NAME} Editorial Production Report\n\n`;
    md += `**Series:** ${showTitle}  \n`;
    md += `**Total Candidates Ranked:** ${promos.length}  \n`;
    md += `**Approved for Production:** ${acceptedCount}  \n\n`;
    md += `## Why This Global Ranking (Top 3)\n\n`;
    for (const r of whyTop3) {
      md += `- ${r}\n`;
    }
    md += `\n## Master Ranked Promos\n\n`;
    md += `| Rank | Candidate Key | Ep | In | Out | Dur | Score | Status | Why It Works |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    for (const p of promos) {
      md += `| #${p.global_rank} | \`${p.candidate_key}\` | ${p.episode} | ${p.start_clock} | ${p.end_clock} | ${p.duration_seconds}s | ${p.scores.decision} | ${p.status} | ${p.why_it_works} |\n`;
    }
    downloadFile("report.md", md, "text/markdown");
  };

  const exportEdl = () => {
    let edl = `TITLE: ${PRODUCT_NAME.toUpperCase()}_CUTS\nFCM: NON-DROP FRAME\n\n`;
    let eventIndex = 1;
    promos.forEach((p) => {
      p.segments.forEach((segment) => {
        const start = screenplayClockToEdl(segment.start_clock);
        const end = screenplayClockToEdl(segment.end_clock);
        edl += `${String(eventIndex).padStart(3, "0")}  AX       V     C        ${start} ${end} ${start} ${end}\n`;
        edl += `* SCREENPLAY-ONLY PLAN: ${p.candidate_key} (${segment.episode})\n\n`;
        eventIndex += 1;
      });
    });
    downloadFile("promos.edl", edl, "text/plain");
  };

  const openAdjustModal = (p: PromoCandidateItem) => {
    setAdjustingPromo(p);
    setAdjStartMs(p.segments[0].start_ms);
    setAdjEndMs(p.segments[0].end_ms);
  };

  const saveAdjustment = () => {
    if (!adjustingPromo) return;
    if (adjustmentErrors.length > 0) {
      showToast({ message: adjustmentErrors[0], type: "warning" });
      return;
    }
    onAdjustPromoBoundaries(
      adjustingPromo.id,
      adjStartMs,
      adjEndMs,
    );
    setAdjustingPromo(null);
    showToast({ message: "Saved line-adjusted cut boundaries.", type: "success" });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Batch Export Controls */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-2">
              <Sparkles size={12} />
              View 3: Global Ranked Promos & Human Editorial Studio
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>{showTitle || "Ranked Promos"}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 font-normal">
                {promos.length} Candidates Ranked
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                {acceptedCount} Approved
              </span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Global ranking enforces an episode-variety cap so single episodes do not dominate.
              Human editors can accept, reject with reason, or adjust cuts to line boundaries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportFullRunZip}
              disabled={!runRecord}
              className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-semibold border border-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} />
              Full Run ZIP
            </button>
            <button
              type="button"
              onClick={exportMasterCsv}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={13} className="text-emerald-400" />
              Master CSV
            </button>
            <button
              type="button"
              onClick={exportCutListCsv}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText size={13} className="text-blue-400" />
              Cut List CSV
            </button>
            <button
              type="button"
              onClick={exportPromosJson}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileJson size={13} className="text-amber-400" />
              JSON Cut Sheet
            </button>
            <button
              type="button"
              onClick={exportReportMd}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText size={13} className="text-purple-400" />
              Report MD
            </button>
            <button
              type="button"
              onClick={exportEdl}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Film size={13} className="text-red-400" />
              EDL Timeline
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-neutral-500">
          Exports are generated in this browser from the stored current run. Downloaded files persist on your device; the app keeps run data only in this tab's session storage.
        </p>
      </div>

      {runRecord?.status === "partial_model_failure" && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <b className="block text-red-300">Model scoring did not complete.</b>
          These are retained rule-based shortlist results, not output from the selected model.
          {runRecord.errors[0] ? ` ${runRecord.errors[0]}` : ""}
        </div>
      )}

      {runRecord?.status === "cancelled" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          This run was cancelled. Only candidates completed before cancellation are shown.
        </div>
      )}

      {/* "Why this ranking" Panel (DEMO.md Section 4 View 3) */}
      {whyTop3.length > 0 && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-amber-500/10 via-neutral-900 to-purple-500/10 border border-amber-500/30 space-y-2.5">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Why This Global Ranking (Top 3 Explanation)
            </h3>
          </div>
          <p className="text-xs text-neutral-400">
            Generated from continuous tension scoring and diversity rules, avoiding subjective hallucination:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {whyTop3.map((reason, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-300 leading-relaxed flex items-start gap-2"
              >
                <span className="shrink-0 font-bold text-amber-400 font-mono">
                  #{idx + 1}
                </span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Sorting Bar */}
      <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Filter size={14} />
            <span>Filters:</span>
          </div>

          <select
            value={filterEpisode}
            onChange={(e) => setFilterEpisode(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Episodes ({episodesList.length})</option>
            {episodesList.map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved ({acceptedCount})</option>
            <option value="selected">Selected / Pending</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={filterFlag}
            onChange={(e) => setFilterFlag(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Quality Flags</option>
            <option value="clean">Clean (No flags)</option>
            <option value="needs context">Needs Context</option>
            <option value="possible fake cliffhanger">Possible Fake Cliffhanger</option>
            <option value="soft hook">Soft Hook</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <ArrowUpDown size={14} />
            <span>Sort by:</span>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "rank" | "duration" | "score")}
            className="px-2.5 py-1.5 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="rank">Global Rank (Asc)</option>
            <option value="score">Score (Desc)</option>
            <option value="duration">Duration (Shortest first)</option>
          </select>
        </div>
      </div>

      {/* Ranked Promos List */}
      <div className="space-y-4">
        {filteredPromos.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-xl">
            {promos.length === 0 && runRecord?.status === "complete" ? (
              <><b className="mb-1 block text-sm text-amber-300">No promo found</b>No source-grounded window satisfied the selected 20–60 second duration and line-boundary rules. Nothing was forced into the ranking.</>
            ) : "No promos match the current filters."}
          </div>
        ) : (
          filteredPromos.map((promo) => {
            const isApproved = promo.status === "approved";
            const isRejected = promo.status === "rejected";
            const isExpanded = !!expandedTranscripts[promo.id];

            return (
              <div
                key={promo.id}
                className={`p-5 rounded-xl border transition-all ${
                  isApproved
                    ? "bg-emerald-950/15 border-emerald-500/50"
                    : isRejected
                      ? "bg-neutral-900/50 border-neutral-800/60 opacity-60"
                      : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                }`}
              >
                {/* Promo Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono text-sm border border-amber-500/30">
                      #{promo.global_rank}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm font-mono">
                          {promo.candidate_key}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-xs">
                          {promo.episode}
                        </span>
                        {isApproved && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1">
                            <CheckCircle2 size={12} /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1">
                            <X size={12} /> Rejected ({promo.rejection_reason || "Editor veto"})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Clock3 size={12} />
                          {promo.start_clock} → {promo.end_clock} ({promo.duration_seconds}s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Accept, Reject, Adjust */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openAdjustModal(promo)}
                      className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sliders size={13} />
                      Adjust
                    </button>
                    {isApproved ? (
                      <button
                        type="button"
                        onClick={() => onUpdatePromoStatus(promo.id, "selected")}
                        className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Undo2 size={13} />
                        Revert
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onUpdatePromoStatus(promo.id, "approved")}
                        className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <Check size={13} />
                        Accept
                      </button>
                    )}
                    {!isRejected ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingPromoId(promo.id);
                        }}
                        className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-red-950/40 text-neutral-400 hover:text-red-400 text-xs font-medium border border-neutral-700 transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onUpdatePromoStatus(promo.id, "selected")}
                        className="px-3 py-1.5 rounded-md bg-neutral-800 text-neutral-400 text-xs font-medium border border-neutral-700 transition-colors cursor-pointer"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>

                {/* Body: Hook, Cliffhanger, Why it works, Scores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
                  {/* Hook & Cliffhanger */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="p-3 rounded-lg bg-neutral-950 border border-amber-500/30">
                      <div className="flex items-center justify-between text-amber-400 font-semibold mb-1">
                        <span className="uppercase text-[10px] tracking-wider">
                          Hook Line (First 3s)
                        </span>
                        <span className="font-mono text-[11px] text-neutral-400">
                          {promo.hook_timestamp} · {promo.hook_speaker}
                        </span>
                      </div>
                      <p className="text-white text-sm italic font-serif">
                        "{promo.hook_line}"
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-neutral-950 border border-purple-500/30">
                      <div className="flex items-center justify-between text-purple-400 font-semibold mb-1">
                        <span className="uppercase text-[10px] tracking-wider">
                          Cliffhanger Line (Final Beat)
                        </span>
                        <span className="font-mono text-[11px] text-neutral-400">
                          {promo.cliffhanger_timestamp} · {promo.cliffhanger_speaker}
                        </span>
                      </div>
                      <p className="text-white text-sm italic font-serif">
                        "{promo.cliffhanger_line}"
                      </p>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Why It Works:
                      </span>
                      <p className="text-neutral-200 mt-0.5 leading-relaxed">
                        {promo.why_it_works}
                      </p>
                    </div>
                  </div>

                  {/* Scores & Hard Check Badges */}
                  <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2">
                        <span className="font-semibold text-neutral-300">
                          Decision Score
                        </span>
                        <span className="text-base font-bold text-amber-400 font-mono">
                          {promo.scores.decision} / 100
                        </span>
                      </div>

                      <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
                        Scored by {promo.score_source || "legacy/unknown"}
                      </div>

                      <div className="space-y-1.5 text-neutral-400">
                        <div className="flex items-center justify-between">
                          <span>Opening Hook</span>
                          <span className="font-mono text-white">{promo.scores.hook}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Ending Cliffhanger</span>
                          <span className="font-mono text-white">{promo.scores.cliffhanger}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Standalone Clarity</span>
                          <span className="font-mono text-white">{promo.scores.standalone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-neutral-800 mt-3">
                      <div className="text-[10px] uppercase font-semibold text-neutral-500 mb-1.5">
                        Passed Hard Checks
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {promo.hard_checks_passed.map((hc) => (
                          <span
                            key={hc}
                            className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 text-[10px]"
                          >
                            ✓ {hc.split(":")[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transcript Preview Toggle */}
                <div className="mt-4 pt-3 border-t border-neutral-800/80">
                  <button
                    type="button"
                    onClick={() => toggleTranscript(promo.id)}
                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>
                      {isExpanded ? "Hide" : "Show"} Transcript Lines inside Cut (
                      {promo.transcript_lines.length} events)
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
                      {promo.transcript_lines.map((t, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded border ${
                            t.is_hook
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                              : t.is_cliffhanger
                                ? "bg-purple-500/10 border-purple-500/40 text-purple-200"
                                : "bg-neutral-900 border-neutral-800 text-neutral-300"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] opacity-80 mb-0.5">
                            <span className="font-bold">
                              {t.speaker || "Scene Direction"}
                            </span>
                            <span className="text-[10px]">
                              {t.start_clock} → {t.end_clock}
                            </span>
                          </div>
                          <p className="font-sans text-sm">{t.text}</p>
                          {t.is_hook && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-amber-400">
                              ★ OPENING HOOK
                            </span>
                          )}
                          {t.is_cliffhanger && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-purple-400">
                              ⚡ CLIFFHANGER PEAK
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reject Modal with Reason Picker */}
      {rejectingPromoId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">
              Reject Promo Candidate
            </h3>
            <p className="text-xs text-neutral-400">
              Pick the primary defect reason. Rejection feedback is saved to build 
              future benchmark gold sets.
            </p>

            <div className="space-y-2">
              {[
                "Weak hook in first 3s",
                "Fake cliffhanger / resolves prematurely",
                "Needs earlier story context",
                "Spoils twist from another episode",
                "Overlap with higher-ranked cut",
                "Sentence fragment start",
                "Other editor veto",
              ].map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-800 hover:bg-neutral-800/40 cursor-pointer text-xs text-neutral-200"
                >
                  <input
                    type="radio"
                    name="rejectReason"
                    value={reason}
                    checked={rejectReason === reason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="text-amber-500 focus:ring-0"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setRejectingPromoId(null)}
                className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs hover:bg-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdatePromoStatus(rejectingPromoId, "rejected", rejectReason);
                  setRejectingPromoId(null);
                  showToast({ message: `Promo rejected: "${rejectReason}".`, type: "info" });
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Cut Boundaries Modal */}
      {adjustingPromo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders size={18} className="text-amber-400" />
              Adjust Cut Boundaries ({adjustingPromo.candidate_key})
            </h3>
            <p className="text-xs text-neutral-400">
              Select real dialogue or action boundaries. Duration, sentence-fragment, and
              continuing-speaker checks run before the cut can be saved.
            </p>

            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1">
                  <span>In-Point</span>
                  <span className="font-mono text-amber-400">
                    {clock(adjStartMs)}
                  </span>
                </div>
                <select
                  value={adjStartMs}
                  onChange={(event) => setAdjStartMs(Number(event.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
                >
                  {boundaryEvents.map((event) => (
                    <option key={`start-${event.event_id}`} value={event.start_ms}>
                      {clock(event.start_ms)} · {event.speaker || event.type} · {event.text.slice(0, 72)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1">
                  <span>Out-Point</span>
                  <span className="font-mono text-purple-400">
                    {clock(adjEndMs)}
                  </span>
                </div>
                <select
                  value={adjEndMs}
                  onChange={(event) => setAdjEndMs(Number(event.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:border-purple-500 focus:outline-none"
                >
                  {boundaryEvents.map((event) => (
                    <option key={`end-${event.event_id}`} value={event.end_ms}>
                      {clock(event.end_ms)} · {event.speaker || event.type} · {event.text.slice(0, 72)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Resulting Cut Duration:</span>
                  <span className={`font-bold font-mono text-sm ${adjustmentErrors.length === 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {((adjEndMs - adjStartMs) / 1000).toFixed(1)}s
                  </span>
                </div>
                {adjustmentErrors.length === 0 ? (
                  <p className="text-emerald-400">All live boundary checks pass.</p>
                ) : (
                  <ul className="list-disc pl-4 text-red-300 space-y-1">
                    {adjustmentErrors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setAdjustingPromo(null)}
                className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs hover:bg-neutral-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAdjustment}
                disabled={adjustmentErrors.length > 0}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs cursor-pointer shadow-md disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save Line-Snapped Cut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
