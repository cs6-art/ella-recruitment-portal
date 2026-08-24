import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import CandidateApplicationForm from "@/components/CandidateApplicationForm";
import ResumeScreeningInviteGenerator from "@/components/ResumeScreeningInviteGenerator";
import { canManagePipeline } from "@/lib/access-control";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResumeScreeningPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (!canManagePipeline(user)) redirect("/dashboard");

  // Intake must use the live role sheet even in demo mode so every currently
  // published role is available, not just the synthetic catalogue roles.
  const roles = await getRoleRequests({ liveOnly: true });
  const roleOptions = roles
    .filter(isPublishedRoleForIntake)
    .map((role) => ({ roleId: role.roleId, label: `${role.jobTitle || role.roleId} (${role.roleId})` }))
    // Keep every resume-screening role selector predictable as the published
    // role catalogue grows; IDs remain the option values.
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  const driveUrl = process.env.GOOGLE_BULK_RESUME_DRIVE_URL?.trim() || "";

  return (
    <AppShell user={user}>
      <main className="container page resume-screening-page">
        <header className="hero-row resume-screening-header">
          <div>
            <span className="eyebrow-dark">CANDIDATE INTAKE</span>
            <h1>Resume Screening</h1>
            <p>Start an automated CV analysis for a candidate applying to a published role.</p>
          </div>
        </header>
        <section className="card resume-drive-option" aria-labelledby="resume-drive-title">
          <div>
            <span className="eyebrow-dark">ALTERNATIVE INTAKE</span>
            <h2 id="resume-drive-title">Upload from Google Drive</h2>
            <p>Open the shared resume folder to add candidate files for the connected screening workflow.</p>
          </div>
          {driveUrl ? (
            <a className="btn btn-secondary" href={driveUrl} target="_blank" rel="noreferrer">Upload from Google Drive</a>
          ) : (
            <span className="resume-drive-unavailable">Google Drive upload is not configured.</span>
          )}
        </section>
        <ResumeScreeningInviteGenerator roleOptions={roleOptions} />
        <CandidateApplicationForm
          submitUrl="/api/applicants"
          title="CV Analysis"
          description="Upload the candidate resume to begin the automated screening process."
          submitLabel="Submit My Application"
          requireConsent={false}
          showRoleSelect
          roleOptions={roleOptions}
        />
      </main>
    </AppShell>
  );
}
