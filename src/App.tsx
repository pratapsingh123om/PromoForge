import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clapperboard,
  Clock3,
  Download,
  FileArchive,
  FileJson,
  FileText,
  Film,
  FolderKanban,
  Gauge,
  GitBranch,
  Heart,
  HelpCircle,
  Info,
  ListFilter,
  Menu,
  Pause,
  Play,
  Plus,
  Redo2,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { api } from "./api/client";
import {
  evaluationRows,
  graphNodes,
  projects as initialProjects,
  promos as initialPromos,
  transcript,
} from "./data/mockData";
import type {
  ActiveEpisodeContext,
  PageId,
  Project,
  Promo,
  PromoRecommendationResponse,
  PromoStatus,
  Settings,
  ToastNotification,
} from "./types";
import {
  Badge,
  Button,
  Metric,
  PageHeader,
  Panel,
  RowLink,
  ToastBanner,
  WorkflowBreadcrumb,
} from "./components/ui";
import { EvaluationWorkflow } from "./components/EvaluationWorkflow";
import { ProjectLibrary } from "./components/ProjectLibrary";
import { RecommendedPromoStudio } from "./components/RecommendedPromoStudio";

const navSections = [
  {
    title: "Core Workflow",
    items: [
      { id: "projects" as PageId, label: "1. Projects", icon: FolderKanban },
      { id: "discover" as PageId, label: "2. Discover", icon: Sparkles },
      { id: "studio" as PageId, label: "3. Promo Studio", icon: Clapperboard },
      { id: "campaign" as PageId, label: "4. Campaign Lab", icon: WandSparkles },
      { id: "exports" as PageId, label: "5. Exports", icon: FileArchive },
    ],
  },
  {
    title: "Editorial Analysis",
    items: [
      { id: "narrative" as PageId, label: "Narrative Explorer", icon: GitBranch },
      { id: "evaluation" as PageId, label: "Evaluation", icon: Gauge },
    ],
  },
  {
    title: "Workspace",
    items: [{ id: "settings" as PageId, label: "Settings", icon: SettingsIcon }],
  },
];

const defaultSettings: Settings = {
  model: "Prometheus Narrative v2.4",
  apiBaseUrl: "",
  hook: 40,
  cliffhanger: 30,
  coherence: 30,
  minDuration: 20,
  maxDuration: 45,
  workspaceName: "PromoForge Studio",
  defaultProject: "Glass Hearts",
};

function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "") as unknown;
      if (Array.isArray(initial)) return (Array.isArray(parsed) ? parsed : initial) as T;
      if (initial && typeof initial === "object") {
        return (
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { ...initial, ...parsed }
            : initial
        ) as T;
      }
      return (typeof parsed === typeof initial ? parsed : initial) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private or embedded browsing contexts.
    }
  }, [key, state]);

  return [state, setState] as const;
}

function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// -------------------------------------------------------------
// 1. PROJECTS PAGE
// -------------------------------------------------------------
function ProjectsPage({
  onOpenStudio,
  onNavigate,
  showToast,
}: {
  onOpenStudio: (projectName: string) => void;
  onNavigate: (page: PageId) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [items, setItems] = usePersistentState<Project[]>("pf-projects", initialProjects);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "processing" | "failed">("all");

  const retry = async (id: string) => {
    const prevItems = [...items];
    setItems((v) =>
      v.map((p) =>
        p.id === id ? { ...p, status: "processing", progress: 14, updated: "Retrying analysis..." } : p,
      ),
    );
    showToast({
      message: "Restarted story analysis pipeline for screenplay.",
      type: "info",
      undoAction: () => setItems(prevItems),
    });
    await api.retryAnalysis(id);
  };

  const upload = (file?: File) => {
    if (!file) return;
    setUploading(true);
    setTimeout(() => {
      const newProject: Project = {
        id: `p${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, "") || "Untitled Screenplay",
        episodes: 12,
        progress: 18,
        status: "processing",
        updated: "Ingesting scenes now",
        logline: "Imported screenplay document awaiting character entity extraction.",
      };
      setItems((v) => [newProject, ...v]);
      setUploading(false);
      showToast({
        message: `Uploaded "${newProject.name}" for narrative ingestion.`,
        type: "success",
      });
    }, 800);
  };

  const addProject = () => {
    const newProject: Project = {
      id: `p${Date.now()}`,
      name: `New Microdrama ${items.length + 1}`,
      episodes: 24,
      progress: 0,
      status: "processing",
      updated: "Created now",
      logline: "Fictional microdrama screenplay series awaiting manuscript upload.",
    };
    setItems((v) => [newProject, ...v]);
    showToast({
      message: `Created project "${newProject.name}".`,
      type: "success",
    });
  };

  const visibleItems = filter === "all" ? items : items.filter((item) => item.status === filter);

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 1 / Workspace"
        title="Screenplays & Narrative Ingestion"
        description="Ingest scripts, index multi-episode story arcs, and prepare candidates for promo extraction."
        actions={
          <>
            <Button variant="secondary" onClick={addProject}>
              <Plus size={16} aria-hidden="true" /> New project
            </Button>
            <Button
              variant="primary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={16} aria-hidden="true" />
              {uploading ? "Ingesting screenplay..." : "Upload screenplay"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.fountain"
              hidden
              onChange={(event) => {
                upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="metrics-grid">
        <Metric label="Active Series" value="03" />
        <Metric label="Episodes Indexed" value="146" />
        <Metric label="Ranked Moments" value="284" delta="+32 ready" />
        <Metric label="Analysis Health" value="98.4%" delta="Pipeline stable" />
      </div>

      <div className="section-title">
        <div>
          <h2>Project Library</h2>
          <p>Verified editorial projects ready for promo extraction and campaign assembly.</p>
        </div>
        <label className="select-wrap compact-select">
          <ListFilter size={15} aria-hidden="true" />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            aria-label="Filter projects by status"
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready for extraction</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed review</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      <div className="project-list">
        {visibleItems.map((project) => (
          <article className="project-row" key={project.id}>
            <div className="project-art">
              <BookOpen size={22} aria-hidden="true" />
              <span>{project.episodes} EP</span>
            </div>
            <div className="project-main">
              <div className="project-title">
                <h3>{project.name}</h3>
                <Badge
                  tone={
                    project.status === "ready"
                      ? "green"
                      : project.status === "failed"
                        ? "red"
                        : "orange"
                  }
                >
                  {project.status === "ready"
                    ? "Ready"
                    : project.status === "failed"
                      ? "Needs action"
                      : "Processing"}
                </Badge>
              </div>
              <p>
                {project.episodes} episodes · {project.updated}
              </p>
            </div>
            <div className="progress-wrap">
              <div>
                <span>Story arc analysis</span>
                <b>{project.progress}%</b>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${project.progress}%` }} />
              </div>
            </div>
            <div className="stages">
              {["Ingest", "Entities", "Narrative", "Ranking"].map((s, i) => (
                <span className={project.progress >= (i + 1) * 25 ? "done" : ""} key={s}>
                  {project.progress >= (i + 1) * 25 ? (
                    <Check size={12} aria-hidden="true" />
                  ) : (
                    <CircleDot size={12} aria-hidden="true" />
                  )}
                  {s}
                </span>
              ))}
            </div>
            {project.status === "failed" ? (
              <Button variant="danger" onClick={() => retry(project.id)}>
                <Redo2 size={15} aria-hidden="true" /> Retry ingestion
              </Button>
            ) : (
              <Button
                variant={project.status === "ready" ? "primary" : "secondary"}
                onClick={() => onOpenStudio(project.name)}
              >
                {project.status === "ready" ? "Explore moments" : "Review"}{" "}
                <ChevronRight size={15} aria-hidden="true" />
              </Button>
            )}
          </article>
        ))}

        {visibleItems.length === 0 && (
          <Panel>
            <div className="empty-state">
              <ListFilter size={28} aria-hidden="true" />
              <h3>No projects match this filter</h3>
              <p>Change your filter to view all active screenplay projects.</p>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------
// 2. DISCOVER PAGE
// -------------------------------------------------------------
function DiscoverPage({
  promos,
  shortlist,
  toggleShortlist,
  setPage,
  openPromo,
  activeEpisode,
  onUseCandidate,
  showToast,
}: {
  promos: Promo[];
  shortlist: string[];
  toggleShortlist: (id: string) => void;
  setPage: (p: PageId) => void;
  openPromo: (id: string) => void;
  activeEpisode: ActiveEpisodeContext | null;
  onUseCandidate: (candidateId: string) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All emotions");
  const [sort, setSort] = useState("Score: high to low");
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [episodeRecommendation, setEpisodeRecommendation] = useState<PromoRecommendationResponse | null>(null);
  const [episodeCandidatesLoading, setEpisodeCandidatesLoading] = useState(false);
  const [episodeCandidatesError, setEpisodeCandidatesError] = useState("");

  useEffect(() => {
    if (!activeEpisode) {
      setEpisodeRecommendation(null);
      setEpisodeCandidatesError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setEpisodeCandidatesLoading(true);
      setEpisodeCandidatesError("");
      try {
        const ready = await api.listEvaluationReady();
        const match = ready.find(
          (item) =>
            item.project_id === activeEpisode.project_id &&
            item.episode_id === activeEpisode.episode_id,
        );
        if (!match) {
          if (!cancelled) setEpisodeRecommendation(null);
          return;
        }
        const response = await api.readEpisodeRecommendation(match.job_id, match.episode_id);
        if (!cancelled) {
          setEpisodeRecommendation(response);
          setExpandedEvidenceId(response.top_pick_id);
        }
      } catch (caught) {
        if (!cancelled) {
          setEpisodeCandidatesError(
            caught instanceof Error ? caught.message : "Could not load episode candidates.",
          );
        }
      } finally {
        if (!cancelled) setEpisodeCandidatesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeEpisode?.project_id, activeEpisode?.episode_id]);

  const episodeCandidates = episodeRecommendation?.candidates || [];

  const categories = ["All emotions", ...new Set(promos.map((p) => p.category))];

  const filtered = useMemo(
    () =>
      promos
        .filter(
          (p) =>
            `${p.title} ${p.project} ${p.hook}`.toLowerCase().includes(query.toLowerCase()) &&
            (category === "All emotions" || p.category === category),
        )
        .sort((a, b) => (sort.startsWith("Score") ? b.score - a.score : a.duration - b.duration)),
    [promos, query, category, sort],
  );

  const handleToggleShortlist = (promo: Promo) => {
    const isCurrentlyIn = shortlist.includes(promo.id);
    toggleShortlist(promo.id);
    showToast({
      message: isCurrentlyIn
        ? `Removed "${promo.title}" from shortlist.`
        : `Added "${promo.title}" to shortlist.`,
      type: isCurrentlyIn ? "info" : "success",
      undoAction: () => toggleShortlist(promo.id),
    });
  };

  if (activeEpisode) {
    return (
      <>
        <PageHeader
          eyebrow="Workflow Step 2 / Episode Discovery"
          title={`${activeEpisode.project_name} · ${activeEpisode.episode_id}`}
          description="PromoForge narrows this episode to three source-grounded options and recommends one winner for the demo workflow."
          actions={
            <>
              <Button variant="secondary" onClick={() => setPage("projects")}>
                <FolderKanban size={16} /> Change episode
              </Button>
              {episodeRecommendation && (
                <Button variant="primary" onClick={() => onUseCandidate(episodeRecommendation.top_pick_id)}>
                  <Clapperboard size={16} /> Continue with top pick
                </Button>
              )}
            </>
          }
        />

        <div className="episode-context-strip">
          <div><BookOpen size={18} /><span>Active series</span><b>{activeEpisode.project_name}</b></div>
          <div><FileText size={18} /><span>Active episode</span><b>{activeEpisode.episode_id}</b></div>
          <div><Sparkles size={18} /><span>Decision shortlist</span><b>{episodeCandidates.length} / 3</b></div>
        </div>

        {episodeRecommendation && (
          <div className="model-decision-banner">
            <div className="model-decision-icon"><Sparkles size={20} /></div>
            <div>
              <span>{episodeRecommendation.fallback_used ? "Deterministic fallback recommendation" : "Model-assisted recommendation"}</span>
              <b>Candidate #1 is the current winner</b>
              <p>{episodeRecommendation.recommendation_basis}</p>
            </div>
            <div className="model-decision-source"><span>Decision source</span><b>{episodeRecommendation.fallback_used ? "Fallback policy" : `${episodeRecommendation.provider} · ${episodeRecommendation.model}`}</b></div>
            <Badge tone="green">No editor required for demo</Badge>
          </div>
        )}

        {episodeCandidatesError && (
          <div className="project-error" role="alert"><AlertTriangle size={17} /><span>{episodeCandidatesError}</span></div>
        )}

        {episodeCandidatesLoading ? (
          <Panel><div className="project-loading"><CircleDot size={20} /><span>Loading this episode’s ranked candidates…</span></div></Panel>
        ) : episodeCandidates.length ? (
          <div className="real-candidate-list">
            {episodeCandidates.map((item) => {
              const candidate = item.candidate;
              const expanded = expandedEvidenceId === candidate.id;
              return (
                <article className={`real-candidate-card ${item.recommended ? "winner" : ""}`} key={candidate.id}>
                  <div className="real-candidate-row">
                    <div className="candidate-rank"><span>{item.recommended ? "Top pick" : "Rank"}</span><b>#{String(candidate.rank || 0).padStart(2, "0")}</b></div>
                    <div className="candidate-boundary"><div>{item.recommended && <Badge tone="green">Recommended</Badge>}<h3>{candidate.candidate_key}</h3></div><p>{(candidate.start_ms / 1000).toFixed(1)}s → {(candidate.end_ms / 1000).toFixed(1)}s · {(candidate.duration_ms / 1000).toFixed(1)} seconds</p></div>
                    <div className="candidate-components"><span>Hook <b>{Math.round(candidate.score_components.hook)}</b></span><span>Tension <b>{Math.round(candidate.score_components.tension)}</b></span><span>Curiosity <b>{Math.round(candidate.score_components.curiosity)}</b></span></div>
                    <div className="candidate-evidence"><span>Evidence</span><b>{item.evidence.length} events</b></div>
                    <div className="candidate-total"><span>Decision score</span><b>{candidate.score.toFixed(1)}</b></div>
                    <div className="candidate-actions">
                      <Button variant="secondary" onClick={() => setExpandedEvidenceId(expanded ? null : candidate.id)}>{expanded ? "Hide evidence" : "Evidence & reasoning"} <ChevronDown size={14} className={expanded ? "rotate-180" : ""} /></Button>
                      {item.recommended && <Button variant="primary" onClick={() => onUseCandidate(candidate.id)}>Use #1 <ArrowRight size={14} /></Button>}
                    </div>
                  </div>
                  {expanded && (
                    <div className="candidate-evidence-drawer">
                      <div className="candidate-reasoning">
                        <span>Why the system shortlisted it</span>
                        {item.rationale.map((reason) => <p key={reason}><CheckCircle2 size={14} />{reason}</p>)}
                        <div className="candidate-cautions"><b>Checks before production</b>{item.cautions.map((caution) => <p key={caution}>{caution}</p>)}</div>
                      </div>
                      <div className="candidate-source-events">
                        <span>Verified screenplay evidence</span>
                        {item.evidence.map((event) => (
                          <article key={event.event_id}>
                            <div><Badge tone={event.event_type === "dialogue" ? "purple" : "orange"}>{event.event_type}</Badge><time>{(event.start_ms / 1000).toFixed(1)}–{(event.end_ms / 1000).toFixed(1)}s</time></div>
                            <b>{event.character || "Scene direction"}</b>
                            <p>{event.text}</p>
                            <footer><span>{event.narrative_type.replaceAll("_", " ")}</span><span>Hook {event.hook_strength}</span><span>Tension {event.tension}</span></footer>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Panel>
            <div className="episode-empty-state">
              <Sparkles size={28} />
              <h2>No ranked promos for {activeEpisode.episode_id} yet</h2>
              <p>The episode is attached to {activeEpisode.project_name}, but narrative analysis and promo generation must finish before candidates appear here.</p>
              <Button variant="primary" onClick={() => setPage("projects")}>Return to series and queue analysis</Button>
            </div>
          </Panel>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 2 / Discovery"
        title="Screenplay Moments Ranked for High Hook Retention"
        description="Every candidate is grounded in verified dialogue beats and Prometheus v2.4 predictive retention scores."
        actions={
          shortlist.length > 0 ? (
            <Button variant="primary" onClick={() => setPage("campaign")}>
              <WandSparkles size={16} aria-hidden="true" />
              Launch Campaign Lab ({shortlist.length}) <ArrowRight size={15} aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                if (filtered[0]) openPromo(filtered[0].id);
              }}
            >
              <Clapperboard size={16} aria-hidden="true" />
              Review top candidate
            </Button>
          )
        }
      />

      {shortlist.length > 0 && (
        <aside className="shortlist-strip" aria-label="Shortlist summary">
          <div className="shortlist-strip-left">
            <Badge tone="orange">{shortlist.length} shortlisted</Badge>
            <div className="shortlist-strip-text">
              <b>{shortlist.length} candidates ready for multi-variant campaign assembly</b>
              <p>Move to Campaign Lab to generate distinct emotional angles and creative packs.</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => setPage("campaign")}>
            Assemble Campaign <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </aside>
      )}

      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dialogue beats, characters, projects..."
            aria-label="Search promo candidates"
          />
        </label>
        <label className="select-wrap">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by emotional category"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <label className="select-wrap">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort promo candidates"
          >
            <option>Score: high to low</option>
            <option>Duration: shortest</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <span className="result-count">{filtered.length} candidates verified</span>
      </div>

      <div className="promo-grid">
        {filtered.map((promo, index) => {
          const isShortlisted = shortlist.includes(promo.id);
          const isExpanded = expandedEvidenceId === promo.id;

          return (
            <article className="promo-card" key={promo.id}>
              <div className="promo-image">
                <img
                  src={promo.image}
                  alt={`Cinematic storyboard still for ${promo.title}`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
                <div className="rank">#{String(index + 1).padStart(2, "0")}</div>
                <button
                  type="button"
                  aria-label={`${isShortlisted ? "Remove" : "Add"} ${promo.title} ${
                    isShortlisted ? "from" : "to"
                  } shortlist`}
                  aria-pressed={isShortlisted}
                  onClick={() => handleToggleShortlist(promo)}
                  className={isShortlisted ? "heart active" : "heart"}
                >
                  <Heart size={18} fill={isShortlisted ? "currentColor" : "none"} />
                </button>
                <div className="duration-tag">
                  <Clock3 size={12} aria-hidden="true" />
                  <span>{promo.duration}s</span>
                </div>
                <button
                  type="button"
                  className="play-float"
                  onClick={() => openPromo(promo.id)}
                  aria-label={`Open ${promo.title} in Promo Studio`}
                >
                  <Play size={18} fill="currentColor" />
                </button>
              </div>

              <div className="promo-body">
                <div className="promo-meta">
                  <Badge tone="orange">{promo.category}</Badge>
                  <span>{promo.episode}</span>
                  <span className="text-muted-dim">•</span>
                  <span>{promo.project}</span>
                </div>

                <h3>{promo.title}</h3>
                <p>{promo.hook}</p>

                {/* Score context with explicit model breakdown (Rule 7) */}
                <div className="score-row">
                  <div>
                    <span className="score-label">Promo score</span>
                    <strong className="score-number">{promo.score}</strong>
                  </div>
                  <div className="scorebar-container">
                    <div className="score-submetrics">
                      <span>Hook {promo.metrics.hookStrength}%</span>
                      <span>Cliff {promo.metrics.cliffhanger}%</span>
                      <span>Coherence {promo.metrics.coherence}%</span>
                    </div>
                    <div className="scorebar" role="progressbar" aria-valuenow={promo.score} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${promo.score}%` }} />
                    </div>
                  </div>
                </div>

                {/* Progressive disclosure: Screenplay Evidence & Rationale */}
                <button
                  type="button"
                  className="evidence-toggle-btn"
                  onClick={() => setExpandedEvidenceId(isExpanded ? null : promo.id)}
                  aria-expanded={isExpanded}
                >
                  <span>Screenplay Evidence & Rationale</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "0.15s",
                    }}
                    aria-hidden="true"
                  />
                </button>

                {isExpanded && (
                  <div className="evidence-drawer">
                    <p className="evidence-quote">“{promo.metrics.evidenceQuote}”</p>
                    <p className="evidence-rationale">{promo.metrics.evidenceRationale}</p>
                    <div className="evidence-tags">
                      <Badge tone="purple">
                        Confidence {promo.metrics.modelConfidence}%
                      </Badge>
                      <Badge
                        tone={
                          promo.metrics.spoilerRisk === "High"
                            ? "red"
                            : promo.metrics.spoilerRisk === "Moderate"
                              ? "orange"
                              : "green"
                        }
                      >
                        {promo.metrics.spoilerRisk} spoiler risk
                      </Badge>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="open-candidate"
                  onClick={() => openPromo(promo.id)}
                >
                  <span>Edit in Promo Studio</span>
                  <SquareArrowOutUpRight size={15} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}

        {filtered.length === 0 && (
          <Panel className="grid-empty">
            <div className="empty-state">
              <Search size={28} aria-hidden="true" />
              <h3>No promo candidates found</h3>
              <p>Try searching for a different keyword or emotional category.</p>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------
// 3. PROMO STUDIO PAGE (EDIT)
// -------------------------------------------------------------
function StudioPage({
  promo,
  setStatus,
  settings,
  onNavigate,
  showToast,
}: {
  promo: Promo;
  setStatus: (id: string, status: PromoStatus) => void;
  settings: Settings;
  onNavigate: (p: PageId) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const studioSegments = useMemo(() => {
    const episodes = promo.episode.match(/\d+/g)?.map(Number) || [1];
    const durations = [
      Math.max(1, Math.round(promo.duration * 0.28)),
      Math.max(1, Math.round(promo.duration * 0.36)),
    ];
    durations.push(Math.max(1, promo.duration - durations[0] - durations[1]));
    return ["Discovery", "Confrontation", "Reveal"].map((label, index) => ({
      id: `s${index + 1}`,
      episode: episodes[Math.min(index, episodes.length - 1)],
      duration: durations[index],
      label,
      color: ["#FF6234", "#A78BFA", "#34D399"][index],
    }));
  }, [promo.duration, promo.episode]);

  const studioTranscript = useMemo(
    () =>
      promo.id === "pr1"
        ? transcript
        : [
            { time: "00:00", speaker: "STORY BEAT", text: promo.hook },
            {
              time: `00:${String(Math.round(promo.duration * 0.33)).padStart(2, "0")}`,
              speaker: "SOURCE",
              text: `${promo.project} · ${promo.episode} · ${promo.metrics.evidenceScene}`,
            },
            {
              time: `00:${String(Math.round(promo.duration * 0.66)).padStart(2, "0")}`,
              speaker: "EVIDENCE",
              text: promo.metrics.evidenceQuote,
            },
          ],
    [promo],
  );

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(Math.min(8, promo.duration));
  const [selected, setSelected] = useState(studioSegments.map((segment) => segment.id));

  const totalDuration = studioSegments
    .filter((s) => selected.includes(s.id))
    .reduce((a, b) => a + b.duration, 0);

  const isDurationValid =
    totalDuration >= settings.minDuration && totalDuration <= settings.maxDuration;

  const activeTranscriptIndex = studioTranscript.reduce(
    (activeIndex, line, index) => {
      const seconds = Number(line.time.split(":")[1]);
      return seconds <= position ? index : activeIndex;
    },
    0,
  );

  useEffect(() => {
    setPlaying(false);
    setPosition(Math.min(8, promo.duration));
    setSelected(studioSegments.map((segment) => segment.id));
  }, [promo.id, promo.duration, studioSegments]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setPosition((value) => {
          if (value >= promo.duration) {
            setPlaying(false);
            return promo.duration;
          }
          return value + 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [playing, promo.duration]);

  const handleSetStatus = (nextStatus: PromoStatus) => {
    const prevStatus = promo.status;
    setStatus(promo.id, nextStatus);
    showToast({
      message:
        nextStatus === "approved"
          ? `Approved "${promo.title}" for production campaign.`
          : nextStatus === "rejected"
            ? `Marked "${promo.title}" as rejected.`
            : `Set "${promo.title}" to review.`,
      type: nextStatus === "approved" ? "success" : nextStatus === "rejected" ? "warning" : "info",
      undoAction: () => setStatus(promo.id, prevStatus),
    });
  };

  return (
    <>
      <PageHeader
        eyebrow={`Workflow Step 3 / Edit / ${promo.project}`}
        title={promo.title}
        description={`${promo.episode} · Candidate ${promo.id.toUpperCase()} · Screenplay storyboard cut`}
        actions={
          <div className="header-actions">
            <Badge
              tone={
                promo.status === "approved"
                  ? "green"
                  : promo.status === "rejected"
                    ? "red"
                    : "orange"
              }
            >
              {promo.status === "approved"
                ? "Approved Cut"
                : promo.status === "rejected"
                  ? "Rejected"
                  : "Review Required"}
            </Badge>
            {promo.status !== "approved" ? (
              <Button variant="primary" onClick={() => handleSetStatus("approved")}>
                <Check size={16} aria-hidden="true" /> Approve cut
              </Button>
            ) : (
              <Button variant="primary" onClick={() => onNavigate("campaign")}>
                Proceed to Campaign <ArrowRight size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        }
      />

      <div className="studio-grid">
        {/* Left: Screenplay Evidence */}
        <Panel
          title="Screenplay Evidence"
          action={<Badge tone="purple">{promo.episode}</Badge>}
          className="transcript-panel"
        >
          <div className="transcript">
            {studioTranscript.map((line, i) => (
              <button
                type="button"
                className={activeTranscriptIndex === i ? "active" : ""}
                key={line.time}
                onClick={() => setPosition(Number(line.time.split(":")[1]))}
                aria-pressed={activeTranscriptIndex === i}
              >
                <time>{line.time}</time>
                <span>
                  <b>{line.speaker}</b>
                  {line.text}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Center: 9:16 Storyboard Preview (Central as required by Section 12) */}
        <div className="preview-column">
          <div className="phone-preview">
            <img
              src={promo.image}
              alt={`Selected sequence preview for ${promo.title}`}
              decoding="async"
            />
            <div className="safe-frame" />
            <div className="preview-top">
              <span>PROMOFORGE CUT</span>
              <b>9:16 VERTICAL</b>
            </div>
            <div className="subtitle">
              {promo.id === "pr1"
                ? position < 14
                  ? "“The ring was never yours.”"
                  : position < 25
                    ? "“Our marriage was her idea?”"
                    : "“No, Mara. It was mine.”"
                : position < promo.duration * 0.5
                  ? promo.hook
                  : promo.title}
            </div>
            <button
              type="button"
              className="big-play"
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "Pause promo preview" : "Play promo preview"}
              aria-pressed={playing}
            >
              {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <div className="preview-controls">
              <span>{`00:${String(position).padStart(2, "0")}`}</span>
              <input
                className="preview-scrubber"
                type="range"
                min="0"
                max={promo.duration}
                value={position}
                onChange={(event) => setPosition(Number(event.target.value))}
                aria-label="Promo preview position"
              />
              <span>{`00:${String(promo.duration).padStart(2, "0")}`}</span>
            </div>
          </div>
          <p className="preview-note">
            <Info size={14} aria-hidden="true" /> Storyboard preview frames aligned with screenplay dialogue beats.
          </p>
        </div>

        {/* Right: Editorial Intelligence (Measured facts vs Model estimates) */}
        <Panel
          title="Editorial Intelligence"
          action={<Badge tone="orange">Score {promo.score}</Badge>}
          className="inspector"
        >
          <div className="inspector-body">
            {/* Section 1: Measured Screenplay Facts */}
            <h4 className="insight-group-title">Verified Screenplay Facts</h4>
            <div className="evidence-fact-card">
              <b>{promo.metrics.evidenceScene}</b>
              <p className="italic">“{promo.metrics.evidenceQuote}”</p>
              <p>{promo.metrics.evidenceRationale}</p>
            </div>

            {/* Section 2: Model Estimates */}
            <h4 className="insight-group-title">Model Estimates (Prometheus v2.4)</h4>
            <div className="insight">
              <span>Hook Strength</span>
              <b>{promo.metrics.hookStrength}%</b>
              <div>
                <i style={{ width: `${promo.metrics.hookStrength}%` }} />
              </div>
              <p>Opening beat presents a direct cognitive gap within 3 seconds.</p>
            </div>

            <div className="insight">
              <span>Cliffhanger Index</span>
              <b>{promo.metrics.cliffhanger}%</b>
              <div>
                <i style={{ width: `${promo.metrics.cliffhanger}%` }} />
              </div>
              <p>Cut terminates on unresolved speaker turn before answer occurs.</p>
            </div>

            <div className="insight">
              <span>Narrative Coherence</span>
              <b>{promo.metrics.coherence}%</b>
              <div>
                <i style={{ width: `${promo.metrics.coherence}%` }} />
              </div>
              <p>Linear dialogue sequence preserves causality across episodes.</p>
            </div>

            {/* Spoiler Watch (Rule 7) */}
            <div className="warning">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <b>{promo.metrics.spoilerRisk} Spoiler Risk</b>
                <p>{promo.metrics.spoilerDetails}</p>
              </div>
            </div>
          </div>

          <div className="decision-actions">
            <Button
              variant="danger"
              onClick={() => handleSetStatus("rejected")}
              disabled={promo.status === "rejected"}
            >
              <X size={16} aria-hidden="true" /> Reject cut
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSetStatus("approved")}
              disabled={promo.status === "approved"}
            >
              <Check size={16} aria-hidden="true" /> Approve cut
            </Button>
          </div>
        </Panel>
      </div>

      {/* Multi-Episode Timeline */}
      <Panel
        className="timeline-panel"
        title="Multi-Episode Timeline"
        action={
          <Badge tone={isDurationValid ? "green" : "red"}>
            {totalDuration}s / {settings.minDuration}–{settings.maxDuration}s window
          </Badge>
        }
      >
        <div className="timeline-scale">
          {Array.from({ length: 7 }, (_, index) =>
            Math.round((promo.duration / 6) * index),
          ).map((n) => (
            <span key={n}>{n}s</span>
          ))}
        </div>
        <div className="timeline-track">
          <div
            className="playhead"
            style={{ left: `${(position / promo.duration) * 100}%` }}
          />
          {studioSegments.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                setSelected((v) =>
                  v.includes(s.id) ? v.filter((id) => id !== s.id) : [...v, s.id],
                )
              }
              className={selected.includes(s.id) ? "segment selected" : "segment"}
              style={{
                width: `${(s.duration / promo.duration) * 100}%`,
                borderTopColor: s.color,
              }}
              aria-pressed={selected.includes(s.id)}
            >
              <b>EP {s.episode}</b>
              <span>{s.label}</span>
              <small>{s.duration}s</small>
            </button>
          ))}
        </div>
        <div className="timeline-actions">
          <span>Toggle segments to tailor cut duration to platform limits.</span>
          <Button
            variant="secondary"
            onClick={() => {
              const allIds = studioSegments.map((s) => s.id);
              setSelected(allIds);
              showToast({ message: "Reset timeline segments to original cut.", type: "info" });
            }}
          >
            <Redo2 size={14} aria-hidden="true" /> Reset selection
          </Button>
        </div>
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// 4. NARRATIVE EXPLORER PAGE
// -------------------------------------------------------------
function NarrativePage({ onOpenStudio }: { onOpenStudio: (name: string) => void }) {
  const [active, setActive] = useState("ring");
  const [showPaths, setShowPaths] = useState(true);
  const [episodeRange, setEpisodeRange] = useState<"EP 01–48" | "EP 12–22" | "EP 12–14">("EP 01–48");

  const node = graphNodes.find((n) => n.id === active) || graphNodes[0];

  const cycleRange = () =>
    setEpisodeRange((range) =>
      range === "EP 01–48" ? "EP 12–22" : range === "EP 12–22" ? "EP 12–14" : "EP 01–48",
    );

  return (
    <>
      <PageHeader
        eyebrow="Editorial Analysis / Narrative Explorer"
        title="Every Secret Leaves a Trace Across the Series Arc"
        description="Inspect story relationships, secret provenance, and character confrontations to unearth high-leverage promo moments."
        actions={
          <>
            <Button variant="secondary" onClick={cycleRange}>
              <ListFilter size={16} aria-hidden="true" /> Window: {episodeRange}
            </Button>
            <Button
              variant={showPaths ? "primary" : "secondary"}
              onClick={() => setShowPaths((value) => !value)}
            >
              <Sparkles size={16} aria-hidden="true" />
              {showPaths ? "Recommended path (31s)" : "Show optimal arc"}
            </Button>
          </>
        }
      />

      <div className="narrative-layout">
        <Panel
          className="graph-panel"
          title="Glass Hearts · Story Knowledge Graph"
          action={
            <div className="graph-legend">
              <span className="legend-item">
                <i className="char" /> Character
              </span>
              <span className="legend-item">
                <i className="secret" /> Secret
              </span>
              <span className="legend-item">
                <i className="conflict" /> Conflict
              </span>
            </div>
          }
        >
          <div className="graph-canvas">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              {[
                ["mara", "julian"],
                ["mara", "ring"],
                ["julian", "ring"],
                ["julian", "elena"],
                ["ring", "contract"],
                ["ring", "reveal"],
                ["elena", "reveal"],
              ].map(([a, b]) => {
                const n1 = graphNodes.find((n) => n.id === a)!;
                const n2 = graphNodes.find((n) => n.id === b)!;
                const isActive = a === active || b === active;
                return (
                  <line
                    key={a + b}
                    x1={n1.x}
                    y1={n1.y}
                    x2={n2.x}
                    y2={n2.y}
                    className={isActive ? "active" : ""}
                  />
                );
              })}
            </svg>

            {graphNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActive(n.id)}
                className={`graph-node ${n.type} ${n.id === active ? "active" : ""}`}
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
                aria-pressed={n.id === active}
              >
                <span>
                  {n.type === "character"
                    ? n.label
                        .split(" ")
                        .map((x) => x[0])
                        .join("")
                    : n.type === "secret"
                      ? "?"
                      : "!"}
                </span>
                <b>{n.label}</b>
                <small>{n.type}</small>
              </button>
            ))}

            {showPaths && (
              <div className="recommended-path-banner">
                <Sparkles size={16} aria-hidden="true" />
                <span>Recommended promo trajectory: Mara → The engraved ring → Reveal (31s)</span>
              </div>
            )}
          </div>
        </Panel>

        <div className="narrative-side">
          <Panel title="Selected Node Details">
            <div style={{ padding: "16px 18px 0" }}>
              <Badge
                tone={
                  node.type === "revelation"
                    ? "green"
                    : node.type === "secret"
                      ? "purple"
                      : "orange"
                }
              >
                {node.type}
              </Badge>
            </div>
            <h3 className="node-title">{node.label}</h3>
            <p className="muted-desc">
              Introduced in EP 04 · Peaks in narrative centrality during EP 12–14 confrontation.
            </p>
            <div className="node-stat">
              <span>Centrality Index</span>
              <b>94%</b>
            </div>
            <div className="node-stat">
              <span>Promo Retention Utility</span>
              <b>Very High</b>
            </div>
          </Panel>

          <Panel title="Spoiler Watch & Clearance">
            <div className="risk-item">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <b>Elena’s True Identity</b>
                <p>Critical reveal in EP 22 gala · Do not disclose full face before final frame</p>
              </div>
              <Badge tone="red">High</Badge>
            </div>
            <div className="risk-item">
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <b>Marriage Contract Author</b>
                <p>Supporting reveal in EP 18 · Safe to tease initials</p>
              </div>
              <Badge tone="orange">Medium</Badge>
            </div>
          </Panel>

          <Panel title="Associated Promo Candidates">
            <RowLink
              title="The Ring Was Never Hers"
              meta="EP 12–14 · 31s · Score 94"
              onClick={() => onOpenStudio("Glass Hearts")}
            />
            <RowLink
              title="The Contract Bride"
              meta="EP 03–05 · 35s · Score 88"
              onClick={() => onOpenStudio("The CEO’s Secret Vow")}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------
// 5. CAMPAIGN LAB PAGE
// -------------------------------------------------------------
function CampaignPage({
  promos,
  shortlist,
  toggleShortlist,
  onNavigate,
  showToast,
}: {
  promos: Promo[];
  shortlist: string[];
  toggleShortlist: (id: string) => void;
  onNavigate: (p: PageId) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [appeal, setAppeal] = usePersistentState("pf-campaign-appeal", "Betrayal");
  const [campaignName, setCampaignName] = usePersistentState(
    "pf-campaign-name",
    "Glass Hearts · US Launch Creative Pack",
  );
  const [generatedFor, setGeneratedFor] = usePersistentState("pf-campaign-generated-for", "");
  const [compare, setCompare] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selected = promos.filter((p) => shortlist.includes(p.id));
  const campaignSignature = `${appeal}:${selected.map((p) => p.id).join(",")}`;
  const generated = generatedFor === campaignSignature;

  const generate = async () => {
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      await api.createCampaign(selected.map((promo) => promo.id));
      setGeneratedFor(campaignSignature);
      showToast({
        message: `Generated 4 creative variants around "${appeal}".`,
        type: "success",
      });
    } catch {
      showToast({
        message: "Failed to generate creative pack. Please try again.",
        type: "warning",
      });
    } finally {
      setGenerating(false);
    }
  };

  const exportBrief = () => {
    const brief = [
      `PROMOFORGE EDITORIAL AI · CAMPAIGN STRATEGY BRIEF`,
      `================================================`,
      `Campaign: ${campaignName}`,
      `Emotional Target Appeal: ${appeal}`,
      `Strategy: Test multi-variant hooks while strictly protecting the EP 22 identity reveal.`,
      ``,
      `SELECTED SCREENPLAY PROMOS:`,
      ...(selected.length
        ? selected.map(
            (promo, index) =>
              `${index + 1}. ${promo.title} [${promo.episode}] - Duration: ${promo.duration}s, Score: ${promo.score}`,
          )
        : ["No promos selected."]),
      ``,
      `DELIVERABLES:`,
      `- Variant 1: Cold Open (Shock hook within first 3 seconds)`,
      `- Variant 2: Character POV (Mara's emotional betrayal perspective)`,
      `- Variant 3: Revelation-First (Initials discovery leading into amnesia reversal)`,
      `- Variant 4: Question Hook (Pits husband against hidden benefactor)`,
      ``,
      `PERFORMANCE TELEMETRY:`,
      `Status: Awaiting launch telemetry — performance signals connect post-export.`,
    ].join("\n");
    download("promoforge-campaign-brief.txt", brief);
    showToast({ message: "Downloaded campaign brief document.", type: "success" });
  };

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 4 / Campaign Lab"
        title="Generate Diverse Creative Packs Around Emotional Entry Points"
        description="Transform verified screenplay cuts into 4 editorially distinct promotional variants targeted at specific viewer motivations."
        actions={
          <>
            <Button variant="secondary" onClick={exportBrief}>
              <Download size={16} aria-hidden="true" /> Export campaign brief
            </Button>
            <Button
              variant="primary"
              onClick={generate}
              disabled={generating || selected.length === 0}
              disabledReason={selected.length === 0 ? "Select at least 1 promo candidate to generate a pack." : undefined}
            >
              <WandSparkles size={16} aria-hidden="true" />
              {generating ? "Synthesizing creative pack..." : "Generate creative pack"}
            </Button>
          </>
        }
      />

      <div className="campaign-layout">
        {/* Left: Campaign Setup */}
        <Panel title="Campaign Strategy Setup" className="campaign-setup">
          <div className="form-group">
            <label htmlFor="campaign-name-input">Campaign Name</label>
            <input
              id="campaign-name-input"
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label>
              Primary Emotional Angle <small>Click to switch focus</small>
            </label>
            <div className="appeal-grid">
              {["Betrayal", "Forbidden love", "Revenge", "Mystery", "Status", "Longing"].map(
                (a) => (
                  <button
                    type="button"
                    className={appeal === a ? "active" : ""}
                    onClick={() => setAppeal(a)}
                    aria-pressed={appeal === a}
                    key={a}
                  >
                    {a}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="form-group">
            <label>
              Selected Promos <small>{selected.length} in pack</small>
            </label>
            <div className="campaign-promos">
              {promos.slice(0, 4).map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggleShortlist(p.id)}
                  className={`campaign-promo-btn ${shortlist.includes(p.id) ? "selected" : ""}`}
                  aria-pressed={shortlist.includes(p.id)}
                >
                  <img src={p.image} alt="" loading="lazy" decoding="async" />
                  <span>
                    <b>{p.title}</b>
                    <small>
                      {p.duration}s · Score {p.score}
                    </small>
                  </span>
                  {shortlist.includes(p.id) ? (
                    <CheckCircle2 size={18} className="text-green" aria-hidden="true" />
                  ) : (
                    <Plus size={18} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {/* Right: Generated Variants & Comparison */}
        <div className="campaign-main">
          <Panel
            title={generated ? `${appeal} Creative Pack` : "Creative Variants"}
            action={
              generated && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <Badge tone="green">4 Variants Ready</Badge>
                  <Button variant="ghost" onClick={() => setCompare((value) => !value)}>
                    <BarChart3 size={15} aria-hidden="true" />
                    {compare ? "Hide comparison" : "Compare variant metrics"}
                  </Button>
                </div>
              )
            }
          >
            {generated ? (
              <>
                <div className="variant-grid">
                  {["Cold open", "Character POV", "Revelation-first", "Question hook"].map(
                    (v, i) => (
                      <article className="variant" key={v}>
                        <div className="variant-preview">
                          <img
                            src={(selected[i % Math.max(selected.length, 1)] || promos[i]).image}
                            alt={`Fictional ${v} campaign variant`}
                          />
                          <Play fill="currentColor" />
                        </div>
                        <span className="variant-badge">VARIANT 0{i + 1}</span>
                        <h3>{v}</h3>
                        <p>
                          {
                            [
                              "“The ring was never hers.” Immediate dialogue shock hook.",
                              "“I married a stranger.” Emphasizes protagonist vulnerability.",
                              "“She was alive all along.” Puts third-act revelation upfront.",
                              "“Who planned their marriage?” Centers on conspiratorial mystery.",
                            ][i]
                          }
                        </p>
                        <div className="variant-footer">
                          <Badge tone="orange">{appeal}</Badge>
                          <small>{24 + i * 3}s cut</small>
                        </div>
                      </article>
                    ),
                  )}
                </div>

                {compare && (
                  <div className="comparison-wrap">
                    <div className="comparison-head">
                      <div>
                        <span>Creative Comparison</span>
                        <b>Pre-launch Model Estimates</b>
                      </div>
                      <Badge tone="purple">Estimated by Prometheus v2.4</Badge>
                    </div>
                    <div className="comparison-grid">
                      {[
                        ["Cold open", "96%", "88%", "Low"],
                        ["Character POV", "91%", "94%", "Low"],
                        ["Revelation-first", "98%", "81%", "High"],
                        ["Question hook", "89%", "92%", "Medium"],
                      ].map((row) => (
                        <div key={row[0]}>
                          <b>{row[0]}</b>
                          <span>
                            Hook Strength <strong>{row[1]}</strong>
                          </span>
                          <span>
                            Coherence <strong>{row[2]}</strong>
                          </span>
                          <span>
                            Spoiler Risk <strong>{row[3]}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <WandSparkles size={32} aria-hidden="true" />
                <h3>Your Creative Pack Starts Here</h3>
                <p>
                  Select candidate promos and an emotional appeal, then click "Generate creative pack" to produce diverse vertical cuts.
                </p>
              </div>
            )}
          </Panel>

          {/* Performance Signals (Honest States: Rule 7) */}
          <Panel
            title="Performance Signals"
            action={<Badge>Awaiting Launch Telemetry</Badge>}
          >
            <div className="performance-empty">
              <BarChart3 size={28} aria-hidden="true" />
              <div>
                <b>No Post-Launch Telemetry Yet</b>
                <p>
                  Real-time CTR, completion rates, and CPI metrics will populate as soon as the campaign delivery pipeline connects to TikTok Ads and Meta.
                </p>
              </div>
            </div>
            <div className="empty-metrics">
              {["Click-Through Rate", "3s Completion", "Effective CPI", "Viewer Conversion"].map(
                (metric) => (
                  <div key={metric}>
                    <span>{metric}</span>
                    <b>—</b>
                    <small>Awaiting live delivery</small>
                  </div>
                ),
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------
// 6. EXPORTS PAGE
// -------------------------------------------------------------
function ExportsPage({
  promos,
  showToast,
}: {
  promos: Promo[];
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const approved = promos.filter((p) => p.status === "approved");

  const exportFile = (format: string) => {
    if (approved.length === 0) {
      showToast({
        message: "No approved cuts available. Approve at least one promo in Studio first.",
        type: "warning",
      });
      return;
    }

    if (format === "JSON") {
      download(
        "promoforge-cut-sheet.json",
        JSON.stringify(
          {
            project: "Glass Hearts",
            timestamp: new Date().toISOString(),
            approved_promos: approved,
          },
          null,
          2,
        ),
        "application/json",
      );
    } else if (format === "CSV") {
      const headers = "id,title,project,episode,duration,score,hook,spoilerRisk\n";
      const rows = approved
        .map(
          (p) =>
            `"${p.id}","${p.title}","${p.project}","${p.episode}",${p.duration},${p.score},"${p.hook}","${p.metrics.spoilerRisk}"`,
        )
        .join("\n");
      download("promoforge-cut-sheet.csv", headers + rows, "text/csv");
    } else if (format === "TXT") {
      const txtContent = approved
        .map(
          (p) =>
            `PROMO: ${p.title}\n` +
            `Project: ${p.project} (${p.episode}) | Duration: ${p.duration}s | Score: ${p.score}\n` +
            `Hook Beat: ${p.hook}\n` +
            `Evidence Quote: ${p.metrics.evidenceQuote}\n` +
            `Scene: ${p.metrics.evidenceScene}\n` +
            `Spoiler Clearance: ${p.metrics.spoilerRisk} (${p.metrics.spoilerDetails})\n`,
        )
        .join("\n----------------------------------------\n\n");
      download("promoforge-editorial-cut-sheets.txt", txtContent);
    }

    showToast({
      message: `Exported ${approved.length} approved cut sheet(s) in ${format} format.`,
      type: "success",
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 5 / Delivery"
        title="Production Cut Sheets & Editorial Timelines"
        description="Production-ready delivery formats for NLE video editors (Premiere, Resolve, Avid), motion designers, and media buyers."
        actions={
          <Button
            variant="primary"
            onClick={() => exportFile("JSON")}
            disabled={approved.length === 0}
            disabledReason={approved.length === 0 ? "Approve at least one promo cut in Studio to export." : undefined}
          >
            <Download size={16} aria-hidden="true" />
            Export all approved ({approved.length})
          </Button>
        }
      />

      <Panel
        title="Available Editorial Formats"
        action={<Badge tone="green">{approved.length} cuts approved for delivery</Badge>}
      >
        <div className="export-list">
          {[
            {
              type: "JSON",
              icon: FileJson,
              title: "Structured Metadata & Beat Sheets (JSON)",
              desc: "Complete scene timestamps, dialogue quote markers, predictive retention scores, and spoiler clearance details.",
            },
            {
              type: "CSV",
              icon: Boxes,
              title: "Media Buyer Campaign Inventory (CSV)",
              desc: "Flat inventory sheet formatted for bulk ad upload, asset management, and performance tracking.",
            },
            {
              type: "TXT",
              icon: FileText,
              title: "Human-Readable NLE Editor Cut Sheet (TXT)",
              desc: "Timestamped dialogue and transition instructions designed for offline video editing in Premiere or Resolve.",
            },
          ].map((f) => (
            <div className="export-row" key={f.type}>
              <div className="file-icon">
                <f.icon size={22} aria-hidden="true" />
              </div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
              <span>Ready for download</span>
              <Button
                variant="secondary"
                onClick={() => exportFile(f.type)}
                disabled={approved.length === 0}
              >
                <Download size={15} aria-hidden="true" /> Download {f.type}
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      {/* Editorial Timeline Interchange (OTIO) */}
      <Panel title="Editorial Timeline Interchange" className="otio-card">
        <div className="otio">
          <div>
            <Badge tone="purple">FastAPI Adapter Contract</Badge>
            <h2>OpenTimelineIO (OTIO) Native Delivery</h2>
            <p>
              The PromoForge backend adapter produces standardized <code>.otio</code> timeline tracks containing accurate video cuts, audio dialogue markers, and subtitle tracks. Deliver native project files straight into Adobe Premiere Pro, DaVinci Resolve, and Final Cut.
            </p>
            <code>POST /v1/exports/otio {"{ project_id: 'p1', promo_ids: ['pr1', 'pr2'] }"}</code>
          </div>
          <div className="integration-state">
            <CircleDot size={24} className="text-muted" aria-hidden="true" />
            <b>Backend Pipeline Standby</b>
            <span>Configure FastAPI endpoint in Settings</span>
            <Button variant="secondary" disabled>
              Verify endpoint handshake
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// 7. EVALUATION PAGE
// -------------------------------------------------------------
function EvaluationPage({
  activeEpisode,
  showToast,
}: {
  activeEpisode: ActiveEpisodeContext | null;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  return <EvaluationWorkflow activeEpisode={activeEpisode} showToast={showToast} />;
}

function LegacyEvaluationPage({
  showToast,
}: {
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [tab, setTab] = useState<"metrics" | "failures" | "json">("metrics");

  const evaluationReport = {
    run_id: "eval_prometheus_24_audit",
    timestamp: "2026-11-20T07:00:00Z",
    model: "prometheus-narrative-v2.4",
    benchmark_dataset: "PF-Eval-v1.3",
    metrics: {
      hook_precision: 0.86,
      narrative_coherence: 0.91,
      cliffhanger_recall: 0.83,
      spoiler_avoidance: 0.94,
    },
    sample_count: 1248,
    status: "completed",
    audit_notes: "Model exceeds heuristic baseline across all dimensions, with +21.1% lift in hook precision.",
  };

  const handleDownload = () => {
    download("promoforge-evaluation-audit.json", JSON.stringify(evaluationReport, null, 2), "application/json");
    showToast({ message: "Downloaded evaluation audit report.", type: "success" });
  };

  return (
    <>
      <PageHeader
        eyebrow="Editorial Analysis / Model Evaluation"
        title="Prometheus v2.4 Editorial Quality Audit"
        description="Audit model ranking precision, narrative coherence, and spoiler risk mitigation against the PF-Eval validation set."
        actions={
          <Button variant="primary" onClick={handleDownload}>
            <Download size={16} aria-hidden="true" /> Download validation report (JSON)
          </Button>
        }
      />

      <div className="metrics-grid">
        <Metric label="Overall Model Quality" value="0.89" delta="+18.2% vs baseline" />
        <Metric label="Screenplays Evaluated" value="1,248" />
        <Metric label="Pass Rate" value="92.6%" delta="+4.1 pts" />
        <Metric label="Actionable Anomalies" value="03" delta="Review failure analysis" positive={false} />
      </div>

      <div className="tabs" role="tablist" aria-label="Evaluation audit views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "metrics"}
          className={tab === "metrics" ? "active" : ""}
          onClick={() => setTab("metrics")}
        >
          Validation Metrics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "failures"}
          className={tab === "failures" ? "active" : ""}
          onClick={() => setTab("failures")}
        >
          Failure Analysis (Action Items)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "json"}
          className={tab === "json" ? "active" : ""}
          onClick={() => setTab("json")}
        >
          Raw Evaluation JSON
        </button>
      </div>

      {tab === "metrics" && (
        <Panel title="Prometheus Narrative v2.4 vs Heuristic Baseline">
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Comparison of Prometheus model metrics against baseline
              </caption>
              <thead>
                <tr>
                  <th scope="col">Editorial Metric</th>
                  <th scope="col">Prometheus v2.4</th>
                  <th scope="col">Heuristic Baseline</th>
                  <th scope="col">Net Performance Lift</th>
                </tr>
              </thead>
              <tbody>
                {evaluationRows.map((row) => (
                  <tr key={row[0]}>
                    <th scope="row" style={{ fontWeight: 600 }}>{row[0]}</th>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td className="positive">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "failures" && (
        <div className="failure-grid">
          {[
            {
              title: "Temporal Ambiguity",
              cases: "34 cases",
              desc: "Dialogue references a character event occurring outside the selected episode boundary.",
              remediation: "Action: Add automated episode scene chronology filter before finalizing candidate.",
            },
            {
              title: "False Cliffhangers",
              cases: "21 cases",
              desc: "Scene boundary appears dramatic acoustically but resolves trivially in the next line of screenplay dialogue.",
              remediation: "Action: Expand lookahead window from 1 line to 3 lines in cliffhanger score.",
            },
            {
              title: "Entity Cold Starts",
              cases: "17 cases",
              desc: "Selected moment assumes prior knowledge of secondary character relationships without introduction.",
              remediation: "Action: Require minimum character introduction weight in standalone promo ranking.",
            },
          ].map((item) => (
            <Panel key={item.title} className="failure-card">
              <Badge tone="red">{item.cases}</Badge>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <div style={{ background: "#1b1d25", padding: "10px", borderRadius: "6px", fontSize: "12px", color: "#ffb799" }}>
                {item.remediation}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {tab === "json" && (
        <Panel title="Evaluation JSON Payload">
          <pre>{JSON.stringify(evaluationReport, null, 2)}</pre>
        </Panel>
      )}
    </>
  );
}

// -------------------------------------------------------------
// 8. SETTINGS PAGE
// -------------------------------------------------------------
function SettingsPage({
  settings,
  setSettings,
  onDirtyChange,
  showToast,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onDirtyChange: (dirty: boolean) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  const update = (key: keyof Settings, value: string | number) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const totalWeight = draft.hook + draft.cliffhanger + draft.coherence;
  const durationValid =
    draft.minDuration >= 1 &&
    draft.maxDuration <= 60 &&
    draft.maxDuration > draft.minDuration;

  const apiUrlValid = (() => {
    if (!draft.apiBaseUrl.trim()) return true;
    try {
      return ["http:", "https:"].includes(new URL(draft.apiBaseUrl).protocol);
    } catch {
      return false;
    }
  })();

  const formValid =
    totalWeight === 100 && durationValid && apiUrlValid && draft.workspaceName.trim().length > 0;
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => {
    onDirtyChange(hasChanges);
    return () => onDirtyChange(false);
  }, [hasChanges, onDirtyChange]);

  const save = () => {
    if (!formValid) return;
    setSettings({ ...draft, workspaceName: draft.workspaceName.trim() });
    setSaved(true);
    showToast({ message: "Workspace settings and model weights saved.", type: "success" });
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <PageHeader
        eyebrow="System / Settings"
        title="Workspace Configuration & Model Weights"
        description="Tune the Prometheus narrative evaluation weights and editorial constraints to match your production standards."
        actions={
          <Button
            variant="primary"
            onClick={save}
            disabled={!formValid || !hasChanges}
            disabledReason={!hasChanges ? "No changes to save." : !formValid ? "Please fix configuration errors before saving." : undefined}
          >
            <Check size={16} aria-hidden="true" />
            {saved ? "Settings saved" : hasChanges ? "Save changes" : "No changes"}
          </Button>
        }
      />

      <div className="settings-layout">
        <Panel title="Model & API Configuration">
          <div className="form-stack">
            <label htmlFor="ranking-model-select">
              Ranking Engine Model
              <select
                id="ranking-model-select"
                value={draft.model}
                onChange={(e) => update("model", e.target.value)}
              >
                <option>Prometheus Narrative v2.4 (Recommended)</option>
                <option>Prometheus Narrative v2.3</option>
                <option>Heuristic Baseline v1.8</option>
              </select>
            </label>

            <label htmlFor="api-url-input">
              FastAPI Endpoint URL
              <input
                id="api-url-input"
                value={draft.apiBaseUrl}
                onChange={(event) => update("apiBaseUrl", event.target.value)}
                placeholder="https://api.promoforge.internal"
                aria-invalid={!apiUrlValid}
              />
            </label>
            {!apiUrlValid && <p className="field-error">Enter a valid HTTP or HTTPS endpoint URL.</p>}

            <div style={{ background: "#161820", padding: "12px", borderRadius: "6px", display: "flex", gap: "10px", alignItems: "center" }}>
              <Info size={18} className="text-orange" aria-hidden="true" />
              <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                Local browser adapter active. When a remote FastAPI endpoint is set, all extraction and OTIO calls route to your cluster.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Ranking Weights (Must Sum to 100%)">
          <div className="range-list">
            {(
              [
                ["hook", "Hook Strength Weight"],
                ["cliffhanger", "Cliffhanger Index Weight"],
                ["coherence", "Narrative Coherence Weight"],
              ] as [keyof Settings, string][]
            ).map(([k, l]) => (
              <label key={k}>
                <span>
                  {l}
                  <b>{draft[k]}%</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draft[k]}
                  onChange={(e) => update(k, +e.target.value)}
                  aria-label={l}
                />
              </label>
            ))}
          </div>
          <div className={`weight-status ${totalWeight === 100 ? "ok" : "bad"}`} aria-live="polite">
            {totalWeight === 100 ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <CircleAlert size={16} aria-hidden="true" />
            )}
            <span>
              Total Weight: {totalWeight}% {totalWeight !== 100 && "(Must equal exactly 100%)"}
            </span>
          </div>
        </Panel>

        <Panel title="Duration Constraints (Seconds)">
          <div className="duration-inputs">
            <label>
              Minimum Length
              <input
                type="number"
                min="1"
                max="59"
                value={draft.minDuration}
                onChange={(e) => update("minDuration", +e.target.value)}
                aria-invalid={!durationValid}
              />
            </label>
            <span style={{ fontSize: "13px", color: "var(--muted)", margin: "0 4px" }}>to</span>
            <label>
              Maximum Length
              <input
                type="number"
                min="2"
                max="60"
                value={draft.maxDuration}
                onChange={(e) => update("maxDuration", +e.target.value)}
                aria-invalid={!durationValid}
              />
            </label>
          </div>
          <div className="duration-viz">
            <span
              style={{
                left: `${Math.min(100, Math.max(0, draft.minDuration / 0.6))}%`,
                width: `${Math.min(
                  100 - Math.min(100, Math.max(0, draft.minDuration / 0.6)),
                  Math.max(0, (draft.maxDuration - draft.minDuration) / 0.6),
                )}%`,
              }}
            />
            <i>0s</i>
            <i>60s</i>
          </div>
          {!durationValid && (
            <p className="field-error" style={{ margin: "0 18px 14px" }}>
              Duration window must be between 1 and 60 seconds, with maximum greater than minimum.
            </p>
          )}
        </Panel>

        <Panel title="Workspace Defaults">
          <div className="form-stack">
            <label htmlFor="workspace-name-input">
              Studio Workspace Name
              <input
                id="workspace-name-input"
                value={draft.workspaceName}
                onChange={(event) => update("workspaceName", event.target.value)}
                aria-invalid={!draft.workspaceName.trim()}
              />
            </label>
            <label htmlFor="default-project-select">
              Active Project
              <select
                id="default-project-select"
                value={draft.defaultProject}
                onChange={(event) => update("defaultProject", event.target.value)}
              >
                <option>Glass Hearts</option>
                <option>The CEO’s Secret Vow</option>
                <option>Crimson Inheritance</option>
              </select>
            </label>
          </div>
        </Panel>
      </div>
    </>
  );
}

// -------------------------------------------------------------
// MAIN APP COMPONENT
// -------------------------------------------------------------
export default function App() {
  const [page, setPage] = usePersistentState<PageId>("pf-page", "discover");
  const [collapsed, setCollapsed] = usePersistentState("pf-sidebar", false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [shortlist, setShortlist] = usePersistentState<string[]>("pf-shortlist", ["pr1", "pr2"]);
  const [promos, setPromos] = usePersistentState<Promo[]>("pf-promos", initialPromos);
  const [settings, setSettings] = usePersistentState<Settings>("pf-settings", defaultSettings);
  const [selectedPromoId, setSelectedPromoId] = usePersistentState("pf-selected-promo", "pr1");
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [activeEpisode, setActiveEpisode] = usePersistentState<ActiveEpisodeContext | null>(
    "pf-active-episode",
    null,
  );
  const [activeCandidateId, setActiveCandidateId] = usePersistentState<string | null>(
    "pf-active-candidate",
    null,
  );

  const showToast = (notification: Omit<ToastNotification, "id">) => {
    setToast({
      id: `toast-${Date.now()}`,
      ...notification,
    });
  };

  const toggleShortlist = (id: string) => {
    setShortlist((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  };

  const setStatus = async (id: string, status: PromoStatus) => {
    setPromos((v) => v.map((p) => (p.id === id ? { ...p, status } : p)));
    await api.updatePromoStatus(id, status);
  };

  const openPromo = (id: string) => {
    setSelectedPromoId(id);
    setPage("studio");
    setMobileNavOpen(false);
  };

  const openProject = (projectName: string) => {
    setSettings((s) => ({ ...s, defaultProject: projectName }));
    const projectPromo = promos.find((promo) => promo.project === projectName);
    if (projectPromo) {
      setSelectedPromoId(projectPromo.id);
      setPage("studio");
    } else {
      setPage("discover");
    }
    setMobileNavOpen(false);
  };

  const selectEpisode = (episode: ActiveEpisodeContext) => {
    setActiveEpisode(episode);
    setActiveCandidateId(null);
    setSettings((current) => ({ ...current, defaultProject: episode.project_name }));
    setPage("discover");
    setMobileNavOpen(false);
    showToast({
      message: `Opened ${episode.project_name} · ${episode.episode_id}.`,
      type: "success",
    });
  };

  const useRecommendedCandidate = (candidateId: string) => {
    setActiveCandidateId(candidateId);
    setPage("studio");
    setMobileNavOpen(false);
    showToast({
      message: "Top promo selected for the demo workspace.",
      type: "success",
    });
  };

  const navigate = (nextPage: PageId) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  const cycleProject = () => {
    navigate("projects");
  };

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  const activePromo =
    promos.find((promo) => promo.id === selectedPromoId) || promos[0] || initialPromos[0];

  const pages: Record<PageId, ReactNode> = {
    projects: (
      <ProjectLibrary
        activeEpisode={activeEpisode}
        onSelectEpisode={selectEpisode}
        showToast={showToast}
      />
    ),
    discover: (
      <DiscoverPage
        promos={promos}
        shortlist={shortlist}
        toggleShortlist={toggleShortlist}
        setPage={navigate}
        openPromo={openPromo}
        activeEpisode={activeEpisode}
        onUseCandidate={useRecommendedCandidate}
        showToast={showToast}
      />
    ),
    studio: activeEpisode ? (
      <RecommendedPromoStudio
        activeEpisode={activeEpisode}
        candidateId={activeCandidateId}
        onNavigate={navigate}
        showToast={showToast}
      />
    ) : (
      <StudioPage
        promo={activePromo}
        setStatus={setStatus}
        settings={settings}
        onNavigate={navigate}
        showToast={showToast}
      />
    ),
    narrative: <NarrativePage onOpenStudio={openProject} />,
    campaign: (
      <CampaignPage
        promos={promos}
        shortlist={shortlist}
        toggleShortlist={toggleShortlist}
        onNavigate={navigate}
        showToast={showToast}
      />
    ),
    exports: <ExportsPage promos={promos} showToast={showToast} />,
    evaluation: <EvaluationPage activeEpisode={activeEpisode} showToast={showToast} />,
    settings: (
      <SettingsPage
        settings={settings}
        setSettings={setSettings}
        onDirtyChange={setSettingsDirty}
        showToast={showToast}
      />
    ),
  };

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside
        id="primary-navigation"
        className={`sidebar ${collapsed && !mobileNavOpen ? "collapsed" : ""} ${
          mobileNavOpen ? "mobile-open" : ""
        }`}
        aria-label="Studio primary navigation"
      >
        <div className="brand">
          <div className="brand-mark">
            <Film size={20} aria-hidden="true" />
          </div>
          {(!collapsed || mobileNavOpen) && (
            <div className="brand-info">
              <b>PromoForge</b>
              <span>EDITORIAL STUDIO</span>
            </div>
          )}
          <button
            type="button"
            className="brand-toggle-btn"
            onClick={() =>
              mobileNavOpen ? setMobileNavOpen(false) : setCollapsed((value) => !value)
            }
            aria-label={mobileNavOpen ? "Close navigation drawer" : "Toggle sidebar collapsed state"}
          >
            {mobileNavOpen ? <X size={18} /> : collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav>
          {navSections.map((section) => (
            <div key={section.title} style={{ marginBottom: "6px" }}>
              {(!collapsed || mobileNavOpen) && (
                <div className="nav-section-title">{section.title}</div>
              )}
              {section.items.map((item) => (
                <button
                  type="button"
                  title={item.label}
                  key={item.id}
                  className={page === item.id ? "active" : ""}
                  onClick={() => navigate(item.id)}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <item.icon size={18} aria-hidden="true" />
                  {(!collapsed || mobileNavOpen) && <span>{item.label}</span>}
                  {item.id === "discover" && (!collapsed || mobileNavOpen) && (
                    <i>{promos.length}</i>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {(!collapsed || mobileNavOpen) && (
            <div className="demo-card">
              <Badge tone="orange">STUDIO DEMO</Badge>
              <p>Prometheus Narrative v2.4</p>
              <span>Fictional microdrama datasets</span>
            </div>
          )}
          <div className="profile">
            <span className="profile-avatar">AM</span>
            {(!collapsed || mobileNavOpen) && (
              <div className="profile-info">
                <b>Alex Morgan</b>
                <small>Lead Promo Editor</small>
              </div>
            )}
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Main Workspace Area */}
      <main>
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open mobile navigation menu"
            aria-controls="primary-navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          {/* Interactive Project Switcher (Preserves context across pages) */}
          <button
            type="button"
            className="project-switcher-btn"
            onClick={cycleProject}
            title="Click to switch active project"
            aria-label={`Active project: ${activeEpisode?.project_name || settings.defaultProject}. Click to choose project.`}
          >
            <span className="project-dot" />
            <div className="project-switcher-text">
              <small>ACTIVE SERIES</small>
              <b>
                {activeEpisode
                  ? `${activeEpisode.project_name} · ${activeEpisode.episode_id}`
                  : settings.defaultProject}
              </b>
            </div>
            <ChevronDown size={14} className="text-muted" aria-hidden="true" />
          </button>

          <div className="topbar-right">
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Open Discover ranked moments"
              title="Quick jump to Discover"
              onClick={() => navigate("discover")}
            >
              <Search size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Open Evaluation audit alerts"
              title="Open Evaluation audit"
              onClick={() => navigate("evaluation")}
            >
              <Bell size={18} aria-hidden="true" />
              <span className="notification-dot" />
            </button>
            <div
              className={`sync-indicator ${settingsDirty ? "unsaved" : "synced"}`}
              aria-live="polite"
            >
              {settingsDirty ? (
                <CircleAlert size={14} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={14} aria-hidden="true" />
              )}
              <span>{settingsDirty ? "Unsaved settings" : "Workspace synced"}</span>
            </div>
          </div>
        </header>

        <div className="page-content" key={page}>
          {/* Workflow Sequence Breadcrumb (Section 3: Projects → Discover → Edit → Campaign → Export) */}
          <WorkflowBreadcrumb currentPage={page} onNavigate={navigate} />

          {/* Render Active Page */}
          {pages[page]}
        </div>
      </main>

      {/* Consequential Undo Toast Banner (Rule 8) */}
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
