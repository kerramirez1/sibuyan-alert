# 2026-09-30 (cont.) — Responder row had no primary action

## Reported

From a screenshot of the responder queue: "mukhang hindi consistent ang mga button
katulad sa admin incident report inspect" — the buttons looked flat next to the admin
row's filled "Inspect report".

## The cause

`ResponderIncidentActions` styled its two workflow actions **differently**:

| Action | Before | When it applies |
|---|---|---|
| "Respond to incident" / "Join response" | `bg-brand-700` — filled primary | `canRespond`: actionable status AND not assigned to me |
| "Resolve incident" | `border-gray-300 bg-white text-gray-700` — plain outline | `canResolve`: `status === 'responding'` AND assigned to me |

They are **mutually exclusive** (`!assignedResponder` vs `assignedResponder`), so only
one ever renders — but which one you got decided whether the row had a primary at all.
An **assigned** responder therefore saw two outlines and nothing primary; an unassigned
one saw a filled button. Same class of action, two weights.

That is exactly the screenshot: "Inspect report" and "Resolve incident" both outlined.

## The rule applied

**One primary per row, and it is the action the row exists for.**

- **Responder row** — the workflow action (Respond / Resolve) is primary; Inspect is the
  secondary outline.
- **Admin row** — there is no single workflow action (verify/reject/transfer are all
  conditional), so **Inspect** holds that role, which is why the admin row's Inspect is
  filled and the responder row's is not. That difference is deliberate, not drift.

Both responder actions now share `RESPONDER_PRIMARY_ACTION_CLASS`, a single constant, so
they cannot drift apart again.

## An assertion was changed, deliberately

`AdminReportsPage.test.jsx` line ~532 asserted the resolve button had
`border-gray-300 bg-white text-gray-700` — **the old outlined treatment, i.e. the
inconsistency itself**, encoded as a test. It now asserts `bg-brand-700`, with a comment
recording why. The test's own purpose (severity-first ordering, status indicators not
using coloured badges) is untouched; the resolve-button assertion was incidental to it.

A new test, 'gives the responder row the same primary weight whichever action applies',
covers the resolve half; the join half was already covered.

## Verification

- `AdminReportsPage.test.jsx` — 31 passed. Lint 0/0.
- Rendered output checked directly: `Resolve incident` and `Respond to incident` both
  carry `bg-brand-700`; `Inspect report` stays `btn-outline`.
- Preview: `scratch/responder-action-buttons-preview.html` — the responder row in both
  action states plus an admin row for comparison. Generator deleted after writing.
