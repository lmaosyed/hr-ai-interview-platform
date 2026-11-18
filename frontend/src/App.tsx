import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AdminCandidateDirectoryPage } from "./pages/AdminCandidateDirectoryPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminHrDirectoryPage } from "./pages/AdminHrDirectoryPage";
import { CandidateHomePage } from "./pages/CandidateHomePage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { CandidateLoginPage } from "./pages/CandidateLoginPage";
import { CandidateProfilePage } from "./pages/CandidateProfilePage";
import { EvaluationLabPage } from "./pages/EvaluationLabPage";
import { HrAnalyticsPage } from "./pages/HrAnalyticsPage";
import { HrCandidatesPage } from "./pages/HrCandidatesPage";
import { HrHomePage } from "./pages/HrHomePage";
import { HrInvitesPage } from "./pages/HrInvitesPage";
import { HrJobPage } from "./pages/HrJobPage";
import { HrLoginPage } from "./pages/HrLoginPage";
import { HrPipelinePage } from "./pages/HrPipelinePage";
import { HrPortalPage } from "./pages/HrPortalPage";
import { HrTemplatesPage } from "./pages/HrTemplatesPage";
import { InterviewPage } from "./pages/InterviewPage";
import { LandingPage } from "./pages/LandingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/candidate-login" element={<CandidateLoginPage />} />
      <Route path="/candidate/home" element={<CandidateHomePage />} />
      <Route path="/candidate/profile" element={<CandidateProfilePage />} />
      <Route path="/evaluation-lab" element={<EvaluationLabPage />} />
      <Route path="/hr/login" element={<HrLoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/hrs" element={<AdminHrDirectoryPage />} />
      <Route path="/admin/candidates" element={<AdminCandidateDirectoryPage />} />
      <Route path="/interview/:token" element={<InterviewPage />} />
      <Route element={<AppShell />}>
        <Route path="/hr/portal" element={<HrPortalPage />} />
        <Route path="/hr/home" element={<Navigate to="/hr/pipeline" replace />} />
        <Route path="/hr/pipeline" element={<HrPipelinePage />} />
        <Route path="/hr/dashboards" element={<HrHomePage />} />
        <Route path="/hr/templates" element={<Navigate to="/hr/jobs" replace />} />
        <Route path="/hr/jobs" element={<HrTemplatesPage />} />
        <Route path="/hr/invites" element={<HrInvitesPage />} />
        <Route path="/hr/candidates" element={<HrCandidatesPage />} />
        <Route path="/hr/analytics" element={<Navigate to="/hr/reports" replace />} />
        <Route path="/hr/reports" element={<HrAnalyticsPage />} />
        <Route path="/hr/jobs/:jobId" element={<HrJobPage />} />
        <Route path="/hr/jobs/:jobId/analytics" element={<HrAnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
