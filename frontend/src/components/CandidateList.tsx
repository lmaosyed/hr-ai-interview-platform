import type { CandidateListItem } from "../types/api";

type Props = {
  candidates: CandidateListItem[];
  selectedCandidateId: number | null;
  onSelect: (candidateId: number) => void;
};

export function CandidateList({ candidates, selectedCandidateId, onSelect }: Props) {
  if (!candidates.length) {
    return <div className="empty-panel">No candidates match the current filters yet.</div>;
  }

  return (
    <div className="candidate-list">
      {candidates.map((candidate) => {
        const score = candidate.session_score?.overall_score;
        const scoreTone = score == null ? "" : score >= 80 ? "good" : score >= 60 ? "medium" : "bad";
        const summarySnippet = candidate.session_score?.ai_summary
          ? `${candidate.session_score.ai_summary.slice(0, 120)}${candidate.session_score.ai_summary.length > 120 ? "..." : ""}`
          : null;
        return (
          <button
            className={`candidate-row ${selectedCandidateId === candidate.id ? "active" : ""}`}
            key={candidate.id}
            onClick={() => onSelect(candidate.id)}
          >
            <div className="candidate-row-head">
              <strong>{candidate.name}</strong>
              <span className={`score-pill ${scoreTone}`}>{score == null ? "Unscored" : Math.round(score)}</span>
            </div>
            <p>
              {candidate.email} · {candidate.status}
            </p>
            <p>
              {(candidate.current_role ?? "Candidate")} {candidate.years_experience ? `· ${candidate.years_experience} yrs` : ""}{" "}
              {candidate.job_category ? `· ${candidate.job_category}` : ""}
            </p>
            <div className="tag-row">
              {candidate.top_integrity_flags.map((flag) => (
                <span className="mini-tag" key={flag}>
                  {flag}
                </span>
              ))}
            </div>
            {summarySnippet ? <p className="muted-copy">{summarySnippet}</p> : null}
          </button>
        );
      })}
    </div>
  );
}
