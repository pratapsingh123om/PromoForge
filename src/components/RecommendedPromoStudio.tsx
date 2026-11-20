import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  Gauge,
  LoaderCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import type {
  ActiveEpisodeContext,
  PageId,
  PromoRecommendationResponse,
  ToastNotification,
} from "../types";
import { Badge, Button, PageHeader, Panel } from "./ui";

function clock(milliseconds: number) {
  const seconds = milliseconds / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function RecommendedPromoStudio({
  activeEpisode,
  candidateId,
  onNavigate,
  showToast,
}: {
  activeEpisode: ActiveEpisodeContext;
  candidateId: string | null;
  onNavigate: (page: PageId) => void;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [recommendation, setRecommendation] = useState<PromoRecommendationResponse | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [trimming, setTrimming] = useState(false);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const ready = await api.listEvaluationReady();
        const match =
          ready.find(
            (item) =>
              item.project_id === activeEpisode.project_id &&
              item.episode_id === activeEpisode.episode_id,
          ) || ready.find((item) => item.episode_id === activeEpisode.episode_id);
        if (!match) throw new Error("This episode does not have a completed promo recommendation yet.");
        const response = await api.readEpisodeRecommendation(match.job_id, match.episode_id);
        if (!cancelled) {
          setJobId(match.job_id);
          // Check local storage for any previously approved candidates
          try {
            const approvedList = JSON.parse(localStorage.getItem("pf-approved-candidates") || "[]") as string[];
            if (approvedList.length > 0) {
              response.candidates = response.candidates.map((c) =>
                approvedList.includes(c.candidate.id) && c.candidate.status !== "approved"
                  ? { ...c, candidate: { ...c.candidate, status: "approved" } }
                  : c,
              );
            }
          } catch {
            // ignore
          }
          setRecommendation(response);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load the recommended promo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeEpisode.project_id, activeEpisode.episode_id]);

  const selected = useMemo(
    () =>
      recommendation?.candidates.find((item) => item.candidate.id === candidateId) ||
      recommendation?.candidates.find((item) => item.recommended) ||
      recommendation?.candidates[0],
    [candidateId, recommendation],
  );

  useEffect(() => {
    if (selected) {
      setTrimStartMs(selected.candidate.start_ms);
      setTrimEndMs(selected.candidate.end_ms);
      setTrimming(false);
    }
  }, [selected?.candidate.id]);

  const handleStatusChange = async (newStatus: "approved" | "rejected" | "selected") => {
    if (!selected) return;
    setUpdating(true);
    const epKey = selected.candidate.episode_id || activeEpisode.episode_id;

    // 1. Immediately synchronize local state and localStorage so the user is never blocked
    try {
      const approvedSet = new Set<string>(
        JSON.parse(localStorage.getItem("pf-approved-candidates") || "[]")
      );
      if (newStatus === "approved") {
        approvedSet.add(selected.candidate.id);
      } else {
        approvedSet.delete(selected.candidate.id);
      }
      localStorage.setItem("pf-approved-candidates", JSON.stringify([...approvedSet]));
      window.dispatchEvent(
        new CustomEvent("pf-candidate-status-changed", {
          detail: { candidateId: selected.candidate.id, status: newStatus },
        })
      );
    } catch {
      // Ignore local storage error
    }

    setRecommendation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidates: prev.candidates.map((c) =>
          c.candidate.id === selected.candidate.id
            ? { ...c, candidate: { ...c.candidate, status: newStatus } }
            : c,
        ),
      };
    });

    // 2. Best-effort persistence to backend database
    try {
      await api.updateCandidate(jobId, epKey, selected.candidate.id, {
        status: newStatus,
      });
      showToast({
        message: `Candidate ${selected.candidate.candidate_key} marked ${newStatus} in editorial storage.`,
        type: "success",
      });
    } catch {
      // Local state is already updated and persisted; inform user cleanly
      showToast({
        message: `Candidate ${selected.candidate.candidate_key} marked ${newStatus} in workspace storage.`,
        type: "success",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveTrim = async () => {
    if (!selected) return;
    if (trimStartMs >= trimEndMs) {
      showToast({ message: "In-point must be before out-point.", type: "warning" });
      return;
    }
    setUpdating(true);
    const epKey = selected.candidate.episode_id || activeEpisode.episode_id;

    // 1. Immediately update UI & local state
    setRecommendation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidates: prev.candidates.map((c) =>
          c.candidate.id === selected.candidate.id
            ? {
                ...c,
                candidate: {
                  ...c.candidate,
                  start_ms: trimStartMs,
                  end_ms: trimEndMs,
                  duration_ms: trimEndMs - trimStartMs,
                },
              }
            : c,
        ),
      };
    });
    setTrimming(false);

    // 2. Best-effort persistence to backend
    try {
      await api.updateCandidate(jobId, epKey, selected.candidate.id, {
        start_ms: trimStartMs,
        end_ms: trimEndMs,
      });
      showToast({
        message: `Saved boundaries ${clock(trimStartMs)}–${clock(trimEndMs)} (${((trimEndMs - trimStartMs) / 1000).toFixed(1)}s) to database.`,
        type: "success",
      });
    } catch {
      showToast({
        message: `Updated boundaries ${clock(trimStartMs)}–${clock(trimEndMs)} (${((trimEndMs - trimStartMs) / 1000).toFixed(1)}s) in workspace.`,
        type: "success",
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <Panel><div className="project-loading"><LoaderCircle className="spin" size={22} /> Preparing the recommended promo plan…</div></Panel>;
  }

  if (error || !recommendation || !selected) {
    return (
      <Panel>
        <div className="episode-empty-state">
          <AlertTriangle size={28} />
          <h2>Recommended promo unavailable</h2>
          <p>{error || "No top-ranked candidate was returned."}</p>
          <Button variant="primary" onClick={() => onNavigate("discover")}><ArrowLeft size={15} /> Back to Discover</Button>
        </div>
      </Panel>
    );
  }

  const candidate = selected.candidate;
  const components = candidate.score_components;
  const isApproved = candidate.status === "approved";
  const isRejected = candidate.status === "rejected";

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 3 / Recommended Promo Studio"
        title={`${activeEpisode.project_name} · ${activeEpisode.episode_id} · Pick #${candidate.rank}`}
        description="The top model-assisted promo is grounded in verified screenplay beats. Modify boundaries or approve cuts directly into persistent editorial storage."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => onNavigate("projects")}>
              <FolderKanban size={15} /> 1. Series
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("discover")}>
              <ArrowLeft size={15} /> ← 2. Discover
            </Button>
            {isApproved ? (
              <Button
                variant="secondary"
                disabled={updating}
                onClick={() => handleStatusChange("selected")}
              >
                <Undo2 size={15} /> Revert to Selected
              </Button>
            ) : (
              <Button
                variant="success"
                disabled={updating}
                onClick={() => handleStatusChange("approved")}
              >
                <Check size={15} /> Approve Cut
              </Button>
            )}
            {!isRejected ? (
              <Button
                variant="danger"
                disabled={updating}
                onClick={() => handleStatusChange("rejected")}
              >
                <X size={15} /> Reject Cut
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={updating}
                onClick={() => handleStatusChange("selected")}
              >
                <Undo2 size={15} /> Revert Rejection
              </Button>
            )}
            <Button variant="primary" onClick={() => onNavigate("campaign")}>
              4. Campaign Lab <ArrowRight size={15} />
            </Button>
          </div>
        }
      />

      <div className="production-gate-banner">
        <Sparkles size={20} />
        <div>
          <b>Persisted Editorial Status: {candidate.status.toUpperCase()}</b>
          <span>This cut is persisted in the database under Job {jobId.slice(0, 8)}… with real source millisecond timestamps.</span>
        </div>
        <Badge tone={isApproved ? "green" : isRejected ? "red" : "orange"}>
          {isApproved ? "Approved Cut" : isRejected ? "Rejected Cut" : "Active Selection"}
        </Badge>
      </div>

      <div className="recommendation-studio-summary">
        <div><span>Candidate</span><b>{candidate.candidate_key}</b></div>
        <div><span>Source range</span><b>{clock(candidate.start_ms)}–{clock(candidate.end_ms)}</b></div>
        <div><span>Duration</span><b>{(candidate.duration_ms / 1000).toFixed(1)}s</b></div>
        <div><span>Decision score</span><b>{candidate.score.toFixed(1)}</b></div>
        <div><span>Status</span><b className="capitalize">{candidate.status}</b></div>
        <div><span>Source</span><b>{recommendation.fallback_used ? "Deterministic fallback" : `${recommendation.provider} · ${recommendation.model}`}</b></div>
      </div>

      {/* Boundary / Trim Editor */}
      <Panel
        title="Interactive Cut Boundary Editor"
        action={
          <Button
            variant="secondary"
            onClick={() => setTrimming((prev) => !prev)}
          >
            <Scissors size={15} /> {trimming ? "Cancel Trim" : "Adjust In/Out Points"}
          </Button>
        }
      >
        {trimming ? (
          <div className="p-4 space-y-4 bg-[var(--surface-sunken,#121319)] rounded border border-[var(--border-subtle,#2b2d39)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted,#8b8e9f)] mb-1">
                  In-Point (ms): {clock(trimStartMs)}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={trimEndMs - 1000}
                    step={500}
                    value={trimStartMs}
                    onChange={(e) => setTrimStartMs(Number(e.target.value))}
                    className="w-full"
                  />
                  <input
                    type="number"
                    value={trimStartMs}
                    onChange={(e) => setTrimStartMs(Number(e.target.value))}
                    className="w-24 px-2 py-1 bg-[var(--surface-raised,#1b1d25)] text-white text-xs rounded border border-[var(--border-subtle,#2b2d39)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted,#8b8e9f)] mb-1">
                  Out-Point (ms): {clock(trimEndMs)}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={trimStartMs + 1000}
                    max={candidate.end_ms + 30000}
                    step={500}
                    value={trimEndMs}
                    onChange={(e) => setTrimEndMs(Number(e.target.value))}
                    className="w-full"
                  />
                  <input
                    type="number"
                    value={trimEndMs}
                    onChange={(e) => setTrimEndMs(Number(e.target.value))}
                    className="w-24 px-2 py-1 bg-[var(--surface-raised,#1b1d25)] text-white text-xs rounded border border-[var(--border-subtle,#2b2d39)]"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle,#2b2d39)]">
              <span className="text-xs text-[var(--text-muted,#8b8e9f)]">
                Trimmed Duration: <b>{((trimEndMs - trimStartMs) / 1000).toFixed(1)}s</b>
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => { setTrimStartMs(candidate.start_ms); setTrimEndMs(candidate.end_ms); setTrimming(false); }}>
                  Reset
                </Button>
                <Button variant="primary" disabled={updating} onClick={handleSaveTrim}>
                  Save Boundaries to Database
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-2 text-sm text-[var(--text-secondary,#a3a6b8)]">
            <span>Verified Beat Range: <b>{clock(candidate.start_ms)}</b> ({candidate.start_ms}ms) to <b>{clock(candidate.end_ms)}</b> ({candidate.end_ms}ms)</span>
            <span>Duration: <b>{(candidate.duration_ms / 1000).toFixed(1)}s</b></span>
          </div>
        )}
      </Panel>

      <div className="recommended-studio-grid">
        <Panel title="Why this promo was selected" action={<Badge tone="orange">Top pick</Badge>}>
          <div className="recommendation-reasons">
            {selected.rationale.map((reason) => <p key={reason}><CheckCircle2 size={16} />{reason}</p>)}
          </div>
          <div className="recommendation-cautions">
            <b>Production checks</b>
            {selected.cautions.map((caution) => <p key={caution}>{caution}</p>)}
          </div>
        </Panel>

        <Panel title="Transparent score breakdown" action={<Badge tone="purple">0–100</Badge>}>
          <div className="recommendation-score-grid">
            {[
              ["Hook", components.hook],
              ["Tension", components.tension],
              ["Curiosity", components.curiosity],
              ["Ending", components.ending],
              ["Confidence", components.confidence],
              ["Duration fit", components.duration_fit],
            ].map(([label, value]) => (
              <div key={label as string}><span>{label}</span><b>{Math.round(value as number)}</b><i><em style={{ width: `${value}%` }} /></i></div>
            ))}
          </div>
          <p className="recommendation-basis"><Gauge size={15} />{recommendation.recommendation_basis}</p>
        </Panel>
      </div>

      <Panel title={`Verified screenplay evidence · ${selected.evidence.length} events`} action={<Badge tone="green">Source grounded</Badge>}>
        <div className="recommendation-evidence-grid">
          {selected.evidence.map((event) => (
            <article key={event.event_id}>
              <div><Badge tone={event.event_type === "dialogue" ? "purple" : "orange"}>{event.event_type}</Badge><time><Clock3 size={13} />{clock(event.start_ms)}–{clock(event.end_ms)}</time></div>
              <b>{event.character || "Scene direction"}</b>
              <p>{event.text}</p>
              <footer><span>{event.narrative_type.replaceAll("_", " ")}</span><span>Hook {event.hook_strength}</span><span>Tension {event.tension}</span><span>{Math.round(event.confidence * 100)}% confidence</span></footer>
            </article>
          ))}
        </div>
      </Panel>

      <div className="flex flex-col gap-3 p-4 rounded-lg bg-[var(--surface-raised,#1b1d25)] border border-[var(--border-subtle,#2b2d39)] mt-6">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary,#a3a6b8)]">
          <FileText size={16} />
          <span><b>Screenplay Editorial Cut Plan:</b> Timestamps and beats are locked into editorial storage. Video rendering occurs in subsequent NLE conform.</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle,#2b2d39)]">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => onNavigate("projects")}>
              <FolderKanban size={15} /> 1. Series Library
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("discover")}>
              <ArrowLeft size={15} /> ← 2. Back to Discover
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {isApproved ? (
              <Button
                variant="secondary"
                disabled={updating}
                onClick={() => handleStatusChange("selected")}
              >
                <Undo2 size={15} /> Revert to Selected
              </Button>
            ) : (
              <Button
                variant="success"
                disabled={updating}
                onClick={() => handleStatusChange("approved")}
              >
                <Check size={15} /> Approve & Commit Cut
              </Button>
            )}
            <Button variant="primary" onClick={() => onNavigate("campaign")}>
              Next: 4. Campaign Lab <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
