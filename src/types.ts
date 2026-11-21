export type PageId =
  | "projects"
  | "discover"
  | "studio"
  | "narrative"
  | "campaign"
  | "exports"
  | "evaluation"
  | "settings";

export type PromoStatus = "review" | "approved" | "rejected";

export interface PromoMetrics {
  hookStrength: number;
  cliffhanger: number;
  coherence: number;
  modelConfidence: number;
  spoilerRisk: "Low" | "Moderate" | "High";
  spoilerDetails: string;
  evidenceQuote: string;
  evidenceScene: string;
  evidenceRationale: string;
}

export interface Promo {
  id: string;
  title: string;
  project: string;
  episode: string;
  duration: number;
  score: number;
  category: string;
  image: string;
  hook: string;
  status: PromoStatus;
  metrics: PromoMetrics;
}

export interface Segment {
  id: string;
  episode: number;
  start: number;
  duration: number;
  label: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  episodes: number;
  progress: number;
  status: "ready" | "processing" | "failed";
  updated: string;
  logline?: string;
}

export interface BackendProject {
  id: string;
  name: string;
  status: string;
  source_name: string | null;
  source_sha256: string | null;
  episode_count: number;
  warning_count: number;
  created_at: string;
}

export interface BackendEpisode {
  id: string;
  episode_id: string;
  episode_number: number;
  external_episode_id: string | null;
  source_name: string | null;
  duration_ms: number;
  scene_count: number;
  event_count: number;
  warning_count: number;
}

export interface ActiveEpisodeContext {
  project_id: string;
  project_name: string;
  episode_id: string;
  episode_number: number;
}

export interface BackendPromoCandidate {
  id: string;
  candidate_key: string;
  episode_id: string;
  generator_version: string;
  rank: number | null;
  status: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  hook_event_id: string;
  end_event_id: string;
  evidence_event_ids: string[];
  score: number;
  score_components: {
    hook: number;
    tension: number;
    curiosity: number;
    ending: number;
    confidence: number;
    duration_fit: number;
  };
  validation_issues: string[];
  suppressed_by_key: string | null;
}

export interface PromoRecommendationEvidence {
  event_id: string;
  start_ms: number;
  end_ms: number;
  event_type: string;
  character: string | null;
  text: string;
  narrative_type: string;
  emotional_appeal: string;
  hook_strength: number;
  tension: number;
  context_dependency: string;
  open_question: string | null;
  confidence: number;
}

export interface PromoRecommendationCandidate {
  candidate: BackendPromoCandidate;
  recommended: boolean;
  rationale: string[];
  cautions: string[];
  evidence: PromoRecommendationEvidence[];
}

export interface PromoRecommendationResponse {
  episode_id: string;
  model_run_id: string;
  provider: string;
  model: string;
  fallback_used: boolean;
  recommendation_basis: string;
  top_pick_id: string;
  shortlist_size: number;
  human_review_required: boolean;
  production_review_recommended: boolean;
  candidates: PromoRecommendationCandidate[];
}

export interface EpisodeParseSummary {
  source_name: string;
  status: "valid" | "failed";
  episode_id: string | null;
  episode_number: number | null;
  event_count: number;
  scoring_event_count: number;
  last_timestamp_ms: number | null;
  unresolved_aliases: string[];
  alias_analysis_available: boolean;
  warning_count: number;
  warnings: string[];
  error: string | null;
  error_line: number | null;
}

export interface BatchParseValidationResponse {
  file_count: number;
  valid_count: number;
  failed_count: number;
  total_event_count: number;
  total_scoring_event_count: number;
  alias_analysis_available: boolean;
  episodes: EpisodeParseSummary[];
}

export interface Settings {
  model: string;
  apiBaseUrl: string;
  hook: number;
  cliffhanger: number;
  coherence: number;
  minDuration: number;
  maxDuration: number;
  workspaceName: string;
  defaultProject: string;
}

export interface ToastNotification {
  id: string;
  message: string;
  type?: "info" | "success" | "warning";
  undoAction?: () => void;
}

export interface EvaluationReadyItem {
  job_id: string;
  project_id: string;
  project_name: string;
  episode_id: string;
  generator_version: string;
  candidate_count: number;
}

export interface EvaluationSessionSummary {
  id: string;
  job_id: string;
  episode_id: string;
  session_key: string;
  status: string;
  candidate_count: number;
  assignment_count: number;
  completed_assignment_count: number;
  min_reviews_per_candidate: number;
  created_at: string;
  completed_at: string | null;
}

export interface ReviewEvidenceItem {
  event_id: string;
  start_ms: number;
  end_ms: number;
  event_type: string;
  character: string | null;
  text: string;
}

export interface ReviewAssignment {
  id: string;
  session_id: string;
  reviewer_id: string;
  blind_label: string;
  assignment_order: number;
  status: string;
  episode_id: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  evidence: ReviewEvidenceItem[];
  completed_at: string | null;
}

export interface RubricScores {
  hook: number;
  curiosity: number;
  clarity: number;
  emotion: number;
  coherence: number;
  spoiler_safety: number;
  editability: number;
  brand_fit: number;
}

export type ReviewDecision = "approve" | "approve_with_changes" | "reject";

export interface EvaluationSystemMetrics {
  candidate_count: number;
  automatically_valid_count: number;
  automatic_validity_rate: number;
  fully_reviewed_count: number;
  review_coverage: number;
  precision_at_k: number | null;
  precision_at_k_complete: boolean;
  acceptance_rate: number | null;
  mean_editor_score: number | null;
  boundary_usable_rate: number | null;
  spoiler_violation_rate: number | null;
  duplicate_candidate_rate: number;
  duplicate_pair_count: number;
  inter_reviewer_agreement: number | null;
}

export interface EvaluationCandidateResult {
  candidate_id: string;
  system_id: string;
  rank: number;
  duration_ms: number;
  automatically_valid: boolean;
  issues: string[];
  duplicate_of: string[];
  review_count: number;
  mean_editor_score: number | null;
  consensus_decision: string | null;
  editor_accepted: boolean | null;
  boundary_usable: boolean | null;
  spoiler_safe: boolean | null;
  usable: boolean | null;
}

export interface EvaluationSessionReport {
  session: EvaluationSessionSummary;
  report: {
    systems: Array<{ system_id: string; metrics: EvaluationSystemMetrics }>;
    candidates: EvaluationCandidateResult[];
    dataset: {
      candidate_count: number;
      review_count: number;
      reviewer_count: number;
      system_count: number;
    };
  };
}

export interface DemoScoreCandidateInput {
  candidate_id: string;
  episode: string;
  start_clock: string;
  end_clock: string;
  duration_seconds: number;
  hook_line: string;
  cliffhanger_line: string;
  transcript_lines: Array<{
    speaker: string | null;
    text: string;
    start_clock: string;
    end_clock: string;
  }>;
}

export interface DemoScorePromptRequest {
  show_title: string;
  language: string;
  target_audience: string | null;
  candidates: DemoScoreCandidateInput[];
}

export interface DemoScorePromptResponse {
  prompt: string;
  response_schema: Record<string, unknown>;
  prompt_sha256: string;
}

export interface DemoModelScore {
  candidate_id: string;
  hook: number;
  cliffhanger: number;
  standalone: number;
  why_it_works: string;
}

export interface DemoScoreResponse {
  provider: string;
  model: string;
  model_calls: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  retries: number;
  estimated_cost: number | null;
  prompt_sha256: string;
  raw_response: string;
  scores: DemoModelScore[];
}

export interface DemoScoreRunRequest extends DemoScorePromptRequest {
  model: {
    provider: "gemini" | "openai" | "no-api";
    model: string;
    base_url: string;
    api_key?: string;
    temperature: number;
    max_tokens: number;
  };
  manual_payload?: string;
}

export interface BackendHealthResponse {
  status: "ok";
  service: string;
  version: string;
  environment: string;
  model_provider: string;
  model: string;
  provider_ready: boolean;
  configuration_warnings: string[];
}
