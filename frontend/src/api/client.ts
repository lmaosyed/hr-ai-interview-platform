import type {
  AdminDashboard,
  AdminSession,
  BulkCandidateInvitePayload,
  CandidateDetail,
  CandidateDeadlineExtensionRequestPayload,
  CandidateDeadlineExtensionResponse,
  CandidateDeadlineExtensionUpdatePayload,
  CandidateDeadlineExtensionUpdateResponse,
  CandidateInvitePayload,
  CandidateInviteResponse,
  CandidateSession,
  CandidateListItem,
  CandidateStatus,
  EvaluationLabResult,
  HrNote,
  HrSession,
  HrUserCreatePayload,
  HrUserStatusPayload,
  InterviewContext,
  JobCreatePayload,
  JobAnalytics,
  JobListItem,
  JobQuestionQualityCheckPayload,
  JobQuestionQualityCheckResult,
  JobTemplate,
  SessionUploadResponse,
} from "../types/api";
import type { SystemStatus } from "../types/api";
import { getHrSession, getAdminSession, getCandidateSession, clearHrSession, clearAdminSession, clearCandidateSession } from "../utils/session";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = path.startsWith("/hr/") ? getHrSession()
    : path.startsWith("/admin/") ? getAdminSession() : getCandidateSession();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      if (path.startsWith("/hr/")) { clearHrSession(); window.location.replace("/hr/login"); }
      else if (path.startsWith("/admin/")) { clearAdminSession(); window.location.replace("/admin/login"); }
      else if (!path.startsWith("/lab/")) { clearCandidateSession(); window.location.replace("/candidate-login"); }
    }
    const rawMessage = await response.text();
    let message = rawMessage;
    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed?.detail === "string") {
        message = parsed.detail;
      } else if (Array.isArray(parsed?.detail)) {
        message = parsed.detail.map((item: { loc?: string[]; msg?: string }) =>
          `${item.loc?.slice(1).join(" / ") || "Input"}: ${item.msg || "Invalid value"}`).join(". ");
      }
    } catch {
      message = rawMessage;
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getAssetUrl(path: string | null | undefined) {
  if (!path) {
    return "";
  }
  if (path.startsWith("http")) return path;
  const session = window.location.pathname.startsWith("/hr") ? getHrSession()
    : window.location.pathname.startsWith("/admin") ? getAdminSession() : getCandidateSession();
  const url = new URL(`${API_ORIGIN}/${path.replace(/^\//, "")}`);
  if (session?.access_token) url.searchParams.set("access_token", session.access_token);
  return url.toString();
}

export function fetchHrJobs(hrUserId: number): Promise<JobListItem[]> {
  return apiFetch<JobListItem[]>(`/hr/jobs?hr_user_id=${hrUserId}`);
}

export function fetchHrJob(jobId: number): Promise<JobTemplate> {
  return apiFetch<JobTemplate>(`/hr/jobs/${jobId}`);
}

export function hrLogin(username: string, password: string): Promise<HrSession> {
  return apiFetch<HrSession>("/auth/hr/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function adminLogin(username: string, password: string): Promise<AdminSession> {
  return apiFetch<AdminSession>("/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function candidateLogin(username: string, password: string): Promise<CandidateSession> {
  return apiFetch<CandidateSession>("/auth/candidate/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function updateCandidateProfile(formData: FormData): Promise<CandidateSession> {
  return apiFetch<CandidateSession>("/auth/candidate/profile", {
    method: "POST",
    body: formData,
  });
}

export function requestCandidateDeadlineExtension(
  payload: CandidateDeadlineExtensionRequestPayload,
): Promise<CandidateDeadlineExtensionResponse> {
  return apiFetch<CandidateDeadlineExtensionResponse>("/auth/candidate/extensions/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchInterviewContext(token: string, username?: string): Promise<InterviewContext> {
  const suffix = username ? `?username=${encodeURIComponent(username)}` : "";
  return apiFetch<InterviewContext>(`/interview/${token}${suffix}`);
}

export function uploadInterviewSession(formData: FormData): Promise<SessionUploadResponse> {
  return apiFetch<SessionUploadResponse>("/sessions/upload", {
    method: "POST",
    body: formData,
  });
}

export function fetchSessionStatus(sessionId: number): Promise<SessionUploadResponse> {
  return apiFetch<SessionUploadResponse>(`/sessions/${sessionId}/status`);
}

export function fetchJobCandidates(
  jobId: number,
  options?: { search?: string; statusFilter?: string },
): Promise<CandidateListItem[]> {
  const params = new URLSearchParams();
  if (options?.search) {
    params.set("search", options.search);
  }
  if (options?.statusFilter) {
    params.set("status_filter", options.statusFilter);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<CandidateListItem[]>(`/hr/jobs/${jobId}/candidates${query}`);
}

export function searchCandidates(
  hrUserId: number,
  query: string,
  options?: { statusFilter?: string; jobId?: number | "all" },
): Promise<CandidateListItem[]> {
  const params = new URLSearchParams({
    hr_user_id: String(hrUserId),
    q: query,
  });
  if (options?.statusFilter && options.statusFilter !== "all") {
    params.set("status_filter", options.statusFilter);
  }
  if (options?.jobId && options.jobId !== "all") {
    params.set("job_id", String(options.jobId));
  }
  return apiFetch<CandidateListItem[]>(`/hr/candidates/search?${params.toString()}`);
}

export function fetchCandidateDetail(candidateId: number): Promise<CandidateDetail> {
  return apiFetch<CandidateDetail>(`/hr/candidates/${candidateId}`);
}

export function retryCandidateProcessing(candidateId: number) {
  return apiFetch(`/hr/candidates/${candidateId}/retry-processing`, { method: "POST" });
}

export function createJob(payload: JobCreatePayload): Promise<JobTemplate> {
  return apiFetch<JobTemplate>("/hr/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateJob(jobId: number, payload: JobCreatePayload): Promise<JobTemplate> {
  return apiFetch<JobTemplate>(`/hr/jobs/${jobId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteJob(jobId: number) {
  return apiFetch<{ job_id: number; deleted: boolean }>(`/hr/jobs/${jobId}`, {
    method: "DELETE",
  });
}

export function duplicateJob(jobId: number): Promise<JobTemplate> {
  return apiFetch<JobTemplate>(`/hr/jobs/${jobId}/duplicate`, {
    method: "POST",
  });
}

export function createCandidateInvite(payload: CandidateInvitePayload): Promise<CandidateInviteResponse> {
  return apiFetch<CandidateInviteResponse>("/hr/candidates/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createBulkCandidateInvites(
  payload: BulkCandidateInvitePayload,
): Promise<CandidateInviteResponse[]> {
  return apiFetch<CandidateInviteResponse[]>("/hr/candidates/invite/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function evaluatePracticeInterview(formData: FormData): Promise<EvaluationLabResult> {
  return apiFetch<EvaluationLabResult>("/lab/evaluate", {
    method: "POST",
    body: formData,
  });
}

export function updateCandidateStatus(candidateId: number, status: CandidateStatus) {
  return apiFetch<{ candidate_id: number; status: CandidateStatus }>(
    `/hr/candidates/${candidateId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export function extendCandidateDeadline(
  candidateId: number,
  payload: CandidateDeadlineExtensionUpdatePayload,
) {
  return apiFetch<CandidateDeadlineExtensionUpdateResponse>(
    `/hr/candidates/${candidateId}/extend-deadline`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function addHrNote(candidateId: number, hrUser: string, note: string) {
  return apiFetch<{ note: HrNote }>(`/hr/candidates/${candidateId}/notes`, {
    method: "POST",
    body: JSON.stringify({ hr_user: hrUser, note }),
  });
}

export function fetchJobAnalytics(jobId: number): Promise<JobAnalytics> {
  return apiFetch<JobAnalytics>(`/hr/jobs/${jobId}/analytics`);
}

export function checkJobQuestionQuality(
  payload: JobQuestionQualityCheckPayload,
): Promise<JobQuestionQualityCheckResult> {
  return apiFetch<JobQuestionQualityCheckResult>("/hr/questions/check-quality", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiFetch<AdminDashboard>("/admin/dashboard");
}

export function fetchSystemStatus(verifyAi = false): Promise<SystemStatus> {
  return apiFetch<SystemStatus>(`/admin/system-status?verify_ai=${verifyAi}`);
}

export function createHrUser(payload: HrUserCreatePayload) {
  return apiFetch("/admin/hr-users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHrUserStatus(hrUserId: number, payload: HrUserStatusPayload) {
  return apiFetch(`/admin/hr-users/${hrUserId}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteHrUser(hrUserId: number) {
  return apiFetch<{ hr_user_id: number; deleted: boolean }>(`/admin/hr-users/${hrUserId}`, {
    method: "DELETE",
  });
}
