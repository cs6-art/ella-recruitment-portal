# Deployment checklist

- Configure every variable in `.env.example` in the production environment.
- Grant the Google service account editor access to the spreadsheet and verify
  all tab headers using `GOOGLE-SHEETS-SCHEMA.md`.
- Activate the production n8n webhook and validate `X-Webhook-Secret`.
- Deploy the `queue/v2beta` consumer in `vercel.json`; Vercel automatically
  authenticates the Queues SDK in a deployed Function, so no queue API token
  is required. Set a random `CRON_SECRET` (at least 16 characters) in the
  Production environment for the five-minute orphaned-job recovery cron.
  This cron frequency requires Vercel Pro or Enterprise; Hobby permits only
  daily cron schedules and rejects this configuration during deployment.
- Confirm the `Bulk_Resume_Queue` header row includes the W columns documented
  in `N8N-CONTRACTS.md`, and keep the portal bulk intake n8n workflow active.
- Keep `BULK_RESUME_NOTIFY_ON_SUCCESS` disabled unless the role-request n8n
  webhook is configured to handle the idempotent batch-completion event.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS portal URL.
- Resume storage is Google Drive, not local disk (Vercel's filesystem is
  read-only outside `/tmp`, which isn't durable or shared across instances
  anyway). Create a folder for private resume uploads, share it with the
  service account in `GOOGLE_SERVICE_ACCOUNT_EMAIL` (Editor access — a
  Shared Drive is strongly preferred over a personal My Drive folder, since
  service accounts have no storage quota of their own and uploads fail
  outright without one), then set `RESUME_STORAGE_DRIVE_FOLDER_ID` to that
  folder's ID.
- Add malware scanning at the hosting edge or storage layer and verify the 30-day resume retention policy.
- Test one valid resume, multiple simultaneous uploads, an invalid job
  description, a duplicate hash, a worker timeout, a browser refresh during
  processing, and individual retry in a non-production workbook and Drive
  folder. Confirm Completed only appears when the saved applicant screening
  result can be read.
- Confirm active User_Directory rows and permissions for a creator, reviewer,
  approver, and settings editor.
- Run `npm.cmd test`, `npx.cmd tsc --noEmit`, and `npm.cmd run build`.
- Perform the manual smoke test in `TESTING.md` against production n8n and a
  test spreadsheet row.
- Verify HTTPS, secure cookie behavior, backups, monitoring, and rollback.
