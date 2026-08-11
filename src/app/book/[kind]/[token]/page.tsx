import { notFound } from "next/navigation";

import BookingSelector from "@/components/BookingSelector";
import { getBookingContext, type BookingKind } from "@/lib/applicant-workflow";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  if (kind !== "voice" && kind !== "final") notFound();
  const context = await getBookingContext(kind as BookingKind, token);
  if (!context) notFound();
  return <BookingSelector token={token} initialContext={context} />;
}
