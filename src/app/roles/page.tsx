import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import RolesList from "@/components/RolesList";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const cookieStore = await cookies();

  const user = verifySessionToken(
    cookieStore.get(COOKIE_NAME)?.value,
  );

  if (!user) {
    redirect("/");
  }

  const canReviewRole =
    user.canReviewRole === true;

  const canApproveRole =
    user.canApproveRole === true;

  if (!user.canCreateRole && !canReviewRole && !canApproveRole) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={user}>
      <RolesList
        canCreateRole={
          user.canCreateRole === true
        }
        creatorOnly={
          user.canCreateRole === true &&
          !canReviewRole &&
          !canApproveRole
        }
      />
    </AppShell>
  );
}
