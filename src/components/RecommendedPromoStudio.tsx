import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const ready = await api.listEvaluationReady();
        const match = ready.find(
          (item) =>
            item.project_id === activeEpisode.project_id &&
            item.episode_id === activeEpisode.episode_id,
        );
        if (!match) throw new Error("This episode does not have a completed promo recommendation yet.");
        const response = await api.readEpisodeRecommendation(match.job_id, match.episode_id);
        if (!cancelled) setRecommendation(response);
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

  return (
    <>
      <PageHeader
        eyebrow="Workflow Step 3 / Recommended Promo Plan"
        title={`${activeEpisode.project_name} · ${activeEpisode.episode_id} · Pick #${candidate.rank}`}
        description="The top model-assisted promo is ready for demo exploration. Human review is deferred until a real video moves toward production."
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate("discover")}><ArrowLeft size={15} /> Compare top 3</Button>
            <Button variant="secondary" onClick={() => onNavigate("evaluation")}><ShieldCheck size={15} /> Production review</Button>
          </>
        }
      />

      <div className="production-gate-banner">
        <Sparkles size={20} />
        <div><b>Model recommendation selected for further processing</b><span>Exploration needs no editor session. Request blinded human review only before committing a production video or final export.</span></div>
        <Badge tone="green">Demo ready</Badge>
      </div>

      <div className="recommendation-studio-summary">
        <div><span>Candidate</span><b>{candidate.candidate_key}</b></div>
        <div><span>Source range</span><b>{clock(candidate.start_ms)}–{clock(candidate.end_ms)}</b></div>
        <div><span>Duration</span><b>{(candidate.duration_ms / 1000).toFixed(1)}s</b></div>
        <div><span>Decision score</span><b>{candidate.score.toFixed(1)}</b></div>
        <div><span>Source</span><b>{recommendation.fallback_used ? "Deterministic fallback" : `${recommendation.provider} · ${recommendation.model}`}</b></div>
      </div>

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

      <div className="demo-processing-actions">
        <div><FileText size={18} /><span><b>This is a screenplay cut plan, not a rendered video.</b> Video assembly and media export remain a later production step.</span></div>
        <Button
          variant="primary"
          onClick={() => showToast({ message: `${candidate.candidate_key} is the active demo promo plan.`, type: "success" })}
        >Use this promo plan</Button>
      </div>
    </>
  );
}
