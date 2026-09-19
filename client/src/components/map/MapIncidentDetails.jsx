import { useEffect, useState } from 'react';
import {
    HiOutlineChevronUp,
    HiOutlineExclamationCircle,
    HiOutlineLockClosed,
    HiOutlinePhotograph,
} from 'react-icons/hi';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import useRecordView from '../../hooks/useRecordView';
import { formatIncidentLabel, getIncidentDetailViewModel, getTransferLine, normalizeCasualties } from '../../utils/incidentDetails';
import { getIncidentVisibilityRules } from '../../utils/incidentDetailsVisibility';
import { getMapCoordinates } from '../../utils/mapReports';
import { formatIncidentTime, formatIncidentRelativeTime } from '../../utils/dateTimeUtils';
import { getMapSeverityConfig, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import Button from '../ui/Button';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import ImageViewer from '../ui/ImageViewer';
import { Skeleton } from '../ui/Skeleton';

/*
 * This sheet's visual grammar, in three pieces:
 *
 *   1. state is a chip — status and severity, side by side under the title,
 *      because they are the two facts a reader triages on and both already have
 *      a colour that means them elsewhere in the app;
 *   2. facts are label-over-value, spaced between rows rather than ruled between
 *      cells, so every value keeps the width it needs and a long one still owns
 *      its own line (see OverviewRow);
 *   3. everything below the facts steps down in size and weight rather than being
 *      boxed — this sheet is already inside a panel, and a card per section made
 *      it read as a stack of cards instead of as one record.
 *
 * Groups are separated by space, not by a line per boundary. Each section here
 * used to open with its own rule over an 8-12px pad, in a stack that already
 * spaced them apart: the border and the gap said the same thing, and the section
 * heading said it again. The overview's rows were ruled the same way, one
 * hairline per fact, until the pane read as a table laid over a brief. What is
 * left is the structure that is not spacing: the casualty band's own edge, the
 * safety callout, and the sticky action bar's boundary.
 *
 * Status and severity both come from the shared lookups the record rows, queue
 * tabs and map legend read, so one incident cannot be described in two colours
 * on one screen.
 */

/* One fact: its label, then the value under it. The label steps down in size and
   weight (not in colour alone), so a column of them still reads as labels. */
const DetailItem = ({ label, value, children, mono = false }) => (
    <div className="min-w-0">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className={`mt-0.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100 ${mono ? 'font-mono tabular-nums whitespace-nowrap' : ''}`}>
            {children || value || 'Not specified'}
        </dd>
    </div>
);

/* A logical row of the overview: two short facts share a line, a long one owns
   the whole row.

   Rows are separated by their own padding rather than by a rule between them.
   A hairline per fact made a ruled table of what is really a list of labelled
   values — every row already opens with the same 10px uppercase label, so the
   reader gets the boundary from the type, and the pane gets it from the gap. */
const OverviewRow = ({ children, wide = false }) => (
    <div className={`grid gap-x-4 py-2.5 ${wide ? 'grid-cols-1' : 'grid-cols-2'}`}>{children}</div>
);

/* Casualty figures: label over numeral. Every cell is a numeral — a figure that
   was never recorded prints 0, in the same face and at the same size as a
   recorded one, so the three counts read as one row of numbers. The written
   fallback it replaces ("Not recorded") had to be set two steps down to fit this
   ~78px column, which is exactly what made one cell look like a caption beside
   two figures. A figure nobody entered is not a different kind of figure to the
   reader of a summary.

   What is *not* changed is the record: `casualties.*` still stores null for "not
   recorded" and the CSV export still writes that word (see formatCasualtyMetric
   and the casualties note on the Report model). The card answers "how many" with
   a number; the data keeps the difference.

   Colour follows the figure: a non-zero count takes the warm ramp this app
   already uses for severity, and a zero steps down to the muted grey instead of
   holding the same weight as a real casualty. A row of three counts where the
   zeros read as loudly as the fatalities is a row that has to be read twice.

   The grey is slate-500 rather than slate-400: this band is tinted by the
   record's worst figure (red-50, amber-50 or grey-50), and slate-400 measures
   about 2.3:1 on that tint, under the 3:1 large-text floor. slate-500 keeps the
   figure quiet at ~4.3:1, which is the point of muting it — quieter, not faint. */
const CASUALTY_NUMERAL_TONES = {
    injured: 'text-amber-700 dark:text-amber-300',
    fatalities: 'text-red-700 dark:text-red-300',
    missing: 'text-orange-700 dark:text-orange-300',
};
const ZERO_NUMERAL_TONE = 'text-slate-500 dark:text-slate-400';

const CasualtyStat = ({ label, count, toneKey }) => {
    // null / undefined / blank / unparseable all land here as 0.
    const value = typeof count === 'number' ? count : 0;

    return (
        <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {label}
            </dt>
            <dd className={`mt-1 font-display text-[22px] font-bold leading-none tabular-nums ${value > 0 ? CASUALTY_NUMERAL_TONES[toneKey] : ZERO_NUMERAL_TONE}`}>
                {value}
            </dd>
        </div>
    );
};

/* The band the casualty figures sit in: a wash that reports the record's worst
   figure, so "is anyone hurt" is answerable without reading three numbers. All
   zeros stay neutral — an empty row is not an emergency. */
const getCasualtyBandTone = ({ fatalitiesNum = 0, injuredNum = 0, missingNum = 0 } = {}) => {
    if (fatalitiesNum > 0) return 'border-red-100 bg-red-50/60 dark:border-red-500/20 dark:bg-red-500/[0.07]';
    if (injuredNum > 0 || missingNum > 0) return 'border-amber-100 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.07]';
    return 'border-gray-100 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.03]';
};

const MapIncidentDetailsSkeleton = () => (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5" role="status" aria-busy="true" aria-label="Loading incident brief">
        <span className="sr-only">Loading incident brief</span>
        {/* Header status line */}
        <Skeleton variant="text" className="h-3.5 w-40 rounded" />
        {/* Title & Ref */}
        <div className="space-y-1.5">
            <Skeleton variant="text" className="h-6 w-4/5 rounded-lg" />
            <Skeleton variant="text" className="h-3.5 w-1/3 rounded" />
        </div>
        {/* Overview dl grid */}
        <div className="space-y-3">
            <Skeleton variant="text" className="h-3.5 w-24" />
            <div className="grid grid-cols-2 gap-3 pt-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-1">
                        <Skeleton variant="text" className="h-2.5 w-16" />
                        <Skeleton variant="text" className="h-3.5 w-24" />
                    </div>
                ))}
            </div>
            {/* Casualty summary 3-column */}
            <div className="space-y-2">
                <Skeleton variant="text" className="h-2.5 w-28" />
                <div className="grid grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-1">
                            <Skeleton variant="text" className="h-2 w-12" />
                            <Skeleton variant="text" className="h-5 w-6 mt-1" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const MapIncidentDetails = ({
    report,
    viewerRole = 'guest',
    viewer = null,
    isOwner: explicitIsOwner = false,
    isOperational: explicitIsOperational = false,
    canRespond = false,
    canResolve = false,
    canVerify = false,
    canReject = false,
    actionLoading = false,
    onRespond,
    onResolve,
    onVerify,
    onReject,
    onToggleExpand,
    onClose: _onClose,
    onBack,
    onViewImage,
}) => {
    const operational = useOperationalIncidentDetails(report, viewerRole);
    const displayedReport = operational.report || report;
    const details = getIncidentDetailViewModel(displayedReport);
    const [viewerItem, setViewerItem] = useState(null);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const isDescriptionLong = Boolean(details.description && details.description.length > 120);

    const incidentId = displayedReport?._id || displayedReport?.id;

    // Reach: this sheet mounts only when an incident's details are opened, so
    // mounting IS the view. The grouped-location modal is deliberately not
    // instrumented — it shows a list, not one record, so there is no single
    // target whose reach it could honestly describe.
    useRecordView({ targetType: 'report', targetId: incidentId });

    useEffect(() => {
        setViewerItem(null);
        setIsDescriptionExpanded(false);
    }, [incidentId]);

    if (!displayedReport && !operational.loading) {
        return (
            <div className="px-4 py-8 text-center sm:px-5">
                <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                    Incident brief is unavailable.
                </p>
            </div>
        );
    }

    if (operational.loading && !displayedReport) {
        return <MapIncidentDetailsSkeleton />;
    }

    const ownsReport = Boolean(
        explicitIsOwner
        || (viewerRole === 'reporter' && (displayedReport?.isOwnedByCurrentUser || details.isOwnedByCurrentUser))
    );

    const visibility = getIncidentVisibilityRules({
        viewerRole,
        report: displayedReport,
        isOwner: ownsReport,
    });

    const isOperational = explicitIsOperational || operational.isOperationalViewer || visibility.isOperational;
    const hasActions = Boolean(canRespond || canResolve || canVerify || canReject);

    const normalizedCasualties = normalizeCasualties(displayedReport?.casualties);
    const { injured, fatalities, missing, injuredNum, fatalitiesNum, missingNum, isAllZeroOrUnrecorded } = normalizedCasualties;

    const evidenceDescriptor = displayedReport?.evidence;
    const effectiveViewerAccess = visibility.viewerAccess;
    const isOriginalAllowed = effectiveViewerAccess === 'original';

    const rawEvidenceItems = Array.isArray(evidenceDescriptor?.items)
        ? evidenceDescriptor.items
        : Array.isArray(evidenceDescriptor) && evidenceDescriptor.length > 0
            ? evidenceDescriptor
            : isOriginalAllowed && Array.isArray(displayedReport?.images)
                ? displayedReport.images
                : [];

    const declaredEvidenceCount = Number(evidenceDescriptor?.evidenceCount ?? evidenceDescriptor?.count ?? displayedReport?.evidenceCount);
    const totalEvidenceCount = Math.max(
        Number.isFinite(declaredEvidenceCount) && declaredEvidenceCount > 0 ? Math.floor(declaredEvidenceCount) : 0,
        rawEvidenceItems.length,
    );

    const mapCoords = getMapCoordinates(displayedReport);
    const exactCoordinatesText = (visibility.showCoordinates && mapCoords)
        ? `${mapCoords.lat.toFixed(6)}, ${mapCoords.lng.toFixed(6)}`
        : null;

    const respondingAgencies = details.respondingAgencies.length > 0
        ? details.respondingAgencies
        : displayedReport?.respondedBy?.agency
            ? [displayedReport.respondedBy.agency]
            : displayedReport?.responderAgency
                ? [displayedReport.responderAgency]
                : [];

    const lastUpdatedText = details.updatedAt ? ` Last updated ${formatIncidentRelativeTime(details.updatedAt)}.` : '';

    const hasPrivacySafePreview = !isOperational && !ownsReport && totalEvidenceCount > 0;
    const isUnverifiedCommunityReport = !isOperational && !ownsReport && displayedReport?.status === 'pending';
    let privacyNotice = '';
    if (isOperational) {
        privacyNotice = 'This operational view contains protected incident information. Access to original evidence and sensitive coordination details is restricted by role.';
    } else if (ownsReport && isOriginalAllowed) {
        privacyNotice = `This is verified public safety information. Sensitive responder identities and internal coordination details are protected.${lastUpdatedText}`;
    } else if (isUnverifiedCommunityReport) {
        privacyNotice = `This is an unverified community report awaiting municipal verification. Treat details as unconfirmed. Personal identities and original evidence are protected.${lastUpdatedText}`;
    } else if (hasPrivacySafePreview) {
        privacyNotice = `This is verified public safety information. Personal identities and original evidence are protected. A privacy-safe preview may be shown.${lastUpdatedText}`;
    } else {
        privacyNotice = `This is verified public safety information. Personal identities, evidence, and internal coordination details are protected.${lastUpdatedText}`;
    }

    const severityLabel = details.severity
        ? details.severity.charAt(0).toUpperCase() + details.severity.slice(1).toLowerCase()
        : 'Moderate';

    const incidentTypeLabel = formatIncidentLabel(
        displayedReport?.incidentType || displayedReport?.accidentType || displayedReport?.incidentCategory,
    );

    const respondingAgencyText = respondingAgencies.length > 0 ? respondingAgencies.join(', ') : 'Awaiting assignment';
    const transferLine = getTransferLine(displayedReport, {
        assignedMunicipality: viewer?.assignedMunicipality,
        isOwner: ownsReport,
    });
    const transferMatch = transferLine.match(/^Transferred\s+(to|from)\s+(.+)$/i);
    const transferDetail = transferMatch
        ? { label: `Transferred ${transferMatch[1].toLowerCase()}`, value: transferMatch[2] }
        : null;

    // State, from the shared lookups: an unrecognised status falls back to
    // `verified` and an unrecorded severity to `moderate`, which is how the rest
    // of the app presents both.
    const statusConfig = MAP_STATUS_CONFIG[details.status] || MAP_STATUS_CONFIG.verified;
    const severityConfig = getMapSeverityConfig(details.severity);
    // Whether the record actually carries a description, as opposed to the view
    // model's placeholder sentence for a missing one. Derived here rather than in
    // the shared view model so the placeholder keeps its one owner (and its
    // tests) while this sheet can still present an absence as an absence.
    const hasReportedDescription = Boolean(displayedReport?.description?.trim());
    // Whether there is anything for the gallery to show. Counted from both the
    // declared count and the items the viewer may see, so a redacted preview and
    // an operational original are both "there is evidence".
    const hasEvidenceToShow = totalEvidenceCount > 0 || rawEvidenceItems.length > 0;

    return (
        <div className="flex flex-col">
            <div className="space-y-4 px-4 py-3.5 sm:px-5 sm:py-4">
                {/* 1. Incident Brief */}
                <div>
                    {typeof onBack === 'function' && (
                        <div className="pb-2">
                            <button
                                type="button"
                                onClick={onBack}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                            >
                                <span>&larr;</span>
                                <span>Back to active incidents</span>
                            </button>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Incident brief
                        </span>
                        {details.id && (
                            // The reference is what a reader quotes back to the
                            // office, so it is a chip in tabular mono rather than
                            // the faintest text in the header. The last six
                            // characters are the readable form; the full id is on
                            // the tooltip for anyone who needs it.
                            <span
                                className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                                title={`Reference number ${String(details.id).toUpperCase()}`}
                            >
                                Ref: #{String(details.id).slice(-6).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* The title is the incident's name, at the size a name is
                        read at — one step up from the body type below it, and
                        still breakable for a long one. */}
                    <h3 className="mt-1.5 font-display text-[17px] font-bold leading-snug text-gray-950 break-words sm:text-lg dark:text-white">
                        {details.title}
                    </h3>

                    {/* State, as two chips: the lifecycle stage and the gravity,
                        each on the colour that already means it in this app (see
                        the note at the top of this file). The words are the same
                        ones this sheet printed before — the chip changes how they
                        are carried, not what they say. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusConfig.badge}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusConfig.dot}`} />
                            <span className="capitalize">{details.status}</span>
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${severityConfig.badge}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${severityConfig.dot}`} />
                            <span>{severityLabel}</span>
                        </span>
                        {details.status === 'pending' && (
                            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                Awaiting verification
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Peek Affordance */}
                {onToggleExpand && (
                    <div className="sm:hidden pt-0.5">
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="flex w-full items-center justify-between gap-2 py-2 text-xs font-semibold text-brand-700 dark:text-sky-400 cursor-pointer"
                            aria-label="Expand full incident brief"
                        >
                            <span>Swipe up for incident details</span>
                            <HiOutlineChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </button>
                    </div>
                )}

                {/* Error Banner */}
                {operational.error && (
                    <div className="flex flex-col gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <span>{operational.error}</span>
                        {operational.retryable && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                {/* 2. Overview: the record's facts, then its human cost. */}
                <section aria-labelledby="map-incident-overview-heading">
                    <h4 id="map-incident-overview-heading" className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                        Overview
                    </h4>

                    {/* Short facts share a row; a fact whose value is too long for
                        half this pane (a timestamp, a coordinate pair, an agency
                        list) takes the whole row instead. That is what keeps every
                        value on one line: what used to wrap was never the layout,
                        it was "Sep 18, 2026, 7:15" breaking before "AM". */}
                    <dl>
                        <OverviewRow>
                            <DetailItem label="Incident type">
                                <span className="capitalize">{incidentTypeLabel}</span>
                            </DetailItem>
                            <DetailItem label="Severity">
                                <span className="capitalize">{details.severity || 'Moderate'}</span>
                            </DetailItem>
                        </OverviewRow>
                        <OverviewRow wide>
                            <DetailItem label="Incident time" value={formatIncidentTime(details.incidentTime)} />
                        </OverviewRow>
                        <OverviewRow wide>
                            <DetailItem label="Submitted time" value={formatIncidentTime(displayedReport?.createdAt)} />
                        </OverviewRow>
                        <OverviewRow>
                            <DetailItem label="Barangay" value={details.barangay || 'Not specified'} />
                            <DetailItem label="Municipality" value={details.municipality || 'Sibuyan Island'} />
                        </OverviewRow>
                        {transferDetail && (
                            <OverviewRow wide>
                                <DetailItem label={transferDetail.label} value={transferDetail.value} />
                            </OverviewRow>
                        )}
                        {respondingAgencyText && (
                            <OverviewRow wide>
                                <DetailItem label="Responding agency">
                                    {respondingAgencyText}
                                </DetailItem>
                            </OverviewRow>
                        )}
                        {exactCoordinatesText && (
                            <OverviewRow wide>
                                <DetailItem label="Exact coordinates" mono>
                                    {exactCoordinatesText}
                                </DetailItem>
                            </OverviewRow>
                        )}
                    </dl>

                    {/* Casualty summary — the one band in the pane, because it is
                        the one group of facts that belongs together: three figures
                        answering a single question about the people involved. */}
                    <div className={`mt-2.5 rounded-lg border p-2.5 ${getCasualtyBandTone({ fatalitiesNum, injuredNum, missingNum })}`}>
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Casualty summary
                        </h5>

                        <dl className="mt-2 grid grid-cols-3 gap-2">
                            <CasualtyStat label="Injured" count={injured} toneKey="injured" />
                            <CasualtyStat label="Fatalities" count={fatalities} toneKey="fatalities" />
                            <CasualtyStat label="Missing" count={missing} toneKey="missing" />
                        </dl>

                        {isAllZeroOrUnrecorded && typeof injured !== 'number' && typeof fatalities !== 'number' && typeof missing !== 'number' && (
                            <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                                No casualty information recorded.
                            </p>
                        )}
                    </div>
                </section>

                {/* 3. Safety Indicators (if any) */}
                {details.safetyIndicators.length > 0 && (
                    <section className="rounded-lg border border-amber-200/80 bg-amber-50/60 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20" aria-labelledby="map-safety-indicators-heading">
                        <h4 id="map-safety-indicators-heading" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                            <HiOutlineExclamationCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {isOperational ? 'Critical incident indicators' : 'Public safety indicators'}
                        </h4>
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {details.safetyIndicators.map((indicator) => (
                                <li
                                    key={indicator}
                                    className="rounded border border-amber-300/80 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-amber-950 shadow-2xs dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200"
                                >
                                    {indicator}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* 4. Clamped Description */}
                {details.description && (
                    <section aria-labelledby="map-incident-description-heading">
                        <h4 id="map-incident-description-heading" className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {isOperational ? 'Operational description' : 'Description'}
                        </h4>
                        {/* A placeholder sentence is set as the absence it is: same
                            words, one step down in contrast, so an empty field
                            cannot be mistaken for reported content. */}
                        <p className={`whitespace-pre-wrap break-words text-xs leading-relaxed ${hasReportedDescription ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500'} ${!isDescriptionExpanded && isDescriptionLong ? 'line-clamp-3' : ''}`}>
                            {details.description}
                        </p>
                        {isDescriptionLong && (
                            <button
                                type="button"
                                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                                className="mt-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                            >
                                {isDescriptionExpanded ? 'Show less' : 'Read more'}
                            </button>
                        )}
                    </section>
                )}

                {/* 5. Evidence Photos */}
                <section aria-labelledby="map-incident-evidence-heading">
                    <h4 id="map-incident-evidence-heading" className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        <span>
                            {totalEvidenceCount > 0
                                ? ownsReport && isOriginalAllowed
                                    ? `Your evidence photos · ${totalEvidenceCount}`
                                    : effectiveViewerAccess === 'redacted'
                                        ? `Evidence preview · ${totalEvidenceCount}`
                                        : `Evidence photos · ${totalEvidenceCount}`
                                : 'Evidence photos'}
                        </span>
                    </h4>

                    {hasEvidenceToShow ? (
                        <div>
                            <ProtectedEvidenceGallery
                                images={isOriginalAllowed ? (displayedReport?.images || []) : []}
                                evidence={evidenceDescriptor}
                                accessLevel={effectiveViewerAccess}
                                isOwner={ownsReport && isOriginalAllowed}
                                isOperational={isOperational}
                                variant="stacked"
                                onViewImage={onViewImage || ((item) => setViewerItem(item))}
                            />
                        </div>
                    ) : (
                        // A line, not a tile: a bordered box holding the words "No
                        // evidence attached." is a container for nothing, inside a
                        // pane that is already a container. The words are the ones
                        // the gallery itself prints, so nothing about the state
                        // changes — only that it no longer draws a card around it.
                        <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <HiOutlinePhotograph className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            No evidence attached.
                        </p>
                    )}
                </section>

                {/* 6. Static Privacy & Security Notice */}
                {/* System information, set as system information: a lock and the
                    sentence. It used to open with a rule, which made the
                    quietest thing in the pane the one with a border over it.
                    Every wording branch below is unchanged — this is the pane
                    explaining what it is allowed to show. */}
                <div className="flex items-start gap-2.5">
                    <HiOutlineLockClosed className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{privacyNotice}</p>
                </div>
            </div>

            {/* 7. Sticky Actions Footer */}
            {hasActions && (
                <div className="z-10 border-t border-gray-200/80 bg-gray-50/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-white/[0.03] sm:px-5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {canVerify && (
                            <Button
                                onClick={() => onVerify?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Verify report
                            </Button>
                        )}

                        {canReject && (
                            <Button
                                variant="dangerOutline"
                                onClick={() => onReject?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Reject report
                            </Button>
                        )}

                        {canRespond && (
                            <Button
                                onClick={() => onRespond?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Respond to incident
                            </Button>
                        )}

                        {canResolve && (
                            <Button
                                variant="secondary"
                                onClick={() => onResolve?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Review resolution
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {!onViewImage && (
                <ImageViewer
                    isOpen={Boolean(viewerItem)}
                    item={viewerItem}
                    onClose={() => setViewerItem(null)}
                    entityLabel="Evidence photo"
                />
            )}
        </div>
    );
};

export default MapIncidentDetails;
