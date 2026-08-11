import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import RoleDetails from "@/components/RoleDetails";
import {
  COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const dynamic = "force-dynamic";

type RoleDetailsPageProps = {
  params: Promise<{
    roleId: string;
  }>;
};

export default async function RoleDetailsPage({
  params,
}: RoleDetailsPageProps) {
  const cookieStore = await cookies();

  const user = verifySessionToken(
    cookieStore.get(COOKIE_NAME)?.value,
  );

  if (!user) {
    redirect("/");
  }

  if (
    user.canCreateRole !== true &&
    user.canReviewRole !== true &&
    user.canApproveRole !== true
  ) {
    redirect("/dashboard");
  }

  const { roleId } = await params;

  return (
    <AppShell user={user}>
      <RoleDetails
        roleId={decodeURIComponent(roleId)}
        canReviewRole={user.canReviewRole === true}
        canApproveRole={user.canApproveRole === true}
      />
    </AppShell>
  );
}
