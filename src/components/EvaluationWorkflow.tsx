import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import type {
  EvaluationReadyItem,
  ActiveEpisodeContext,
  EvaluationSessionReport,
  EvaluationSessionSummary,
  ReviewAssignment,
  ReviewDecision,
  RubricScores,
  ToastNotification,
} from "../types";
import { Badge, Button, Metric, PageHeader, Panel } from "./ui";


const criteria: Array<{ key: keyof RubricScores; label: string; help: string }> = [
  { key: "hook", label: "Hook", help: "Captures attention immediately" },
  { key: "curiosity", label: "Curiosity", help: "Creates a reason to keep watching" },
  { key: "clarity", label: "Clarity", help: "Works without excessive context" },
  { key: "emotion", label: "Emotion", help: "Creates tension, surprise, or empathy" },
  { key: "coherence", label: "Coherence", help: "Forms a logical mini-story" },
  { key: "spoiler_safety", label: "Spoiler safety", help: "Preserves the payoff" },
  { key: "editability", label: "Editability", help: "Can become a polished cut" },
  { key: "brand_fit", label: "Brand fit", help: "Represents the show accurately" },
];

const initialScores: RubricScores = {
  hook: 3,
  curiosity: 3,
  clarity: 3,
  emotion: 3,
  coherence: 3,
  spoiler_safety: 3,
  editability: 3,
  brand_fit: 3,
};

function percent(value: number | null) {
  return value === null ? "Pending" : `${Math.round(value * 100)}%`;
}

function clock(milliseconds: number) {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EvaluationWorkflow({
  activeEpisode,
  showToast,
}: {
  activeEpisode?: ActiveEpisodeContext | null;
  showToast: (toast: Omit<ToastNotification, "id">) => void;
}) {
  const [ready, setReady] = useState<EvaluationReadyItem[]>([]);
  const [selectedReady, setSelectedReady] = useState("");
  const [sessionKey, setSessionKey] = useState("production-review-v1");
  const [reviewers, setReviewers] = useState(["EDITOR_A", "EDITOR_B"]);
  const [activeReviewer, setActiveReviewer] = useState("EDITOR_A");
  const [session, setSession] = useState<EvaluationSessionSummary | null>(null);
  const [assignments, setAssignments] = useState<ReviewAssignment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scores, setScores] = useState<RubricScores>(initialScores);
  const [decision, setDecision] = useState<ReviewDecision>("approve_with_changes");
  const [boundaryUsable, setBoundaryUsable] = useState(true);
  const [spoilerSafe, setSpoilerSafe] = useState(true);
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<EvaluationSessionReport | null>(null);
  const [tiebreaker, setTiebreaker] = useState("EDITOR_C");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedItem = ready.find(
    (item) => `${item.job_id}:${item.episode_id}` === selectedReady,
  );
  const activeAssignment = assignments[activeIndex];
  const pendingAssignments = assignments.filter((item) => item.status === "pending");
  const completedAssignments = assignments.length - pendingAssignments.length;
  const metrics = report?.report.systems[0]?.metrics;
  const unresolved = report?.report.candidates.filter((candidate) => candidate.usable === null) || [];

  const loadReady = async () => {
    setBusy(true);
    setError("");
    try {
      const items = await api.listEvaluationReady();
      setReady(items);
      const preferred = items.find(
        (item) =>
          item.project_id === activeEpisode?.project_id &&
          item.episode_id === activeEpisode?.episode_id,
      );
      setSelectedReady((current) => current || (preferred ? `${preferred.job_id}:${preferred.episode_id}` : items[0] ? `${items[0].job_id}:${items[0].episode_id}` : ""));

      // Resume latest active session if one exists (PF-011)
      try {
        const { sessions } = await api.listEvaluationSessions();
        if (sessions && sessions.length > 0) {
          const storedSessionId = localStorage.getItem("pf-active-evaluation-session");
          const targetSession = sessions.find((s) => s.id === storedSessionId) || sessions[0];
          if (targetSession) {
            localStorage.setItem("pf-active-evaluation-session", targetSession.id);
            setSession(targetSession);
            await loadAssignments(targetSession.id, activeReviewer);
          }
        }
      } catch {
        // Fall through if no persisted session endpoint is available yet
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load review-ready candidates.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadReady();
  }, [activeEpisode?.project_id, activeEpisode?.episode_id]);

  const loadAssignments = async (sessionId: string, reviewerId: string) => {
    const response = await api.listReviewAssignments(sessionId, reviewerId);
    setSession(response.session);
    setAssignments(response.assignments);
    localStorage.setItem("pf-active-evaluation-session", response.session.id);
    const nextPending = response.assignments.findIndex((item) => item.status === "pending");
    setActiveIndex(nextPending >= 0 ? nextPending : 0);
  };

  const createSession = async () => {
    if (!selectedItem || reviewers.some((reviewer) => !reviewer.trim())) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.createEvaluationSession(
        selectedItem,
        sessionKey.trim(),
        reviewers.map((reviewer) => reviewer.trim()),
      );
      setSession(response.session);
      localStorage.setItem("pf-active-evaluation-session", response.session.id);
      setActiveReviewer(reviewers[0].trim());
      await loadAssignments(response.session.id, reviewers[0].trim());
      showToast({
        message: response.created ? "Created blinded editorial review session." : "Reopened existing review session.",
        type: "success",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the review session.");
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setScores(initialScores);
    setDecision("approve_with_changes");
    setBoundaryUsable(true);
    setSpoilerSafe(true);
    setNotes("");
  };

  const submit = async () => {
    if (!activeAssignment || activeAssignment.status !== "pending") return;
    setBusy(true);
    setError("");
    try {
      await api.submitReview(activeAssignment.id, {
        reviewer_id: activeReviewer,
        decision,
        scores,
        boundary_usable: boundaryUsable,
        spoiler_safe: spoilerSafe,
        notes: notes.trim() || null,
      });
      resetForm();
      if (session) await loadAssignments(session.id, activeReviewer);
      showToast({ message: `Saved review for ${activeAssignment.blind_label}.`, type: "success" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the review.");
    } finally {
      setBusy(false);
    }
  };

  const refreshReport = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.readEvaluationReport(session.id);
      setReport(next);
      setSession(next.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate the report.");
    } finally {
      setBusy(false);
    }
  };

  const addTiebreaker = async () => {
    if (!session || !tiebreaker.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.assignTiebreaker(session.id, tiebreaker.trim());
      setReviewers((current) => [...new Set([...current, tiebreaker.trim()])]);
      setActiveReviewer(tiebreaker.trim());
      await loadAssignments(session.id, tiebreaker.trim());
      setReport(null);
      showToast({ message: `Assigned ${response.assignments_created} split decisions.`, type: "success" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign the tiebreaker.");
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const finalReport = await api.finalizeEvaluation(session.id);
      setReport(finalReport);
      setSession(finalReport.session);
      showToast({ message: "Finalized the editorial evaluation report.", type: "success" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finalize the evaluation.");
    } finally {
      setBusy(false);
    }
  };

  const evidenceTitle = useMemo(() => {
    if (!activeAssignment) return "No assignment selected";
    return `${activeAssignment.blind_label} · ${clock(activeAssignment.start_ms)}–${clock(activeAssignment.end_ms)}`;
  }, [activeAssignment]);

  return (
    <>
      <PageHeader
        eyebrow="Optional Production Gate / Blinded Review"
        title="Human Review Before Video Production"
        description="The demo recommendation does not require editors. Use this independent review only when a selected promo is moving toward a produced video or final export."
        actions={
          report ? (
            <Button variant="secondary" onClick={() => saveJson("promoforge-editorial-evaluation.json", report)}>
              <Download size={16} aria-hidden="true" /> Download report
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="eval-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!session && (
        <Panel title="Start an optional production review" className="eval-setup">
          <div className="optional-review-note"><ShieldCheck size={19} /><div><b>Not required for model exploration</b><span>The top-three shortlist and top pick already come from source-grounded model signals. This gate adds human accountability before production spend.</span></div></div>
          <div className="eval-setup-grid">
            <label>
              <span>Review-ready episode</span>
              <select value={selectedReady} onChange={(event) => setSelectedReady(event.target.value)} disabled={busy || ready.length === 0}>
                {ready.map((item) => (
                  <option key={`${item.job_id}:${item.episode_id}`} value={`${item.job_id}:${item.episode_id}`}>
                    {item.project_name} · {item.episode_id} · {item.candidate_count} candidates
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Session key</span>
              <input value={sessionKey} onChange={(event) => setSessionKey(event.target.value)} />
            </label>
            {reviewers.slice(0, 2).map((reviewer, index) => (
              <label key={index}>
                <span>Independent editor {index + 1}</span>
                <input
                  value={reviewer}
                  onChange={(event) => setReviewers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                />
              </label>
            ))}
          </div>
          {ready.length === 0 ? (
            <div className="eval-empty">
              <EyeOff size={24} aria-hidden="true" />
              <div><b>No generated candidates are ready</b><p>Generate promo candidates for an analyzed episode, then refresh this list.</p></div>
              <Button variant="secondary" onClick={() => void loadReady()} disabled={busy}><RefreshCw size={15} /> Refresh</Button>
            </div>
          ) : (
            <div className="eval-setup-action">
              <div><ShieldCheck size={18} /><span>Ranks, model scores, and provider identity stay hidden from editors.</span></div>
              <Button variant="primary" onClick={() => void createSession()} disabled={busy || !sessionKey.trim()}>
                <Users size={16} /> {busy ? "Preparing…" : "Start optional review"}
              </Button>
            </div>
          )}
        </Panel>
      )}

      {session && !report && (
        <>
          <div className="metrics-grid">
            <Metric label="Candidates" value={String(session.candidate_count).padStart(2, "0")} />
            <Metric label="Assignments complete" value={`${session.completed_assignment_count}/${session.assignment_count}`} />
            <Metric label="Current editor" value={activeReviewer} />
            <Metric label="Blinding" value="Active" delta="Rank and scores hidden" />
          </div>

          <div className="eval-review-toolbar">
            <label>
              <span>Reviewing as</span>
              <select
                value={activeReviewer}
                onChange={(event) => {
                  const reviewer = event.target.value;
                  setActiveReviewer(reviewer);
                  if (session) void loadAssignments(session.id, reviewer);
                }}
              >
                {reviewers.map((reviewer) => <option key={reviewer}>{reviewer}</option>)}
              </select>
            </label>
            <div className="eval-progress"><i style={{ width: assignments.length ? `${(completedAssignments / assignments.length) * 100}%` : "0%" }} /></div>
            <span>{completedAssignments} of {assignments.length} reviewed</span>
            {session.completed_assignment_count === session.assignment_count && (
              <Button variant="primary" onClick={() => void refreshReport()} disabled={busy}>Calculate report</Button>
            )}
          </div>

          {activeAssignment && (
            <div className="eval-workspace">
              <Panel title={evidenceTitle} className="eval-evidence-panel">
                <div className="eval-blind-banner"><EyeOff size={16} /><span>Blinded candidate · {(activeAssignment.duration_ms / 1000).toFixed(1)} seconds</span></div>
                <div className="eval-evidence-list">
                  {activeAssignment.evidence.map((event) => (
                    <article key={event.event_id}>
                      <div><Badge tone={event.event_type === "dialogue" ? "purple" : "orange"}>{event.event_type}</Badge><time>{clock(event.start_ms)}–{clock(event.end_ms)}</time></div>
                      <b>{event.character || "Scene direction"}</b>
                      <p>{event.text}</p>
                    </article>
                  ))}
                </div>
              </Panel>

              <Panel title="Independent editorial rubric" className="eval-rubric-panel">
                {activeAssignment.status === "completed" ? (
                  <div className="eval-complete-card"><CheckCircle2 size={30} /><h3>Review saved</h3><p>This assignment is immutable. Continue to the next pending candidate.</p></div>
                ) : (
                  <>
                    <div className="rubric-grid">
                      {criteria.map((criterion) => (
                        <fieldset key={criterion.key}>
                          <legend><b>{criterion.label}</b><span>{criterion.help}</span></legend>
                          <div className="score-choices">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button type="button" key={value} className={scores[criterion.key] === value ? "active" : ""} onClick={() => setScores((current) => ({ ...current, [criterion.key]: value }))} aria-label={`${criterion.label}: ${value} out of 5`}>{value}</button>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                    <div className="eval-binary-row">
                      <label><input type="checkbox" checked={boundaryUsable} onChange={(event) => setBoundaryUsable(event.target.checked)} /> Cut boundaries are usable</label>
                      <label><input type="checkbox" checked={spoilerSafe} onChange={(event) => setSpoilerSafe(event.target.checked)} /> Candidate is spoiler-safe</label>
                    </div>
                    <label className="eval-decision"><span>Editorial decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as ReviewDecision)}><option value="approve">Approve</option><option value="approve_with_changes">Approve with changes</option><option value="reject">Reject</option></select></label>
                    <label className="eval-notes"><span>Notes (optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Explain boundary changes or rejection reason…" /></label>
                    <Button variant="primary" onClick={() => void submit()} disabled={busy}>Save independent review</Button>
                  </>
                )}
              </Panel>
            </div>
          )}

          <div className="eval-pagination">
            <Button variant="secondary" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={activeIndex === 0}><ChevronLeft size={15} /> Previous</Button>
            <span>{assignments.length ? activeIndex + 1 : 0} / {assignments.length}</span>
            <Button variant="secondary" onClick={() => setActiveIndex((index) => Math.min(assignments.length - 1, index + 1))} disabled={activeIndex >= assignments.length - 1}>Next <ChevronRight size={15} /></Button>
          </div>
        </>
      )}

      {report && metrics && (
        <>
          <div className="metrics-grid">
            <Metric label="Precision@K" value={percent(metrics.precision_at_k)} delta={metrics.precision_at_k_complete ? "Top set fully reviewed" : "Needs review coverage"} />
            <Metric label="Acceptance" value={percent(metrics.acceptance_rate)} />
            <Metric label="Spoiler violations" value={percent(metrics.spoiler_violation_rate)} positive={metrics.spoiler_violation_rate === 0} />
            <Metric label="Reviewer agreement" value={percent(metrics.inter_reviewer_agreement)} />
          </div>
          <Panel title={session?.status === "completed" ? "Final editorial report" : "Review consensus check"}>
            <div className="eval-report-summary">
              <div><b>{metrics.fully_reviewed_count}/{metrics.candidate_count}</b><span>candidates fully reviewed</span></div>
              <div><b>{percent(metrics.boundary_usable_rate)}</b><span>boundary usability</span></div>
              <div><b>{percent(metrics.duplicate_candidate_rate)}</b><span>duplicate candidate rate</span></div>
              <div><b>{metrics.mean_editor_score?.toFixed(2) || "Pending"}</b><span>mean rubric score</span></div>
            </div>
            {unresolved.length > 0 ? (
              <div className="eval-tiebreaker">
                <AlertTriangle size={20} />
                <div><b>{unresolved.length} split decision{unresolved.length === 1 ? "" : "s"}</b><p>Assign a new independent editor only to unresolved candidates.</p></div>
                <input value={tiebreaker} onChange={(event) => setTiebreaker(event.target.value)} aria-label="Tiebreaker reviewer ID" />
                <Button variant="primary" onClick={() => void addTiebreaker()} disabled={busy}>Assign tiebreaker</Button>
              </div>
            ) : session?.status !== "completed" ? (
              <div className="eval-finalize"><ShieldCheck size={20} /><div><b>Consensus is complete</b><p>Freeze the reviews and save the auditable report.</p></div><Button variant="primary" onClick={() => void finalize()} disabled={busy}>Finalize evaluation</Button></div>
            ) : (
              <div className="eval-finalize"><CheckCircle2 size={20} /><div><b>Evaluation finalized</b><p>The report is frozen with its source reviews and deterministic metrics.</p></div></div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
