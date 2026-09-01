import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AppShell from "@/components/AppShell";
import NotificationsList from "@/components/NotificationsList";
import { filterVisibleApplicants } from "@/lib/access-control";
import { getNotificationSourceRows } from "@/lib/candidate-applications";
import { getNotificationReadState } from "@/lib/google-sheets";
import { applyReadState, deriveNotifications } from "@/lib/notifications";
import { COOKIE_NAME, verifySessionToken, type SessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function NotificationsLoading() {
  return (
    <main className="container page notifications-page" aria-busy="true">
      <header className="hero-row">
        <div>
          <span className="eyebrow-dark">RECRUITMENT PIPELINE</span>
          <h1>Notifications</h1>
          <p>Loading notifications...</p>
        </div>
      </header>
      <section className="card"><div className="empty">Loading notifications...</div></section>
    </main>
  );
}

async function NotificationsData({ user }: { user: SessionUser }) {
  const [rows, readState] = await Promise.all([
    getNotificationSourceRows(),
    getNotificationReadState(user.email),
  ]);
  const derived = deriveNotifications(filterVisibleApplicants(rows, user));
  const { notifications, unreadCount } = applyReadState(derived, readState);
  return <NotificationsList initialNotifications={notifications} initialUnread={unreadCount} />;
}

export default async function NotificationsPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true && user.canReviewDepartmentRole !== true) {
    redirect("/dashboard");
  }
  return (
    <AppShell user={user}>
      <Suspense fallback={<NotificationsLoading />}>
        <NotificationsData user={user} />
      </Suspense>
    </AppShell>
  );
}
