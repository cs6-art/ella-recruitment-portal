import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import GoogleCalendarConnect from "@/components/GoogleCalendarConnect";
import SettingsEditor from "@/components/SettingsEditor";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (!user.canEditSettings) redirect("/dashboard");
  return <AppShell user={user}><GoogleCalendarConnect /><SettingsEditor /></AppShell>;
}
