import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import AppShell from "@/components/AppShell";
import RoleRequestForm, { type RoleRequestFormValues } from "@/components/RoleRequestForm";
import { canEditRoleRequest, canViewRole } from "@/lib/access-control";
import { parseHodAvailabilitySlots } from "@/lib/hod-availability";
import { getRoleRequestById } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type EditRolePageProps = {
  params: Promise<{ roleId: string }>;
};

function screeningQuestions(value: string) {
  if (!value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  } catch {
    // Legacy rows store the questions as one question per line.
  }
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export default async function EditRolePage({ params }: EditRolePageProps) {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!user) redirect("/");

  const { roleId: encodedRoleId } = await params;
  const roleId = decodeURIComponent(encodedRoleId);
  const role = await getRoleRequestById(roleId);
  if (!role || !canViewRole(user, role) || !canEditRoleRequest(user, role)) redirect(`/roles/${encodeURIComponent(roleId)}`);

  const initialValues: Partial<RoleRequestFormValues> = {
    requestType: role.requestType || "Staff Addition",
    department: role.department,
    jobTitle: role.jobTitle,
    numberOfVacancies: role.numberOfVacancies || 1,
    reasonForRequest: role.reasonForRequest,
    jobDescription: role.jobDescription,
    replacementEmployee: role.replacementEmployee,
    targetHiringDate: role.targetHiringDate,
    hodEmail: role.hodEmail,
    hodAvailabilitySlots: parseHodAvailabilitySlots(role.hodAvailabilitySlots),
    customScreeningQuestion1: role.customScreeningQuestion1,
    customScreeningQuestion2: role.customScreeningQuestion2,
    aiGeneratedScreeningQuestions: screeningQuestions(role.aiGeneratedScreeningQuestions),
  };

  return (
    <AppShell user={user}>
      <main className="container page">
        <div className="hero-row">
          <div>
            <a className="btn btn-secondary roles-back-button" href={`/roles/${encodeURIComponent(role.roleId)}`}>
              Back to Role Details
            </a>
            <h1>Edit Role Request</h1>
            <p>Update the vacancy details and HOD screening information before the request moves forward.</p>
          </div>
        </div>
        <RoleRequestForm
          user={{ name: String(user.name ?? ""), email: String(user.email ?? "") }}
          roleId={role.roleId}
          initialValues={initialValues}
        />
      </main>
    </AppShell>
  );
}
