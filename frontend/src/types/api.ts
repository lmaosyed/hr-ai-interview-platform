export type CandidateStatus =
  | "pending"
  | "completed"
  | "reviewed"
  | "shortlisted"
  | "rejected";

export type HireSignal = "strong" | "likely" | "weak" | "not_recommended";
export type RiskLevel = "low" | "medium" | "high";
export type ProcessingStatus = "pending" | "processing" | "done" | "failed";
export type InterviewTimeMode = "fixed" | "free";
export type QuestionResponseType = "spoken" | "text" | "code";

export interface JobQuestion {
  text: string;
  response_type: QuestionResponseType;
  helper_text?: string | null;
  evaluation_focus?: string | null;
  ideal_answer_traits?: string[];
  red_flag_points?: string[];
  starter_code?: string | null;
  time_limit_seconds: number | null;
  difficulty: "easy" | "medium" | "hard";
  weight: number;
}

export interface JobListItem {
  id: number;
  hr_user_id: number;
  title: string;
  category: string;
  description: string;
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
  created_at: string;
  candidate_count: number;
}

export interface JobTemplate extends JobCreatePayload {
  id: number;
  created_at: string;
}

export interface InterviewContext {
  candidate_id: number;
  candidate_name: string;
  candidate_username: string;
  hr_name: string;
  job_id: number;
  job_title: string;
  job_category: string;
  job_description: string;
  questions: JobQuestion[];
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
  invite_expires_at?: string | null;
}

export interface SessionUploadResponse {
  session_id: number;
  processing_status: ProcessingStatus;
}

export interface SessionScoreSummary {
  overall_score: number | null;
  answer_quality_score: number | null;
  confidence_score: number | null;
  integrity_score: number | null;
  communication_score: number | null;
  hire_signal: HireSignal | null;
  ai_summary: string | null;
  risk_level: RiskLevel | null;
  explainability?: {
    content_reasons?: string[];
    confidence_reasons?: string[];
    integrity_reasons?: string[];
    score_model_note?: string;
  } | null;
  score_breakdown?: Record<string, number> | null;
  timeline_events?: TimelineEvent[] | null;
}

export interface CandidateListItem {
  id: number;
  hr_user_id: number;
  job_id: number;
  name: string;
  email: string;
  username: string;
  status: CandidateStatus;
  applied_at: string;
  current_role?: string | null;
  years_experience?: number | null;
  job_category?: string | null;
  latest_session_id?: number | null;
  latest_session_duration_seconds?: number | null;
  top_integrity_flags: string[];
  session_score?: SessionScoreSummary | null;
}

export interface IntegrityEvent {
  id: number;
  event_type: string;
  timestamp_seconds: number;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface QuestionResponse {
  id: number;
  question_index: number;
  question_text: string;
  response_type?: string | null;
  helper_text?: string | null;
  transcript: string;
  answer_quality_score: number;
  relevance_score: number;
  depth_score: number;
  confidence_score: number;
  communication_score?: number | null;
  duration_seconds: number;
  difficulty_weight: number;
  ai_summary?: string | null;
  transcript_start_seconds?: number | null;
  transcript_end_seconds?: number | null;
  score_rationale?: Record<string, string> | null;
  highlight_moments?: {
    timestamp_seconds: number;
    label: string;
    evidence: string;
    description?: string;
  }[] | null;
  transcript_timestamps?: {
    timestamp_seconds: number;
    label: string;
    text: string;
  }[] | null;
}

export interface TypedResponse {
  question_index: number;
  question_text: string;
  response_type: QuestionResponseType;
  answer_text: string;
  helper_text?: string | null;
  starter_code?: string | null;
}

export interface HrNote {
  id: number;
  hr_user: string;
  note: string;
  created_at: string;
}

export interface TimelineEvent {
  timestamp: number;
  type: string;
  description: string;
}

export interface CandidateDetail {
  processing_error?: string | null;
  id: number;
  hr_user_id: number;
  job_id: number;
  name: string;
  email: string;
  username: string;
  status: CandidateStatus;
  resume_url?: string | null;
  deadline_extension_requested_at?: string | null;
  deadline_extension_reason?: string | null;
  applied_at: string;
  current_role?: string | null;
  years_experience?: number | null;
  job_title: string;
  job_category: string;
  time_mode?: InterviewTimeMode | null;
  time_limit_per_question?: number | null;
  session_id?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  raw_video_path?: string | null;
  raw_screen_path?: string | null;
  processing_status?: string | null;
  session_score?: SessionScoreSummary | null;
  integrity_events: IntegrityEvent[];
  question_responses: QuestionResponse[];
  typed_responses: TypedResponse[];
  hr_notes: HrNote[];
}

export interface AnalyticsMetric {
  label: string;
  value: number;
}

export interface HistogramBucket {
  range_label: string;
  count: number;
}

export interface IntegrityFrequency {
  event_type: string;
  count: number;
}

export interface HireSignalBreakdown {
  signal: HireSignal;
  count: number;
}

export interface JobAnalytics {
  average_scores: AnalyticsMetric[];
  score_distribution: HistogramBucket[];
  integrity_flag_frequency: IntegrityFrequency[];
  hire_signal_breakdown: HireSignalBreakdown[];
}

export interface GazeSnapshot {
  timestamp_seconds: number;
  gaze_x: number;
  gaze_y: number;
  direction: "left" | "right" | "up" | "down" | "center";
  is_on_screen: boolean;
  confidence: number;
}

export interface InterviewIntegrityEvent {
  event_type: string;
  timestamp_seconds: number;
  duration_seconds?: number;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface HrSession {
  access_token: string;
  hr_user_id: number;
  name: string;
  email: string;
  username: string;
}

export interface AdminSession {
  access_token: string;
  admin_user_id: number;
  name: string;
  email: string;
  username: string;
}

export interface SystemStatus {
  checked_at: string;
  database_ready: boolean;
  queue_ready: boolean;
  worker_ready: boolean;
  ai_state: "ready" | "blocked" | "unchecked";
  ai_message: string;
  ai_model: string;
  email_mode: "local" | "external" | "unconfigured";
  email_message: string;
  local_inbox_url: string | null;
}

export interface CandidateApplicationSummary {
  candidate_id: number;
  hr_user_id: number;
  job_id: number;
  job_title: string;
  job_category: string;
  job_description: string;
  interview_token: string;
  status: CandidateStatus;
  applied_at: string;
  hr_name: string;
  invite_expires_at?: string | null;
  invite_expired?: boolean;
  deadline_extension_requested_at?: string | null;
  deadline_extension_reason?: string | null;
}

export interface CandidateSession {
  access_token: string;
  name: string;
  username: string;
  email: string;
  login_password?: string;
  current_role?: string | null;
  years_experience?: number | null;
  resume_url?: string | null;
  profile_completed: boolean;
  applications: CandidateApplicationSummary[];
}

export interface JobCreatePayload {
  hr_user_id: number;
  title: string;
  category: string;
  description: string;
  questions: JobQuestion[];
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
}

export interface CandidateInvitePayload {
  hr_user_id: number;
  job_id: number;
  name?: string | null;
  email: string;
  username?: string | null;
  password?: string | null;
  invite_expiry_hours?: number | null;
}

export interface BulkCandidateInviteItem {
  email: string;
  name?: string | null;
}

export interface BulkCandidateInvitePayload {
  hr_user_id: number;
  job_id: number;
  candidates: BulkCandidateInviteItem[];
  invite_expiry_hours?: number | null;
}

export interface CandidateInviteResponse {
  candidate_id: number;
  hr_user_id: number;
  job_id: number;
  candidate_name: string;
  candidate_email: string;
  username: string;
  password: string;
  interview_token: string;
  job_title: string;
  job_category: string;
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
  login_identifier: string;
  invite_url: string;
  invite_expires_at?: string | null;
  email_sent: boolean;
  email_error?: string | null;
  mailbox_preview_url?: string | null;
}

export interface CandidateDeadlineExtensionRequestPayload {
  identifier: string;
  password: string;
  candidate_id: number;
  reason: string;
}

export interface CandidateDeadlineExtensionResponse {
  candidate_id: number;
  deadline_extension_requested_at: string;
  deadline_extension_reason: string;
}

export interface CandidateDeadlineExtensionUpdatePayload {
  invite_expiry_hours?: number | null;
}

export interface CandidateDeadlineExtensionUpdateResponse {
  candidate_id: number;
  invite_expires_at?: string | null;
}

export interface JobQuestionQualityCheckPayload {
  question_text: string;
  response_type: QuestionResponseType;
  helper_text?: string | null;
  evaluation_focus?: string | null;
  ideal_answer_traits?: string[];
  red_flag_points?: string[];
}

export interface JobQuestionQualityCheckResult {
  overall_score: number;
  rating: string;
  strengths: string[];
  concerns: string[];
  suggested_rewrite?: string | null;
}

export interface PracticeLabConfig {
  title: string;
  category: string;
  description: string;
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
  questions: JobQuestion[];
}

export interface EvaluationLabResult {
  audio_metrics?: Record<string, number | string>;
  practice_id: string;
  title: string;
  category: string;
  description: string;
  time_mode: InterviewTimeMode;
  time_limit_per_question: number | null;
  transcript: string;
  summary: string;
  relevance_score: number;
  depth_score: number;
  communication_score: number;
  answer_quality_score: number;
  confidence_score: number;
  duration_seconds: number;
  demo_mode: boolean;
  transcription_provider: string;
  question_responses: QuestionResponse[];
  typed_responses: TypedResponse[];
  integrity_events: IntegrityEvent[];
  session_score: SessionScoreSummary;
  gaze_summary: Record<string, number>;
  questions: JobQuestion[];
}

export interface HrUserCreatePayload {
  name: string;
  email: string;
  username: string;
  password: string;
}

export interface HrUserStatusPayload {
  is_active: boolean;
}

export interface AdminCandidateSummary {
  id: number;
  name: string;
  username: string;
  email: string;
  status: CandidateStatus;
  job_title: string;
  job_category: string;
  applied_at: string;
}

export interface AdminHrUser {
  id: number;
  name: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
  job_count: number;
  candidate_count: number;
  candidates: AdminCandidateSummary[];
}

export interface AdminMetrics {
  total_hrs: number;
  active_hrs: number;
  suspended_hrs: number;
  total_candidates: number;
  total_templates: number;
  pending_decisions: number;
}

export interface AdminDashboard {
  metrics: AdminMetrics;
  hr_users: AdminHrUser[];
}
