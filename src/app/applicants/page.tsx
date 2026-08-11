import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import CandidateApplicationForm from "@/components/CandidateApplicationForm";
import ApplicantsList from "@/components/ApplicantsList";
import { getApplicants } from "@/lib/candidate-applications";
import { getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApplicantsPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");

  const [applicants, roles] = await Promise.all([getApplicants(), getRoleRequests()]);
  const roleOptions = roles
    .filter((role) => ["Approved", "Recruitment Setup", "Job Posted"].includes(role.status))
    .map((role) => ({
      roleId: role.roleId,
      label: `${role.jobTitle || role.roleId} (${role.roleId})`,
      status: role.status,
    }));

  return (
    <AppShell user={user}>
      <ApplicantsList
        applicants={applicants}
        description="Review candidate workflows and add manual intake records when HR needs to capture an application directly."
        topContent={(
          <CandidateApplicationForm
            submitUrl="/api/applicants"
            title="Add candidate"
            description="Create a manual HR candidate record against an approved or active role."
            submitLabel="Add Candidate"
            requireConsent={false}
            defaultApplicationSource="HR Invitation"
            applicationSourceOptions={["Referral", "Walk-in", "Agency", "Existing Database", "HR Invitation"]}
            showRoleSelect
            roleOptions={roleOptions}
          />
        )}
      />
    </AppShell>
  );
}
