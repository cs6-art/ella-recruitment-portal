import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
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
  const publishedRoles = roles
    .filter((role) => role.status === "Job Posted" && role.recruitmentSetupStatus === "Published")
    .map((role) => ({
      roleId: role.roleId,
      label: role.jobTitle || role.roleId,
    }));
  return (
    <AppShell user={user}>
      <ApplicantsList
        applicants={applicants}
        publishedRoles={publishedRoles}
        description="Review every applicant as they move through the recruitment workflow."
      />
    </AppShell>
  );
}
