import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import CandidateApplicationForm from "@/components/CandidateApplicationForm";
import { getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResumeScreeningPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");

  const roles = await getRoleRequests();
  const roleOptions = roles
    .filter((role) => role.status === "Job Posted" && role.recruitmentSetupStatus === "Published")
    .map((role) => ({ roleId: role.roleId, label: `${role.jobTitle || role.roleId} (${role.roleId})` }));

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
        <CandidateApplicationForm
          submitUrl="/api/applicants"
          title="Start a resume screening"
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
