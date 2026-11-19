import type { CandidateListItem, JobListItem } from "../types/api";

export type PipelineStageKey =
  | "leads"
  | "application_review"
  | "active"
  | "pending_offer"
  | "hired"
  | "archived";

export type PipelineStageDefinition = {
  key: PipelineStageKey;
  label: string;
  description: string;
};

export const PIPELINE_STAGES: PipelineStageDefinition[] = [
  {
    key: "leads",
    label: "Leads",
    description: "Everyone who has applied for a role.",
  },
  {
    key: "application_review",
    label: "Application Review",
    description: "Candidates who still need to take the platform interview.",
  },
  {
    key: "active",
    label: "Active",
    description: "Candidates who completed the test and are ready for next-round review.",
  },
  {
    key: "pending_offer",
    label: "Pending Offer",
    description: "Shortlisted candidates selected for the next round.",
  },
  {
    key: "hired",
    label: "Hired",
    description: "Candidates who have been closed out as hired.",
  },
  {
    key: "archived",
    label: "Archived",
    description: "Candidates who were rejected or closed out.",
  },
];

export function candidateMatchesPipelineStage(
  candidate: CandidateListItem,
  stage: PipelineStageKey | "all",
) {
  if (stage === "all") {
    return true;
  }

  switch (stage) {
    case "leads":
      return true;
    case "application_review":
      return candidate.status === "pending" && !candidate.latest_session_id;
    case "active":
      return ["completed", "reviewed"].includes(candidate.status);
    case "pending_offer":
      return candidate.status === "shortlisted";
    case "hired":
      return false;
    case "archived":
      return candidate.status === "rejected";
    default:
      return false;
  }
}

export function getPipelineStageCount(
  candidates: CandidateListItem[],
  stage: PipelineStageKey,
) {
  return candidates.filter((candidate) => candidateMatchesPipelineStage(candidate, stage)).length;
}

export function getPipelineStageCounts(candidates: CandidateListItem[]) {
  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage.key, getPipelineStageCount(candidates, stage.key)]),
  ) as Record<PipelineStageKey, number>;
}

export function getJobMatchesSearch(job: JobListItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [job.title, job.category, job.description].join(" ").toLowerCase().includes(normalized);
}

export function getCandidateSortScore(candidate: CandidateListItem) {
  return candidate.session_score?.overall_score ?? -1;
}
