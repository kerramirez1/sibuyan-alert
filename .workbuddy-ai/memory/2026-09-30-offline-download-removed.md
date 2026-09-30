# 2026-09-30 (cont.) — "Download for offline use" removed

## Audit first: what the button actually did

`components/ui/FieldPreloadButton.jsx`, used in exactly one place —
`ResponderDashboardWorkspace.jsx` in the dashboard's action row, before
"Dispatch queue" and "Safety map".

It called `reportsAPI.getAll()`, `reportsAPI.getStats()` and
`highRiskZonesAPI.getAll()` with `Promise.allSettled`, then toasted
"Incident data saved for offline use." **It wrote nothing itself.** Its own doc
comment says so: "There is no bespoke storage here: these are ordinary API reads,
and the service worker caches the responses."

**So the button was a cache warmer, not the offline feature.**

## The question that decided whether removal was safe

Does offline reading survive without it? Checked `public/sw.js`:

```js
async function networkFirst(request, cacheName, scope) {
    const cache = await caches.open(cacheName);
    const key = scope ? scopedKey(request, scope) : request;
    try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(key, response.clone());   // caches every success
        return response;
    } catch (error) {
        const cached = await cache.match(key);
        if (cached) return cached;                                             // serves it offline
        throw error;
    }
}
```

Every successful API read is cached automatically, and the cache is served when the
network fails. `/api/files` and `/api/auth` are excluded from the data cache, which
is correct — they are not offline data.

**Conclusion: removing the button does not remove any offline capability.** The
offline queue, the offline banner, and the sync path are separate and untouched.

**The one real loss, stated plainly:** the responder can no longer *deliberately*
pre-load before driving out of coverage — they must have visited the pages that
populate the cache. That is a UX trade-off, not a functional regression, and the
user accepted it.

## Removal

- `FieldPreloadButton` import and its `<FieldPreloadButton />` usage removed from
  `ResponderDashboardWorkspace.jsx`.
- `components/ui/FieldPreloadButton.jsx` **deleted** — no other consumer and no
  barrel export, so leaving it would have been dead code. Recoverable from git.
- The action row is unaffected: the two remaining links already carry `flex-1` and
  simply share the width.

**Not touched:** `public/sw.js`, `useConnectivity`, the offline report queue, the
offline banner, `reportsAPI`/`highRiskZonesAPI` (both still used elsewhere — the
map and `useGlobalHighRiskZones`).

## Verification

- `ResponderDashboardWorkspace.test.jsx` + `AdminPage.test.jsx` — 14 passed.
- No test asserted the button, so nothing needed rewriting.
- `grep -rn "FieldPreloadButton" client/src/` returns nothing.
- Lint 0/0, build clean.
