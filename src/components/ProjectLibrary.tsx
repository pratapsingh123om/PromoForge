import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileArchive,
  FileText,
  FolderOpen,
  ListFilter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api } from "../api/client";
import type {
  ActiveEpisodeContext,
  BackendEpisode,
  BackendProject,
  ToastNotification,
} from "../types";
import { Badge, Button, Metric, PageHeader, Panel } from "./ui";


function duration(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ProjectLibrary({
  activeEpisode,
  onSelectEpisode,
  showToast,
}: {
  activeEpisode: ActiveEpisodeContext | null;
  onSelectEpisode: (episode: ActiveEpisodeContext) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const archiveRef = useRef<HTMLInputElement>(null);
  const episodeFileRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, BackendEpisode[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    activeEpisode?.project_id || null,
  );
  const [filter, setFilter] = useState<"all" | "ready" | "processing" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [episodeDialogOpen, setEpisodeDialogOpen] = useState(false);
  const [seriesName, setSeriesName] = useState("");
  const [episodeFile, setEpisodeFile] = useState<File | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError("");
    try {
      setProjects(await api.listProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load series.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadEpisodes = async (projectId: string, force = false) => {
    if (!force && episodes[projectId]) return;
    setBusyAction(`episodes:${projectId}`);
    setError("");
    try {
      const rows = await api.listProjectEpisodes(projectId);
      setEpisodes((current) => ({ ...current, [projectId]: rows }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load episodes.");
    } finally {
      setBusyAction("");
    }
  };

  useEffect(() => {
    if (expandedProjectId) void loadEpisodes(expandedProjectId);
  }, [expandedProjectId]);

  const openEpisodeDialog = (project?: BackendProject) => {
    setSeriesName(project?.name || "");
    setEpisodeFile(null);
    setEpisodeDialogOpen(true);
  };

  const importEpisode = async () => {
    if (!seriesName.trim() || !episodeFile) return;
    setBusyAction("episode-upload");
    setError("");
    try {
      const result = await api.importNamedEpisode(seriesName.trim(), episodeFile);
      await loadProjects();
      setExpandedProjectId(result.project.id);
      await loadEpisodes(result.project.id, true);
      setEpisodeDialogOpen(false);
      showToast({
        message: result.episode_created
          ? `${result.episode.episode_id} added to “${result.project.name}”.`
          : `${result.episode.episode_id} was already present in “${result.project.name}”.`,
        type: result.episode_created ? "success" : "info",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the episode.");
    } finally {
      setBusyAction("");
    }
  };

  const importArchive = async (file?: File) => {
    if (!file) return;
    setBusyAction("series-upload");
    setError("");
    try {
      const result = await api.importSeriesArchive(file);
      await loadProjects();
      setExpandedProjectId(result.project.id);
      await loadEpisodes(result.project.id, true);
      showToast({
        message: result.created
          ? `Imported series “${result.project.name}”.`
          : `Series “${result.project.name}” was already imported.`,
        type: result.created ? "success" : "info",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the series archive.");
    } finally {
      setBusyAction("");
      if (archiveRef.current) archiveRef.current.value = "";
    }
  };

  const queueAnalysis = async (project: BackendProject) => {
    setBusyAction(`analyze:${project.id}`);
    setError("");
    try {
      const result = await api.queueProjectAnalysis(project.id);
      showToast({
        message: `Analysis job ${result.job.id.slice(0, 8)} queued for “${project.name}”.`,
        type: "success",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue analysis.");
    } finally {
      setBusyAction("");
    }
  };

  const visibleProjects = projects.filter(
    (project) => filter === "all" || project.status === filter,
  );
  const totalEpisodes = projects.reduce((total, project) => total + project.episode_count, 0);
  const totalWarnings = projects.reduce((total, project) => total + project.warning_count, 0);
  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 1 / Series Library"
        title="Series & Episode Ingestion"
        description="Name the series when adding an episode so every upload stays attached to the correct story workspace."
        actions={
          <>
            <Button variant="secondary" onClick={() => archiveRef.current?.click()} disabled={Boolean(busyAction)}>
              <FileArchive size={16} aria-hidden="true" /> Import series ZIP
            </Button>
            <Button variant="primary" onClick={() => openEpisodeDialog()} disabled={Boolean(busyAction)}>
              <Plus size={16} aria-hidden="true" /> Add episode
            </Button>
            <input ref={archiveRef} type="file" accept=".zip" hidden onChange={(event) => void importArchive(event.target.files?.[0])} />
          </>
        }
      />

      {error && <div className="project-error" role="alert"><AlertTriangle size={17} /><span>{error}</span></div>}

      <div className="metrics-grid">
        <Metric label="Series" value={String(projects.length).padStart(2, "0")} />
        <Metric label="Episodes Indexed" value={String(totalEpisodes)} />
        <Metric label="Source Warnings" value={String(totalWarnings)} positive={totalWarnings === 0} />
        <Metric label="Persistence" value="Live" delta="Backend connected" />
      </div>

      <div className="section-title">
        <div><h2>Series Library</h2><p>Open a series to view, add, and select its episodes.</p></div>
        <label className="select-wrap compact-select">
          <ListFilter size={15} aria-hidden="true" />
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter series by status">
            <option value="all">All statuses</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Failed</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>

      {loading ? (
        <Panel><div className="project-loading"><LoaderCircle className="spin" size={24} /><span>Loading series…</span></div></Panel>
      ) : (
        <div className="series-list">
          {visibleProjects.map((project) => {
            const expanded = expandedProjectId === project.id;
            const projectEpisodes = episodes[project.id] || [];
            return (
              <section className={`series-group ${activeEpisode?.project_id === project.id ? "active" : ""}`} key={project.id}>
                <article className="series-row">
                  <div className="project-art"><BookOpen size={22} /><span>{project.episode_count} EP</span></div>
                  <div className="project-main"><div className="project-title"><h3>{project.name}</h3><Badge tone={project.status === "ready" ? "green" : "orange"}>{project.status}</Badge></div><p>{project.episode_count} episodes · {project.warning_count} warnings</p></div>
                  <div className="series-source"><span>Source</span><b>{project.source_name || "Named episode uploads"}</b></div>
                  <div className="series-actions">
                    <Button variant="secondary" onClick={() => openEpisodeDialog(project)}><Upload size={15} /> Add episode</Button>
                    <Button variant="secondary" onClick={() => void queueAnalysis(project)} disabled={busyAction === `analyze:${project.id}`}><Sparkles size={15} /> Analyze</Button>
                    <Button variant={expanded ? "primary" : "secondary"} onClick={() => setExpandedProjectId(expanded ? null : project.id)}>{expanded ? "Hide episodes" : "View episodes"} <ChevronRight size={15} className={expanded ? "rotate-90" : ""} /></Button>
                  </div>
                </article>

                {expanded && (
                  <div className="episode-browser">
                    <div className="episode-browser-head"><div><FolderOpen size={18} /><div><b>{project.name}</b><span>Select an episode to carry its context into Discover and Studio.</span></div></div><Button variant="secondary" onClick={() => void loadEpisodes(project.id, true)}><RefreshCw size={14} /> Refresh</Button></div>
                    {busyAction === `episodes:${project.id}` ? (
                      <div className="project-loading"><LoaderCircle className="spin" size={20} /> Loading episodes…</div>
                    ) : projectEpisodes.length ? (
                      <div className="episode-list">
                        {projectEpisodes.map((episode) => {
                          const isActive = activeEpisode?.project_id === project.id && activeEpisode.episode_id === episode.episode_id;
                          return (
                            <article className={`episode-row ${isActive ? "active" : ""}`} key={episode.id}>
                              <div className="episode-number"><FileText size={17} /><b>{episode.episode_id}</b><span>Episode {episode.episode_number}</span></div>
                              <div className="episode-stat"><Clock3 size={14} /><span>{duration(episode.duration_ms)}</span></div>
                              <div className="episode-stat"><span>{episode.scene_count} scenes</span></div>
                              <div className="episode-stat"><span>{episode.event_count} events</span></div>
                              {episode.warning_count ? <Badge tone="orange">{episode.warning_count} warning</Badge> : <Badge tone="green">Indexed</Badge>}
                              <Button variant={isActive ? "primary" : "secondary"} onClick={() => onSelectEpisode({ project_id: project.id, project_name: project.name, episode_id: episode.episode_id, episode_number: episode.episode_number })}>{isActive ? "Active episode" : "Open workspace"} <ChevronRight size={14} /></Button>
                            </article>
                          );
                        })}
                      </div>
                    ) : <div className="eval-empty"><FileText size={22} /><div><b>No episodes yet</b><p>Add the first timestamped TXT episode to this series.</p></div><Button variant="primary" onClick={() => openEpisodeDialog(project)}>Add episode</Button></div>}
                  </div>
                )}
              </section>
            );
          })}
          {!visibleProjects.length && <Panel><div className="empty-state"><ListFilter size={28} /><h3>No series match this filter</h3><p>Import a ZIP or add an episode with a new series name.</p></div></Panel>}
        </div>
      )}

      {episodeDialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !busyAction && setEpisodeDialogOpen(false)}>
          <section className="episode-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="episode-upload-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-head"><div><span>Episode ingestion</span><h2 id="episode-upload-title">Add episode to a named series</h2></div><button type="button" onClick={() => setEpisodeDialogOpen(false)} aria-label="Close episode upload"><X size={18} /></button></div>
            <label><span>Series name</span><input value={seriesName} onChange={(event) => setSeriesName(event.target.value)} list="series-name-options" placeholder="e.g. I Married a Broken Soldier" autoFocus /><datalist id="series-name-options">{projects.map((project) => <option key={project.id} value={project.name} />)}</datalist><small>Matching names append to the existing series. A new name creates a new series.</small></label>
            <label><span>Episode TXT file</span><button type="button" className="file-drop-button" onClick={() => episodeFileRef.current?.click()}><Upload size={18} /><div><b>{episodeFile?.name || "Choose timestamped episode"}</b><small>UTF-8 TXT · company screenplay format</small></div></button><input ref={episodeFileRef} type="file" accept=".txt,text/plain" hidden onChange={(event) => setEpisodeFile(event.target.files?.[0] || null)} /></label>
            <div className="dialog-actions"><Button variant="secondary" onClick={() => setEpisodeDialogOpen(false)} disabled={busyAction === "episode-upload"}>Cancel</Button><Button variant="primary" onClick={() => void importEpisode()} disabled={!seriesName.trim() || !episodeFile || busyAction === "episode-upload"}>{busyAction === "episode-upload" ? "Importing…" : "Add episode"}</Button></div>
          </section>
        </div>
      )}
    </>
  );
}
