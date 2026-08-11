# Troubleshooting

`The n8n webhook is not configured` means the server is missing
`N8N_ROLE_REQUEST_WEBHOOK_URL` or `N8N_WEBHOOK_SECRET`. These values are never
read by the browser.


`Unable to load role requests` usually means the service account cannot read
the `Role_Requests` tab, the tab/header is missing, or the spreadsheet ID is
wrong. Check server logs and sheet sharing without exposing credentials.

An HTTP 409 status conflict means another user changed the role after the page
was loaded. Refresh the role details page before retrying.

If notification delivery is pending or failed while the update succeeded,
inspect n8n notification logs and the history row's `Notification_Status` and
`Notification_Error`; do not repeat the business update unless a deliberate
retry is required.
# Recruitment Setup readiness errors

`RECRUITMENT_SETUP_INCOMPLETE` means the requested stage has missing required
fields. The response includes `missingFields`; complete those fields or choose
the explicit Not disclosed / Not required option before retrying. A normal
draft save never publishes a role.
