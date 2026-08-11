# Production hardening preparation

## Rate limiting

Apply a shared IP/user rate limiter at the reverse proxy or hosting edge for
login, role creation, status transitions, recruitment setup, and settings.
Use a durable store such as Redis in a multi-instance deployment. Keep the
current server-side permission checks as the final authorization layer.

## CSRF protection

All browser mutations should remain same-origin and use the HTTP-only,
SameSite session cookie. Before exposing beyond a trusted internal network,
add a synchronizer token or signed origin-bound CSRF token to POST/PUT routes,
and reject unexpected `Origin`/`Referer` values.

## Structured logging and monitoring

Replace ad-hoc console messages with JSON logs containing request ID, route,
user email hash, role ID, action, status, duration, and outcome. Never log
session tokens, webhook secrets, private keys, or full applicant data. Add an
error-monitoring integration at the API route catch blocks and report the
request ID with the exception.

## Environment variables

Keep secrets server-only: `SESSION_SECRET`, Google service-account values,
`N8N_WEBHOOK_SECRET`, and webhook URLs must not use `NEXT_PUBLIC_`. Only
`NEXT_PUBLIC_APP_URL` and public Google client configuration may be exposed.

## Backup and recovery

Schedule versioned Google Sheet backups, test restoration quarterly, preserve
the `Role_ID` and `Action_Request_ID` columns, and retain n8n workflow exports
and credential/configuration runbooks separately from production data.

## Deployment checklist

- Set production environment variables and rotate development secrets.
- Confirm Google service-account sheet access and writable spreadsheet scope.
- Activate n8n production webhooks and verify `X-Webhook-Secret`.
- Configure `NEXT_PUBLIC_APP_URL` for email links.
- Confirm User_Directory active/RBAC rows and Settings headers.
- Run build and tests, then perform one end-to-end role/status/setup test.
- Confirm backups, monitoring, HTTPS, secure headers, and rollback procedure.
