import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import CandidateApplicationForm from "@/components/CandidateApplicationForm";
import { getRoleRequestById, getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResumeScreeningPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");

  const roles = await getRoleRequests();
  // Demo mode adds synthetic historical roles to the catalogue for reporting,
  // but manual CV intake must only target roles backed by a live sheet row.
  // Resolve each published option against the live lookup before rendering it
  // so a visible demo role cannot produce a submission-time rejection.
  const livePublishedRoles = await Promise.all(
    roles
      .filter((role) => role.status === "Job Posted" && role.recruitmentSetupStatus === "Published")
      .map(async (role) => ({ role, liveRole: await getRoleRequestById(role.roleId) })),
  );
  const roleOptions = livePublishedRoles
    .filter(({ liveRole }) => liveRole?.status === "Job Posted" && liveRole.recruitmentSetupStatus === "Published")
    .map(({ role }) => role)
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
