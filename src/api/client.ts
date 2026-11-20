import { promos } from "../data/mockData";
import type {
  BackendEpisode,
  BackendProject,
  BackendPromoCandidate,
  PromoRecommendationResponse,
  EvaluationReadyItem,
  EvaluationSessionReport,
  EvaluationSessionSummary,
  Promo,
  PromoStatus,
  ReviewAssignment,
  ReviewDecision,
  RubricScores,
} from "../types";

const wait = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms));

function backendBaseUrl() {
  let configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  try {
    const settings = JSON.parse(localStorage.getItem("pf-settings") || "{}") as {
      apiBaseUrl?: string;
    };
    configured = settings.apiBaseUrl?.trim() || configured;
  } catch {
    // Fall through to the environment/default URL.
  }
  const base = (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
}

async function backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string | { message?: string } }
      | null;
    const detail = body?.detail;
    const message =
      typeof detail === "string" ? detail : detail?.message || `Backend request failed (${response.status})`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

// Frontend contract mirrors the planned FastAPI resources.
export const api = {
  async listProjects(): Promise<BackendProject[]> {
    return backendRequest("/projects");
  },
  async listProjectEpisodes(projectId: string): Promise<BackendEpisode[]> {
    return backendRequest(`/projects/${encodeURIComponent(projectId)}/episodes`);
  },
  async importSeriesArchive(file: File): Promise<{ project: BackendProject; created: boolean }> {
    const form = new FormData();
    form.append("file", file);
    return backendRequest("/projects/import", { method: "POST", body: form });
  },
  async importNamedEpisode(
    seriesName: string,
    file: File,
  ): Promise<{
    project: BackendProject;
    episode: BackendEpisode;
    project_created: boolean;
    episode_created: boolean;
  }> {
    const form = new FormData();
    form.append("series_name", seriesName);
    form.append("file", file);
    return backendRequest("/projects/episodes/import", { method: "POST", body: form });
  },
  async queueProjectAnalysis(projectId: string, idempotencyKey?: string) {
    const key = idempotencyKey || `analysis-${projectId}-${new Date().toISOString().slice(0, 10)}`;
    return backendRequest<{ job: { id: string; status: string }; created: boolean }>(
      `/projects/${encodeURIComponent(projectId)}/analyze`,
      {
        method: "POST",
        body: JSON.stringify({ idempotency_key: key }),
      },
    );
  },
  async readEpisodePromos(jobId: string, episodeId: string) {
    return backendRequest<{
      episode_id: string;
      proposal_count: number;
      selected_count: number;
      candidates: BackendPromoCandidate[];
    }>(
      `/jobs/${encodeURIComponent(jobId)}/episodes/${encodeURIComponent(episodeId)}/promos`,
    );
  },
  async updateCandidate(
    jobId: string,
    episodeKey: string,
    candidateId: string,
    payload: { status?: string; start_ms?: number; end_ms?: number },
  ): Promise<{ candidate: BackendPromoCandidate; updated: boolean }> {
    return backendRequest(
      `/jobs/${encodeURIComponent(jobId)}/episodes/${encodeURIComponent(episodeKey)}/promos/${encodeURIComponent(candidateId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  },
  async exportPromos(
    jobId: string,
    episodeKey: string,
    format: "json" | "csv" | "txt" | "otio" = "json",
  ): Promise<{
    episode_id: string;
    format: string;
    sha256: string;
    filename: string;
    candidate_count: number;
    artifact: string;
  }> {
    return backendRequest(
      `/jobs/${encodeURIComponent(jobId)}/episodes/${encodeURIComponent(episodeKey)}/export?format=${encodeURIComponent(format)}`,
    );
  },
  async listEvaluationSessions(): Promise<{ sessions: EvaluationSessionSummary[] }> {
    return backendRequest("/evaluation/sessions");
  },
  async readEpisodeRecommendation(
    jobId: string,
    episodeId: string,
  ): Promise<PromoRecommendationResponse> {
    return backendRequest(
      `/jobs/${encodeURIComponent(jobId)}/episodes/${encodeURIComponent(episodeId)}/promos/recommendation`,
    );
  },
  async listPromos(): Promise<Promo[]> {
    await wait();
    return promos;
  },
  async updatePromoStatus(id: string, status: PromoStatus) {
    await wait();
    return { id, status };
  },
  async retryAnalysis(id: string) {
    await wait(500);
    return { id, accepted: true };
  },
  async createCampaign(promoIds: string[]) {
    await wait();
    return { id: `campaign-${Date.now()}`, promoIds };
  },
  async listEvaluationReady(): Promise<EvaluationReadyItem[]> {
    return backendRequest("/evaluation/ready");
  },
  async createEvaluationSession(
    item: EvaluationReadyItem,
    sessionKey: string,
    reviewerIds: string[],
  ): Promise<{ session: EvaluationSessionSummary; created: boolean }> {
    return backendRequest(
      `/jobs/${encodeURIComponent(item.job_id)}/episodes/${encodeURIComponent(item.episode_id)}/evaluation/sessions`,
      {
        method: "POST",
        body: JSON.stringify({ session_key: sessionKey, reviewer_ids: reviewerIds }),
      },
    );
  },
  async listReviewAssignments(
    sessionId: string,
    reviewerId: string,
  ): Promise<{ session: EvaluationSessionSummary; assignments: ReviewAssignment[] }> {
    return backendRequest(
      `/evaluation/sessions/${encodeURIComponent(sessionId)}/assignments?reviewer_id=${encodeURIComponent(reviewerId)}`,
    );
  },
  async submitReview(
    assignmentId: string,
    payload: {
      reviewer_id: string;
      decision: ReviewDecision;
      scores: RubricScores;
      boundary_usable: boolean;
      spoiler_safe: boolean;
      notes: string | null;
    },
  ): Promise<{ assignment: ReviewAssignment }> {
    return backendRequest(`/evaluation/assignments/${encodeURIComponent(assignmentId)}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async readEvaluationReport(sessionId: string): Promise<EvaluationSessionReport> {
    return backendRequest(`/evaluation/sessions/${encodeURIComponent(sessionId)}/report`);
  },
  async assignTiebreaker(
    sessionId: string,
    reviewerId: string,
  ): Promise<{ session: EvaluationSessionSummary; assignments_created: number }> {
    return backendRequest(`/evaluation/sessions/${encodeURIComponent(sessionId)}/tiebreaker`, {
      method: "POST",
      body: JSON.stringify({ reviewer_id: reviewerId }),
    });
  },
  async finalizeEvaluation(sessionId: string): Promise<EvaluationSessionReport> {
    return backendRequest(`/evaluation/sessions/${encodeURIComponent(sessionId)}/finalize`, {
      method: "POST",
    });
  },
};
