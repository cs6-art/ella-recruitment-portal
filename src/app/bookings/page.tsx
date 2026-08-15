import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import BookingsList from "@/components/BookingsList";
import { getInterviewBookings } from "@/lib/candidate-applications";
import { canManageInterviewAvailability } from "@/lib/access-control";
import { getCalendarBusyWindows } from "@/lib/google-calendar";
import { getRoleRequests } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");
  const [bookings, roles] = await Promise.all([getInterviewBookings(), getRoleRequests()]);
  const approvedRoles = await Promise.all(roles
    .filter((role) => canManageInterviewAvailability(role.status))
    .map(async ({ roleId, jobTitle, hodEmail, hodAvailabilitySlots, voiceInterviewAvailabilityMode, voiceInterviewSlots, voiceInterviewAutoStartDate, voiceInterviewAutoEndDate, voiceInterviewTimezone, interviewAvailabilityRules }) => {
      const start = new Date();
      const end = new Date(start.getTime() + 180 * 24 * 60 * 60 * 1000);
      const busy = hodEmail ? await getCalendarBusyWindows({ hodEmail, start, end }) : null;
      return { roleId, jobTitle, hodEmail, hodAvailabilitySlots, voiceInterviewAvailabilityMode, voiceInterviewSlots, voiceInterviewAutoStartDate, voiceInterviewAutoEndDate, voiceInterviewTimezone, interviewAvailabilityRules, finalBusyWindows: busy?.checked ? JSON.stringify(busy.busy) : "[]" };
    }));
  return <AppShell user={user}><BookingsList bookings={bookings} roles={approvedRoles} /></AppShell>;
}
