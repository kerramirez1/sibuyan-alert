# 2026-09-30 (cont.) — Inspect report → one arrow icon button

## Requested

Replace the wide labelled "Inspect report" button with a minimalist arrow icon button,
applied to **both** the admin and responder rows.

## Why "both, identically" was the right reading

This is the third turn in a row about the same complaint — the button looked different
depending on where you were. Before this change it was:

| Row | Treatment |
|---|---|
| Admin | `btn-primary` — filled navy, labelled |
| Responder | `btn-outline` — outlined, labelled |

Same action, same label, two weights. So the fix is not "make it an icon on the admin
row" but **one component with one treatment**: `InspectReportButton`, rendered by both
`AdminIncidentActions` and `ResponderIncidentActions`. A single definition cannot drift
from itself, which is the same reasoning behind `RESPONDER_PRIMARY_ACTION_CLASS`.

## The control

- Icon-only (`HiOutlineArrowRight`), bordered, accent text, quiet until hover.
- `h-11 w-11` on touch, stepping down to `sm:h-9 sm:w-9` where a cursor points.
- **`aria-label="Inspect report"` is load-bearing**: icon-only means the accessible name
  can no longer come from the content, and ~15 test queries plus every screen-reader user
  reach it by that name. `title` gives it back to a pointer.
- `aria-expanded` / `aria-controls="responder-incident-inspector"` unchanged — two tests
  assert them.

## Layout

The arrow moved **into the action group** rather than staying alone on the left. A 44px
icon at the far left of a `justify-between` row with the actions on the right is a hole,
not a composition — the same problem as the header search removal.

`RESPONDER_PRIMARY_ACTION_CLASS` went from `w-full sm:w-auto` to `flex-1 sm:flex-none` so
that at mobile width the arrow and the primary share one row instead of the arrow sitting
alone above a full-width button.

## An assertion was changed, deliberately

`AdminReportsPage.test.jsx` asserted `toHaveClass('btn-outline')` on the Inspect button —
a property of the old wide button. It now asserts what matters for an icon-only control:
the accessible name and `title` are present and `textContent` is empty, i.e. it really is
icon-only. All ~15 `getByRole('button', { name: 'Inspect report' })` queries still pass
untouched, which is the check that the rename did not break reachability.

## Found while auditing, not fixed

`IncidentActionButtons` and `IncidentStatusBadge` are **exported from `IncidentQueue.jsx`
but have no consumers** — dead code, along with the `ActionButton` helper only
`IncidentActionButtons` uses. Worth a separate cleanup; out of scope here. It matters only
in that `IncidentActionButtons` also renders an Inspect action, which is why it needed no
change: nothing mounts it.

## Verification

- `AdminReportsPage.test.jsx` — 31 passed. Lint 0/0, build clean.
- Rendered output checked: **4 Inspect buttons across all preview rows, all byte-identical**,
  `h-11 w-11`, and zero remaining `>Inspect report<` text nodes.
- Preview: `scratch/incident-action-rows-preview.html` — admin row, responder assigned,
  responder unassigned, and a 390px mobile render. Generator deleted after writing.
