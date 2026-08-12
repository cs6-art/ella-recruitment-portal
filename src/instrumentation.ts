const RESUME_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupExpiredResumeFiles } = await import("./lib/resume-files");
  const runCleanup = () => {
    void cleanupExpiredResumeFiles().catch((error) => {
      console.warn("[Resume Cleanup] Scheduled cleanup failed:", error);
    });
  };

  runCleanup();
  const timer = setInterval(runCleanup, RESUME_CLEANUP_INTERVAL_MS);
  timer.unref?.();
}
