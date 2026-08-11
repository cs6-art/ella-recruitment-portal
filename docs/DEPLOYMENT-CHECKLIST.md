# Deployment checklist

- Configure every variable in `.env.example` in the production environment.
- Grant the Google service account editor access to the spreadsheet and verify
  all tab headers using `GOOGLE-SHEETS-SCHEMA.md`.
- Activate the production n8n webhook and validate `X-Webhook-Secret`.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS portal URL.
- Confirm active User_Directory rows and permissions for a creator, reviewer,
  approver, and settings editor.
- Run `npm.cmd test`, `npx.cmd tsc --noEmit`, and `npm.cmd run build`.
- Perform the manual smoke test in `TESTING.md` against production n8n and a
  test spreadsheet row.
- Verify HTTPS, secure cookie behavior, backups, monitoring, and rollback.
