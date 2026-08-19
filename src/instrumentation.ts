const RESUME_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const INTERVIEW_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Demo mode must never touch live data. The interview maintenance below
  // writes "No Show" rows back to Google Sheets, which the n8n pollers would
  // observe and act on — exactly the emails and calls a demo must not send.
  const { isDemoMode } = await import("./lib/demo-mode");
  if (isDemoMode()) {
    console.info("[Demo Mode] Background maintenance disabled; no data will be written.");
    return;
  }

  const { cleanupExpiredResumeFiles } = await import("./lib/resume-files");
  const runCleanup = () => {
    void cleanupExpiredResumeFiles().catch((error) => {
      console.warn("[Resume Cleanup] Scheduled cleanup failed:", error);
    });
  };

  runCleanup();
  const timer = setInterval(runCleanup, RESUME_CLEANUP_INTERVAL_MS);
  timer.unref?.();

  const { syncPastBookedInterviewsNoShow, syncPastAvailableInterviewSlots } = await import("./lib/applicant-workflow");
  const runInterviewMaintenance = () => {
    void (async () => {
      await syncPastBookedInterviewsNoShow();
      await syncPastAvailableInterviewSlots();
    })().catch((error) => {
      console.warn("[Interview Maintenance] Scheduled sync failed:", error);
    });
  };

  // Delay the first pass so application startup and the first navigation are
  // not competing with the maintenance sheet reads.
  const initialMaintenance = setTimeout(runInterviewMaintenance, 15_000);
  initialMaintenance.unref?.();
  const maintenanceTimer = setInterval(runInterviewMaintenance, INTERVIEW_MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref?.();
}
