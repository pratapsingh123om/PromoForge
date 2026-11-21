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
  BookOpen,
} from "lucide-react";

import { View1StartUpload, type ModelSettings } from "./components/View1StartUpload";
import { View2Progress, type EpisodeProgressState } from "./components/View2Progress";
import { View3RankedPromos } from "./components/View3RankedPromos";
import { View4QualityLimits } from "./components/View4QualityLimits";
import { SeriesLibrary } from "./components/SeriesLibrary";

import {
  generateEpisodePromosClient,
  rankAllEpisodesGlobally,
  adjustPromoCandidate,
  buildSeriesAliasMap,
  applySeriesAliasMapToEpisodes,
  type ParsedEpisode,
  type PromoCandidateItem,
  type RunCheckSummary,
} from "./services/screenplayEngine";
import {
  DEFAULT_MODEL_MAX_TOKENS,
  DEFAULT_MODEL_TEMPERATURE,
  PRODUCT_NAME,
} from "./config";
import { api } from "./api/client";
import type {
  DemoScoreCandidateInput,
  DemoScorePromptResponse,
  DemoScoreResponse,
  DemoModelScore,
  BackendHealthResponse,
} from "./types";
import {
  MAX_MODEL_CANDIDATES,
  SERIES_MODEL_CANDIDATES,
  MODEL_BATCH_SIZE,
  chunkArray,
  shortlistCandidatesForModel,
  type DemoRunRecord,
} from "./services/demoRun";
import {
  loadSeriesLibrary,
  persistSeriesLibrary,
  INVENTED_LIBRARY_ID,
  type SeriesLibraryEntry,
} from "./services/seriesLibrary";

export type ViewTab = "library" | "upload" | "progress" | "ranked" | "quality";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "warning" | "info";
}

interface RunInputContext {
  language: string;
  targetAudience: string;
}

interface PendingManualRun {
  candidates: PromoCandidateItem[];
  summary: RunCheckSummary;
  startedAt: number;
  createdAt: string;
  context: RunInputContext;
  stageTimingsMs: Record<string, number>;
  prompt: DemoScorePromptResponse;
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

const EMPTY_RUN_SUMMARY: RunCheckSummary = {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    const saved = sessionStorage.getItem("pf-active-tab");
    return ["library", "upload", "progress", "ranked", "quality"].includes(saved || "")
      ? (saved as ViewTab)
      : "upload";
  });
  const [seriesLibrary, setSeriesLibrary] = useState<SeriesLibraryEntry[]>(loadSeriesLibrary);

  // Ingestion & Screenplay State
  const [showTitle, setShowTitle] = useState<string>(() => {
    return sessionStorage.getItem("pf-show-title") || "";
  });
  const [minDuration, setMinDuration] = useState<number>(20);
  const [maxDuration, setMaxDuration] = useState<number>(60);
  const [parsedEpisodes, setParsedEpisodes] = useState<ParsedEpisode[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pf-parsed-episodes") || "[]");
    } catch {
      return [];
    }
  });
  const [backendHealth, setBackendHealth] = useState<BackendHealthResponse | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "unavailable">("checking");
  const [backendError, setBackendError] = useState("");
  const [interruptedRun] = useState(() => {
    const interrupted = sessionStorage.getItem("pf-run-in-progress") === "true";
    sessionStorage.removeItem("pf-run-in-progress");
    return interrupted;
  });

  // The browser chooses a scoring profile; provider credentials remain server-side.
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    provider: "gemini",
    modelName: "gemini-3.1-flash-lite",
    baseUrl: "https://api.openai.com/v1",
    temperature: DEFAULT_MODEL_TEMPERATURE,
    maxTokens: DEFAULT_MODEL_MAX_TOKENS,
  });

  // Pipeline Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [modelCallsCount, setModelCallsCount] = useState<number>(0);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [runCancelled, setRunCancelled] = useState<boolean>(false);
  const [progressStates, setProgressStates] = useState<Record<string, EpisodeProgressState>>({});
  const timerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef<boolean>(false);
  const [runRecord, setRunRecord] = useState<DemoRunRecord | null>(() => {
    try {
      const saved = sessionStorage.getItem("pf-run-record");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [pendingManualRun, setPendingManualRun] = useState<PendingManualRun | null>(null);
  const [manualJson, setManualJson] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Results & Human Editorial State
  const [rankedPromos, setRankedPromos] = useState<PromoCandidateItem[]>(() => {
    try {
      const saved = sessionStorage.getItem("pf-ranked-promos");
      return saved ? (JSON.parse(saved) as PromoCandidateItem[]) : [];
    } catch {
      return [];
    }
  });

  const [whyTop3, setWhyTop3] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem("pf-why-top3");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [whyTop10, setWhyTop10] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem("pf-why-top10");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [allCandidatesByEpisode, setAllCandidatesByEpisode] = useState<Record<string, PromoCandidateItem[]>>(() => {
    try {
      const saved = sessionStorage.getItem("pf-all-candidates-by-ep");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [runSummary, setRunSummary] = useState<RunCheckSummary>(() => {
    try {
      const saved = sessionStorage.getItem("pf-run-summary");
      return saved
        ? JSON.parse(saved)
        : EMPTY_RUN_SUMMARY;
    } catch {
      return EMPTY_RUN_SUMMARY;
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

  const checkBackendHealth = async () => {
    setBackendStatus("checking");
    setBackendError("");
    try {
      const health = await api.health();
      setBackendHealth(health);
      setBackendStatus("connected");
    } catch (error) {
      setBackendHealth(null);
      setBackendStatus("unavailable");
      setBackendError(error instanceof Error ? error.message : "Backend is unavailable");
    }
  };

  useEffect(() => {
    void checkBackendHealth();
  }, []);

  // Persist only for the current browser tab/session. Uploaded screenplay text is not kept long-term.
  useEffect(() => {
    try {
      sessionStorage.setItem("pf-show-title", showTitle);
      sessionStorage.setItem("pf-parsed-episodes", JSON.stringify(parsedEpisodes));
      sessionStorage.setItem("pf-ranked-promos", JSON.stringify(rankedPromos));
      sessionStorage.setItem("pf-why-top3", JSON.stringify(whyTop3));
      sessionStorage.setItem("pf-why-top10", JSON.stringify(whyTop10));
      sessionStorage.setItem("pf-all-candidates-by-ep", JSON.stringify(allCandidatesByEpisode));
      sessionStorage.setItem("pf-run-summary", JSON.stringify(runSummary));
      if (runRecord) sessionStorage.setItem("pf-run-record", JSON.stringify(runRecord));
      else sessionStorage.removeItem("pf-run-record");
    } catch {
      // Ignore quota errors
    }
  }, [showTitle, parsedEpisodes, rankedPromos, whyTop3, whyTop10, allCandidatesByEpisode, runSummary, runRecord]);

  useEffect(() => {
    sessionStorage.setItem("pf-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    persistSeriesLibrary(seriesLibrary);
  }, [seriesLibrary]);

  useEffect(() => {
    if (
      isRunning ||
      !runRecord ||
      parsedEpisodes.length === 0 ||
      Object.keys(progressStates).length > 0
    ) return;
    setProgressStates(Object.fromEntries(parsedEpisodes.map((episode) => [
      episode.episode_id,
      {
        episode_id: episode.episode_id,
        status: "done" as const,
        stage: "Complete",
        candidates_found: allCandidatesByEpisode[episode.episode_id]?.length ?? 0,
      },
    ])));
    setCurrentStageIndex(STAGES.length);
    setElapsedSeconds(runRecord.usage.wall_time_seconds ?? runSummary.wall_time_seconds ?? 0);
    setModelCallsCount(runRecord.usage.model_calls ?? runSummary.model_calls ?? 0);
    setTokenCount((runRecord.usage.input_tokens ?? 0) + (runRecord.usage.output_tokens ?? 0));
  }, [allCandidatesByEpisode, isRunning, parsedEpisodes, progressStates, runRecord, runSummary]);

  useEffect(() => {
    if (!runRecord || rankedPromos.length === 0 || runRecord.run_id === INVENTED_LIBRARY_ID) return;
    const entry: SeriesLibraryEntry = {
      id: runRecord.run_id,
      title: runRecord.show_title,
      saved_at: runRecord.completed_at,
      episodes: parsedEpisodes,
      promos: rankedPromos,
      why_top_3: whyTop3,
      why_top_10: whyTop10,
      candidates_by_episode: allCandidatesByEpisode,
      run_summary: runSummary,
      run_record: runRecord,
    };
    setSeriesLibrary((previous) => {
      const withoutCurrent = previous.filter((item) => item.id !== entry.id);
      return [entry, ...withoutCurrent];
    });
  }, [runRecord, rankedPromos, parsedEpisodes, whyTop3, whyTop10, allCandidatesByEpisode, runSummary]);

  const toScoreCandidates = (candidates: PromoCandidateItem[]): DemoScoreCandidateInput[] =>
    candidates.map((candidate) => ({
      candidate_id: candidate.id,
      episode: candidate.episode,
      start_clock: candidate.start_clock,
      end_clock: candidate.end_clock,
      duration_seconds: candidate.duration_seconds,
      hook_line: candidate.hook_line,
      cliffhanger_line: candidate.cliffhanger_line,
      transcript_lines: candidate.transcript_lines
        .filter((line) => line.event_type === "dialogue" || line.event_type === "action")
        .map((line) => ({
          speaker: line.speaker,
          text: line.text,
          start_clock: line.start_clock,
          end_clock: line.end_clock,
        })),
    }));

  const applyModelScores = (
    candidates: PromoCandidateItem[],
    response: DemoScoreResponse,
  ): PromoCandidateItem[] => {
    const scoreById = new Map(response.scores.map((score) => [score.candidate_id, score]));
    return candidates.map((candidate) => {
      const score = scoreById.get(candidate.id);
      if (!score) return candidate;
      const durationFit = Math.max(
        0,
        100 * (1 - Math.abs(candidate.duration_seconds - 40) / 20),
      );
      const decision = Number((
        0.35 * score.hook +
        0.35 * score.cliffhanger +
        0.2 * score.standalone +
        0.1 * durationFit
      ).toFixed(1));
      return {
        ...candidate,
        why_it_works: score.why_it_works,
        scores: {
          hook: score.hook,
          cliffhanger: score.cliffhanger,
          standalone: score.standalone,
          decision,
        },
        score_source: `${response.provider}/${response.model}`,
      };
    });
  };

  const finalizeRun = ({
    candidates,
    summary,
    startedAt,
    createdAt,
    context,
    stageTimingsMs,
    scoreResponse,
    rawModelResponses = [],
    modelCandidatesScored = 0,
    status,
    errors = [],
  }: {
    candidates: PromoCandidateItem[];
    summary: RunCheckSummary;
    startedAt: number;
    createdAt: string;
    context: RunInputContext;
    stageTimingsMs: Record<string, number>;
    scoreResponse?: DemoScoreResponse;
    rawModelResponses?: DemoRunRecord["raw_model_responses"];
    modelCandidatesScored?: number;
    status: DemoRunRecord["status"];
    errors?: string[];
  }) => {
    const isSeriesMode = parsedEpisodes.length > 1;
    const mode = isSeriesMode ? "series" : "episode";
    const {
      ranked,
      whyTop3: top3Reasons,
      whyTop10: top10Reasons,
      allCandidatesByEpisode: epMap,
    } = rankAllEpisodesGlobally(candidates, {
      mode,
      varietyCap: 2,
      qualityThreshold: isSeriesMode ? 70.0 : 0.0,
      topLimit: isSeriesMode ? 25 : 3,
    });
    const wallTimeSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
    const completedSummary: RunCheckSummary = {
      ...summary,
      candidates_accepted: ranked.length,
      model_calls: scoreResponse?.model_calls ?? 0,
      wall_time_seconds: wallTimeSeconds,
    };
    const record: DemoRunRecord = {
      run_id: `run-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}`,
      status,
      created_at: createdAt,
      completed_at: new Date().toISOString(),
      show_title: showTitle || "",
      language: context.language,
      target_audience: context.targetAudience.trim() || null,
      episode_count: parsedEpisodes.length,
      mode,
      why_top_10: top10Reasons,
      candidates_evaluated_count: candidates.length,
      parameters: {
        min_duration_seconds: minDuration,
        max_duration_seconds: maxDuration,
        variety_cap: 2,
        model_shortlist_limit: isSeriesMode ? SERIES_MODEL_CANDIDATES : MAX_MODEL_CANDIDATES,
        model_candidates_scored: modelCandidatesScored,
      },
      model: {
        provider: scoreResponse?.provider ?? modelSettings.provider,
        model: scoreResponse?.model ?? modelSettings.modelName,
        base_url: modelSettings.provider === "openai" ? modelSettings.baseUrl : null,
      },
      usage: {
        model_calls: scoreResponse?.model_calls ?? 0,
        input_tokens: scoreResponse?.input_tokens ?? null,
        output_tokens: scoreResponse?.output_tokens ?? null,
        estimated_cost: scoreResponse?.estimated_cost ?? null,
        wall_time_seconds: wallTimeSeconds,
      },
      stage_timings_ms: stageTimingsMs,
      check_summary: completedSummary,
      prompt_sha256: scoreResponse?.prompt_sha256 ?? null,
      errors,
      raw_model_responses: rawModelResponses.length > 0
        ? rawModelResponses
        : scoreResponse
          ? [{ filename: "model_response_001.json", content: scoreResponse.raw_response }]
          : [],
    };
    setRankedPromos(ranked);
    setWhyTop3(top3Reasons);
    setWhyTop10(top10Reasons);
    setAllCandidatesByEpisode(epMap);
    try {
      sessionStorage.setItem("pf-why-top10", JSON.stringify(top10Reasons));
      sessionStorage.setItem("pf-all-candidates-by-ep", JSON.stringify(epMap));
    } catch {
      // ignore
    }
    setRunSummary(completedSummary);
    setRunRecord(record);
    sessionStorage.removeItem("pf-run-in-progress");
    setModelCallsCount(scoreResponse?.model_calls ?? 0);
    setTokenCount((scoreResponse?.input_tokens ?? 0) + (scoreResponse?.output_tokens ?? 0));
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return ranked;
  };

  // Run Pipeline Execution
  const handleRunPipeline = async (context: RunInputContext) => {
    if (parsedEpisodes.length === 0) return;

    setActiveTab("progress");
    setIsRunning(true);
    setCurrentStageIndex(0);
    setElapsedSeconds(0);
    setModelCallsCount(0);
    setTokenCount(0);
    setRunCancelled(false);
    cancelRequestedRef.current = false;
    setRankedPromos([]);
    setWhyTop3([]);
    setRunSummary(EMPTY_RUN_SUMMARY);
    setRunRecord(null);
    sessionStorage.setItem("pf-run-in-progress", "true");
    setPendingManualRun(null);
    setManualJson("");
    setManualError("");
    sessionStorage.removeItem("pf-approved-candidates");

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
    const createdAt = new Date(startTimestamp).toISOString();
    const stageTimingsMs: Record<string, number> = {};
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
      model_calls: 0,
      wall_time_seconds: 0,
    };

    const allCandidates: PromoCandidateItem[] = [];
    let cancelled = false;
    let modelError: string | null = null;
    let modelCandidatesScored = 0;
    let scoreResponse: DemoScoreResponse | undefined;
    let rawModelResponses: DemoRunRecord["raw_model_responses"] = [];
    stageLoop: for (let s = 0; s < STAGES.length; s++) {
      if (cancelRequestedRef.current) {
        cancelled = true;
        break;
      }
      setCurrentStageIndex(s);
      const stageStarted = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (cancelRequestedRef.current) {
        cancelled = true;
        break;
      }

      if (s === 1) {
        // Generate Candidates stage
        const isSeriesMode = parsedEpisodes.length > 1;
        if (isSeriesMode) {
          const aliasMap = buildSeriesAliasMap(parsedEpisodes);
          applySeriesAliasMapToEpisodes(parsedEpisodes, aliasMap);
        }
        const perEpLimit = isSeriesMode ? 5 : 3;

        for (const ep of parsedEpisodes) {
          if (cancelRequestedRef.current) {
            cancelled = true;
            break stageLoop;
          }
          setProgressStates((prev) => ({
            ...prev,
            [ep.episode_id]: {
              ...prev[ep.episode_id],
              status: "running",
              stage: "Generating Cuts",
            },
          }));
          const cands = generateEpisodePromosClient(ep, minDuration, maxDuration, summary, perEpLimit);
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
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }

      if (s === 2 && modelSettings.provider !== "fallback" && allCandidates.length > 0) {
        const isSeriesMode = parsedEpisodes.length > 1;
        const shortlistLimit = isSeriesMode ? SERIES_MODEL_CANDIDATES : MAX_MODEL_CANDIDATES;
        const candidatesToScore = shortlistCandidatesForModel(allCandidates, shortlistLimit);
        modelCandidatesScored = candidatesToScore.length;

        if (modelSettings.provider === "no-api") {
          const noApiCandidates = candidatesToScore.slice(0, 30);
          const promptPayload = {
            show_title: showTitle || "",
            language: context.language,
            target_audience: context.targetAudience.trim() || null,
            candidates: toScoreCandidates(noApiCandidates),
          };
          try {
            const prompt = await api.createDemoScoringPrompt(promptPayload);
            stageTimingsMs[STAGES[s]] = Math.round(performance.now() - stageStarted);
            setPendingManualRun({
              candidates: allCandidates,
              summary,
              startedAt: startTimestamp,
              createdAt,
              context,
              stageTimingsMs,
              prompt,
            });
            setIsRunning(false);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            showToast({
              message: "Prompt ready. Paste one schema-valid JSON response to continue the run.",
              type: "info",
            });
            return;
          } catch (error) {
            modelError = error instanceof Error ? error.message : String(error);
            break stageLoop;
          }
        }

        try {
          const batches = chunkArray(candidatesToScore, MODEL_BATCH_SIZE);
          const accumulatedScores: DemoModelScore[] = [];
          const rawResponses: Array<{ filename: string; content: string }> = [];
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCost = 0;
          let totalCalls = 0;
          let totalRetries = 0;
          let lastPromptSha = "";

          for (let b = 0; b < batches.length; b++) {
            if (cancelRequestedRef.current) {
              cancelled = true;
              break stageLoop;
            }
            const batch = batches[b];
            const batchPromptPayload = {
              show_title: showTitle || "",
              language: context.language,
              target_audience: context.targetAudience.trim() || null,
              candidates: toScoreCandidates(batch),
              model: {
                provider: modelSettings.provider,
                model: modelSettings.modelName,
                base_url: modelSettings.baseUrl,
                temperature: modelSettings.temperature,
                max_tokens: modelSettings.maxTokens,
              },
            };
            const batchResp = await api.runDemoScoring(batchPromptPayload);
            accumulatedScores.push(...batchResp.scores);
            rawResponses.push({
              filename: `model_response_batch_${b + 1}.json`,
              content: batchResp.raw_response,
            });
            totalInputTokens += batchResp.input_tokens ?? 0;
            totalOutputTokens += batchResp.output_tokens ?? 0;
            totalCost += batchResp.estimated_cost ?? 0;
            totalCalls += batchResp.model_calls;
            totalRetries += batchResp.retries ?? 0;
            lastPromptSha = batchResp.prompt_sha256;

            setModelCallsCount(totalCalls);
            setTokenCount(totalInputTokens + totalOutputTokens);

            // Apply model scores to allCandidates pool incrementally
            const batchScoreResponse: DemoScoreResponse = {
              provider: batchResp.provider,
              model: batchResp.model,
              scores: batchResp.scores,
              model_calls: batchResp.model_calls,
              input_tokens: batchResp.input_tokens,
              output_tokens: batchResp.output_tokens,
              estimated_cost: batchResp.estimated_cost,
              latency_ms: batchResp.latency_ms,
              retries: batchResp.retries ?? 0,
              prompt_sha256: batchResp.prompt_sha256,
              raw_response: batchResp.raw_response,
            };
            const scoredPool = applyModelScores(allCandidates, batchScoreResponse);
            allCandidates.splice(0, allCandidates.length, ...scoredPool);
          }

          scoreResponse = {
            provider: modelSettings.provider,
            model: modelSettings.modelName,
            scores: accumulatedScores,
            model_calls: totalCalls,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            estimated_cost: Number(totalCost.toFixed(6)),
            latency_ms: Math.round(performance.now() - stageStarted),
            retries: totalRetries,
            prompt_sha256: lastPromptSha,
            raw_response: JSON.stringify(accumulatedScores, null, 2),
          };
          rawModelResponses = rawResponses;
        } catch (error) {
          modelError = error instanceof Error ? error.message : String(error);
          for (const episode of parsedEpisodes) {
            setProgressStates((previous) => ({
              ...previous,
              [episode.episode_id]: {
                ...previous[episode.episode_id],
                status: "failed",
                stage: "Model scoring failed",
                error: modelError || "Model scoring failed",
              },
            }));
          }
          break stageLoop;
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
      stageTimingsMs[STAGES[s]] = Math.round(performance.now() - stageStarted);
    }

    const status: DemoRunRecord["status"] = cancelled
      ? "cancelled"
      : modelError
        ? "partial_model_failure"
        : "complete";
    const ranked = finalizeRun({
      candidates: allCandidates,
      summary,
      startedAt: startTimestamp,
      createdAt,
      context,
      stageTimingsMs,
      scoreResponse,
      rawModelResponses,
      modelCandidatesScored,
      status,
      errors: modelError ? [modelError] : [],
    });

    showToast({
      message: cancelled
        ? `Run cancelled. ${ranked.length} partial ranked promo(s) retained.`
        : modelError
          ? `Model scoring failed: ${modelError}. Partial rule shortlist retained and clearly labelled.`
          : `Pipeline complete: ${ranked.length} promos ranked globally across ${parsedEpisodes.length} episode(s).`,
      type: cancelled || modelError ? "warning" : "success",
    });

    if (!cancelled) {
      setTimeout(() => {
        setActiveTab("ranked");
      }, 600);
    }
  };

  const handleManualScoreSubmit = async () => {
    if (!pendingManualRun || !manualJson.trim()) {
      setManualError("Paste the model JSON response before continuing.");
      return;
    }
    setManualSubmitting(true);
    setManualError("");
    try {
      const response = await api.runDemoScoring({
        show_title: showTitle || "",
        language: pendingManualRun.context.language,
        target_audience: pendingManualRun.context.targetAudience.trim() || null,
        candidates: toScoreCandidates(pendingManualRun.candidates),
        model: {
          provider: "no-api",
          model: "manual-paste",
          base_url: "",
          temperature: modelSettings.temperature,
          max_tokens: modelSettings.maxTokens,
        },
        manual_payload: manualJson,
      });
      const scored = applyModelScores(pendingManualRun.candidates, response);
      const stageTimingsMs = {
        ...pendingManualRun.stageTimingsMs,
        Score: response.latency_ms,
        Checks: 0,
        "De-conflict": 0,
        Rank: 0,
        Export: 0,
      };
      for (const episode of parsedEpisodes) {
        setProgressStates((previous) => ({
          ...previous,
          [episode.episode_id]: {
            ...previous[episode.episode_id],
            status: "done",
            stage: "Complete",
          },
        }));
      }
      const ranked = finalizeRun({
        candidates: scored,
        summary: pendingManualRun.summary,
        startedAt: pendingManualRun.startedAt,
        createdAt: pendingManualRun.createdAt,
        context: pendingManualRun.context,
        stageTimingsMs,
        scoreResponse: response,
        status: "complete",
      });
      setPendingManualRun(null);
      setManualJson("");
      showToast({
        message: `Manual JSON validated. ${ranked.length} promos ranked with the pasted model scores.`,
        type: "success",
      });
      setActiveTab("ranked");
    } catch (error) {
      setManualError(error instanceof Error ? error.message : String(error));
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleManualRunCancel = () => {
    if (!pendingManualRun) return;
    const ranked = finalizeRun({
      candidates: pendingManualRun.candidates,
      summary: pendingManualRun.summary,
      startedAt: pendingManualRun.startedAt,
      createdAt: pendingManualRun.createdAt,
      context: pendingManualRun.context,
      stageTimingsMs: pendingManualRun.stageTimingsMs,
      status: "cancelled",
      errors: ["No-API scoring was cancelled before JSON was supplied."],
    });
    setPendingManualRun(null);
    setManualJson("");
    setRunCancelled(true);
    showToast({
      message: `Manual scoring cancelled. ${ranked.length} partial rule shortlist item(s) retained.`,
      type: "warning",
    });
    setActiveTab("ranked");
  };

  const handleCancelRun = () => {
    cancelRequestedRef.current = true;
    setRunCancelled(true);
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
    setRankedPromos((prev) => {
      const next = prev.map((p) =>
        p.id === promoId
          ? { ...p, status, rejection_reason: rejectionReason }
          : p
      );
      setRunSummary((summary) => ({
        ...summary,
        candidates_accepted: next.filter((promo) => promo.status === "approved").length,
      }));
      setRunRecord((record) => record ? {
        ...record,
        check_summary: {
          ...record.check_summary,
          candidates_accepted: next.filter((promo) => promo.status === "approved").length,
        },
      } : record);
      return next;
    });

    // Persist approval / rejection lists
    try {
      const approvedList = new Set<string>(
        JSON.parse(sessionStorage.getItem("pf-approved-candidates") || "[]")
      );
      if (status === "approved") {
        approvedList.add(promoId);
      } else {
        approvedList.delete(promoId);
      }
      sessionStorage.setItem("pf-approved-candidates", JSON.stringify([...approvedList]));
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
        const episode = parsedEpisodes.find((item) => item.episode_id === p.episode);
        if (!episode) return p;
        return adjustPromoCandidate(p, episode, startMs, endMs).promo || p;
      })
    );
  };

  const clearCurrentWorkspace = () => {
    setShowTitle("");
    setParsedEpisodes([]);
    setRankedPromos([]);
    setWhyTop3([]);
    setWhyTop10([]);
    setAllCandidatesByEpisode({});
    setRunSummary(EMPTY_RUN_SUMMARY);
    setRunRecord(null);
    setProgressStates({});
    setCurrentStageIndex(0);
    setElapsedSeconds(0);
    setModelCallsCount(0);
    setTokenCount(0);
    setRunCancelled(false);
    sessionStorage.removeItem("pf-approved-candidates");
  };

  const handleNewSeries = () => {
    clearCurrentWorkspace();
    setActiveTab("upload");
  };

  const handleOpenSeries = (entry: SeriesLibraryEntry) => {
    setShowTitle(entry.title);
    setParsedEpisodes(entry.episodes);
    setRankedPromos(entry.promos);
    setWhyTop3(entry.why_top_3);
    setWhyTop10(entry.why_top_10);
    setAllCandidatesByEpisode(entry.candidates_by_episode);
    setRunSummary(entry.run_summary);
    setRunRecord(entry.run_record);
    setProgressStates(Object.fromEntries(entry.episodes.map((episode) => [
      episode.episode_id,
      {
        episode_id: episode.episode_id,
        status: "done" as const,
        stage: "Complete",
        candidates_found: entry.candidates_by_episode[episode.episode_id]?.length ?? 0,
      },
    ])));
    setCurrentStageIndex(STAGES.length);
    setElapsedSeconds(entry.run_record.usage.wall_time_seconds ?? entry.run_summary.wall_time_seconds ?? 0);
    setModelCallsCount(entry.run_record.usage.model_calls ?? entry.run_summary.model_calls ?? 0);
    setTokenCount((entry.run_record.usage.input_tokens ?? 0) + (entry.run_record.usage.output_tokens ?? 0));
    setRunCancelled(false);
    setActiveTab("ranked");
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:h-16 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-neutral-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
              <Clapperboard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight font-mono">
                  {PRODUCT_NAME}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Problem 1
                </span>
              </div>
              <div className="text-[11px] text-neutral-400 hidden sm:block">
                AI Editorial Workflow for Microdrama Screenplays
              </div>
            </div>
            <span className={`hidden md:inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
              backendStatus === "connected"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : backendStatus === "checking"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {backendStatus === "connected" ? `API ${backendHealth?.version}` : backendStatus === "checking" ? "API waking up" : "API unavailable"}
            </span>
          </div>

          {/* Navigation Tabs (DEMO.md Section 4: Four Primary Views) */}
          <nav className="flex w-full sm:w-auto items-center gap-1 overflow-x-auto bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "library"
                  ? "bg-neutral-800 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <BookOpen size={14} className={activeTab === "library" ? "text-amber-400" : ""} />
              <span>Library</span>
              {seriesLibrary.length > 0 && (
                <span className="rounded-full bg-neutral-700 px-1.5 text-[10px] text-neutral-200">{seriesLibrary.length}</span>
              )}
            </button>
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
              <span>Upload</span>
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
              <span>Run status</span>
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
              <span>Promos</span>
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
              <span>Quality</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-400 font-mono">
                Audit
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {backendStatus === "checking" && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <span>Waking up the server, please wait… Rule-only scoring remains available.</span>
          </div>
        )}
        {backendStatus === "unavailable" && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            <span>Backend unavailable: {backendError}. Locally, start it with <code>cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000</code>. Rule-only scoring still works.</span>
            <button type="button" onClick={() => void checkBackendHealth()} className="rounded border border-red-400/40 px-3 py-1.5 font-semibold hover:bg-red-500/10">Retry</button>
          </div>
        )}
        {interruptedRun && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            The previous run was interrupted by a page reload. Parsed inputs and completed results were restored; start a new run to resume processing.
          </div>
        )}
        <div className={activeTab === "library" ? "block" : "hidden"}>
          <SeriesLibrary entries={seriesLibrary} onOpen={handleOpenSeries} onNewSeries={handleNewSeries} />
        </div>

        <div className={activeTab === "upload" ? "block" : "hidden"}>
          <View1StartUpload
            parsedEpisodes={parsedEpisodes}
            setParsedEpisodes={(episodes) => {
              setParsedEpisodes(episodes);
              setRankedPromos([]);
              setWhyTop3([]);
              setWhyTop10([]);
              setAllCandidatesByEpisode({});
              setRunSummary(EMPTY_RUN_SUMMARY);
              setRunRecord(null);
              sessionStorage.removeItem("pf-ranked-promos");
              sessionStorage.removeItem("pf-why-top3");
              sessionStorage.removeItem("pf-why-top10");
              sessionStorage.removeItem("pf-all-candidates-by-ep");
              sessionStorage.removeItem("pf-run-summary");
              sessionStorage.removeItem("pf-approved-candidates");
              sessionStorage.removeItem("pf-run-record");
            }}
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
        </div>

        <div className={activeTab === "progress" ? "block" : "hidden"}>
          <View2Progress
            episodes={parsedEpisodes}
            progressStates={progressStates}
            currentStageIndex={currentStageIndex}
            stages={STAGES}
            elapsedSeconds={elapsedSeconds}
            modelCallsCount={modelCallsCount}
            tokenCount={tokenCount}
            isRunning={isRunning}
            wasCancelled={runCancelled}
            awaitingManualScore={Boolean(pendingManualRun)}
            onCancel={handleCancelRun}
            onViewRanked={() => setActiveTab("ranked")}
          />
        </div>

        <div className={activeTab === "ranked" ? "block" : "hidden"}>
          <View3RankedPromos
            promos={rankedPromos}
            episodes={parsedEpisodes}
            whyTop3={whyTop3}
            whyTop10={whyTop10}
            allCandidatesByEpisode={allCandidatesByEpisode}
            showTitle={showTitle}
            runRecord={runRecord}
            onUpdatePromoStatus={handleUpdatePromoStatus}
            onAdjustPromoBoundaries={handleAdjustPromoBoundaries}
            showToast={showToast}
          />
        </div>

        <div className={activeTab === "quality" ? "block" : "hidden"}>
          <View4QualityLimits
            runSummary={runSummary}
            totalEpisodesCount={parsedEpisodes.length}
          />
        </div>
      </main>

      {pendingManualRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-blue-500/30 bg-neutral-900 p-6 shadow-2xl space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                No-API scoring checkpoint
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">Copy prompt, then paste schema-valid JSON</h2>
              <p className="mt-1 text-sm text-neutral-400">
                The run is paused with {pendingManualRun.candidates.length} source-grounded candidate(s). No scores will be fabricated if validation fails.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-neutral-300">Scoring prompt</label>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(pendingManualRun.prompt.prompt);
                    showToast({ message: "Scoring prompt copied to clipboard.", type: "success" });
                  }}
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 cursor-pointer"
                >
                  Copy prompt
                </button>
              </div>
              <textarea
                readOnly
                value={pendingManualRun.prompt.prompt}
                className="h-48 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-neutral-300"
              />
              <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
                <summary className="cursor-pointer text-neutral-300">Required JSON schema</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[10px] text-neutral-400">
                  {JSON.stringify(pendingManualRun.prompt.response_schema, null, 2)}
                </pre>
              </details>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-300">Paste model JSON response</label>
              <textarea
                value={manualJson}
                onChange={(event) => {
                  setManualJson(event.target.value);
                  setManualError("");
                }}
                placeholder='{"scores":[{"candidate_id":"...","hook":80,"cliffhanger":85,"standalone":75,"why_it_works":"..."}]}'
                className="h-48 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs text-white placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
              />
              {manualError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {manualError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
              <span className="text-[11px] text-neutral-500 font-mono">
                Prompt SHA-256: {pendingManualRun.prompt.prompt_sha256}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualRunCancel}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700 cursor-pointer"
                >
                  Cancel and keep partials
                </button>
                <button
                  type="button"
                  disabled={manualSubmitting || !manualJson.trim()}
                  onClick={() => void handleManualScoreSubmit()}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {manualSubmitting ? "Validating…" : "Validate JSON and finish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-neutral-950 border-t border-neutral-800/80 py-4 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-400">{PRODUCT_NAME}</span>
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
