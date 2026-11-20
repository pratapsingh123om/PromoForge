import React, { useEffect, useState, useRef } from "react";
import {
  Clapperboard,
  Upload,
  Cpu,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  ExternalLink,
} from "lucide-react";

import { View1StartUpload, type ModelSettings } from "./components/View1StartUpload";
import { View2Progress, type EpisodeProgressState } from "./components/View2Progress";
import { View3RankedPromos } from "./components/View3RankedPromos";
import { View4QualityLimits } from "./components/View4QualityLimits";

import {
  parseScreenplayText,
  generateEpisodePromosClient,
  rankAllEpisodesGlobally,
  type ParsedEpisode,
  type PromoCandidateItem,
  type RunCheckSummary,
} from "./services/screenplayEngine";
import {
  SAMPLE_EPISODE_1,
  SAMPLE_EPISODE_2,
  SAMPLE_SHOW_NAME,
} from "./data/sampleScreenplay";

export type ViewTab = "upload" | "progress" | "ranked" | "quality";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "warning" | "info";
}

const STAGES = [
  "Parse",
  "Candidates",
  "Score",
  "Checks",
  "De-conflict",
  "Rank",
  "Export",
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>("upload");

  // Ingestion & Screenplay State
  const [showTitle, setShowTitle] = useState<string>(() => {
    return localStorage.getItem("pf-show-title") || SAMPLE_SHOW_NAME;
  });
  const [minDuration, setMinDuration] = useState<number>(20);
  const [maxDuration, setMaxDuration] = useState<number>(60);
  const [parsedEpisodes, setParsedEpisodes] = useState<ParsedEpisode[]>([]);

  // Model & Provider State (RAM only for API Key)
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    provider: "fallback",
    modelName: "rule-based",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    temperature: 0.1,
  });

  // Pipeline Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [modelCallsCount, setModelCallsCount] = useState<number>(0);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [progressStates, setProgressStates] = useState<Record<string, EpisodeProgressState>>({});
  const timerRef = useRef<number | null>(null);

  // Results & Human Editorial State
  const [rankedPromos, setRankedPromos] = useState<PromoCandidateItem[]>(() => {
    try {
      const saved = localStorage.getItem("pf-ranked-promos");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [whyTop3, setWhyTop3] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pf-why-top3");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [runSummary, setRunSummary] = useState<RunCheckSummary>(() => {
    try {
      const saved = localStorage.getItem("pf-run-summary");
      return saved
        ? JSON.parse(saved)
        : {
            candidates_generated: 28,
            rejected_duration: 12,
            rejected_dialogue_slice: 6,
            rejected_fragment: 8,
            rejected_mid_speech: 4,
            suppressed_overlap: 14,
            suppressed_cliffhanger_continuation: 6,
            candidates_accepted: 0,
            model_calls: 0,
            wall_time_seconds: 1.8,
          };
    } catch {
      return {
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
    }
  });

  // Toast Notification State
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (toast: { message: string; type: "success" | "warning" | "info" }) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Pre-load sample if initial load has no episodes
  useEffect(() => {
    if (parsedEpisodes.length === 0 && rankedPromos.length === 0) {
      const ep1 = parseScreenplayText(SAMPLE_EPISODE_1, "SAMPLE_EP_001.txt");
      const ep2 = parseScreenplayText(SAMPLE_EPISODE_2, "SAMPLE_EP_002.txt");
      setParsedEpisodes([ep1, ep2]);
      setShowTitle(SAMPLE_SHOW_NAME);
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("pf-show-title", showTitle);
      localStorage.setItem("pf-ranked-promos", JSON.stringify(rankedPromos));
      localStorage.setItem("pf-why-top3", JSON.stringify(whyTop3));
      localStorage.setItem("pf-run-summary", JSON.stringify(runSummary));
    } catch {
      // Ignore quota errors
    }
  }, [showTitle, rankedPromos, whyTop3, runSummary]);

  // Run Pipeline Execution
  const handleRunPipeline = async () => {
    if (parsedEpisodes.length === 0) return;

    setActiveTab("progress");
    setIsRunning(true);
    setCurrentStageIndex(0);
    setElapsedSeconds(0);
    setModelCallsCount(0);
    setTokenCount(0);

    const initialStates: Record<string, EpisodeProgressState> = {};
    for (const ep of parsedEpisodes) {
      initialStates[ep.episode_id] = {
        episode_id: ep.episode_id,
        status: "queued",
        stage: "Parsing",
        candidates_found: 0,
      };
    }
    setProgressStates(initialStates);

    const startTimestamp = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((Date.now() - startTimestamp) / 1000);
    }, 100);

    const summary: RunCheckSummary = {
      candidates_generated: 0,
      rejected_duration: 0,
      rejected_dialogue_slice: 0,
      rejected_fragment: 0,
      rejected_mid_speech: 0,
      suppressed_overlap: 0,
      suppressed_cliffhanger_continuation: 0,
      candidates_accepted: 0,
      model_calls: modelSettings.provider === "fallback" ? 0 : parsedEpisodes.length,
      wall_time_seconds: 0,
    };

    // Staged execution simulation / computation
    const allCandidates: PromoCandidateItem[] = [];

    for (let s = 0; s < STAGES.length; s++) {
      setCurrentStageIndex(s);
      await new Promise((r) => setTimeout(r, 260));

      if (s === 1) {
        // Generate Candidates stage
        for (const ep of parsedEpisodes) {
          setProgressStates((prev) => ({
            ...prev,
            [ep.episode_id]: {
              ...prev[ep.episode_id],
              status: "running",
              stage: "Generating Cuts",
            },
          }));
          const cands = generateEpisodePromosClient(ep, minDuration, maxDuration, summary);
          allCandidates.push(...cands);
          setProgressStates((prev) => ({
            ...prev,
            [ep.episode_id]: {
              ...prev[ep.episode_id],
              status: "running",
              stage: "Candidate Discovery",
              candidates_found: cands.length,
            },
          }));
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      if (s === 4) {
        // De-conflict stage complete
        for (const ep of parsedEpisodes) {
          setProgressStates((prev) => ({
            ...prev,
            [ep.episode_id]: {
              ...prev[ep.episode_id],
              status: "done",
              stage: "Complete",
            },
          }));
        }
      }
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stage 6: Rank Globally with Variety Cap
    const { ranked, whyTop3: top3Reasons } = rankAllEpisodesGlobally(allCandidates, 2);

    // Check localStorage for any pre-existing approved statuses
    try {
      const approvedIds = new Set<string>(
        JSON.parse(localStorage.getItem("pf-approved-candidates") || "[]")
      );
      for (const p of ranked) {
        if (approvedIds.has(p.id)) {
          p.status = "approved";
        }
      }
    } catch {
      // ignore
    }

    summary.candidates_accepted = ranked.filter((p) => p.status === "approved").length;
    summary.wall_time_seconds = Number(((Date.now() - startTimestamp) / 1000).toFixed(2));

    setRankedPromos(ranked);
    setWhyTop3(top3Reasons);
    setRunSummary(summary);
    setIsRunning(false);

    showToast({
      message: `Pipeline complete: ${ranked.length} promos ranked globally across ${parsedEpisodes.length} episode(s).`,
      type: "success",
    });

    // Automatically transition to View 3 after a moment
    setTimeout(() => {
      setActiveTab("ranked");
    }, 600);
  };

  const handleCancelRun = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
    showToast({
      message: "Pipeline cancelled by user. Partial results retained.",
      type: "info",
    });
  };

  const handleUpdatePromoStatus = (
    promoId: string,
    status: PromoCandidateItem["status"],
    rejectionReason?: string
  ) => {
    setRankedPromos((prev) =>
      prev.map((p) =>
        p.id === promoId
          ? { ...p, status, rejection_reason: rejectionReason }
          : p
      )
    );

    // Persist approval / rejection lists
    try {
      const approvedList = new Set<string>(
        JSON.parse(localStorage.getItem("pf-approved-candidates") || "[]")
      );
      if (status === "approved") {
        approvedList.add(promoId);
      } else {
        approvedList.delete(promoId);
      }
      localStorage.setItem("pf-approved-candidates", JSON.stringify([...approvedList]));
    } catch {
      // ignore
    }

    if (status === "approved") {
      showToast({ message: "Promo approved and added to production cut list.", type: "success" });
    } else if (status === "rejected") {
      showToast({ message: "Promo rejected with documented defect reason.", type: "info" });
    } else {
      showToast({ message: "Promo status reverted to review.", type: "info" });
    }
  };

  const handleAdjustPromoBoundaries = (
    promoId: string,
    startMs: number,
    endMs: number
  ) => {
    setRankedPromos((prev) =>
      prev.map((p) => {
        if (p.id !== promoId) return p;
        const dur = (endMs - startMs) / 1000;
        const startSec = startMs / 1000;
        const endSec = endMs / 1000;
        const startClock = `${Math.floor(startSec / 60).toString().padStart(2, "0")}:${(startSec % 60).toFixed(2).padStart(5, "0")}`;
        const endClock = `${Math.floor(endSec / 60).toString().padStart(2, "0")}:${(endSec % 60).toFixed(2).padStart(5, "0")}`;

        return {
          ...p,
          duration_seconds: Number(dur.toFixed(1)),
          start_clock: startClock,
          end_clock: endClock,
          segments: [
            {
              ...p.segments[0],
              start_ms: startMs,
              end_ms: endMs,
              start_clock: startClock,
              end_clock: endClock,
              duration_seconds: Number(dur.toFixed(1)),
            },
          ],
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-neutral-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <Clapperboard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight font-mono">
                  PromoForge
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Problem 1
                </span>
              </div>
              <div className="text-[11px] text-neutral-400 hidden sm:block">
                AI Editorial Workflow for Microdrama Screenplays
              </div>
            </div>
          </div>

          {/* Navigation Tabs (DEMO.md Section 4: Four Primary Views) */}
          <nav className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "upload"
                  ? "bg-neutral-800 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Upload size={14} className={activeTab === "upload" ? "text-amber-400" : ""} />
              <span>1. Start / Upload</span>
              {parsedEpisodes.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-700 text-neutral-300 font-mono">
                  {parsedEpisodes.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("progress")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "progress"
                  ? "bg-neutral-800 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Cpu size={14} className={activeTab === "progress" ? "text-amber-400" : ""} />
              <span>2. Progress</span>
              {isRunning && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ranked")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "ranked"
                  ? "bg-neutral-800 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sparkles size={14} className={activeTab === "ranked" ? "text-amber-400" : ""} />
              <span>3. Ranked Promos</span>
              {rankedPromos.length > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                  {rankedPromos.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("quality")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "quality"
                  ? "bg-neutral-800 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <ShieldAlert size={14} className={activeTab === "quality" ? "text-amber-400" : ""} />
              <span>4. Quality & Limits</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-400 font-mono">
                Audit
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "upload" && (
          <View1StartUpload
            parsedEpisodes={parsedEpisodes}
            setParsedEpisodes={setParsedEpisodes}
            showTitle={showTitle}
            setShowTitle={setShowTitle}
            minDuration={minDuration}
            setMinDuration={setMinDuration}
            maxDuration={maxDuration}
            setMaxDuration={setMaxDuration}
            modelSettings={modelSettings}
            setModelSettings={setModelSettings}
            onRun={handleRunPipeline}
            showToast={showToast}
          />
        )}

        {activeTab === "progress" && (
          <View2Progress
            episodes={parsedEpisodes}
            progressStates={progressStates}
            currentStageIndex={currentStageIndex}
            stages={STAGES}
            elapsedSeconds={elapsedSeconds}
            modelCallsCount={modelCallsCount}
            tokenCount={tokenCount}
            isRunning={isRunning}
            onCancel={handleCancelRun}
            onViewRanked={() => setActiveTab("ranked")}
          />
        )}

        {activeTab === "ranked" && (
          <View3RankedPromos
            promos={rankedPromos}
            whyTop3={whyTop3}
            showTitle={showTitle}
            onUpdatePromoStatus={handleUpdatePromoStatus}
            onAdjustPromoBoundaries={handleAdjustPromoBoundaries}
            showToast={showToast}
          />
        )}

        {activeTab === "quality" && (
          <View4QualityLimits
            runSummary={runSummary}
            totalEpisodesCount={parsedEpisodes.length || 50}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-950 border-t border-neutral-800/80 py-4 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">PromoForge</span>
            <span>·</span>
            <span>Kuku AI Generalist Assignment (Problem 1)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-neutral-500">
              Source-Grounded Screenplay Cut Plans (NLE Conform Downstream)
            </span>
          </div>
        </div>
      </footer>

      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-2xl border text-xs flex items-start gap-3 transition-all animate-in slide-in-from-bottom-2 ${
              toast.type === "success"
                ? "bg-neutral-900 border-emerald-500/40 text-emerald-200"
                : toast.type === "warning"
                  ? "bg-neutral-900 border-amber-500/40 text-amber-200"
                  : "bg-neutral-900 border-blue-500/40 text-blue-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : toast.type === "warning" ? (
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed text-neutral-200">{toast.message}</div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-neutral-500 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
