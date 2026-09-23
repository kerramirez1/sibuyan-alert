# System Processes — Sibuyan Alert

> **Purpose:** a process-oriented companion to [`CODEBASE_CONTEXT.md`](../CODEBASE_CONTEXT.md).
> That document describes *what the system is* (architecture, models, API surface).
> This one describes *what the system does over time* — every business flow, every
> background loop, and every client-side async mechanism, with the trigger, the
> cadence, and the files involved.
>
> **Last verified:** 2026-09-22 against the working tree. Test suite green:
> 162 files / 1524 tests (102 / 1062 client, 60 / 462 server).

---

## 0. How to read this document

Each process entry has the same four fields:

| Field | Meaning |
|---|---|
| **Trigger** | What starts it — a request, a user action, a timer, a browser event |
| **Cadence** | How often it runs, or `on demand` |
| **Touches** | Collections / stores it reads or writes |
| **Files** | Where the code lives |

A process is listed here **only if it has a lifecycle** — something that starts,
runs, and stops. Pure functions and presentational components are deliberately
excluded; `CODEBASE_CONTEXT.md` covers those.

---

## 1. Process inventory

| # | Process | Trigger | Cadence |
|---|---|---|---|
| BP-1 | Citizen registration & KYC | `POST /api/auth/register` | on demand |
| BP-2 | Incident report submission | Reporter submits form | on demand |
| BP-2b | Offline report delivery | `online` event / backoff timer | 15s → 300s backoff |
| BP-3 | Verification & dispatch | Admin verifies report | on demand |
| BP-4 | Multi-unit response | Responder acknowledges | on demand |
| BP-5 | Incident resolution | Responder closes incident | on demand |
| BP-6 | Cross-municipality transfer | Admin transfers report | on demand |
| BP-7 | Hazard zone management | Admin places a zone | on demand |
| BP-8 | Reach recording | Viewer opens a record | on demand |
| BP-9 | Analytics read | Dashboard/analytics page load | on demand |
| RP-1 | **Dispatch escalation sweeper** | `setInterval` | **every 30s** |
| RP-2 | Evidence processing queue | Report submit (`201` already sent) | on demand, serial |
| RP-3 | Background task queue | Caller enqueues | on demand |
| RP-4 | Session rotation & cap | Refresh / login | on demand |
| RP-5 | Notification expiry | MongoDB TTL monitor | ~60s sweep |
| RP-6 | Analytics view maintenance | Server boot | once per boot |
| RP-7 | Boot sequence | Process start | once |
| RP-8 | Socket room lifecycle | Client `join` / `disconnect` | on demand |
| CP-1 | SWR query cache | Component mount | TTL 30s–300s |
| CP-2 | Offline report queue | Submit failure / offline | on demand |
| CP-3 | Report draft autosave | Form edit | on demand |
| CP-4 | Connectivity & health polling | Window events / timer | 60s |
| CP-5 | Service worker cache scoping | Login / logout | on demand |
| CP-6 | Lazy chunk retry | Chunk load failure | once per session |
| CP-7 | Protected blob cache | Evidence open | on demand, LRU 50 |
| CP-8 | On-device selfie detection | Camera active | 100ms scan |
| CP-9 | Reach view recording | Details opened | on demand |

---

## 2. Business processes

### BP-1 — Citizen registration & KYC (fail-closed)

```
RegisterPage.jsx (3 steps)
  → POST /api/auth/register  (multipart: fields + idDocument + selfiePhoto)
  → middleware/upload.js        magic-number + size validation
  → middleware/validate.js      validateRegistration
  → middleware/rateLimiter.js   authLimiter
  → authController.register
      1. detectFaces(selfie, { fastMode: true, maxDimension: 800 })
           detector_failed → 503, and the user is NEVER created
           no face / multi face / invalid → 400
      2. parallel GridFS writes (Promise.all + orphan cleanup on failure)
           identity_document + identity_selfie, visibility: private
      3. User.create({ role: 'reporter', verificationStatus: 'pending' })
      4. authSessionService.createSession → sets HttpOnly cookies
```

- **Then:** admin reviews at `/admin/users`; `adminController.verifyUser` sets
  `isVerified = true` and emits `verificationStatusChanged` to `user_${id}`.
- **Resubmit:** `POST /api/auth/resubmit-id` runs the same fastMode selfie gate when a
  new selfie is supplied, replaces the GridFS files, and resets status to `pending`.
- **Client pre-compression** (`utils/identityImage.js`): ID `2000px / 0.85`,
  selfie `1280px / 0.80`. The server remains the source of truth.
- **Why fail-closed:** a detector outage must not become a bypass. `503` is a
  deliberate refusal to create an unverified account.
- **Warm-up:** `initFaceDetector()` runs at boot (`server.js`) so the first selfie
  does not pay the cascade cold-load cost.

**Files:** `server/controllers/authController.js`, `server/middleware/upload.js`,
`server/services/faceDetectionService.js`, `server/services/gridFsService.js`,
`client/src/pages/RegisterPage.jsx`, `client/src/utils/identityImage.js`

---

### BP-2 — Incident report submission

```
ReportPage.jsx  (1 Location → 2 Details → 3 People → 4 Evidence → Review)
  → reportsAPI.create (multipart, CSRF header)
  → routes/reports.js  POST /
  → protect, requireVerifiedReporter, reportLimiter, reportUpload.array('images', 5)
  → reportController.createReport
      ├─ locationService.resolveSibuyanLocation   $geoIntersects + island bbox
      ├─ duplicateDetection.findDuplicateCandidates   advisory only, never a gate
      ├─ gridFsService.uploadToGridFS             evidence images
      ├─ Report.create({ status: 'pending', ... })
      ├─ scheduleEvidenceMetadataProcessing(...)  ← AFTER the 201, off-request
      └─ socketService.emitNewReportAlert         municipality_*_responders
```

- **Bounding box:** `[122.45, 12.30]` → `[122.70, 12.55]`. Outside it is an
  immediate `400`. There is no "near enough" path.
- **Resolution is 3-tier and refuses to guess:** (1) `$geoIntersects` against
  `BarangayBoundary` polygons, (2) rate-limited Nominatim reverse geocode,
  (3) `needs_manual_assignment` for an admin — **never** a silent municipality.
- **Duplicate detection is a signal, not a gate.** Window 60 min, radius 250 m,
  max 5 candidates. A bystander's mis-typed report is still the same crash, so
  type mismatch does not disqualify a candidate. The human decides.
- **Response budget:** the `201` returns *before* image analysis. Before this
  split, five photos measured ~90s of server work — past Heroku's 30s router
  timeout and the client's own 60s submit timeout, so the client gave up on
  submissions the server went on to complete.

**Files:** `server/controllers/reportController.js`, `server/services/locationService.js`,
`server/utils/duplicateDetection.js`, `server/middleware/upload.js`,
`client/src/pages/ReportPage.jsx`, `client/src/components/report/*`

---

### BP-2b — Offline report delivery (write-ahead queue)

```
submit fails (timeout / offline / 5xx)
  → offlineReportQueue.enqueueReport()      IndexedDB, BEFORE any retry
  → useOfflineReportSync                    arms a backoff timer
  → flushQueuedReports()                    sequential, one at a time
      success (201) → row deleted
      transient     → stays queued, retry with backoff
      permanent 4xx → parked as blockedReports (POSSIBLE_DUPLICATE)
```

- **Store:** IndexedDB `sibuyan-offline` v1, store `pending-reports`,
  keyPath `clientReportId`.
- **Idempotency:** `crypto.randomUUID()` (fallback `r-<base36>-<rand>`). The
  server can see the same report twice and still file it once.
- **Backoff:** base 15s, ×2 factor, 300s cap. Only *deliverable* reports arm the
  timer — a parked duplicate does not spin.
- **Lease:** an in-flight copy is protected for 120s (`QUEUED_REPORT_SENDING_STALE_MS`),
  which must stay above the 60s submit timeout or the queue could replay a request
  that is still running.
- **Ownership:** `partitionQueuedReports` excludes rows belonging to another
  account, and only a session that `canSubmitReports` flushes. A shared device
  cannot deliver someone else's queue.
- **Duplicate handling:** `POSSIBLE_DUPLICATE` is **never auto-retried**. It is
  surfaced in `OfflineQueueBanner.jsx`; the reporter confirms via
  `resolveBlockedQueuedReport(id, { confirmDistinct: true })`, which stamps
  `fields.confirmDistinct = 'true'` and files it as deliberately separate.

**Files:** `client/src/utils/offlineReportQueue.js`,
`client/src/hooks/useOfflineReportSync.js`,
`client/src/components/reporterReports/OfflineQueueBanner.jsx`,
`client/src/config/reportSubmission.js`

---

### BP-3 — Verification & dispatch

```
AdminReportsPage.jsx → IncidentActionDialogs (Verify)
  → PUT /api/admin/reports/:id/verify
  → protect, requireAdmin, validateReportVerification
  → adminController.verifyReport
      ├─ admin.assignedMunicipality MUST equal report.municipalityName
      ├─ status → 'verified' | 'rejected'  (+ verifiedAt, verifiedBy)
      ├─ armDispatchAcknowledgement()   ← starts the RP-1 ack clock
      ├─ pushService.sendPushNotification  to municipal responders
      └─ socketService.emitReportVerifiedAlert
```

- **Jurisdiction is checked, not assumed.** An admin from Cajidiocan cannot
  verify a Magdiwang report — that is what BP-6 exists for.
- **Verifying starts the escalation clock.** If no unit acknowledges within the
  ack window, RP-1 re-pages. This is the direct consequence of SMS being out of
  scope: with no SMS fallback, silence has to be treated as failure.

**Files:** `server/controllers/adminController.js`, `server/services/socketService.js`,
`server/services/pushService.js`, `server/services/dispatchEscalationService.js`

---

### BP-4 — Multi-unit response

```
ResponderIncidentInspector / MapIncidentDetails → ResponderUnitModal
  → PUT /api/admin/reports/:id/respond  { unitName, unitType }
  → protect, requireResponder, validateResponderAction
  → adminController.respondToReport
      ├─ report must be 'verified' | 'transferred' | 'responding'
      ├─ append to responders[]   ← never overwrites an existing unit
      ├─ status → 'responding'
      ├─ acknowledgeDispatch()    ← stops the RP-1 escalation for this unit
      └─ socketService.emitLocalUnitResponse
```

- **Units:** MDRRMO, PNP, BFP, SDH (`server/config/responderUnits.js`).
- **Additive by design:** PNP joining after MDRRMO does not erase MDRRMO's entry.
  A transferred report can also be responded to directly.

**Files:** `server/controllers/adminController.js`,
`client/src/components/ResponderUnitModal.jsx`,
`client/src/components/adminReports/ResponderIncidentInspector.jsx`

---

### BP-5 — Incident resolution

```
IncidentActionDialogs (Resolution modal)
  → PUT /api/admin/reports/:id/resolve  { resolutionNotes, ... }
  → protect, requireResponder, validateResolution
  → adminController.resolveReport
      ├─ the caller MUST already be in report.responders[]
      ├─ status → 'resolved'  (+ resolvedAt, resolutionNotes)
      ├─ emailService → resolution notice to the original reporter
      └─ socketService.emitReportResolutionDetails → user_${reporterId}
```

- **Only an on-scene unit can close.** A responder who never responded cannot
  resolve the incident — the record has to reflect who was actually there.
- **Reporter notification is private:** it goes to `user_${reporterId}`, not a
  public broadcast.

**Files:** `server/controllers/adminController.js`, `server/services/emailService.js`

---

### BP-6 — Cross-municipality transfer (two-step consent)

```
Admin A (Cajidiocan) → Transfer dialog
  → PUT /api/admin/reports/:id/transfer  { targetMunicipality, reason }
  → adminController.transferReport
      ├─ append to transferHistory[]
      ├─ municipalityName → target, status → 'transferred'
      └─ emit reportTransferredAlert to BOTH responder rooms

Admin B (Magdiwang) → transfer queue
  → PUT /api/admin/reports/:id/acknowledge-transfer
  → adminController.acknowledgeTransfer
      └─ transferHistory.acknowledgedAt = Date.now()
```

- **Why two steps:** there is no super-admin and no cross-municipality override.
  Requiring the receiving office to acknowledge means **both** offices consented —
  a report cannot be pushed onto a municipality that never accepted it.

**Files:** `server/controllers/adminController.js`, `server/models/Report.js`

---

### BP-7 — Hazard zone management

```
AdminHighRiskZonesPage.jsx (/admin/zones)  → click map to place pin
  → POST /api/high-risk-zones
  → protect, requireAdmin
  → riskZoneJurisdictionService   ← zone coords MUST be in the admin's municipality
  → HighRiskZone.create({ point, radius, severity, municipality })
  → io.emit('highRiskZoneCreated', zone)
```

- **Radius:** 50–5000 m slider, 10 m steps, default 100 m. The floor is 50 m
  rather than the schema's 10 m because below that the circle is smaller than the
  pin that places it. A zone saved below the floor keeps its stored radius.
- **Hazard reference layers** (DOST Project NOAH, ODC-ODbL) render *behind* the
  pins as a placement aid. They appear on `/admin/zones` and nowhere else —
  ~1.7 MB of polygons must not ride along with the incident-first public dashboard.
- **`available: false` is a first-class outcome.** A lookup that could not be
  performed is never flattened into "clear". There is deliberately **no flood
  layer**: 0 of 25,426 Romblon flood polygons fall inside the Sibuyan box, and an
  empty overlay on a hazard map reads as "no flood risk here".
- **Accident-prone areas are derived, not published** — computed from the system's
  own `reports` (see RP-9 below), never from a GIS file.

**Files:** `server/routes/highRiskZones.js`, `server/services/riskZoneJurisdictionService.js`,
`server/config/hazardDatasets.js`, `server/utils/accidentHotspots.js`,
`client/src/pages/AdminHighRiskZonesPage.jsx`

---

### BP-8 — Reach recording (distinct viewers per record)

```
Viewer opens an incident sheet / archive dossier / zone panel
  → useRecordView  →  POST /api/views  { targetType, targetId, anonymousId }
  → optionalAuth, viewLimiter
  → viewEventService.recordViewEvent
      ├─ viewerKey = 'user:<id>' | 'anon:<uuid v4>'
      ├─ upsert on (targetType, targetId, viewerKey)  ← unique index does the dedupe
      ├─ retry once on E11000 (a concurrent upsert can race itself)
      └─ signed-in only: link the browser alias, collapse its guest row
```

- **Counted:** opening a record's details. **Not counted:** loading the dashboard,
  scrolling a pin past the viewport, zooming. That boundary is the whole point —
  "was the pin seen" is impression tracking, which is a different and more
  invasive feature.
- **Dedupe lives in the index, not in application logic.** "Has this viewer been
  counted? if not, insert" has a race that double-taps, retries, and offline
  replay will all find. A unique index cannot race with itself.
- **Crossing the sign-in boundary** (`viewer_aliases`): one person legitimately
  holds two keys (`anon:` then `user:`), and both are public reach. Collapsing the
  guest row for **that one record only** keeps them from counting twice.
- **Identity is deliberately weak:** an opaque random UUID in `localStorage`.
  Not IP (a barangay wifi is one public IP — an entire village would collapse into
  one viewer) and not MAC (unreadable by a browser). This measures **reach**, not
  audited headcount.
- **Retention:** 180 days from `lastViewedAt`; the alias carries the same window
  anchored on `linkedAt`.
- **Every read path returns counts only.** No function in the service layer can
  return a per-viewer list.

**Files:** `server/services/viewEventService.js`, `server/models/ViewEvent.js`,
`server/models/ViewerAlias.js`, `server/routes/views.js`,
`client/src/hooks/useRecordView.js`, `client/src/utils/viewerIdentity.js`,
`docs/view-reach.md` (full design rationale)

---

### BP-9 — Analytics read

- **Scoping:** `server/utils/analyticsScope.js` restricts every admin metric to the
  caller's municipality. Responder and reporter views get their own scoped shapes.
- **Backing:** `analyticsViewService.ensureAnalyticsView` creates a read-only
  MongoDB view over `reports`. If creation fails (restricted DB role), analytics
  **degrades to live aggregation** rather than failing the boot.
- **Public analytics** are sanitized separately (`server/utils/publicAnalytics.js`).

**Files:** `server/controllers/analyticsController.js`,
`server/services/analyticsViewService.js`, `server/utils/analyticsScope.js`

---

## 3. Background & runtime processes

### RP-1 — Dispatch escalation sweeper ⚠️ *the only timer in the application*

| | |
|---|---|
| **Trigger** | `setInterval`, started at boot by `startDispatchEscalationSweeper({ io })` |
| **Cadence** | every **30 s** (`sweepIntervalMs`) |
| **Batch** | 25 reports per pass (`sweepBatchSize`) |
| **Touches** | `Report.dispatch`, `Notification`, `User` |

**Why it exists.** SMS is out of scope, so every alert rides over IP. That only
works if silence is treated as failure — otherwise an alert no unit acknowledged is
indistinguishable from one that was handled.

**The loop:**

```
verify report
  → armDispatchAcknowledgement()   sets ackDeadlineAt = now + ackWindow (5 min)
sweeper every 30s
  → claim reports where nextEscalationAt <= now AND escalationCount < 3
  → re-page the municipality's admins + responders
  → Notification({ type: 'dispatch_escalated' })
  → nextEscalationAt = now + escalationInterval (5 min)
responder acknowledges
  → acknowledgeDispatch()   clears the clock
budget exhausted (3 escalations) → stop, and stay visible in the queue
```

**The fail-safe that matters:** `claimDispatchEscalation` is a **single atomic
`findOneAndUpdate`** whose filter only matches while the report is still due. Two
dynos sweeping at the same moment cannot double-escalate, and no lock or leader
election is needed. Overlapping passes in one process are skipped via a
`sweepInFlight` flag, and the timer is `unref()`-ed so it never holds the process open.

**All values env-overridable** (`DISPATCH_ACK_WINDOW_MINUTES`,
`DISPATCH_ESCALATION_INTERVAL_MINUTES`, `DISPATCH_MAX_ESCALATIONS`,
`DISPATCH_SWEEP_INTERVAL_MS`, `DISPATCH_SWEEP_BATCH_SIZE`), each falling back to a
safe default rather than trusting a malformed value.

**Files:** `server/services/dispatchEscalationService.js`, `server/config/dispatchPolicy.js`

---

### RP-2 — Evidence processing queue

- **Trigger:** `reportController` enqueues *after* the `201` has been sent.
- **Concurrency: exactly 1** (`EVIDENCE_PROCESSING_CONCURRENCY = 1`).
- **Why:** the pico face detector is synchronous main-thread JavaScript. More
  concurrency would only multiply memory and interleave reports — it would not
  process more per second.
- **Why a queue at all:** one photo cost ~10s, ~18–24s with EXIF rotation. Five
  photos could hold a request ~90s, past Heroku's 30s router timeout.
- **Failure is non-fatal:** while metadata is absent the public projection shows
  `processing`, so the UI never claims a redaction that has not been proven.

**Files:** `server/services/evidenceProcessingQueue.js`,
`server/services/backgroundTaskQueue.js`, `server/services/evidenceDerivativeService.js`

---

### RP-3 — Background task queue (generic)

- In-process FIFO with a concurrency bound; default 1.
- **Deliberately transport-free and DB-free** so it is unit-testable.
- Every task is `.catch`-ed into `onError` — a floating promise cannot crash the
  process. `drain()` awaits quiescence; `stats()` gives observability.

**Files:** `server/services/backgroundTaskQueue.js`

---

### RP-4 — Session rotation & cap

- **Cap:** at most **5 active sessions**. Creating a 6th revokes the oldest with
  reason `session_limit`.
- **Rotation:** `POST /api/auth/refresh` issues a new refresh token and marks the
  previous session `revokedAt` with reason `rotated`. A **30-second grace window**
  (`rotationGraceUntil`) lets in-flight concurrent requests finish instead of
  failing on a session that was valid when they started.
- **Revocation reasons:** `rotated`, `logout`, `logout_all`, `credential_change`,
  `session_limit`, `security_replay`.
- Storage is SHA-256 hashes only — a database dump does not yield usable tokens.

**Files:** `server/services/authSessionService.js`, `server/models/AuthSession.js`,
`server/config/authConfig.js`

---

### RP-5 — Notification expiry

- `Notification` carries a TTL index of **30 days**; the MongoDB TTL monitor
  sweeps roughly once a minute.
- Same mechanism for reach data (180 days) — see BP-8.
- **TTL is a deletion floor, not a hard cap:** a row may outlive its window by up
  to one sweep interval.

**Files:** `server/models/Notification.js`, `server/models/ViewEvent.js`

---

### RP-6 — Analytics view maintenance

- Runs **once per boot** via `ensureAnalyticsView(mongoose.connection)`.
- Never fails the boot: a restricted DB role degrades analytics to live
  aggregation instead.

**Files:** `server/services/analyticsViewService.js`, `server.js`

---

### RP-7 — Boot sequence

The real order, from `server.js` — worth knowing because several steps are
deliberately non-fatal:

```
1. validateRuntimeConfig(process.env)          ← FAIL-FAST, aborts the boot
2. attachSocketRedisAdapter(io)                ← only when REDIS_URL is set
3. connectDB()
4. initFaceDetector()                          ← warm the cascade (non-fatal)
5. seedMunicipalities / Admins / MunicipalAdmins / ResponderAccounts  (non-fatal)
6. BarangayBoundary readiness check            ← warns loudly if 0 polygons
7. HazardArea readiness check                  ← warns per missing dataset
8. ensureAnalyticsView()                       ← degrades, never aborts
9. startDispatchEscalationSweeper({ io })      ← RP-1
10. httpServer.listen(PORT)
```

Middleware order is equally load-bearing:
`trust proxy(1)` in prod → CORS → **compression (threshold 1024)** → `json 10mb` →
security headers → CSRF → routes → SPA → error handler.

**`/api/health` deliberately exposes readiness.** `boundaries.ready` and
`hazardLayers.ready` are surfaced because a missing dataset would otherwise answer
every pin with "no hazard here" — a false all-clear on a hazard map. A fresh DB
without polygons makes border reports `400` as ambiguous; the health endpoint is
how a deploy catches that.

**Scaling guard:** production refuses to boot with `WEB_CONCURRENCY > 1` and no
`REDIS_URL`, because in-memory rate limits and Socket.IO rooms would silently
diverge across dynos.

**Files:** `server/server.js`, `server/config/runtimeConfig.js`,
`server/config/scaling.js`, `server/config/clientApp.js`

---

### RP-8 — Socket room lifecycle

Rooms are joined **server-side** from the cookie identity in the `join` handler —
the client cannot ask for a room it is not entitled to:

| Room | Who joins |
|---|---|
| `user_${id}` | every authenticated socket |
| `reporters` | role `reporter` — redacted pending pins only |
| `municipality_${name}` | `municipal_admin` / `responder` with a matching assignment |
| `municipality_${name}_responders` | `responder` only |

- `joinMunicipality` / `joinResponderRoom` re-check the role **and** that
  `assignedMunicipality === municipalityCode`, emitting `authError` otherwise.
- Reporters deliberately never join municipality rooms — those stay operational-only.
- **Presence tracking was removed** (online-users map, `userOnline`/`userOffline`,
  `GET /api/admin/online-users`) as out of scope. The rooms now serve incident
  alerts only.

**Files:** `server/server.js`, `server/services/socketService.js`

---

### RP-9 — Accident-hotspot derivation

- **Trigger:** request-driven, from the Risk Zones layer read (`buildAccidentHotspotLayer`).
- **Source:** the system's own `reports` — no GIS file, no hand-placed geometry.
- **Counts only validated states:** `verified`, `transferred`, `responding`,
  `resolved`. `pending` and `rejected` never contribute.
- **Rule:** radius **100 m**, window **30 days**, medium at **3** reports, high at
  **6**, read ceiling **2000** reports.
- **Anchoring, not chaining:** a report joins a hotspot when it is within 100 m of
  that hotspot's *anchor* (its earliest report). This keeps every hotspot a bounded
  area whose drawn circle actually contains all its members.
- **Structural guards:** `mediumMinReports` can never fall below 2 — an
  "accident-prone area" made of one accident is a different and misleading claim,
  not a weaker version. `highMinReports` is forced above `mediumMinReports` so a
  cluster cannot be both classes at once.
- **Privacy:** the payload carries an anchor, a count and a class. Reporter,
  address, title, description and report ids are never selected — so there is no
  shape of this response that can leak one.
- **Expect an empty layer on a quiet island.** One or two validated reports
  classify nothing, by design.

**Files:** `server/utils/accidentHotspots.js`, `server/config/accidentHotspots.js`

---

## 4. Client-side async processes

### CP-1 — Stale-while-revalidate query cache

`client/src/utils/queryCache.js` is the single SWR store (TTL + `dedupedFetch` +
key-scoped entries).

| Cache key | TTL |
|---|---|
| `dashboard:operational:{muni}` / `dashboard:public:*` | 60s |
| `incident-queue:{role}:{view}:{status}:p{page}:q{search}` | 30s |
| `reporter-overview:{ownerId}` | 60s |
| `high-risk-zones:island-wide` | 300s |

- Fresh cache → **zero network** on back-navigation. Stale → instant render + silent
  refresh. No cache → spinner + fetch. A repeat skeleton is a bug.
- **Keys are always scoped.** Never mix municipalities or users in one key.
- **Explicit user actions bypass the fresh-cache shortcut** with `{ force: true }`;
  automatic mount fetches use the cache.
- **Socket events write through to the same keys**, so live data does not wait for
  a TTL.
- `clearQueryCache()` runs on logout / session-expire and before every test.
  Never assert network-call counts without accounting for the cache.

**Files:** `client/src/utils/queryCache.js`, `client/src/hooks/useIncidentReports.js`,
`client/src/hooks/useGlobalHighRiskZones.js`

---

### CP-2 — Offline report queue → see **BP-2b**

### CP-3 — Report draft autosave

- **Store:** `localStorage`, key `sibuyan-report-draft-v1`, **7-day** TTL.
- **Never stores photos or tokens** — fields only. Description ≤ 2000 chars,
  address ≤ 500, barangay ≤ 200, casualties 0–999.
- Deliberately **separate** from the IndexedDB queue: the draft holds a form that
  was never submitted (closed tab, failed validation, dead battery); the queue holds
  reports the reporter already submitted.
- `isDraftWorthy` avoids resurrecting pristine defaults. Expired, version-mismatched
  or corrupt drafts return `null`. Quota / private-mode errors fail silently.

**Files:** `client/src/utils/reportDraft.js`

---

### CP-4 — Connectivity & health polling

Two complementary signals — do not conflate them:

| Hook | Source | Cadence | Meaning |
|---|---|---|---|
| `useConnectivity` | `navigator.onLine` + `online`/`offline` events | on event | interface state |
| `useSystemHealth` | `GET /api/health` | **60s** + on mount | server liveness |

- `useConnectivity` is deliberately **not** a liveness probe: a captive portal reads
  online. It assumes online when the environment cannot report, because a false
  offline warning is worse than none.
- `useSystemHealth` starts optimistic (`'checking'` renders online) so the first
  paint is not a false alarm, and flips to `'degraded'` only on a confirmed failure.

**Files:** `client/src/hooks/useConnectivity.js`, `client/src/hooks/useSystemHealth.js`

---

### CP-5 — Service worker cache scoping

- `/sw.js` registered eagerly at app start, scope `/`, `updateViaCache: 'none'`.
- Messages: `set-cache-scope`, `clear-caches`, `set-push-config`, `skip-waiting`.
- **Privacy constraint:** `setCacheScope(null)` on logout. Without it, a logged-out
  device could read the previous account's cached incidents.
- Avoids `navigator.serviceWorker.ready` (which never settles in some states); all
  failures degrade offline support, never block the app.

**Files:** `client/src/services/serviceWorker.js`, `client/public/sw.js`

---

### CP-6 — Lazy chunk retry

- **Trigger:** a dynamic import rejects with a chunk-load error — the normal
  consequence of a deploy replacing Vite's hashed chunks.
- **Strategy:** retry the import once; on a second failure force one same-document
  navigation, **once per session** (guard key `sibuyan-chunk-reload-v1` in
  `sessionStorage`, expires after 10 min).
- **Why the cap:** without it, a genuinely offline device would reload forever
  instead of degrading to the ErrorBoundary.

**Files:** `client/src/utils/lazyWithRetry.js`, `client/src/App.jsx`

---

### CP-7 — Protected blob cache

- In-memory LRU, **50 entries** (`DEFAULT_MAX_CACHE_SIZE`), evicting oldest and
  calling `URL.revokeObjectURL`.
- Single-flight dedup via an in-flight `Map` — concurrent opens share one request.
- **Only** `/api/files` or protected-original URLs are accepted; non-Blob payloads
  are rejected (a CDN/WAF can return HTML with a `200`).
- `clearBlobCache()` is mandatory on logout, account switch, and session expiry.

**Files:** `client/src/utils/blobCache.js`

---

### CP-8 — On-device selfie face detection

- **Entirely on-device — nothing is uploaded.** The server re-checks independently.
- Scan interval **100 ms**; auto-capture after a valid face stays stable for
  **2200 ms**; **2500 ms** cooldown afterwards.
- Frame downscaled to **320 px** for sub-10 ms scans; prefers the native
  `FaceDetector` API and falls back to the pico cascade at `/cascades/facefinder`.
- Quality gates: confidence ≥ 4.5, size ratio 0.22–0.78, centre tolerance
  X 0.16 / Y 0.18, minimum brightness 30.

**Files:** `client/src/hooks/useSelfieFaceDetection.js`,
`client/src/utils/selfieFaceDetector.js`

---

### CP-9 — Reach view recording → see **BP-8**

---

## 5. Tunable constants — one place

Every number below is env-overridable or config-centralised. If you change one,
check its companion (noted in the comments) — several are paired.

| Constant | Value | Where |
|---|---|---|
| Access token TTL | 15 min | `server/config/authConfig.js` |
| Refresh session TTL | 7 days | `server/config/authConfig.js` |
| Active session cap | 5 | `authSessionService.js` |
| Rotation grace window | 30 s | `authSessionService.js` |
| bcrypt cost | 12 | `authController.js` |
| Password max UTF-8 bytes | 72 | `server/utils/passwordPolicy.js` |
| Dispatch ack window | 5 min | `server/config/dispatchPolicy.js` |
| Dispatch escalation interval | 5 min | `server/config/dispatchPolicy.js` |
| Dispatch max escalations | 3 | `server/config/dispatchPolicy.js` |
| Sweep interval / batch | 30 s / 25 | `server/config/dispatchPolicy.js` |
| Evidence queue concurrency | 1 | `evidenceProcessingQueue.js` |
| Duplicate window / radius / max | 60 min / 250 m / 5 | `server/utils/duplicateDetection.js` |
| Hotspot radius / window | 100 m / 30 d | `server/config/accidentHotspots.js` |
| Hotspot medium / high | 3 / 6 | `server/config/accidentHotspots.js` |
| Hotspot read ceiling | 2000 | `server/config/accidentHotspots.js` |
| Reach retention | 180 days | `server/models/ViewEvent.js` |
| Notification TTL | 30 days | `server/models/Notification.js` |
| Query `maxTimeMs` | 5000 | `server/config/queryPolicy.js` |
| Page size default / max | 50 / 100 | `server/config/queryPolicy.js` |
| API cache entries | 500 | `server/utils/apiCache.js` |
| Report submit timeout | 60 s | `client/src/config/reportSubmission.js` |
| Queue sending-stale lease | 120 s | `client/src/config/reportSubmission.js` |
| Offline retry base / factor / max | 15 s / ×2 / 300 s | `client/src/config/reportSubmission.js` |
| Report draft TTL | 7 days | `client/src/config/reportSubmission.js` |
| Blob cache size | 50 | `client/src/utils/blobCache.js` |
| Health poll interval | 60 s | `useSystemHealth.js` |
| Upload progress throttle | 250 ms | `client/src/utils/progressThrottle.js` |
| Selfie scan / stability / cooldown | 100 / 2200 / 2500 ms | `useSelfieFaceDetection.js` |
| Satellite max zoom | 16 | `client/src/config/mapProvider.js` |
| Street (OSM fallback) max zoom | 19 | `client/src/config/mapProvider.js` |

---

## 6. Verified state & how to re-verify

```bash
# Full suite (root) — ~5 min
npm test

# Individually
npm run test:client      # 102 files / 1062 tests
npm run test:server      # 60 files / 462 tests
npm run lint             # oxlint --deny-warnings, must be 0/0
npm run build            # production client bundle
```

Last run: **2026-09-22 — 162 files / 1524 tests, all passing; lint clean.**

---

## 7. Known documentation drift

`CODEBASE_CONTEXT.md` is largely accurate but has fallen behind the code in these
specific places. Fix these when you touch that file:

| Location | Says | Actually |
|---|---|---|
| §1 axiom 6 | 153 files / 1383 tests | 162 / 1524 |
| §18.1 | 109 files / 793 tests | 162 / 1524 |
| §10.3, §11.14 | derivative version `3.2`, `rv=3.2` | **`3.4`**, `public_soft_blur` |
| §12 | Chains 1–7 only | missing offline sync, reach, escalation, duplicate detection, hotspot derivation |
| §15 | no `/api/views` | `POST /api/views`, `GET /api/views/reach` |
| §3 tree | no `config/dispatchPolicy.js`, `config/queryPolicy.js`, `config/scaling.js`, `services/*Queue.js`, `services/previewService.js`, `services/viewEventService.js`, `models/ViewEvent.js`, `models/ViewerAlias.js` | all present and live |
| — | no client offline/draft/connectivity docs | `offlineReportQueue.js`, `useOfflineReportSync.js`, `reportDraft.js`, `useConnectivity.js`, `useSystemHealth.js`, `viewerIdentity.js`, `lazyWithRetry.js`, `blobCache.js`, `progressThrottle.js`, `selfieFaceDetector.js` |

Two of these are worth correcting on sight, because both are load-bearing:

1. **The evidence version.** Code that reads `rv=3.2` from the doc will not match
   the endpoint the server actually serves.
2. **The test counts.** A stale count is how a deleted test suite goes unnoticed.
