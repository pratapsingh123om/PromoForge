import React, { useEffect, useMemo, useState } from "react";
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
  Maximize2,
  Minimize2,
  Users,
  Clapperboard,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Volume2,
  Smartphone,
  Monitor,
} from "lucide-react";
import {
  CHARACTER_PALETTES,
  characterSeed,
  characterInitials,
} from "./View2Progress";
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
  whyTop10?: string[];
  allCandidatesByEpisode?: Record<string, PromoCandidateItem[]>;
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
  whyTop10 = [],
  allCandidatesByEpisode = {},
  showTitle,
  runRecord,
  onUpdatePromoStatus,
  onAdjustPromoBoundaries,
  showToast,
}: View3Props) {
  const [viewMode, setViewMode] = useState<"series" | "drilldown">("series");
  const [filterEpisode, setFilterEpisode] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFlag, setFilterFlag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"rank" | "duration" | "score">("rank");
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
  const [largeTranscriptId, setLargeTranscriptId] = useState<string | null>(null);
  const [fullBrowserPromoId, setFullBrowserPromoId] = useState<string | null>(null);
  const [fullBrowserCharFilter, setFullBrowserCharFilter] = useState<string>("all");
  const [transcriptCharFilters, setTranscriptCharFilters] = useState<Record<string, string>>({});

  // Animated Storyboard Video Player state
  const [playerPromoId, setPlayerPromoId] = useState<string | null>(null);
  const [playerLineIndex, setPlayerLineIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [playerOrientation, setPlayerOrientation] = useState<"vertical" | "horizontal">("vertical");

  // Reject modal state
  const [rejectingPromoId, setRejectingPromoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("Weak hook in first 3s");

  // Adjust modal state
  const [adjustingPromo, setAdjustingPromo] = useState<PromoCandidateItem | null>(null);
  const [adjStartMs, setAdjStartMs] = useState<number>(0);
  const [adjEndMs, setAdjEndMs] = useState<number>(0);

  const allAvailableEpisodes = useMemo(() => {
    if (episodes && episodes.length > 0) {
      return episodes.map((e) => e.episode_id).sort();
    }
    if (allCandidatesByEpisode && Object.keys(allCandidatesByEpisode).length > 0) {
      return Object.keys(allCandidatesByEpisode).sort();
    }
    return Array.from(new Set(promos.map((p) => p.episode))).sort();
  }, [episodes, allCandidatesByEpisode, promos]);

  const [drilldownEpisode, setDrilldownEpisode] = useState<string>(() => {
    return episodes[0]?.episode_id || "EP_001";
  });

  const activeDrilldownEpisode = drilldownEpisode || allAvailableEpisodes[0] || "EP_001";

  const drilldownPromos = useMemo(() => {
    const list =
      allCandidatesByEpisode[activeDrilldownEpisode] ||
      promos.filter((p) => p.episode === activeDrilldownEpisode);
    return [...list].sort(
      (a, b) =>
        (b.acquisition_score ?? b.scores.decision) -
        (a.acquisition_score ?? a.scores.decision),
    );
  }, [allCandidatesByEpisode, activeDrilldownEpisode, promos]);

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
        if (sortBy === "score") {
          return (
            (b.acquisition_score ?? b.scores.decision) -
            (a.acquisition_score ?? a.scores.decision)
          );
        }
        return 0;
      });
  }, [promos, filterEpisode, filterStatus, filterFlag, sortBy]);

  const acceptedCount = useMemo(
    () => promos.filter((p) => p.status === "approved").length,
    [promos]
  );
  const castPreview = useMemo(() => {
    const speakers = new Map<string, { name: string; lines: number; episodes: Set<string> }>();
    episodes.forEach((episode) => episode.events.forEach((event) => {
      if (event.type !== "dialogue" || !event.speaker) return;
      const key = event.speaker.trim().toUpperCase();
      const current = speakers.get(key) || { name: event.speaker.trim(), lines: 0, episodes: new Set<string>() };
      current.lines += 1;
      current.episodes.add(episode.episode_id);
      speakers.set(key, current);
    }));
    return Array.from(speakers.values()).sort((a, b) => b.lines - a.lines).slice(0, 8);
  }, [episodes]);

  const characterMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        initials: string;
        lines: number;
        episodes: Set<string>;
        role: "Lead voice" | "Recurring" | "Supporting";
        palette: readonly [string, string, string];
      }
    >();

    episodes.forEach((episode) => {
      episode.events.forEach((event) => {
        if (event.type !== "dialogue" || !event.speaker?.trim()) return;
        const name = event.speaker.trim().replace(/\s+/g, " ");
        const key = name.toUpperCase();
        const current = map.get(key) || {
          name,
          initials: characterInitials(name),
          lines: 0,
          episodes: new Set<string>(),
          role: "Supporting" as const,
          palette: CHARACTER_PALETTES[characterSeed(name) % CHARACTER_PALETTES.length],
        };
        current.lines += 1;
        current.episodes.add(episode.episode_id);
        map.set(key, current);
      });
    });

    promos.forEach((promo) => {
      promo.transcript_lines.forEach((line) => {
        if (line.event_type !== "dialogue" || !line.speaker?.trim()) return;
        const name = line.speaker.trim().replace(/\s+/g, " ");
        const key = name.toUpperCase();
        if (!map.has(key)) {
          map.set(key, {
            name,
            initials: characterInitials(name),
            lines: 1,
            episodes: new Set([promo.episode]),
            role: "Supporting" as const,
            palette: CHARACTER_PALETTES[characterSeed(name) % CHARACTER_PALETTES.length],
          });
        }
      });
    });

    const sorted = Array.from(map.values()).sort((a, b) => b.lines - a.lines);
    sorted.forEach((char, index) => {
      if (index < 2) {
        char.role = "Lead voice";
      } else if (char.episodes.size > 1 || char.lines >= 6) {
        char.role = "Recurring";
      } else {
        char.role = "Supporting";
      }
    });

    return map;
  }, [episodes, promos]);

  const playerPromo = useMemo(() => {
    if (!playerPromoId) return null;
    return (
      promos.find((p) => p.id === playerPromoId) ||
      Object.values(allCandidatesByEpisode).flat().find((p) => p.id === playerPromoId) ||
      null
    );
  }, [playerPromoId, promos, allCandidatesByEpisode]);

  const fullBrowserPromo = useMemo(() => {
    if (!fullBrowserPromoId) return null;
    return (
      promos.find((p) => p.id === fullBrowserPromoId) ||
      Object.values(allCandidatesByEpisode).flat().find((p) => p.id === fullBrowserPromoId) ||
      null
    );
  }, [fullBrowserPromoId, promos, allCandidatesByEpisode]);

  // Storyboard Animation playback loop
  useEffect(() => {
    if (!isPlaying || !playerPromo || playerPromo.transcript_lines.length === 0) return;
    const currentLine = playerPromo.transcript_lines[playerLineIndex];
    const wordCount = currentLine?.text.split(/\s+/).length || 8;
    const stepDuration = Math.max(1600, Math.min(4800, wordCount * 240)) / playbackSpeed;
    const timer = setTimeout(() => {
      setPlayerLineIndex((prev) => {
        if (prev + 1 >= playerPromo.transcript_lines.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, stepDuration);
    return () => clearTimeout(timer);
  }, [isPlaying, playerLineIndex, playerPromo, playbackSpeed]);

  // Global keydown handler for player and full browser reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (playerPromoId) setPlayerPromoId(null);
        else if (fullBrowserPromoId) setFullBrowserPromoId(null);
      } else if (e.key === " " && playerPromoId) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === "ArrowRight" && playerPromoId && playerPromo) {
        setPlayerLineIndex((prev) => Math.min(playerPromo.transcript_lines.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft" && playerPromoId) {
        setPlayerLineIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playerPromoId, fullBrowserPromoId, playerPromo]);

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
    const files = createRunExportFiles(runRecord, promos, whyTop10.length > 0 ? whyTop10 : whyTop3);
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
      why_top_10_ranking: whyTop10.length > 0 ? whyTop10 : whyTop3,
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
    const topReasons = whyTop10.length > 0 ? whyTop10 : whyTop3;
    md += `## Why This Campaign Ranking (${topReasons.length <= 3 ? "Top 3" : "Top 10"})\n\n`;
    for (const r of topReasons) {
      md += `- ${r}\n`;
    }
    md += `\n## Master Ranked Promos\n\n`;
    md += `| Rank | Candidate Key | Ep | In | Out | Dur | Raw Score | Series Adj. | Ranking Score | Status | Why It Works |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const p of promos) {
      const adjustment = p.ranking_adjustment ?? 0;
      md += `| #${p.global_rank} | \`${p.candidate_key}\` | ${p.episode} | ${p.start_clock} | ${p.end_clock} | ${p.duration_seconds}s | ${p.scores.decision} | ${adjustment > 0 ? "+" : ""}${adjustment} | ${p.acquisition_score ?? p.scores.decision} | ${p.status} | ${p.why_it_works} |\n`;
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

  const exportOtio = () => {
    const otioClips = promos.flatMap((p) =>
      p.segments.map((segment) => ({
        OTIO_SCHEMA: "Clip.1",
        name: `${p.candidate_key} (${segment.episode})`,
        source_range: {
          OTIO_SCHEMA: "TimeRange.1",
          start_time: {
            OTIO_SCHEMA: "RationalTime.1",
            value: Math.round(segment.start_ms / (1000 / 30)),
            rate: 30,
          },
          duration: {
            OTIO_SCHEMA: "RationalTime.1",
            value: Math.round(segment.duration_seconds * 30),
            rate: 30,
          },
        },
        metadata: {
          promoforge: {
            promo_id: p.candidate_key,
            episode: segment.episode,
            start_clock: segment.start_clock,
            end_clock: segment.end_clock,
            note: "Screenplay-only cut plan. Not tested on footage because the pack is screenplays only.",
          },
        },
      })),
    );
    const otio = {
      OTIO_SCHEMA: "Timeline.1",
      name: `${PRODUCT_NAME}_CUTS`,
      metadata: {
        promoforge: {
          note: "Screenplay-only cut plan. Not tested on footage because the pack is screenplays only.",
        },
      },
      tracks: {
        OTIO_SCHEMA: "Stack.1",
        children: [
          {
            OTIO_SCHEMA: "Track.1",
            name: "V1",
            kind: "Video",
            children: otioClips,
          },
        ],
      },
    };
    downloadFile("promos.otio", JSON.stringify(otio, null, 2), "application/json");
  };

  const exportSelectedPromos = () => {
    const selected = promos.filter((p) => p.status === "approved");
    if (selected.length === 0) {
      showToast({ message: "No approved promos to export. Accept at least one promo first.", type: "warning" });
      return;
    }
    const data = {
      product: PRODUCT_NAME,
      show_title: showTitle,
      export_timestamp: new Date().toISOString(),
      selected_count: selected.length,
      promos: selected,
    };
    downloadFile("selected_promos.json", JSON.stringify(data, null, 2), "application/json");
  };

  const exportSinglePromo = (promo: PromoCandidateItem) => {
    const data = {
      product: PRODUCT_NAME,
      show_title: showTitle,
      export_timestamp: new Date().toISOString(),
      promo,
    };
    downloadFile(`${promo.candidate_key}.json`, JSON.stringify(data, null, 2), "application/json");
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

  const renderTranscriptLine = (
    t: PromoCandidateItem["transcript_lines"][number],
    idx: number,
    isFullBrowser = false
  ) => {
    const isDialogue = t.event_type === "dialogue" && !!t.speaker;
    const speakerKey = t.speaker?.trim().toUpperCase() || "";
    const char = isDialogue
      ? characterMap.get(speakerKey) || {
          name: t.speaker!.trim(),
          initials: characterInitials(t.speaker!),
          role: "Supporting" as const,
          palette: CHARACTER_PALETTES[characterSeed(t.speaker!) % CHARACTER_PALETTES.length],
        }
      : null;

    return (
      <div
        key={idx}
        className={`rounded-xl border transition-all ${
          isFullBrowser ? "p-4" : "p-3"
        } ${
          t.is_hook
            ? "bg-amber-950/20 border-amber-500/50 shadow-sm shadow-amber-500/10 text-amber-100"
            : t.is_cliffhanger
              ? "bg-purple-950/20 border-purple-500/50 shadow-sm shadow-purple-500/10 text-purple-100"
              : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 text-neutral-200"
        }`}
      >
        {/* Line Header with Character Widget */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800/60 pb-2 mb-2">
          {char ? (
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Character Avatar Widget */}
              <div
                className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/20 shadow-md overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${char.palette[2]} 0%, ${char.palette[0]} 52%, ${char.palette[1]} 100%)`,
                }}
              >
                <span className="text-[10px] font-black tracking-tight text-white drop-shadow">
                  {char.initials}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="font-bold text-white text-xs tracking-tight truncate">
                  {char.name}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                    char.role === "Lead voice"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : char.role === "Recurring"
                        ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                        : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                  }`}
                >
                  {char.role}
                </span>
                {t.is_hook && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40">
                    OPENS CLIP
                  </span>
                )}
                {t.is_cliffhanger && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/25 text-purple-300 border border-purple-500/40">
                    ENDS CLIP
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-neutral-400">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-neutral-400">
                <Clapperboard size={11} />
              </span>
              <span className="font-semibold text-[11px] text-neutral-300">
                {t.event_type === "action" ? "Action / Stage Direction" : t.event_type === "camera" ? "Camera Cue" : "Scene Direction"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 shrink-0">
            <Clock3 size={11} className="text-neutral-500" />
            <span>{t.start_clock} → {t.end_clock}</span>
          </div>
        </div>

        {/* Spoken Text or Scene Direction */}
        <p className={`leading-relaxed ${isDialogue ? "font-serif text-sm text-neutral-100 italic pl-1" : "font-sans text-xs text-neutral-300"}`}>
          {isDialogue ? `"${t.text.replace(/^["']|["']$/g, "")}"` : t.text}
        </p>

        {/* Badges */}
        {t.is_hook && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30 w-fit">
            <span>★</span>
            <span>OPENING HOOK (First 3s Anchor)</span>
          </div>
        )}
        {t.is_cliffhanger && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/30 w-fit">
            <span>⚡</span>
            <span>CLIFFHANGER PEAK (Final Unresolved Beat)</span>
          </div>
        )}
      </div>
    );
  };

  const renderPromoCard = (promo: PromoCandidateItem, isDrilldown = false) => {
    const isApproved = promo.status === "approved";
    const isRejected = promo.status === "rejected";
    const isExpanded = !!expandedTranscripts[promo.id];
    const isLargeTranscript = largeTranscriptId === promo.id;
    const clipCharacters = Array.from(promo.transcript_lines.reduce((characters, line) => {
      if (!line.speaker) return characters;
      const key = line.speaker.trim().toUpperCase();
      const current = characters.get(key) || { name: line.speaker.trim(), lines: 0, hook: false, cliffhanger: false };
      current.lines += 1;
      current.hook ||= line.is_hook;
      current.cliffhanger ||= line.is_cliffhanger;
      characters.set(key, current);
      return characters;
    }, new Map<string, { name: string; lines: number; hook: boolean; cliffhanger: boolean }>()).values());
    const rankingScore = promo.acquisition_score ?? promo.scores.decision;
    const severeFlags = promo.quality_flags.filter((flag) =>
      ["soft hook", "possible fake cliffhanger", "needs context", "late-series spoiler risk"].includes(flag),
    );
    const decision = rankingScore < 70 || severeFlags.length >= 2
      ? { label: "Hold — weak/risky pick", detail: "Do not advance automatically; the score or combined risks make this a poor final candidate.", tone: "red" }
      : severeFlags.length === 1 || rankingScore < 80
        ? { label: "Review risk", detail: `Promising, but verify ${severeFlags[0] || "the lower ranking score"} before production.`, tone: "amber" }
        : { label: "Advance", detail: "Strong ranking score with no major automated risk flags; suitable for final production review.", tone: "emerald" };

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
              {promo.global_rank > 0 ? `#${promo.global_rank}` : "•"}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-white text-sm font-mono">
                  {promo.candidate_key}
                </span>
                <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-xs">
                  {promo.episode}
                </span>
                {promo.post_priority && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      promo.global_rank === 1
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : promo.global_rank === 2
                          ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                          : promo.global_rank === 3
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                            : promo.is_top_10
                              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700"
                    }`}
                  >
                    {promo.post_priority}
                  </span>
                )}
                {promo.moment_type && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-800/80 text-neutral-300 border border-neutral-700 capitalize">
                    {promo.moment_type.replace(/_/g, " ")}
                  </span>
                )}
                {promo.acquisition_score !== undefined && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                    Ranking Score: {promo.acquisition_score}/100
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                  decision.tone === "emerald"
                    ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/40"
                    : decision.tone === "amber"
                      ? "bg-amber-950/50 text-amber-300 border-amber-500/40"
                      : "bg-red-950/50 text-red-300 border-red-500/40"
                }`} title={decision.detail}>
                  Final check: {decision.label}
                </span>
                {promo.quality_flags.includes("late-series spoiler risk") && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-950/60 text-red-300 border border-red-500/40 flex items-center gap-1">
                    <AlertTriangle size={11} /> Late-Series Spoiler Risk
                  </span>
                )}
                {promo.quality_flags.includes("requires series context") && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <AlertTriangle size={11} /> Requires Context
                  </span>
                )}
                {promo.quality_flags.includes("context review needed") && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1" title={promo.context_warning_reason}>
                    <AlertTriangle size={11} /> Context Review Needed (AI Disagreement)
                  </span>
                )}
                {promo.segments.length > 1 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-500/40">
                    {promo.segments.length} Segments
                  </span>
                )}
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

          {/* Actions: Play Animated Cut, Expand, Accept, Reject, Adjust, Export Single */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setPlayerPromoId(promo.id);
                setPlayerLineIndex(0);
                setIsPlaying(true);
              }}
              title="Play animated cut slide show"
              className="px-2.5 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Play size={12} className="fill-current" />
              <span className="hidden sm:inline">Play Cut</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFullBrowserPromoId(promo.id);
                setFullBrowserCharFilter("all");
              }}
              title="Expand promo to full browser"
              className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs border border-neutral-700 transition-colors cursor-pointer"
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => exportSinglePromo(promo)}
              title="Download single promo cut specification JSON"
              className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs border border-neutral-700 transition-colors cursor-pointer"
            >
              <Download size={13} />
            </button>
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

            <div className="rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.08] to-transparent p-3.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
                <Sparkles size={13} /> Editorial reasoning
              </span>
              <p className="text-neutral-100 mt-1.5 text-[13px] leading-6">
                {promo.why_it_works}
              </p>
            </div>
          </div>

          {/* Scores & Hard Check Badges */}
          <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2">
                <span className="font-semibold text-neutral-300">
                  Ranking Score
                </span>
                <span className="text-base font-bold text-amber-400 font-mono">
                  {promo.acquisition_score ?? promo.scores.decision} / 100
                </span>
              </div>

              <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-400">
                <span>Raw decision blend</span>
                <span className="font-mono text-neutral-200">{promo.scores.decision}</span>
              </div>
              <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-400">
                <span>Series adjustment</span>
                <span className={`font-mono ${(promo.ranking_adjustment ?? 0) < 0 ? "text-red-300" : (promo.ranking_adjustment ?? 0) > 0 ? "text-emerald-300" : "text-neutral-300"}`}>
                  {(promo.ranking_adjustment ?? 0) > 0 ? "+" : ""}{promo.ranking_adjustment ?? 0}
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

        {/* Clip-specific character widgets */}
        {clipCharacters.length > 0 && (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                <Users size={13} /> Characters in this promo
              </span>
              <span className="text-[10px] text-neutral-500">Generated from the selected cut</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {clipCharacters.map((character, index) => {
                const initials = character.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
                const gradients = ["from-rose-500 to-orange-500", "from-violet-500 to-fuchsia-500", "from-cyan-500 to-blue-600", "from-emerald-500 to-teal-600", "from-amber-400 to-red-500", "from-indigo-500 to-purple-600"];
                return (
                  <div key={character.name} className="flex min-w-[210px] items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradients[index % gradients.length]} text-sm font-black text-white shadow-lg`}>{initials}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-white">{character.name}</div>
                      <div className="mt-1 text-[10px] text-neutral-500">{character.lines} dialogue line{character.lines === 1 ? "" : "s"}</div>
                      <div className="mt-1 flex gap-1">
                        {character.hook && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">OPENS CLIP</span>}
                        {character.cliffhanger && <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300">ENDS CLIP</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transcript Preview Toggle & Player Controls */}
        <div className="mt-4 pt-3 border-t border-neutral-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPlayerPromoId(promo.id);
                  setPlayerLineIndex(0);
                  setIsPlaying(true);
                }}
                className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer transition-colors"
              >
                <Play size={11} className="fill-current" />
                <span>Play Animated Cut</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFullBrowserPromoId(promo.id);
                  setFullBrowserCharFilter("all");
                }}
                className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-white cursor-pointer transition-colors"
              >
                <Maximize2 size={11} />
                <span>Full browser reader</span>
              </button>
              {isExpanded && (
                <button
                  type="button"
                  onClick={() => setLargeTranscriptId(isLargeTranscript ? null : promo.id)}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[10px] font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-white cursor-pointer transition-colors"
                >
                  {isLargeTranscript ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                  <span>{isLargeTranscript ? "Compact view" : "Expanded view"}</span>
                </button>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="mt-3 space-y-2.5">
              {/* Character quick filter chips inside card */}
              {clipCharacters.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                  <span className="text-neutral-500 uppercase tracking-wider text-[9px] shrink-0 font-semibold">
                    Character filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setTranscriptCharFilters((prev) => ({ ...prev, [promo.id]: "all" }))}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      (!transcriptCharFilters[promo.id] || transcriptCharFilters[promo.id] === "all")
                        ? "bg-amber-500 text-neutral-950 font-bold"
                        : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    All ({promo.transcript_lines.length})
                  </button>
                  {clipCharacters.map((char) => {
                    const isSelected = transcriptCharFilters[promo.id] === char.name.toUpperCase();
                    const initials = characterInitials(char.name);
                    const palette = CHARACTER_PALETTES[characterSeed(char.name) % CHARACTER_PALETTES.length];
                    return (
                      <button
                        key={char.name}
                        type="button"
                        onClick={() =>
                          setTranscriptCharFilters((prev) => ({
                            ...prev,
                            [promo.id]: isSelected ? "all" : char.name.toUpperCase(),
                          }))
                        }
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer border transition-colors ${
                          isSelected
                            ? "bg-amber-500 text-neutral-950 font-bold border-amber-400"
                            : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700"
                        }`}
                      >
                        <span
                          className="flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold text-white shrink-0"
                          style={{ background: `linear-gradient(135deg, ${palette[2]}, ${palette[0]})` }}
                        >
                          {initials}
                        </span>
                        <span>{char.name}</span>
                        <span className="opacity-70">({char.lines})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Transcript Lines with Character Widget */}
              <div
                className={`p-3 rounded-lg bg-neutral-950 border space-y-2 overflow-y-auto font-mono text-xs transition-all ${
                  isLargeTranscript ? "max-h-[72vh] border-amber-500/40 p-4" : "max-h-64 border-neutral-800"
                }`}
              >
                {promo.transcript_lines
                  .filter((t) => {
                    const filter = transcriptCharFilters[promo.id];
                    if (!filter || filter === "all") return true;
                    return t.speaker?.trim().toUpperCase() === filter;
                  })
                  .map((t, idx) => renderTranscriptLine(t, idx, false))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
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
            <button
              type="button"
              onClick={exportOtio}
              className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Film size={13} className="text-amber-300" />
              OTIO Timeline
            </button>
            {acceptedCount > 0 && (
              <button
                type="button"
                onClick={exportSelectedPromos}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <CheckCircle2 size={13} />
                Download Selected ({acceptedCount})
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Funnel: Scored vs Generated (§2 item 3) */}
        <div className="mt-4 pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300">Discovery & Scoring Funnel:</span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
                {runRecord?.candidates_evaluated_count || promos.length} Discovered
              </span>
              <span className="text-neutral-500">→</span>
              <span className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-500/30 text-blue-300">
                {runRecord?.parameters.model_candidates_scored || Math.min(promos.length, 70)} Scored
              </span>
              <span className="text-neutral-500">→</span>
              <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30 text-amber-300">
                {promos.length} Ranked
              </span>
              <span className="text-neutral-500">→</span>
              <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                {acceptedCount} Approved
              </span>
            </div>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Timeline files carry non-tested screenplay disclaimer
          </span>
        </div>

        <p className="mt-2 text-[11px] text-neutral-500">
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

      {castPreview.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Character roster</div>
              <p className="mt-0.5 text-xs text-neutral-500">Generated from canonical screenplay speakers—no invented photographs.</p>
            </div>
            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[10px] text-neutral-400">{castPreview.length} featured</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {castPreview.map((character, index) => {
              const initials = character.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const gradients = ["from-rose-500 to-orange-500", "from-violet-500 to-fuchsia-500", "from-cyan-500 to-blue-600", "from-emerald-500 to-teal-600", "from-amber-400 to-red-500", "from-indigo-500 to-purple-600"];
              return (
                <div key={character.name} className="flex min-w-[190px] items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradients[index % gradients.length]} font-black text-white shadow-lg`}>{initials}</div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-white" title={character.name}>{character.name}</div>
                    <div className="mt-1 text-[10px] text-neutral-500">{character.lines} lines · {character.episodes.size} ep{character.episodes.size === 1 ? "" : "s"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Dual View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("series")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === "series"
                ? "bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            <Sparkles size={14} />
            <span>Series Campaign Ranking</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                viewMode === "series"
                  ? "bg-neutral-950/20 text-neutral-950 font-bold"
                  : "bg-neutral-950 text-neutral-400"
              }`}
            >
              {promos.length} Top Promos
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("drilldown")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === "drilldown"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            <Film size={14} />
            <span>Per-Episode Drill-down</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                viewMode === "drilldown"
                  ? "bg-white/20 text-white font-bold"
                  : "bg-neutral-950 text-neutral-400"
              }`}
            >
              {allAvailableEpisodes.length} Episodes
            </span>
          </button>
        </div>

        <div className="text-xs text-neutral-400">
          {viewMode === "series" ? (
            <span>Global list with Top 10 highlighted · Variety cap & quality threshold applied</span>
          ) : (
            <span>Per-episode workbench · Inspect best cuts per episode with 0 extra model calls</span>
          )}
        </div>
      </div>

      {viewMode === "series" ? (
        <>
          {/* Campaign Launch Priorities Panel (Top 10 / Top 3 Explanation) */}
          {(whyTop10.length > 0 || whyTop3.length > 0) && (
            <div className="p-5 rounded-xl bg-gradient-to-r from-amber-500/10 via-neutral-900 to-purple-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Campaign Launch Priorities ({whyTop10.length > 0 ? "Top 10 Strategy" : "Top 3 Strategy"} · Which to Post First & Why)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                  Acquisition & Diversity Weighted
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Ranked to maximize cold-audience retention, prevent early-dropoff, balance character perspectives, and avoid late-series spoiler penalties:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {(whyTop10.length > 0 ? whyTop10 : whyTop3).map((reason, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-300 leading-relaxed flex items-start gap-2.5"
                  >
                    <span
                      className={`shrink-0 font-bold px-2 py-0.5 rounded text-xs font-mono ${
                        idx === 0
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : idx === 1
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                            : idx === 2
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                              : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span className="flex-1">{reason}</span>
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
                  <>
                    <b className="mb-1 block text-sm text-amber-300">No promo found</b>No source-grounded window satisfied the selected 20–60 second duration and line-boundary rules. Nothing was forced into the ranking.
                  </>
                ) : (
                  "No promos match the current filters."
                )}
              </div>
            ) : (
              filteredPromos.map((promo) => renderPromoCard(promo))
            )}
          </div>
        </>
      ) : (
        /* Per-Episode Drill-down Workbench */
        <div className="space-y-5">
          <div className="p-5 rounded-xl bg-neutral-900 border border-purple-500/30 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Film size={18} className="text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Episode Candidate Inspector (Zero Extra Model Calls)
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-400">Select Episode:</span>
                <select
                  value={activeDrilldownEpisode}
                  onChange={(e) => setDrilldownEpisode(e.target.value)}
                  className="px-3 py-1.5 rounded-md bg-neutral-950 border border-purple-500/50 text-white font-mono font-semibold focus:outline-none cursor-pointer"
                >
                  {allAvailableEpisodes.map((ep) => (
                    <option key={ep} value={ep}>
                      {ep} ({(allCandidatesByEpisode[ep] || promos.filter((p) => p.episode === ep)).length} cuts)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-neutral-400">
              Showing candidates for <b className="text-white">{activeDrilldownEpisode}</b> pre-computed during rule-based discovery. Editors can review standalone lines, fine-tune boundaries, and accept or reject cuts for this episode individually without incurring additional API calls.
            </p>

            {/* Quick Episode Jump Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1 max-h-28 overflow-y-auto">
              {allAvailableEpisodes.map((ep) => {
                const count = (allCandidatesByEpisode[ep] || promos.filter((p) => p.episode === ep)).length;
                const isSelected = ep === activeDrilldownEpisode;
                return (
                  <button
                    key={ep}
                    type="button"
                    onClick={() => setDrilldownEpisode(ep)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                      isSelected
                        ? "bg-purple-600 text-white font-bold shadow-sm"
                        : "bg-neutral-950 hover:bg-neutral-800 text-neutral-400 border border-neutral-800"
                    }`}
                  >
                    {ep} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Drill-down Candidate Cards */}
          <div className="space-y-4">
            {drilldownPromos.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-xl">
                No candidate cuts found for {activeDrilldownEpisode}.
              </div>
            ) : (
              drilldownPromos.map((promo) => renderPromoCard(promo, true))
            )}
          </div>
        </div>
      )}

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

      {/* Full-Browser Reader Modal */}
      {fullBrowserPromo && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/80">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
                {fullBrowserPromo.candidate_key}
              </span>
              <span className="text-sm font-semibold text-neutral-200">
                {fullBrowserPromo.episode} · Full Script Cut Reader
              </span>
              <span className="font-mono text-xs text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
                {fullBrowserPromo.duration_seconds}s cut ({fullBrowserPromo.start_clock} → {fullBrowserPromo.end_clock})
              </span>
              <span className="text-xs text-purple-400 font-mono font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
                Score: {Math.round((fullBrowserPromo.scores?.decision ?? fullBrowserPromo.scores?.hook ?? 0.8) * 100)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlayerPromoId(fullBrowserPromo.id);
                  setPlayerLineIndex(0);
                  setIsPlaying(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-xs cursor-pointer shadow-sm transition-all"
                title="Launch Animated Storyboard Player"
              >
                <Play size={13} className="fill-current" />
                Play Slide Show
              </button>
              <button
                type="button"
                onClick={() => exportSinglePromo(fullBrowserPromo)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs cursor-pointer"
                title="Export this single cut JSON"
              >
                <FileJson size={13} />
                Export Cut
              </button>
              <button
                type="button"
                onClick={() => setFullBrowserPromoId(null)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white cursor-pointer"
                title="Close Full Browser Reader (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Character Filter Bar */}
          <div className="flex items-center justify-between px-6 py-2.5 bg-neutral-900/50 border-b border-neutral-800/80">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                <Users size={12} className="text-neutral-500" /> Character Filter:
              </span>
              {(() => {
                const charCounts = new Map<string, number>();
                fullBrowserPromo.transcript_lines.forEach((t) => {
                  if (t.speaker) {
                    const spk = t.speaker.trim();
                    charCounts.set(spk, (charCounts.get(spk) || 0) + 1);
                  }
                });
                const chars = Array.from(charCounts.keys());
                return (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFullBrowserCharFilter("all")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                        (!fullBrowserCharFilter || fullBrowserCharFilter.toLowerCase() === "all")
                          ? "bg-amber-500 text-neutral-950 font-bold shadow-sm"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      }`}
                    >
                      All Beats ({fullBrowserPromo.transcript_lines.length})
                    </button>
                    {chars.map((charName) => {
                      const count = charCounts.get(charName) || 0;
                      const charData = characterMap.get(charName.toUpperCase());
                      const isSelected = fullBrowserCharFilter.toLowerCase() === charName.toLowerCase();
                      return (
                        <button
                          key={charName}
                          type="button"
                          onClick={() => setFullBrowserCharFilter(isSelected ? "all" : charName)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-all ${
                            isSelected
                              ? "bg-purple-600 text-white font-bold shadow-sm"
                              : "bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-neutral-700/60"
                          }`}
                        >
                          {charData && (
                            <span
                              className="h-2 w-2 rounded-full inline-block"
                              style={{ backgroundColor: charData.palette[0] }}
                            />
                          )}
                          <span>{charName}</span>
                          <span className="text-[10px] text-neutral-400 font-mono">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="text-xs text-neutral-400 hidden sm:flex items-center gap-4">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono text-[10px] text-neutral-300">Esc</kbd> to exit</span>
            </div>
          </div>

          {/* Transcript Scroll Area */}
          <div className="flex-1 overflow-y-auto px-6 py-6 max-w-5xl mx-auto w-full space-y-3">
            {(() => {
              const filtered = fullBrowserPromo.transcript_lines.filter((line) => {
                if (!fullBrowserCharFilter || fullBrowserCharFilter.toLowerCase() === "all") return true;
                return line.speaker?.trim().toLowerCase() === fullBrowserCharFilter.toLowerCase();
              });
              if (filtered.length === 0) {
                return (
                  <div className="p-12 text-center text-neutral-500 bg-neutral-900/50 border border-neutral-800 rounded-xl space-y-2">
                    <p className="text-sm font-semibold text-neutral-300">
                      No dialogue lines found for "{fullBrowserCharFilter}"
                    </p>
                    <p className="text-xs text-neutral-500">
                      Click "All Beats" above to view all dialogue and action beats inside this cut.
                    </p>
                  </div>
                );
              }
              return filtered.map((line, idx) => renderTranscriptLine(line, idx, true));
            })()}
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900/80 flex items-center justify-between text-xs text-neutral-400">
            <div className="flex items-center gap-4">
              <span><b>Hook:</b> "{fullBrowserPromo.hook_line}"</span>
              <span>•</span>
              <span><b>Cliffhanger:</b> "{fullBrowserPromo.cliffhanger_line}"</span>
            </div>
            <div className="font-mono text-[11px] text-neutral-500">
              PromoForge Precision Screenplay Reader
            </div>
          </div>
        </div>
      )}

      {/* Animated Storyboard Slide Show Player Modal */}
      {playerPromo && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 overflow-hidden animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="w-full max-w-5xl flex items-center justify-between text-neutral-300 z-10">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/30">
                {playerPromo.candidate_key}
              </span>
              <span className="text-xs text-neutral-400">
                {playerPromo.episode} · Beat {playerLineIndex + 1} of {playerPromo.transcript_lines.length}
              </span>
            </div>

            {/* Controls Right */}
            <div className="flex items-center gap-3">
              {/* Orientation Toggle */}
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setPlayerOrientation("horizontal")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer ${
                    playerOrientation === "horizontal"
                      ? "bg-neutral-800 text-white font-semibold"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="Widescreen (16:9)"
                >
                  <Monitor size={13} />
                  <span className="hidden sm:inline">16:9</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerOrientation("vertical")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer ${
                    playerOrientation === "vertical"
                      ? "bg-neutral-800 text-white font-semibold"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="Vertical Reels (9:16)"
                >
                  <Smartphone size={13} />
                  <span className="hidden sm:inline">9:16</span>
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setPlayerPromoId(null);
                  setIsPlaying(false);
                }}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
                title="Close Player (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Center Stage: The Slide Player Screen */}
          <div className="flex-1 w-full flex items-center justify-center p-2 sm:p-4 min-h-0">
            {(() => {
              const currentLine = playerPromo.transcript_lines[playerLineIndex];
              if (!currentLine) return null;
              const isDialogue = currentLine.event_type === "dialogue" && !!currentLine.speaker;
              const speakerKey = currentLine.speaker?.trim().toUpperCase() || "";
              const char = isDialogue
                ? characterMap.get(speakerKey) || {
                    name: currentLine.speaker!.trim(),
                    initials: characterInitials(currentLine.speaker!),
                    role: "Supporting" as const,
                    palette: CHARACTER_PALETTES[characterSeed(currentLine.speaker!) % CHARACTER_PALETTES.length],
                  }
                : null;

              return (
                <div
                  className={`relative flex flex-col justify-between rounded-2xl border border-neutral-800 shadow-2xl p-6 sm:p-8 overflow-hidden transition-all duration-300 ${
                    playerOrientation === "vertical"
                      ? "w-full max-w-sm aspect-[9/16] max-h-[82vh]"
                      : "w-full max-w-3xl aspect-[16/9] max-h-[75vh]"
                  }`}
                  style={{
                    background: char
                      ? `radial-gradient(ellipse at top right, ${char.palette[1]}22 0%, #0a0a0a 75%)`
                      : "radial-gradient(ellipse at center, #171717 0%, #0a0a0a 100%)",
                  }}
                >
                  {/* Slide Ambient Lighting Effect */}
                  <div
                    className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
                    style={{
                      backgroundColor: currentLine.is_hook
                        ? "#f59e0b"
                        : currentLine.is_cliffhanger
                          ? "#a855f7"
                          : char
                            ? char.palette[0]
                            : "#525252",
                    }}
                  />

                  {/* Slide Top Badge */}
                  <div className="flex items-center justify-between z-10">
                    {isDialogue && char ? (
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/30 shadow-lg overflow-hidden"
                          style={{
                            background: `linear-gradient(135deg, ${char.palette[2]} 0%, ${char.palette[0]} 52%, ${char.palette[1]} 100%)`,
                          }}
                        >
                          <span className="text-xs font-black tracking-tight text-white drop-shadow">
                            {char.initials}
                          </span>
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm sm:text-base tracking-tight flex items-center gap-2">
                            <span>{char.name}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                char.role === "Lead voice"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                  : char.role === "Recurring"
                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                    : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                              }`}
                            >
                              {char.role}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-400">
                            {currentLine.start_clock} → {currentLine.end_clock}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Clapperboard size={16} className="text-neutral-400" />
                        <span className="text-xs font-mono uppercase tracking-widest text-neutral-400 font-bold">
                          Scene Direction
                        </span>
                        <span className="text-[11px] font-mono text-neutral-500 ml-2">
                          {currentLine.start_clock} → {currentLine.end_clock}
                        </span>
                      </div>
                    )}

                    {/* Hook or Cliffhanger Highlight Pill */}
                    {currentLine.is_hook ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
                        <Flame size={12} className="text-amber-400" />
                        OPENING HOOK
                      </span>
                    ) : currentLine.is_cliffhanger ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm animate-pulse">
                        <Sparkles size={12} className="text-purple-400" />
                        CLIFFHANGER
                      </span>
                    ) : null}
                  </div>

                  {/* Main Slide Content: Cinematic Subtitles Typography */}
                  <div className="my-auto py-6 z-10 flex flex-col justify-center">
                    {isDialogue ? (
                      <div className="space-y-4">
                        <p className="font-serif text-xl sm:text-2xl md:text-3xl text-amber-50 font-normal leading-relaxed italic drop-shadow-lg tracking-normal">
                          "{currentLine.text}"
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="font-sans text-sm sm:text-base md:text-lg text-neutral-300 leading-relaxed font-normal">
                          {currentLine.text}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Slide Bottom Bar */}
                  <div className="flex items-center justify-between pt-4 border-t border-neutral-800/60 text-xs text-neutral-500 z-10">
                    <span className="font-mono text-[11px]">
                      {playerPromo.episode} · Cut {playerPromo.candidate_key}
                    </span>
                    <span className="font-mono text-[11px]">
                      Speed: {playbackSpeed}x
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Bottom Controls Bar */}
          <div className="w-full max-w-2xl bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3 sm:p-4 backdrop-blur-md z-10 space-y-3">
            {/* Scrubber / Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 px-1">
                <span>Beat {playerLineIndex + 1} of {playerPromo.transcript_lines.length}</span>
                <span>
                  {playerPromo.transcript_lines[playerLineIndex]?.start_clock || "00:00"}
                </span>
              </div>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-neutral-800 p-0.5">
                {playerPromo.transcript_lines.map((line, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPlayerLineIndex(idx)}
                    className={`flex-1 h-full rounded-sm transition-all cursor-pointer ${
                      idx === playerLineIndex
                        ? "bg-amber-400 shadow-sm shadow-amber-400/50"
                        : idx < playerLineIndex
                          ? "bg-neutral-600 hover:bg-neutral-500"
                          : line.is_hook
                            ? "bg-amber-800/70"
                            : line.is_cliffhanger
                              ? "bg-purple-800/70"
                              : "bg-neutral-700/40 hover:bg-neutral-600"
                    }`}
                    title={`${line.speaker || "Action"} (${line.start_clock})`}
                  />
                ))}
              </div>
            </div>

            {/* Playback Button Group */}
            <div className="flex items-center justify-between pt-1">
              {/* Left Speed controls */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase font-bold text-neutral-500 mr-1 hidden sm:inline">Speed:</span>
                {[1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-2 py-0.5 rounded text-xs font-mono cursor-pointer ${
                      playbackSpeed === spd
                        ? "bg-neutral-700 text-white font-bold"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Center Play/Pause & Step Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlayerLineIndex((prev) => Math.max(0, prev - 1))}
                  disabled={playerLineIndex === 0}
                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Beat (Left Arrow)"
                >
                  <SkipBack size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((prev) => !prev)}
                  className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-lg shadow-amber-500/20 font-bold cursor-pointer transition-all transform active:scale-95"
                  title="Play / Pause (Space)"
                >
                  {isPlaying ? (
                    <Pause size={18} className="fill-current" />
                  ) : (
                    <Play size={18} className="fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPlayerLineIndex((prev) =>
                      Math.min(playerPromo.transcript_lines.length - 1, prev + 1)
                    )
                  }
                  disabled={playerLineIndex >= playerPromo.transcript_lines.length - 1}
                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Beat (Right Arrow)"
                >
                  <SkipForward size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayerLineIndex(0);
                    setIsPlaying(true);
                  }}
                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white cursor-pointer ml-1"
                  title="Restart from beginning"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Right Shortcut note */}
              <div className="text-[11px] text-neutral-500 hidden sm:flex items-center gap-2">
                <span>Space: Play/Pause</span>
                <span>•</span>
                <span>←/→: Step</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
