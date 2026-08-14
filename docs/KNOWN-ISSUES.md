# Known Issues and Planned Fixes

Open items found during the 2026-08-14 demo preparation. Each entry records what
was observed, what the investigation established, and the fix that has not been
applied yet. Fixes already shipped are listed at the bottom for context.

## 1. Loading a saved template silently overwrites a role's setup

**Severity:** high — produced live, incorrect screening on a published role.

**What happened.** Role `WD01` (Web Developer) was published on 2026-08-14 at
05:06 carrying the recruitment setup of an AI Engineer role: LLM/RAG screening
criteria, RAG/PyTorch/Pinecone keywords, an AWS Machine Learning certification
requirement, and five LLM-specific interview questions. Candidates applying to a
Web Developer post would have been screened on retrieval-augmented generation.

**Root cause.** The content is a byte-for-byte match with the saved template
`AE` (`Template_ID 26655781-30dd-4ddb-b4ff-adcabd0c0d17`, source role `SAE01`,
created by Bong at 02:06). The distinguishing detail is
`earliestAvailabilityRule`: the template says "within 30 to 60 days" while
`SAE01`'s own row says "within 30 days or has a standard notice period" — so the
values came from the template, not from the source role.

The editor does **not** auto-apply templates: `RecruitmentSetupEditor` only
fetches them into a list, and `Load` must be clicked. The hazard is presentation,
not logic:

- The template panel sits at the top of the setup section with a prominent
  `Load` button, directly above the fields it replaces.
- `Load` replaces every HR-editable field at once with no confirmation.
- Once loaded, nothing distinguishes template content from the role's own saved
  setup, so the next save silently adopts it.

**Planned fix.**

1. Confirmation prompt before `Load` replaces a non-empty setup, naming the
   template and the role it will overwrite.
2. A persistent "Loaded from template *<name>* — not saved yet" banner while the
   form holds unsaved template content, cleared on save or reload.
3. Consider moving the template panel below the HR-edited sections so it is not
   the first thing in reach.

**Data cleanup still outstanding.** `WD01` retains the AI Engineer setup and is
`Job Posted` with a live application link. It needs either a clear-back-to-blank
or a genuine Web Developer setup. Its `AI_System_Prompt` also opens with "You are
Julio…" instead of "You are Ella…" — someone edited the prompt after loading, and
the interviewer would introduce herself as Julio on a real call.

## 2. Final-interview invitation is never sent unless Vapi said "Completed"

**Severity:** high — approved candidates silently never receive a booking link.

**Where.** n8n workflow *Voice Interview HR Decision v2 – Hashed Final Booking
Token* (`4FsKYuSxyaKxFtsM`), node **Filter Voice HR Actions**.

**Root cause.** The filter's final condition is:

```js
return (resultCompleted || explicitApprovalOverride) && (rejectReady || approvalReady);
```

`resultCompleted` requires the `Voice_Interview_Results` row to have both
`Call_Status` **and** `Call_Final_Status` equal to `completed`.
`explicitApprovalOverride` only fires when `Voice_HR_Comments` literally contains
the word "manual". So an HR **Approve** on any candidate whose call came back
`No Answer`, `Busy`, or `Incomplete` is discarded, and no invitation is sent.

This compounds with the Vapi mis-count in item 4: a candidate who genuinely
finished the interview can be labelled `Incomplete`, and then their HR approval
is silently dropped here.

**Observed.** Of 13 approved applicants, three never received the email:

| Applicant | `Call_Status` | Blocker |
| --- | --- | --- |
| `APP-3e795aad…` Julio Jose Padilla | `no answer` | fails `resultCompleted` |
| `hulyo jose padilla` | `busy` | fails `resultCompleted` |
| `Lucas` | `completed` | claim flag stuck at `Processing` with an expired token (2026-08-10) |

**Planned fix.** Treat an explicit HR decision as authoritative — HR only decides
after reviewing the interview, so the decision itself is the signal to act on:

```js
// An explicit HR decision is authoritative. Requiring the Vapi call to be
// "Completed" meant a candidate whose call came back "No Answer", "Busy", or
// "Incomplete" never received the final-interview invitation even after HR
// approved them — and "Incomplete" is itself unreliable (see item 4).
const hrHasDecided = decision === 'approve' || decision === 'reject';

return (
  (resultCompleted || explicitApprovalOverride || hrHasDecided) &&
  (rejectReady || approvalReady)
);
```

**Secondary.** The `approvalFlag === 'processing'` retry branch also requires an
unexpired `Final_Interview_Booking_Token_Expires_At`. Once the token lapses the
row can never be retried (Lucas). Either allow re-issuing a token on expiry, or
clear `Voice_Approval_Processed` to re-queue the applicant.

## 3. "Unable to save" may not mean the save failed

**Severity:** medium — HR cannot tell whether to redo the work.

The recruitment-setup route treats a workflow reply as failure unless the body
carries `success: true`. If n8n returns HTTP 200 without that field while still
performing its writes, the portal reports a failure for work that actually
landed.

This is **unconfirmed** — it requires inspecting the response node of the n8n
recruitment-setup workflow. Mitigation already shipped (see below) reloads the
saved record after a failure so HR can see what was kept, but the underlying
ambiguity should be settled by checking what that workflow returns.

## 4. Voice interview question count comes from Vapi, not the portal

The `Prepare Final Result` node in *Phase 5 – Scheduled Vapi Result Polling* was
fixed to stop mis-attributing answers when a candidate asks the interviewer to
repeat a question. That fix corrects the **Interview evidence** block and the
local completeness fallback.

The "N of 5 questions answered" figure in the summary header still prefers
Vapi's own `answered_question_count` when present, so a miscount originating in
Vapi's end-of-call analysis will still show. If that proves unreliable, prefer
the locally computed count over the provider's.

## 5. Recruitment setup stage buttons

`Mark as Recruitment Ready` and `Mark as Ready for Publishing` are now optional —
`Publish Role` unlocks on genuine field readiness. The four buttons were kept
deliberately.

Collapsing to `Save Draft` + `Publish Role` would simplify the UI, but it would
stop `recruitment_setup_marked_ready` and
`recruitment_setup_ready_for_publishing` from ever reaching n8n. Any workflow
branching on those action values must be checked before removing the buttons.

## 6. Schema documentation drift

`GOOGLE-SHEETS-SCHEMA.md` does not list the `Interview_Slots` columns
`Interviewer_Name`, `Interviewer_Email`, `HOD_Name`, and `HOD_Email`, which the
final-interview booking flow reads and writes (range widened to `X`).

Related: `updateRoleRequestFields()` appends any column it cannot find. If a
header name in the code ever drifts from the sheet, the mismatch appears as a new
column at the far right of `Role_Requests` rather than as an error.

---

## Fixed on 2026-08-14

- **Phone numbers lost their `+`.** Sheets' `USER_ENTERED` mode parsed a leading
  `+` as a formula, storing `60127717025`, which the Vapi dialer could not call.
  Phone writes now use the `'` text-cell prefix. Verified by round-trip against
  the live sheet.
- **"Role request not found" after creating a role.** `POST /api/roles` cached
  the pre-creation list and never invalidated it, so the redirect read a stale
  snapshot for up to 20 seconds.
- **Stale status after setup and status actions.** Added cache invalidation
  after the n8n webhook succeeds, and unconditionally in the status route where
  the previous invalidation sat inside a `try` that swallows errors.
- **Publish reported a false error.** A second click after a successful publish
  hit the `Approved`/`Recruitment Setup` guard once the role became
  `Job Posted`. Publish is now idempotent and reports the settled state.
- **Publish button stayed disabled with a complete checklist.** It required the
  stored stage to equal `Ready for Publishing`; it now gates on actual readiness.
- **Save Draft lost data.** Only voice fields were written directly; everything
  else depended on the n8n mapper. All HR-entered setup fields are now persisted
  by the portal using the same values sent to the workflow.
- **Final Interview card shown too early.** It now appears only after the voice
  HR decision is `Approve`.
- **Interview evidence mis-attributed after a repeat request.** See item 4.
- **Recruitment Setup hidden once published.** The section returned `null` for
  any status other than `Approved`/`Recruitment Setup`, so HR could not see what
  Ella was configured to ask on a live role. Published roles now render it
  read-only, matching the server, which refuses setup saves for them.
- **Recommendation showed a final-interview stage too early.** `Status 3 (Final
  Interview)` defaults to `Pending`, which the summary read as "Awaiting Final
  Interview Scheduling" before the voice call had happened. The voice stage is
  now reported while the voice HR decision is still open.
