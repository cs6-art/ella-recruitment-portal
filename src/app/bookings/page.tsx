import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import BookingsList from "@/components/BookingsList";
import { getInterviewBookings } from "@/lib/candidate-applications";
import { canManageInterviewAvailability } from "@/lib/access-control";
import { getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");
  const [bookings, roles] = await Promise.all([getInterviewBookings(), getRoleRequests()]);
  const approvedRoles = roles
    .filter((role) => canManageInterviewAvailability(role.status))
    .map(({ roleId, jobTitle }) => ({ roleId, jobTitle }));
  return <AppShell user={user}><BookingsList bookings={bookings} roles={approvedRoles} /></AppShell>;
}
