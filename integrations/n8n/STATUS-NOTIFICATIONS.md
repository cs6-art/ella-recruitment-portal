# Role status notification rules

The Next.js status API sends every transition to the n8n role webhook. The
browser never sends email directly. n8n should use the transition `action`,
the `Requester_Email` value from `Role_Requests`, and `User_Directory` to
resolve recipients.

The transition payload includes `portalUrl`, built from `NEXT_PUBLIC_APP_URL`
or the forwarded request host, followed by `/roles/{Role_ID}`. Use that value
in email links; do not hardcode `localhost`.

| Action | Recipients |
| --- | --- |
| `send_for_management_approval` | `User_Directory` users with `Can_Approve_Role = TRUE` and `Active = TRUE` |
| `return_for_revision_hr` | `Requester_Email` |
| `place_on_hold_hr` | `Requester_Email` and active HR reviewers |
| `approve_role` | `Requester_Email` and active HR reviewers |
| `reject_role` | `Requester_Email` and active HR reviewers |
| `return_for_revision_management` | `Requester_Email` and active HR reviewers |
| `place_on_hold_management` | `Requester_Email` and active HR reviewers |
| `resume_hr_review` | Active HR reviewers |
| `resume_management_approval` | Active approvers |

Return an HTTP 200 JSON response after the status and history writes complete:

```json
{
  "success": true,
  "status": "Pending Management Approval",
  "notificationStatus": "sent",
  "notificationError": ""
}
```

Use `sent`, `pending`, `failed`, or `not_configured` for
`notificationStatus`. The portal treats `sent` as success and displays a
warning while preserving the status update for the other values.

Required environment variables:

```text
N8N_ROLE_WEBHOOK_URL=https://your-n8n-domain/webhook/role-request
N8N_WEBHOOK_SECRET=your-shared-webhook-secret
NEXT_PUBLIC_APP_URL=https://your-production-portal-domain
```

The n8n webhook header-auth credential must validate the
`X-Webhook-Secret` header against `N8N_WEBHOOK_SECRET`.
