import { Navigate, useParams, useSearchParams } from "react-router-dom";

// Job boards and global search share one review workspace and selection state.
export function HrJobPage() {
  const { jobId } = useParams();
  const [search] = useSearchParams();
  const query = new URLSearchParams({ jobId: jobId ?? "" });
  const candidateId = search.get("candidateId");
  if (candidateId) query.set("candidateId", candidateId);
  return <Navigate to={`/hr/candidates?${query}`} replace />;
}
