import type { AdminSession, CandidateSession, HrSession } from "../types/api";

const HR_SESSION_KEY = "hr-session";
const ADMIN_SESSION_KEY = "admin-session";
const CANDIDATE_SESSION_KEY = "candidate-session";
// Candidate credentials live only for this page load. Refresh requires sign-in.
window.localStorage.removeItem(CANDIDATE_SESSION_KEY);
let candidateSession: CandidateSession | null = null;

function readJson<T>(key: string): T | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function didPageReload() {
  // Clearing happens once at module initialization, never again after login.
  return false;
}

export function getHrSession() {
  const session = readJson<HrSession>(HR_SESSION_KEY);
  return session?.access_token ? session : null;
}

export function setHrSession(session: HrSession) {
  window.localStorage.setItem(HR_SESSION_KEY, JSON.stringify(session));
}

export function clearHrSession() {
  window.localStorage.removeItem(HR_SESSION_KEY);
}

export function getAdminSession() {
  const session = readJson<AdminSession>(ADMIN_SESSION_KEY);
  return session?.access_token ? session : null;
}

export function setAdminSession(session: AdminSession) {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function getCandidateSession() {
  return candidateSession;
}

export function setCandidateSession(session: CandidateSession) {
  candidateSession = session;
}

export function clearCandidateSession() {
  window.localStorage.removeItem(CANDIDATE_SESSION_KEY);
  candidateSession = null;
}
