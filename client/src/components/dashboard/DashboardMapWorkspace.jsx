import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
    HiChevronRight,
    HiOutlineBadgeCheck,
    HiOutlineCollection,
    HiOutlineArrowLeft,
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineExclamationCircle,
    HiOutlineFilter,
    HiOutlineLightningBolt,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';
import { Link } from '../../router';
import MapView from '../map/MapView';
import MapIncidentDetails from '../map/MapIncidentDetails';
import HighRiskZoneDetails from '../map/HighRiskZoneDetails';
import MapOverlayPanel, { PANEL_SHEET_MEDIA_QUERY } from '../map/MapOverlayPanel';
import MapMobileFilterSheet from './MapMobileFilterSheet';
import Button from '../ui/Button';
import { SkeletonRow } from '../ui/Skeleton';
import {
    getFilteredMapReports,
    getMapCoordinates,
    getVisibleMapReports,
} from '../../utils/mapReports';
import { scheduleElementScroll } from '../../utils/mapNavigation';
import { toSafeArray, safeCount, normalizeMunicipalityKey, getEntityKey } from '../../utils/safeCollection';
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { getMapRiskTypeConfig, getMapSeverityConfig, MAP_ACTIVE_INCIDENT_CONFIG, MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import { getMapExperience } from '../../config/mapExperience';
import { getReportIncidentTypeLabel } from '../../config/incidentTypes';
import { getMunicipalityMapFocus } from '../../utils/sibuyanLocations';
import { buildActiveIncidentsSummary, buildReporterPendingSummary, countOwnedReports } from '../../utils/dashboardReports';

const STATUS_CONFIG = MAP_STATUS_CONFIG;
const MAP_SUMMARY_PANEL_ID = 'dashboard-map-summary-panel';
const OVERVIEW_PANEL_PREFIX = 'overview:';

/**
 * Whether the summary pane is currently a sheet standing over the map.
 *
 * Read at click time from the panel's own media query, so the two can never
 * disagree about the width where the pane stops sitting beside the canvas. The
 * Locate actions below collapse the pane only where it covers the map they just
 * moved: on a wider screen the records stay exactly as the viewer left them,
 * because hiding the list they clicked from is a view reset the camera move
 * never asked for. Falls back to the width comparison when `matchMedia` is
 * unavailable.
 */
const isSummaryPaneSheetViewport = () => {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function') return window.matchMedia(PANEL_SHEET_MEDIA_QUERY).matches;
    return window.innerWidth < 640;
};

/**
 * The phone map's frame: a 4:3 canvas whose height comes from its own width.
 *
 * It used to be a fraction of the viewport (52svh held between 320px and 440px),
 * which on a tall phone produced a portrait canvas — ~443px of height over ~325px
 * of width, a map stretched the wrong way round for reading terrain and how an
 * incident set spreads across it. A ratio cannot do that: the map is 4:3 at
 * every phone width, so it stays wide and balanced, and its height follows the
 * layout instead of the viewport's shape. At a 393x852 viewport that is ~259px;
 * at the ~322px content width this was measured against, ~241px.
 *
 * It also decouples the map from the viewport's height on purpose: the map is
 * drawn from its width alone, so the same phone shows the same map whatever
 * chrome the browser adds or removes above it.
 *
 * From sm the frame is the flat 460px it has always been, and at lg it takes the
 * column's remaining height — `aspect-auto` at both, because a ratio cannot
 * coexist with a height the layout sets (see the frame below).
 */
const PHONE_MAP_FRAME_CLASSES = 'aspect-[4/3] w-full';

/**
 * The records pane's box on a phone, while something is open in it.
 *
 * Deliberately no longer the map's frame. The two boxes are one at sm and up,
 * where the pane stands in the column beside the map: there a pane taller than
 * the map would paint past the canvas it describes, which is the whole reason
 * they were tied together. On a phone the box stands BELOW the map (see the
 * mobile order on the row below), so that constraint does not apply — and the
 * pane keeps the height a records list needs instead of inheriting a canvas
 * ratio: 52svh held between 320px and 440px, which is where the list, its queue
 * rail and its header all fit. Unchanged from the frame it used to share, so
 * nothing about opening a card behaves differently than it did.
 */
const PHONE_PANE_BOX_CLASSES = 'h-[52svh] min-h-[320px] max-h-[440px]';

const formatDate = (value, pattern = 'MMM d, h:mm a') => {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : format(date, pattern);
};

const formatIncidentType = (report) => getReportIncidentTypeLabel(report);

/**
 * Nothing to list.
 *
 * The icon tile is neutral on purpose, even when the set that opened this pane
 * has a tone of its own: "no active incidents" is not a state, it is the
 * absence of one, and painting it amber or red would say something is wrong
 * where nothing is. The copy still names which set is empty.
 */
const EmptyState = ({ title, description, icon: Icon = HiOutlineCheckCircle }) => (
    <div className="px-4 py-10 text-center sm:px-5">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400 ring-1 ring-gray-200/70 dark:bg-white/5 dark:text-gray-500 dark:ring-white/10">
            <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="mt-3 text-[13px] font-semibold text-gray-950 sm:text-sm dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-[34ch] text-xs leading-relaxed text-gray-600 dark:text-gray-500">{description}</p>
    </div>
);

const IncidentList = ({ reports = [], emptyTitle, emptyDescription, onLocate, canLocate, onInspect, currentUserId = null, showOwnershipBadge = false }) => {
    const safeReports = toSafeArray(reports);
    if (safeReports.length === 0) {
        return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {safeReports.map((report, index) => {
                const status = STATUS_CONFIG[report?.status] || STATUS_CONFIG.pending;
                // MVP reporter-friendly: "Transferred" is operational jargon.
                // Reporters see "Coordinated" with the same dot color.
                const isTransferred = report?.status === 'transferred';
                const statusLabel = showOwnershipBadge && isTransferred ? 'Coordinated' : status.label;
                const coordinates = getMapCoordinates(report);
                const locateAvailable = Boolean(coordinates && onLocate && (!canLocate || canLocate(report)));
                const location = report?.address || report?.title || report?.barangay || report?.municipalityName || 'Location unavailable';
                // Only a record that carries a severity gets one printed — see the
                // supporting line below.
                const severity = report?.severity ? getMapSeverityConfig(report.severity) : null;
                const ownerId = report?.reporter && typeof report.reporter === 'object'
                    ? report.reporter._id ?? report.reporter.id
                    : report?.reporter ?? report?.reporterId ?? report?.ownerId ?? null;
                const isOwned = showOwnershipBadge && Boolean(currentUserId && ownerId && String(ownerId) === String(currentUserId))
                    || (showOwnershipBadge && report?.isOwnedByCurrentUser === true);
                return (
                    <article key={getEntityKey(report, `report-${index}`)} className="group px-4 py-3.5 transition-colors hover:bg-gray-50 sm:px-5 dark:hover:bg-white/[0.02]">
                        <div className="min-w-0">
                            {/* The place names the row; everything under it is
                                supporting detail, stepped down by size, weight and
                                colour rather than by a third container. */}
                            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold leading-snug tracking-tight text-gray-950 break-words sm:text-sm dark:text-white">
                                <span className="min-w-0 break-words">{location}</span>
                                {isOwned && (
                                    <span className="inline-flex shrink-0 items-center rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-800 dark:bg-brand-500/15 dark:text-sky-300">
                                        Yours
                                    </span>
                                )}
                            </h3>
                            {/* What it is, then what state it is in. The state is a
                                chip rather than the bare dot-and-word it replaced,
                                because it is the one fact a reader triages on and
                                the chip is the same treatment the hazard rows in
                                this pane already give their class. Its dot and
                                colours come from `MAP_STATUS_CONFIG`, the lookup
                                the queue tabs, the legend and the details chips
                                read, so one incident cannot be described in two
                                colours on one screen. */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{formatIncidentType(report)}</span>
                                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${status.badge}`}>
                                    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                                    {statusLabel}
                                </span>
                                {showOwnershipBadge && isTransferred && (
                                    <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">still being handled</span>
                                )}
                            </div>
                            {/* Where, how bad, when — one line of support, and every
                                part of it atomic: a date broken after "7:15" reads
                                as a missing value rather than as a wrapped one, so
                                the time is `nowrap` and the line wraps between
                                facts instead. Severity prints only when the record
                                carries one; inventing "Moderate" for a report that
                                never recorded a severity would be a fact this row
                                made up. */}
                            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-normal text-gray-500 dark:text-gray-400">
                                <span className="min-w-0 break-words">{getPhysicalMunicipality(report) || 'Municipality unavailable'}</span>
                                {severity && (
                                    <>
                                        <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                        <span className="inline-flex shrink-0 items-center gap-1.5">
                                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${severity.dot}`} />
                                            <span>{severity.label}</span>
                                        </span>
                                    </>
                                )}
                                <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                                <span className="whitespace-nowrap tabular-nums">{formatDate(report.incidentTime || report.createdAt || report.resolvedAt)}</span>
                            </p>
                        </div>
                        {/* No rule above the actions: the row divider already
                            separates rows, and a second line inside every row made
                            the list read as a stack of boxes. */}
                        <div className="mt-2 flex items-center justify-between gap-3">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(report)}
                                    className="-ml-2 inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-8 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                                >
                                    View details
                                </button>
                            )}
                            {locateAvailable && (
                                <button
                                    type="button"
                                    // The camera move is the whole action. The
                                    // handler cancels the click's default so a
                                    // Locate that ever lands inside a link or a
                                    // form ancestor still only flies the map —
                                    // never submits, navigates, or rewrites the
                                    // route — and stops it there rather than
                                    // letting the row act on the same click.
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onLocate(report);
                                    }}
                                    className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-8 dark:text-sky-400 dark:hover:bg-white/5"
                                >
                                    <span>Locate</span>
                                    <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

const PanelLoadingState = ({ label = 'Loading panel content' }) => (
    <div className="divide-y divide-gray-100 dark:divide-white/5 py-1" role="status" aria-busy="true">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} lines={2} trailingAction className="p-3 sm:p-4" role={null} />
        ))}
    </div>
);

/**
 * The pane could not load what it was opened to show. Unlike an empty set, this
 * one IS a state worth a tone: the tile takes the error red, so the pane reads
 * as broken rather than as quiet, and the retry sits beside the explanation it
 * belongs to.
 */
const PanelErrorState = ({ title, description, onRetry }) => (
    <div className="px-4 py-8 text-center sm:px-5" role="alert">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
            <HiOutlineExclamationCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="mt-3 text-[13px] font-semibold text-gray-900 sm:text-sm dark:text-white">{title}</h3>
        <p className="mx-auto mt-1 max-w-[34ch] text-xs leading-relaxed text-gray-600 dark:text-gray-500 break-words">{description}</p>
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="mt-3.5 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/10 cursor-pointer"
            >
                <HiOutlineRefresh className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
            </button>
        )}
    </div>
);

const TrustPointsSummary = ({ value = 0 }) => (
    <div className="p-4 sm:p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Current score</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{value}</p>
        <p className="mt-2.5 border-t border-gray-100/80 pt-2.5 text-xs leading-relaxed text-gray-600 dark:border-white/5 dark:text-gray-300">
            Your current reporter standing is calculated from reports that are presently verified or resolved.
        </p>
    </div>
);

const RiskZoneList = ({ zones = [], onInspect, onLocate, loading = false, error = '', onRetry }) => {
    const safeZones = toSafeArray(zones);
    if (loading && safeZones.length === 0) {
        return <PanelLoadingState label="Loading risk zones" />;
    }

    if (error) {
        // The same state the incident lists show, because it is the same
        // situation: the pane cannot list what it was opened for. Two bespoke
        // error blocks is how one pane ends up with two ways of saying it.
        return (
            <PanelErrorState
                title="Risk zones unavailable"
                description={error}
                onRetry={onRetry}
            />
        );
    }

    if (!safeZones.length) {
        return <EmptyState title="No active risk zones" description="No high-risk areas are currently listed." />;
    }

    return (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {safeZones.map((zone, index) => {
                const config = getMapRiskTypeConfig(zone?.type);
                const coordinates = getMapCoordinates(zone);
                return (
                    <article key={getEntityKey(zone, `zone-${index}`)} className="group px-4 py-3.5 transition-colors hover:bg-gray-50 sm:px-5 dark:hover:bg-white/[0.02]">
                        <div className="min-w-0">
                            {/* Same row hierarchy as an incident above it: the name
                                leads, the hazard class is a badge rather than a
                                coloured line of text, and the supporting detail sits
                                a step down. One list, one reading order, whether the
                                row is a report or a zone. */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="text-[13px] sm:text-sm font-semibold tracking-tight text-gray-950 dark:text-white break-words leading-snug">{zone.name || 'Unnamed zone'}</h3>
                                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${config.badge}`}>
                                    {config.label}
                                </span>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-gray-600 line-clamp-2 dark:text-gray-300 break-words">{zone.address || zone.description || 'No description provided.'}</p>
                            <p className="mt-1.5 text-[11px] leading-normal text-gray-500 break-words dark:text-gray-400">
                                {zone.municipality || zone.municipalityName || 'Sibuyan Island'}{zone.barangay ? ` · ${zone.barangay}` : ''} <span aria-hidden="true">·</span> {Number.isFinite(Number(zone.radius)) && Number(zone.radius) > 0 ? `${Number(zone.radius)} m radius` : 'Radius unavailable'}
                            </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            {onInspect && (
                                <button
                                    type="button"
                                    onClick={() => onInspect(zone)}
                                    className="-ml-2 inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-8 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                                >
                                    View details
                                </button>
                            )}
                            {coordinates && (
                                <button
                                    type="button"
                                    // Same contract as the incident row's Locate:
                                    // fly the map, touch nothing else.
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onLocate(zone);
                                    }}
                                    className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-8 dark:text-sky-400 dark:hover:bg-white/5"
                                >
                                    <span>Locate</span>
                                    <HiOutlineArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

/**
 * The card's trailing affordance, and the only thing that tells a reader whether
 * tapping will change the map.
 *
 * A chevron means "this opens the matching set and points the map at it", and
 * now every card does that, so the affordance is unconditional. It used to have
 * a list-icon twin for the two cards that opened a list without touching the
 * map; a second icon is only worth its ink while a card exists that needs it,
 * and the moment one card wore the wrong one the pattern stopped being readable.
 */
const MetricStripAffordance = ({ selected = false }) => (
    <HiChevronRight
        className={`h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 ${selected
            ? 'text-brand-700 dark:text-sky-300'
            : 'text-gray-400 group-hover:text-brand-700 dark:text-gray-500 dark:group-hover:text-sky-300'
            }`}
        aria-hidden="true"
    />
);

const MetricStripItem = ({
    label, value, helper, onClick, selected, statusDot, loading = false, className = '',
}) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-expanded={selected}
        aria-controls={MAP_SUMMARY_PANEL_ID}
        aria-busy={loading || undefined}
        aria-label={`View ${value} ${label.toLowerCase()}. ${helper}`}
        title={`${value} ${label} — ${helper}`}
        // No hover translate: at lg these cards stack in a column, where nudging
        // one card up by a pixel reads as the whole column twitching rather than
        // as that card lifting out of a row.
        //
        // One padding per arrangement, and the two ends are the ones that are
        // easy to get wrong. On a phone the card is one of four in a two-by-two
        // band above the map — the whole KPI area, and the map's loss — so
        // `px-2 py-2` is the tightest step that still reads as a card, and the
        // horizontal 8px is a measurement rather than a taste: at 375px a
        // half-width card is 167px wide, so this is the 151px the supporting
        // line has to fit a sentence into. From sm it is a card with room to
        // breathe, which is what the band's flat height can afford.
        //
        // From lg the padding goes back down, because the card has changed
        // sides: it is now one of four standing in the map's own column, and
        // that column is exactly as tall as the map beside it. `lg:py-2` is what
        // lets the stack close inside the 420px floor the row guarantees, and
        // `lg:justify-center` is what makes the tiles read as four equal panels
        // instead of four captions pinned to the top of their boxes — the grid
        // gives each one an equal share of the column (see the cards grid), and
        // the tile centres its own two rows in that share.
        //
        // `className` is the caller's, and it exists for one job: the overview
        // grid hands a card the whole row on a phone when the band has an odd
        // number of them (see the cards grid below), so the grid never ends in a
        // half-width hole.
        // `bg-white`, not the `bg-white/95` this used to carry: the map card
        // beside it is solid, and two halves of one row reading as two slightly
        // different surfaces is exactly the kind of difference a reader notices
        // without being able to name it.
        className={`group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl bg-white px-2 py-2 text-left shadow-sm ring-1 ring-gray-200/80 transition duration-150 hover:shadow-md hover:ring-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-4 sm:py-4 lg:justify-center lg:py-2 ${className} dark:bg-white/[0.02] dark:ring-white/10 dark:hover:bg-white/[0.05] dark:hover:ring-white/20 ${selected
            ? 'ring-2 ring-brand-600 dark:ring-brand-400'
            : ''
            }`}
    >
        {/* The selected fill is its own layer instead of a second `bg-*` utility
            on the button. Two reasons: the base stylesheet forces every
            button's border-color transparent, so a border can never carry this
            state, and two competing background utilities on one element resolve
            by stylesheet order rather than by class order. A ring is a
            box-shadow and survives; this tint sits behind the text. */}
        <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 rounded-xl bg-brand-50 transition-opacity duration-150 dark:bg-white/[0.06] ${selected ? 'opacity-100' : 'opacity-0'}`}
        />
        {/* Below lg: the dot and label on one line, with the value row under it.
            The band has one shape at every width — label row, then the number
            with its context — and only the value row changes shape with the card
            it is in (stacked on a phone, side by side from sm).

            The label is a step down to 10px here, and it is the width the
            two-up card pays for that: at 11px "Active incidents" ran past a
            half-width card's line and was clipped mid-word, and a KPI that
            names itself wrongly is worse than one set in a smaller label. */}
        <span className="relative flex w-full items-center gap-1.5 lg:hidden">
            {statusDot && <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px] dark:text-gray-400">
                {label}
            </span>
            <MetricStripAffordance selected={selected} />
        </span>
        {/* From lg: the same row, with the name allowed to wrap instead of being
            clipped. The summary column is ~300px wide, and "Active incidents" is
            the longest name in it — a clipped name is worse than a taller card,
            so the desktop label is never truncated. */}
        <span className="relative hidden w-full items-center gap-2 lg:flex">
            {statusDot && <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />}
            <span className={`min-w-0 flex-1 text-[11px] font-semibold uppercase leading-snug tracking-[0.09em] ${selected ? 'text-brand-800 dark:text-sky-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
            </span>
            <MetricStripAffordance selected={selected} />
        </span>
        {/* The value row. This is the card's headline, and it is one row on every
            width where the card has room for one: the number leads and its
            supporting line sits beside it, baseline-aligned, instead of the two
            of them stacking into a column of three lines with the right half of
            the card empty. On a phone the same two pieces stack (there is no
            room beside a 20px number in a 167px card), so this is a column below
            sm and a row from sm up.

            `mt-auto` below lg only: two cards sharing a row are stretched to
            the taller one, and pushing this row to the card's foot is what keeps
            their supporting lines level. At lg the cards share the column's
            height evenly (see the grid) and the whole tile is centred instead, so
            an auto margin there would fight that. */}
        <span className="relative flex w-full min-w-0 flex-col items-start gap-1 pt-2 max-lg:mt-auto sm:flex-row sm:items-baseline sm:gap-2.5">
            <span className="relative shrink-0 font-display text-xl font-bold leading-none tracking-tight text-gray-950 tabular-nums sm:text-[28px] dark:text-white">
                {value}
            </span>
        {helper && (
            // On a phone this is ONE line, and the type is measured to make that
            // true rather than hoped for. The longest supporting line in the app
            // is the active-incidents mix — "1 responding, 2 waiting
            // (1 transferred)", 40 characters — and in the Inter this app
            // self-hosts it measures 196.6px at the 11px it used to be set at,
            // against the 143.5px a half-width card offered then. At 9px with
            // `tracking-tighter` it measures 143.3px, and the card's 8px padding
            // offers 151.5px: it fits with 8px to spare.
            //
            // One line is deliberate at this size. `whitespace-nowrap` plus
            // `overflow-hidden` is the whole constraint — no `line-clamp`, no
            // ellipsis: the descriptions are fixed strings and they fit. A second
            // line would also undo the band's balance, because the shorter of the
            // two cards in a row would float its sentence in the middle of the
            // card instead of sitting level with its neighbour's.
            //
            // 9px is the app's smallest type — the size of the bottom-nav labels
            // — and this is the one place that size carries a sentence. That is
            // the trade this band makes for keeping every word of the four
            // supporting lines visible with no wrap, no ellipsis and no shorter
            // wording.
            //
            // Below 375px the arithmetic runs out: on a 320px phone the same
            // sentence has ~124px to fit in, which no readable size satisfies.
            // There the clamp comes back, so a narrow device gets a second line
            // instead of a silently clipped word. `max-[374px]` is the app's own
            // arbitrary-variant idiom (see `min-[501px]` in the layout) and it
            // leaves the 375px target on one line with 8px spare.
            //
            // From sm the clamp comes back, because the sentence is no longer
            // boxed into a half-width card: it sits beside the number with the
            // rest of the row to itself, and a longer line degrades into a wrap
            // rather than a clip.
            //
            // From sm it takes the rest of the row (`flex-1` + `min-w-0`), which
            // is why it wraps there rather than being held to one line: at that
            // width the card is full-width, and the clamp is what lets a longer
            // line degrade into a second line instead of a clip. `title` carries
            // the full string for a hover read either way.
            <span
                title={helper}
                className="relative min-w-0 overflow-hidden whitespace-nowrap text-[9px] font-normal tracking-tighter text-gray-500 max-[374px]:line-clamp-2 max-[374px]:whitespace-normal sm:flex-1 sm:line-clamp-2 sm:text-[11px] sm:leading-snug sm:tracking-normal sm:whitespace-normal dark:text-gray-400"
            >
                {helper}
            </span>
        )}
        </span>
    </button>
);

/**
 * The two counts the KPI band exists for: what is waiting to be reviewed and
 * what is currently being worked. They lead the band — the first row when there
 * are four cards to fill two rows — and they are also the card that takes the
 * whole row when a role has an odd number of them (a guest sees three), so the
 * grid never ends in a hole.
 *
 * It is the band's arrangement, not the card's: at sm and wider the grid is a
 * single column again and every card is the same width, which is the shape the
 * workspace's right-hand column needs.
 */
const PRIMARY_METRIC_IDS = new Set(['pending', 'active']);

/**
 * Rail tones: the colour of a rail tab is the colour of its own status dot —
 * the same dot the overview card prints and the legend swatches — so a tab, a
 * card, and a legend entry for one status cannot drift apart. `all` is a scope
 * rather than a status, so it keeps the neutral tone instead of borrowing the
 * brand colour and implying it filters something.
 */
const RAIL_TONES = {
    neutral: {
        dot: 'bg-gray-400', selectedSurface: 'bg-gray-100/80 dark:bg-white/10', selectedText: 'text-gray-900 dark:text-white', bar: 'bg-gray-500',
    },
    amber: {
        dot: MAP_STATUS_CONFIG.pending.dot, selectedSurface: 'bg-amber-50/80 dark:bg-amber-500/10', selectedText: 'text-amber-900 dark:text-amber-200', bar: MAP_STATUS_CONFIG.pending.dot,
    },
    blue: {
        dot: MAP_ACTIVE_INCIDENT_CONFIG.dot, selectedSurface: 'bg-blue-50/80 dark:bg-blue-500/10', selectedText: 'text-blue-900 dark:text-blue-200', bar: MAP_ACTIVE_INCIDENT_CONFIG.dot,
    },
    red: {
        dot: 'bg-red-500', selectedSurface: 'bg-red-50/80 dark:bg-red-500/10', selectedText: 'text-red-900 dark:text-red-200', bar: 'bg-red-500',
    },
    emerald: {
        dot: MAP_STATUS_CONFIG.resolved.dot, selectedSurface: 'bg-green-50/80 dark:bg-green-500/10', selectedText: 'text-green-900 dark:text-green-200', bar: MAP_STATUS_CONFIG.resolved.dot,
    },
};
// Every value a filter can take, not just the five the rail ships today: these
// same lookups draw the mobile summary line, which renders whatever filter a
// deep link arrived with. An unmapped value would silently fall back to the
// neutral tone — the colour of "no status", which is the drift this table is
// here to prevent.
const RAIL_TONE_BY_FILTER = {
    all: 'neutral',
    pending: 'amber',
    verified: 'blue',
    active: 'blue',
    dispatch: 'blue',
    // Responding is one of the handled states and wears the same blue (see
    // ACTIVE_INCIDENT_BLUE), so it shares the blue rail tone: a cyan-tinted tab
    // over a blue dot was the rail contradicting its own swatch.
    responding: 'blue',
    'risk-zones': 'red',
    resolved: 'emerald',
};

const getRailTone = (filterValue) => RAIL_TONE_BY_FILTER[filterValue] || 'neutral';

// One dot per filter, shared by the desktop rail, the mobile summary line and
// the mobile sheet. Three surfaces, one lookup.
const getRailDotClass = (filterValue) => RAIL_TONES[getRailTone(filterValue)].dot;

/**
 * One control in the map rail.
 *
 * The selected state is a tinted surface plus a 2px bar, not a `border-b-2`
 * underline: the base stylesheet forces every button's border-color
 * transparent, so an underline tab rendered with no line at all and the tab
 * that was supposed to read as selected looked exactly like the two beside it.
 */
const MapRailTab = ({ label, count, tone = 'neutral', selected, onClick, title, ariaLabel }) => {
    const styles = RAIL_TONES[tone] || RAIL_TONES.neutral;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            title={title}
            aria-label={ariaLabel}
            // 12px and tight padding because this rail shares a row with a
            // divider, a group cue and four more controls: at 13px with a 20px
            // gap it needed ~890px and wrapped to a second row inside the map
            // column, which cost the canvas more height than the tabs are worth.
            // Measured, the five controls now need ~615px, so a 1280px viewport
            // (~640px of rail) holds them in one row. The `before:-inset-1`
            // overlay keeps the tap target comfortable anyway.
            className={`relative -mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg px-1.5 pb-2 pt-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 before:absolute before:-inset-1 before:content-[''] ${selected
                ? `${styles.selectedSurface} font-semibold ${styles.selectedText}`
                : `font-normal text-gray-500 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white${count === 0 ? ' opacity-60' : ''}`
                }`}
        >
            <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
            <span>{label}</span>
            <span className={`text-[10px] font-medium tabular-nums ${selected ? '' : 'text-gray-400 dark:text-gray-500'}`}>
                {count}
            </span>
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full ${selected ? styles.bar : 'bg-transparent'}`}
            />
        </button>
    );
};

/**
 * The map's filter rail: the status tabs that scope the view, and the hazard
 * layer plus the archive behind a divider on the same line.
 *
 * It sits on its own line ABOVE the map and summary row rather than inside the
 * map card, and that placement is the whole point of this component existing.
 * Measured in the app's own font, the five controls need 615px with one-digit
 * counts, 645px with two and 667px with three — and the narrowest desktop
 * workspace, a 1024px viewport, is 720px wide. Full width they therefore fit on
 * one line at every desktop width, counts included, with ~50px to spare. Inside
 * the map card the rail had only the map column: ~400px at 1024px, ~640px at
 * 1280px, so on a laptop it wrapped onto a second row that cost the canvas ~80px
 * of height and read as a second, unrelated toolbar. The tabs also now describe
 * what they do — they scope the whole view, the canvas and the record lists
 * beside it — instead of looking like options of the map only.
 *
 * `group` still decides the shape: status tabs first, then the hazard layer and
 * the archive behind a divider and a glyph, so a layer can never read as a
 * fourth status. A role changes what happens to a record, not what the rail is
 * called — see mapExperience.
 */
const MapFilterRail = ({
    filters = [],
    showPendingReports = false,
    selectedFilter,
    onSelectFilter,
    getCount,
}) => {
    const statusFilters = toSafeArray(filters).filter((filter) => filter.group === 'status');
    const layerFilters = toSafeArray(filters).filter((filter) => filter.group === 'layers');
    const countOf = (value) => (typeof getCount === 'function' ? getCount(value) : 0);

    return (
        <>
            {statusFilters.map((filter) => {
                const count = countOf(filter.value);
                const isSelected = selectedFilter === filter.value;
                const tooltip = filter.value === 'all'
                    ? (showPendingReports
                        ? 'All open reports (pending + being handled)'
                        : 'Active ongoing incidents')
                    : 'Unverified reports awaiting review';

                return (
                    <MapRailTab
                        key={filter.value}
                        label={filter.label}
                        count={count}
                        tone={getRailTone(filter.value)}
                        selected={isSelected}
                        onClick={() => onSelectFilter(filter.value)}
                        title={tooltip}
                        ariaLabel={`${filter.label} filter (${count} ${count === 1 ? 'record' : 'records'})${isSelected ? ', selected' : ''}`}
                    />
                );
            })}
            {layerFilters.length > 0 && (
                <span
                    className="flex shrink-0 items-end gap-x-1 self-stretch border-l border-gray-200 pl-2 dark:border-white/10"
                    role="group"
                    aria-label="Layers and archive"
                >
                    {/* A layers glyph, not the words "Layers & archive": the
                        stacked-sheets icon is the map convention for this group
                        and costs ~16px where the label needed ~110px. Nothing is
                        lost to a screen reader — the group keeps its full
                        accessible name, and each control keeps its own title. */}
                    <span className="hidden pb-2 text-gray-400 lg:inline dark:text-gray-500" aria-hidden="true">
                        <HiOutlineCollection className="h-3.5 w-3.5" />
                    </span>
                    <MapRailTab
                        label={layerFilters.find((filter) => filter.value === 'risk-zones')?.label || 'Risk zones'}
                        count={countOf('risk-zones')}
                        tone={getRailTone('risk-zones')}
                        selected={selectedFilter === 'risk-zones'}
                        onClick={() => onSelectFilter(selectedFilter === 'risk-zones' ? 'all' : 'risk-zones')}
                        title="Toggle the mapped hazard layer"
                        ariaLabel={`Risk zones layer (${countOf('risk-zones')} ${countOf('risk-zones') === 1 ? 'zone' : 'zones'})${selectedFilter === 'risk-zones' ? ', shown' : ''}`}
                    />
                    <MapRailTab
                        label={layerFilters.find((filter) => filter.value === 'resolved')?.label || 'Resolved archive'}
                        count={countOf('resolved')}
                        tone={getRailTone('resolved')}
                        selected={selectedFilter === 'resolved'}
                        onClick={() => onSelectFilter('resolved')}
                        title="View the resolved incident archive"
                        ariaLabel={`Resolved archive (${countOf('resolved')} ${countOf('resolved') === 1 ? 'record' : 'records'})${selectedFilter === 'resolved' ? ', selected' : ''}`}
                    />
                </span>
            )}
        </>
    );
};

const DashboardMapWorkspace = ({
    user,
    isAuthenticated,
    isAdmin,
    isResponder,
    loading,
    error,
    reports = [],
    resolvedTodayReports = [],
    highRiskZones = [],
    highRiskZonesLoading = false,
    highRiskZonesError = '',
    onRetryHighRiskZones,
    reporterOverviewReports = [],
    reporterOverviewReportsLoading = false,
    onLoadReporterOverviewReports,
    focusLocation,
    focusedReport,
    focusedRiskZone,
    focusedReportMissing = false,
    responderMapFilter,
    setResponderMapFilter,
    canCurrentResponderResolve,
    handleMapRespond,
    handleMapResolve,
    handleMapVerify,
    handleMapReject,
    setSearchParams,
    mapSummaryPanel,
    setMapSummaryPanel,
    activePanel,
    pulseReportIds = [],
    viewSwitch = null,
}) => {
    const focusRequestSequenceRef = useRef(0);
    const mapSectionRef = useRef(null);
    const mapScrollCleanupRef = useRef(null);
    const mobileFilterTriggerRef = useRef(null);
    // The summary box's panel slot, which is where the records a card opens are
    // rendered — at every width, since the pane covers the box the cards keep
    // rather than the map. A layout effect rather than a plain ref read so the
    // node is known in the commit that first paints the box: the panel is
    // portalled into it, and reading it one frame late would show the panel in
    // the map's corner first.
    const summaryDockRef = useRef(null);
    // The box itself, which is what the pane is measured against and which
    // scrolls its cards while nothing is open.
    const summaryBoxRef = useRef(null);
    const [summaryDockNode, setSummaryDockNode] = useState(null);
    useLayoutEffect(() => {
        setSummaryDockNode(summaryDockRef.current);
    }, []);
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    // Whether the MAP's own details pane is open, in the same box this
    // workspace's summary pane uses. Held as a boolean rather than as the selected
    // record because the map is the one that owns that record; all this box needs
    // to know is whose it is.
    const [isMapInspectorOpen, setIsMapInspectorOpen] = useState(false);
    // Which operational queue the Active incidents panel is narrowed to. Only
    // the roles that dispatch read it (see `activeQueueSegments`); for everyone
    // else it stays 'all' and the panel shows the card's whole set.
    const [activeQueueSegment, setActiveQueueSegment] = useState('all');
    const [selectedActiveIncidentId, setSelectedActiveIncidentId] = useState('');
    const [selectedActiveRiskZoneId, setSelectedActiveRiskZoneId] = useState('');
    const [mapLocateRequest, setMapLocateRequest] = useState(null);
    const [panelActionLoading, setPanelActionLoading] = useState(false);
    const createFocusRequestId = () => {
        focusRequestSequenceRef.current += 1;
        return `${Date.now()}-${focusRequestSequenceRef.current}`;
    };
    const focusedReportId = focusedReport?._id ?? focusedReport?.id;
    const focusedRiskZoneId = focusedRiskZone?._id ?? focusedRiskZone?.id;
    const externalFocusId = focusedReportId
        ? `incident:${focusedReportId}`
        : focusedRiskZoneId
            ? `risk-zone:${focusedRiskZoneId}`
            : focusLocation?.requestId || '';

    const deepLinkedLocateRequest = useMemo(() => {
        if (focusedReportId && focusedReport) {
            return {
                type: 'incident',
                id: String(focusedReportId),
                entity: focusedReport,
                requestId: `incident:${focusedReportId}`,
            };
        }
        if (focusedRiskZoneId && focusedRiskZone) {
            return {
                type: 'risk-zone',
                id: String(focusedRiskZoneId),
                entity: focusedRiskZone,
                requestId: `risk-zone:${focusedRiskZoneId}`,
            };
        }
        return null;
    }, [focusedReport, focusedReportId, focusedRiskZone, focusedRiskZoneId]);

    useEffect(() => {
        if (!externalFocusId) return undefined;
        mapScrollCleanupRef.current?.();
        mapScrollCleanupRef.current = scheduleElementScroll(mapSectionRef.current, { delay: 180 });
        return () => mapScrollCleanupRef.current?.();
    }, [externalFocusId]);

    useEffect(() => {
        if (focusedReportId || focusedRiskZoneId) setMapLocateRequest(null);
    }, [focusedReportId, focusedRiskZoneId]);

    const mapExperience = getMapExperience({
        role: user?.role,
        agency: user?.agency,
        municipality: user?.assignedMunicipality,
    });

    // A visit to the map starts at the map's own default, not at the last
    // visit's leftovers.
    //
    // This component is mounted exactly while the map view is open, so mounting
    // IS arriving — from another page, from the analytics half of this same
    // route, or from a reload — and every arrival should look like the first
    // one. Two pieces of the view live in the page above (the selected rail tab
    // and the summary panel) and they used to survive a return, so a viewer who
    // left the map on "Risk zones" came back to "Risk zones", while a viewer who
    // had just signed in opened on "All open".
    //
    // The default is the role's own home tab (mapExperience.defaultFilter), so
    // this is a reset to what this account opens on rather than a hard-coded
    // tab that could widen or narrow what a role sees.
    //
    // The URL still outranks it: ?panel=zones is a request to arrive on the
    // hazard list, and this is the arrival that honours it. A layout effect
    // because the reset belongs to the same commit as the arrival — as a passive
    // effect it landed after the first paint and showed the previous visit's tab
    // for one frame.
    //
    // Captured once, in this first render, which is why the effect's dependencies
    // are only the two setters: afterwards a tab is the viewer's choice and a
    // ?panel change is read where the URL is (see the page's panel effect), so
    // letting it re-run would fight both.
    const arrivalRef = useRef(null);
    if (arrivalRef.current === null) {
        const requestedPanel = activePanel === 'incidents' || activePanel === 'zones' ? activePanel : '';
        arrivalRef.current = {
            filter: mapExperience.defaultFilter,
            panel: requestedPanel,
            // Only what actually differs is asked for, so an arrival that already
            // opens on the default leaves the page's state untouched.
            resetFilter: responderMapFilter !== mapExperience.defaultFilter,
            resetPanel: mapSummaryPanel !== requestedPanel,
        };
    }
    useLayoutEffect(() => {
        const arrival = arrivalRef.current;
        if (arrival.resetFilter) setResponderMapFilter(arrival.filter);
        if (arrival.resetPanel) setMapSummaryPanel(arrival.panel);
    }, [setMapSummaryPanel, setResponderMapFilter]);

    const activeReports = getVisibleMapReports(reports);
    const displayedMapReports = getFilteredMapReports(reports, {
        includePending: mapExperience.showPendingReports,
        statusFilter: mapExperience.filters.length > 0 ? responderMapFilter : null,
    });
    const allMappedReports = getVisibleMapReports(reports, { includePending: true });
    // One pending set for every role that receives pending rows. The card, the
    // tab and the panel all read this array, so their three numbers cannot
    // drift — and a guest, who is never sent pending rows, gets no card, no tab
    // and no panel entry rather than a zero.
    const isReporter = user?.role === 'reporter';
    const pendingMappedReports = allMappedReports.filter((report) => report?.status === 'pending');
    const dispatchableReports = activeReports.filter((report) => ['verified', 'transferred'].includes(report.status));
    const activeResponseReports = activeReports.filter((report) => report.status === 'responding');
    // A transfer is a property of the active set, not a sixth card: the count is
    // read from the same array the Active incidents number is read from, so the
    // supporting line can never quote more transfers than that number holds.
    const transferredActiveReports = dispatchableReports.filter((report) => report.status === 'transferred');
    // Active incidents is the umbrella set. A transferred report is still an
    // open incident — it has simply been handed to another area — so it is
    // counted here rather than surfaced as a category of its own. Verified and
    // responding sit inside this set too; the responder/response cards are
    // deliberately narrower views of the same population.
    const publicActiveReports = activeReports.filter((report) => ['verified', 'transferred', 'responding'].includes(report.status));

    const currentUserId = user?._id ?? user?.id ?? null;

    // Home viewport: where the map rests when the incidents cannot frame it.
    //
    // This applies to EVERY role with an assignment, not just reporters. A
    // municipal admin's page is literally titled "<Municipality> incident map"
    // and promises activity "in <Municipality>", so a map that showed nothing of
    // theirs hid the very incidents they came to triage. Guests have no
    // assignment, so getMunicipalityMapFocus returns null for them and they keep
    // the island-wide view unchanged.
    //
    // Handed to the map separately from `focusLocation`: this one is a resting
    // camera the map decides when to use, while `focusLocation` is a place a link
    // asked the map to fly to. Conflating them is what let the municipality centre
    // outrank the incidents on a warm cache and lose to them on a cold one.
    const municipalityHomeFocus = useMemo(() => {
        if (focusedReport || focusedRiskZone) return null;
        const home = getMunicipalityMapFocus(user?.assignedMunicipality);
        if (!home) return null;
        return { ...home, requestId: `municipality-home:${user.assignedMunicipality}` };
    }, [focusedReport, focusedRiskZone, user?.assignedMunicipality]);

    // Reporter ownership: prefer the loaded My Reports overview (source of
    // truth for "yours"), fall back to ownership flags on map rows.
    const reporterOwnedPendingCount = useMemo(() => {
        if (!isReporter) return 0;
        const overviewPending = Array.isArray(reporterOverviewReports)
            ? reporterOverviewReports.filter((report) => report?.status === 'pending')
            : [];
        if (overviewPending.length > 0 || reporterOverviewReportsLoading) {
            return countOwnedReports(overviewPending.length > 0 ? overviewPending : pendingMappedReports, currentUserId);
        }
        return countOwnedReports(pendingMappedReports, currentUserId);
    }, [isReporter, reporterOverviewReports, reporterOverviewReportsLoading, pendingMappedReports, currentUserId]);
    const reporterPendingSummary = useMemo(() => buildReporterPendingSummary({
        total: pendingMappedReports.length,
        owned: reporterOwnedPendingCount,
    }), [pendingMappedReports.length, reporterOwnedPendingCount]);
    // The count folds verified + transferred + responding together, so the
    // supporting line is derived from the actual mix. A fixed phrase ("Being
    // handled now") was wrong as soon as one incident still had no responder —
    // which is the normal state early in an incident's life.
    // Shared by the reporter and guest overviews — resolved rows are public.
    // Declared here, above both metric arrays, because a `const` referenced
    // before its declaration throws rather than reading as undefined.
    const resolvedMapReports = allMappedReports.filter((report) => report?.status === 'resolved');
    // The Resolved card and the map's Resolved tab are the same set — every
    // resolved pin this viewer is allowed to see — so the card may point the map
    // at it. Today's closures ride along as supporting text instead of as the
    // card's value: as a value, a time-scoped 0 sat beside a Resolved tab
    // reading 2, two numbers for one word on one screen.
    //
    // The count is clipped to that same array, so if a resolved report has no
    // coordinates (and therefore cannot be a pin) it cannot inflate the
    // supporting line past the number printed next to it either.
    const resolvedTodayMappedIds = new Set(
        toSafeArray(resolvedTodayReports).map((report) => getEntityKey(report)),
    );
    const resolvedTodayMappedCount = resolvedMapReports.filter((report) => {
        const id = getEntityKey(report);
        return Boolean(id) && resolvedTodayMappedIds.has(id);
    }).length;
    const resolvedArchivePanelDescription = `${resolvedMapReports.length} ${resolvedMapReports.length === 1 ? 'incident' : 'incidents'} in the resolved archive`;
    const activeIncidentsSummary = buildActiveIncidentsSummary({
        total: publicActiveReports.length,
        responding: activeResponseReports.length,
        transferred: transferredActiveReports.length,
    });


    const closeMapSummaryPanel = useCallback((options = {}) => {
        setSelectedActiveIncidentId('');
        setSelectedActiveRiskZoneId('');
        setMapSummaryPanel('');
        const isOverviewPanel = mapSummaryPanel.startsWith(OVERVIEW_PANEL_PREFIX);
        if (!options.preserveNavigation && !isOverviewPanel && ['incidents', 'zones'].includes(activePanel)) {
            setSearchParams({ view: 'map' });
        }
    }, [activePanel, mapSummaryPanel, setMapSummaryPanel, setSearchParams]);

    const openMapSummaryPanel = useCallback((panel) => {
        setSelectedActiveIncidentId('');
        setSelectedActiveRiskZoneId('');
        // A queue segment belongs to the visit that chose it: reopening the panel
        // must not silently show a narrowed list under the card's full count.
        setActiveQueueSegment('all');
        setMapSummaryPanel(panel);
    }, [setMapSummaryPanel]);

    // The summary box has two readers: this workspace's own pane, and the details
    // pane the map opens when a pin is clicked. Whichever opens second takes the
    // box, so opening the map's gives this one up — the two can never be rendered
    // into one box, and a pin's details can never end up over the canvas it was
    // clicked on.
    const handleMapInspectorChange = useCallback((isOpen) => {
        setIsMapInspectorOpen(isOpen);
        if (isOpen) closeMapSummaryPanel();
    }, [closeMapSummaryPanel]);

    const publicMetrics = [
                {
                    id: 'active', label: 'Active incidents', value: publicActiveReports.length,
                    // Derived from the actual verified / transferred /
                    // responding mix, so the supporting line can never
                    // contradict the number above it. The status list that used
                    // to live in the helper moved here: the card line only has
                    // room for one of the two facts, and the mix is the
                    // actionable one.
                    helper: activeIncidentsSummary.helper,
                    icon: HiOutlineCheckCircle, panelType: 'incidents', panelTitle: 'Active incidents',
                    panelDescription: activeIncidentsSummary.description,
                    records: publicActiveReports,
                    // 'all' is the guest's active set — see GUEST_FILTERS. The
                    // hazard layer stays hidden for it, exactly as 'incidents'
                    // did, because only 'risk-zones' reveals the hazard layer.
                    mapFilter: 'all',
                    emptyTitle: 'No active incidents', emptyDescription: 'No verified, transferred, or responding incidents are currently active.',
                    statusDot: 'bg-blue-500',
                },
                {
                    // Same card the reporter map shows, minus the pending one.
                    // Resolved rows were always public — guests already had a
                    // Resolved filter tab — so this exposes no new data, it only
                    // stops hiding a lifecycle stage from the overview.
                    id: 'resolved', label: 'Resolved', value: resolvedMapReports.length,
                    helper: 'Completed incidents', icon: HiOutlineCheckCircle, panelType: 'incidents',
                    panelTitle: 'Resolved incidents', panelDescription: `${resolvedMapReports.length} ${resolvedMapReports.length === 1 ? 'incident' : 'incidents'} already resolved`,
                    records: resolvedMapReports,
                    mapFilter: 'resolved',
                    emptyTitle: 'No resolved incidents',
                    emptyDescription: 'No resolved incidents yet.',
                    statusDot: 'bg-emerald-500',
                },
                {
                    id: 'risk-zones', label: 'Risk zones', value: highRiskZones.length,
                    helper: 'Mapped hazards — stay cautious', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
                    panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
                    loading: highRiskZonesLoading, error: highRiskZonesError,
                    statusDot: 'bg-red-500',
                },
            ];

    // A supporting line is the one place a role is still allowed to differ. The
    // value slot answers "how big is the set this card opens" and prints the same
    // number a tab prints; the line under it carries the fact that particular
    // role needs, because it is copy about that set rather than a second count of
    // it. Two roles reading different numbers beside the same label is the bug
    // this row was rebuilt to kill.
    const pendingReviewCopy = isReporter
        ? reporterPendingSummary
        : {
            helper: isResponder ? 'Awaiting response' : 'Awaiting review',
            description: isResponder
                ? `${pendingMappedReports.length} unverified ${pendingMappedReports.length === 1 ? 'incident' : 'incidents'} waiting for a responder.`
                : `${pendingMappedReports.length} ${pendingMappedReports.length === 1 ? 'report' : 'reports'} awaiting municipal review.`,
        };

    const resolvedArchiveCopy = isAdmin || isResponder
        ? {
            helper: isResponder
                ? `Closed incidents · ${resolvedTodayMappedCount} today by you`
                : `Closed incidents · ${resolvedTodayMappedCount} today`,
            description: isResponder
                ? `${resolvedArchivePanelDescription} · ${resolvedTodayMappedCount} resolved by you today`
                : `${resolvedArchivePanelDescription} · ${resolvedTodayMappedCount} today`,
        }
        : {
            helper: 'Completed incidents',
            description: `${resolvedArchivePanelDescription}.`,
        };

    // The signed-in row: four cards, one order, one set of names, for reporter,
    // responder and municipal admin alike. The rail is the same for those roles
    // too (see mapExperience), so each card is simply one of the rail's sets in
    // the viewer's own words — and it opens exactly what it counts.
    //
    // What a role can DO with a record is not visible here on purpose: the
    // verbs live on the panel's buttons, driven by `mapExperience.canRespond` /
    // `canResolve` / `canVerify`, which is why a uniform row cannot widen anyone's
    // permissions.
    const signedInMetrics = [
        {
            id: 'pending', label: 'Pending review', value: pendingMappedReports.length,
            helper: pendingReviewCopy.helper, icon: HiOutlineClock, panelType: 'incidents',
            panelTitle: 'Pending review', panelDescription: pendingReviewCopy.description,
            records: pendingMappedReports,
            mapFilter: 'pending',
            emptyTitle: 'No pending reports',
            emptyDescription: 'No community reports are currently awaiting verification.',
            statusDot: 'bg-amber-500',
        },
        {
            id: 'active', label: 'Active incidents', value: publicActiveReports.length,
            helper: activeIncidentsSummary.helper, icon: HiOutlineCheckCircle, panelType: 'incidents',
            panelTitle: 'Active incidents',
            // The same single line as the guest's: the panel header has room for
            // the count and its mix, and the records below it are the detail.
            panelDescription: activeIncidentsSummary.description,
            records: publicActiveReports,
            mapFilter: 'active',
            emptyTitle: 'No active incidents', emptyDescription: 'No verified or handled incidents are currently active.',
            statusDot: 'bg-blue-500',
        },
        {
            id: 'resolved', label: 'Resolved', value: resolvedMapReports.length,
            helper: resolvedArchiveCopy.helper, icon: HiOutlineBadgeCheck, panelType: 'incidents',
            panelTitle: 'Resolved incidents', panelDescription: resolvedArchiveCopy.description,
            records: resolvedMapReports,
            mapFilter: 'resolved',
            emptyTitle: 'No resolved incidents',
            emptyDescription: 'No resolved incidents yet.',
            statusDot: 'bg-emerald-500',
        },
        {
            id: 'risk-zones', label: 'Risk zones', value: highRiskZones.length,
            helper: 'Mapped hazards — stay cautious', icon: HiOutlineLightningBolt, panelType: 'risk-zones',
            panelTitle: 'Active risk zones', records: highRiskZones, mapFilter: 'risk-zones',
            loading: highRiskZonesLoading, error: highRiskZonesError,
            statusDot: 'bg-red-500',
        },
    ];

    // Everyone signed in reads the same row. The only shorter row is a guest's,
    // and it is shorter because the API does not send an anonymous viewer
    // pending rows — not because a guest should be shown less of the same thing.
    const metrics = (isReporter || isResponder || isAdmin) ? signedInMetrics : publicMetrics;

    // One rule decides what a card is: the number, the list it opens, and the
    // pins the map shows all come from one array, so every card can point the
    // map at the tab it counts. The two cards that could not used to explain
    // themselves in their accessible name instead of in their number —
    // "Resolved today" was time-scoped while the Resolved tab is the archive,
    // so the same screen could read 0 resolved beside a Resolved tab reading 2.
    // A time-scoped or otherwise narrower count now belongs in the supporting
    // line and the panel description, never in the value slot: the value slot is
    // read as "the size of the set this card opens".
    const activeOverviewMetric = metrics.find(
        (metric) => `${OVERVIEW_PANEL_PREFIX}${metric.id}` === mapSummaryPanel,
    ) || null;
    const isIncidentSummaryPanel = mapSummaryPanel === 'incidents' || activeOverviewMetric?.panelType === 'incidents';
    const isRiskZoneSummaryPanel = mapSummaryPanel === 'zones' || activeOverviewMetric?.panelType === 'risk-zones';
    const isTrustPointsPanel = activeOverviewMetric?.panelType === 'trust-points';
    const hasSummaryPanel = Boolean(isIncidentSummaryPanel || isRiskZoneSummaryPanel || isTrustPointsPanel);
    // The summary panel's top rule repeats the tone of whatever it is showing:
    // the card that opened it when a card did, otherwise the rail filter that
    // owns it. It is what still states which of the four numbers the reader is
    // looking at once the cards themselves have given the column up.
    // Resolved once, so the rule on the pane's leading edge and the dot beside
    // its title are the same tone by construction and cannot disagree about
    // which set is open.
    const summaryPanelTone = RAIL_TONES[getRailTone(activeOverviewMetric?.id || responderMapFilter)];
    const summaryPanelAccent = summaryPanelTone.bar;
    // The records pane takes the summary box over at every width — whichever
    // reader opened it. The box is the map's own height and stands where the
    // cards do, so the records open in the space they were being read in — below
    // the map on a phone and from sm to lg, beside it from lg — and never in a
    // sheet at the bottom of the screen. A pin's details are one of those
    // readers: clicking a marker opens them here, not over the map, which below
    // sm means the pane stands under the canvas it describes (see the reveal
    // effect below).
    const isSummaryPaneOpen = Boolean(hasSummaryPanel || isMapInspectorOpen);

    // Opening the records returns the box to the top.
    //
    // The box scrolls its own cards, and the pane is positioned against that
    // same box: a leftover scroll offset moves the pane UP with the cards that
    // scrolled, which leaves a strip of the box showing under the pane — the one
    // place the records must not stop short, since the box is exactly as tall as
    // the map. Reset in a layout effect, so it is true again before the commit
    // that shows the pane rather than one frame after it.
    useLayoutEffect(() => {
        if (!isSummaryPaneOpen || !summaryBoxRef.current) return;
        summaryBoxRef.current.scrollTop = 0;
    }, [isSummaryPaneOpen]);

    // Bringing the reader to the pane on a phone.
    //
    // The mobile order puts the box BELOW the map, and the pane renders into the
    // box — so the one reader who opens a pane from the map itself (a tapped pin)
    // would get details painted off-screen, under a canvas they did not scroll
    // past. They are already looking at the box; this is for them. It is a no-op
    // from sm up, where the box is the column beside the map, and a no-op for a
    // pane a card opened, because then the box is already the thing under the
    // reader's finger — the scroll helper skips an element that is already
    // sitting where it should.
    useEffect(() => {
        if (!isSummaryPaneOpen || !isSummaryPaneSheetViewport()) return undefined;
        return scheduleElementScroll(summaryBoxRef.current, { delay: 180, behavior: 'reveal' });
    }, [isSummaryPaneOpen]);

    // The operational queues, as segments of the panel that already holds those
    // records. The rail used to spend two tabs on them (Ready to dispatch, Active
    // response), which is what made the same incident arrive as a different
    // product per account. Each segment is one of the sets above rather than a
    // new derivation, so a segment's number cannot disagree with the card's.
    // `label` is the queue's full name — the accessible name and the tooltip —
    // and `shortLabel` is what the option prints inside the summary column. They
    // are not the same word on purpose: the column is ~290px wide, where "Ready
    // to dispatch" ellipsized to "Ready …" and told the reader nothing about what
    // they were choosing. The short names are the queue names this app already
    // uses elsewhere ("Active response"), so no new vocabulary is introduced.
    const activeQueueSegments = mapExperience.canDispatch
        ? [
            { value: 'all', label: 'All active', shortLabel: 'All', records: publicActiveReports },
            { value: 'dispatch', label: 'Ready to dispatch', shortLabel: 'Dispatch', records: dispatchableReports },
            { value: 'responding', label: 'In response', shortLabel: 'Response', records: activeResponseReports },
        ]
        : [];
    const activeQueuePanelOpen = Boolean(mapExperience.canDispatch)
        && activeOverviewMetric?.id === 'active';
    const activeQueueSegmentRecords = activeQueueSegments
        .find((segment) => segment.value === activeQueueSegment)?.records || publicActiveReports;

    const panelIncidentReports = mapSummaryPanel === 'incidents'
        ? displayedMapReports
        : activeOverviewMetric?.panelType === 'incidents'
            ? (activeQueuePanelOpen ? activeQueueSegmentRecords : activeOverviewMetric.records)
            : [];
    const selectedActiveIncident = panelIncidentReports.find(
        (report) => String(report._id || report.id) === selectedActiveIncidentId,
    ) || null;
    const selectedActiveRiskZone = isRiskZoneSummaryPanel
        ? highRiskZones.find((zone) => String(zone._id || zone.id) === selectedActiveRiskZoneId) || null
        : null;
    const displayedMapReportIds = new Set(
        displayedMapReports.map((report) => String(report._id || report.id)),
    );
    const canLocatePanelReport = () => true;

    const openOverviewMetric = (metric) => {
        if (metric.mapFilter && mapExperience.filters.length > 0) {
            setResponderMapFilter(metric.mapFilter);
        }
        openMapSummaryPanel(`${OVERVIEW_PANEL_PREFIX}${metric.id}`);
        if (metric.requiresReporterRecords && !reporterRecordsLoaded && !reporterOverviewReportsLoading) {
            onLoadReporterOverviewReports?.();
        }
    };

    const retryReporterOverviewReports = () => onLoadReporterOverviewReports?.({ force: true });

    const locateReport = (report, closeModal) => {
        const coordinates = getMapCoordinates(report);
        if (!coordinates) return;
        // A top-down camera keeps the incident pin visually aligned with its
        // stored coordinates. The previous pitched, maximum-zoom view made the
        // pin appear offset and removed useful street-level context.
        //
        // The pane yields the map only where it is a sheet over it. Inside that
        // width the sheet would hide the pin the flight is bringing into view;
        // beside the canvas the list is what the viewer clicked from, so it
        // stays and the camera moves alone.
        if (isSummaryPaneSheetViewport()) {
            closeModal?.();
            // Below sm the map is the pane's neighbour ABOVE it, so the flight
            // this starts would otherwise happen off-screen: a reader paging
            // through records would tap Locate and see nothing move. The camera
            // move is still the only thing Locate does — this is the reader being
            // brought to it, not the view being reset.
            scheduleElementScroll(mapSectionRef.current, { delay: 180, behavior: 'reveal' });
        }
        setMapLocateRequest({
            type: 'incident',
            id: String(report._id || report.id),
            entity: report,
            requestId: createFocusRequestId(),
        });
    };

    const locateZone = (zone) => {
        const coordinates = getMapCoordinates(zone);
        if (!coordinates) return;
        // Same rule as an incident Locate: collapse the pane back to the list
        // only where that pane is covering the map. Beside the canvas the list
        // (or the zone's own details) stays as the viewer left it.
        if (isSummaryPaneSheetViewport()) {
            setSelectedActiveRiskZoneId('');
            closeMapSummaryPanel({ preserveNavigation: true });
        }
        if (mapExperience.filters.length > 0 && responderMapFilter !== 'risk-zones') {
            setResponderMapFilter('risk-zones');
        }
        setMapLocateRequest({
            type: 'risk-zone',
            id: String(zone._id || zone.id),
            entity: zone,
            requestId: createFocusRequestId(),
        });
    };

    const locateActiveIncident = (report) => {
        setSelectedActiveIncidentId('');
        if (mapExperience.filters.length > 0 && !displayedMapReportIds.has(getEntityKey(report))) {
            setResponderMapFilter('all');
        }
        locateReport(report, () => closeMapSummaryPanel({ preserveNavigation: true }));
    };

    const runPanelIncidentAction = async (action, report, successMessage) => {
        if (!action || panelActionLoading) return;
        setPanelActionLoading(true);
        try {
            const result = await action(report);
            if (result?.ok) toast.success(result.message || successMessage);
            else toast.error(result?.message || 'Unable to complete the incident action.');
        } catch {
            toast.error('Unable to complete the incident action. Please try again.');
        } finally {
            setPanelActionLoading(false);
        }
    };

    const panelTitle = selectedActiveIncident
        ? 'Incident details'
        : selectedActiveRiskZone
            ? 'High-risk zone details'
            : activeOverviewMetric?.panelTitle
            || (mapSummaryPanel === 'incidents' ? 'Active incidents' : 'High-risk zones');
    const panelDescription = (selectedActiveIncident || selectedActiveRiskZone)
        ? undefined
        : activeOverviewMetric
            ? activeOverviewMetric.loading
                ? activeOverviewMetric.panelType === 'risk-zones'
                    ? 'Loading monitored zones'
                    : 'Loading matching records'
                : activeOverviewMetric.error
                    ? 'Metric details unavailable'
                    : activeOverviewMetric.panelDescription
                    || `${safeCount(highRiskZones)} monitored ${safeCount(highRiskZones) === 1 ? 'zone' : 'zones'}`
            : mapSummaryPanel === 'incidents'
                ? `${safeCount(displayedMapReports)} currently visible`
                : highRiskZonesLoading
                    ? 'Loading monitored zones'
                    : highRiskZonesError
                        ? 'Risk zone data unavailable'
                        : `${safeCount(highRiskZones)} monitored ${safeCount(highRiskZones) === 1 ? 'zone' : 'zones'}`;
    const panelCloseLabel = selectedActiveIncident
        ? 'Close incident details'
        : selectedActiveRiskZone
            ? 'Close risk zone details'
            : mapSummaryPanel === 'incidents'
                ? 'Close incidents panel'
                : mapSummaryPanel === 'zones'
                    ? 'Close risk zones panel'
                    : `Close ${activeOverviewMetric?.panelTitle?.toLowerCase() || 'overview'} panel`;
    const isReportInResponderMunicipality = (report) => {
        if (!normalizeMunicipalityKey(user?.assignedMunicipality)) return true;
        if (!normalizeMunicipalityKey(report?.municipalityName)) return true;
        const assigned = normalizeMunicipalityKey(user.assignedMunicipality);
        const incidentMuni = normalizeMunicipalityKey(report.municipalityName);
        return incidentMuni === assigned;
    };
    const selectedIncidentCanRespond = Boolean(
        selectedActiveIncident
        && mapExperience.canRespond
        && isReportInResponderMunicipality(selectedActiveIncident)
        && ['verified', 'transferred'].includes(selectedActiveIncident.status),
    );
    const selectedIncidentCanResolve = Boolean(
        selectedActiveIncident
        && mapExperience.canResolve
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'responding'
        && (!canCurrentResponderResolve || canCurrentResponderResolve(selectedActiveIncident)),
    );
    // Map review shortcuts: municipal_admin only, same-municipality pending
    // reports. The queue inspector + server re-check on confirm.
    const selectedIncidentCanVerify = Boolean(
        selectedActiveIncident
        && mapExperience.canVerify
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'pending',
    );
    const selectedIncidentCanReject = Boolean(
        selectedActiveIncident
        && mapExperience.canVerify
        && isReportInResponderMunicipality(selectedActiveIncident)
        && selectedActiveIncident.status === 'pending',
    );

    const getFilterCount = (filterValue) => {
        if (filterValue === 'risk-zones') {
            return safeCount(highRiskZones);
        }
        // The Resolved tab prints the same array the Resolved cards count and
        // open, instead of a second derivation of "resolved" that happens to
        // agree with the first today. One array, one number, whichever surface
        // is asking.
        if (filterValue === 'resolved') {
            return resolvedMapReports.length;
        }
        try {
            return getFilteredMapReports(toSafeArray(reports), {
                includePending: mapExperience.showPendingReports,
                statusFilter: filterValue,
            }).length;
        } catch {
            return 0;
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 sm:gap-5 lg:h-[calc(100dvh-7.25rem)] lg:min-h-[480px] lg:gap-3">
            {/* 7.25rem is the app header (4rem) plus this page's own top and
                bottom padding (1.25rem + 2rem), so the workspace ends where the
                viewport does and the page has nothing left to scroll. The floor
                is 480px, not the 560px it first shipped with: at a 1280x720
                laptop the available height is ~525px, so a 560px floor did not
                protect the map — it put the bottom of the page, KPI cards
                included, back below the fold. */}
            {/* Title block left, view switch right. The switch used to sit in a
                row of its own above this header, which cost a band of empty
                space on the one page that has both views. */}
            {/* Kicker, title, and — below lg — the sentence that explains them.
                From lg the description gives way: the workspace's height is the
                viewport's minus this header, so every line spent here is a line
                the map does not get, and the description restates what the
                kicker and title already name. */}
            <header className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 lg:items-center lg:gap-4">
                <div className="min-w-0">
                    {/* The workspace's own name, and under it the page's subject.
                        *
                        * The eyebrow is about the viewer — "Reporter map",
                        * "Municipal oversight" — and the h1 is about what they are
                        * looking at, which is why the two are one hierarchy rather
                        * than one line printed twice. The h1 also stays the
                        * document's heading: a screen reader announces it on
                        * arrival and a headings list is built from it, so a
                        * workspace whose subject lived only in the URL read as a
                        * fragment of some larger screen.
                        *
                        * From lg the title steps down to 22px rather than being
                        * dropped: this workspace's height is the viewport's minus
                        * this header, so the title is sized for a header that is
                        * also the top of a full-height map — one line, still the
                        * largest type in the column, ~28px of height. What gives
                        * way at lg is the description, which only restates it. */}
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700 dark:text-sky-400">
                        {mapExperience.eyebrow}
                    </p>
                    <h1 className="mt-1 font-display text-[26px] font-bold leading-[1.15] tracking-tight text-gray-950 break-words sm:text-[32px] lg:mt-0.5 lg:text-[22px] dark:text-white">
                        {mapExperience.title}
                    </h1>
                    <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-gray-600 dark:text-gray-300 break-words lg:hidden">
                        {mapExperience.description}
                    </p>
                </div>
                {viewSwitch && <div className="shrink-0 sm:pt-0.5">{viewSwitch}</div>}
            </header>

            {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            )}

            {highRiskZonesError && !highRiskZonesLoading && (
                <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span>{highRiskZonesError}</span>
                    {onRetryHighRiskZones && (
                        <button
                            type="button"
                            onClick={onRetryHighRiskZones}
                            className="inline-flex min-h-[44px] sm:min-h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                        >
                            Retry risk zones
                        </button>
                    )}
                </div>
            )}

            {focusedReportMissing && !focusedReport && (
                <section className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30" role="alert" aria-label="Selected incident unavailable">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Selected incident unavailable</p>
                    <p className="text-xs text-amber-700 dark:text-amber-200">It may have been removed or you may not have access. Showing the latest map instead.</p>
                </section>
            )}

            {/* Where the numbers sit, per width.
             *
             * On a laptop the cards come first and that order is the point: they
             * used to sit BELOW a 500px canvas, so the first thing below the fold
             * was the count that starts the whole triage — "Pending 3" — while
             * the operator saw only terrain. The reporter role never felt that
             * way because they have a separate summary page; the admin and
             * responder only have this screen.
             *
             * On a phone it is the opposite, and deliberately so. The page is an
             * incident map: the map leads it, filters and all, and the four
             * counts follow as the summary of what is on it. A 375x667 screen
             * cannot show a band of KPIs and a usable canvas at once, and the
             * canvas is the one an operator works from — so the map takes the
             * first screenful and the numbers sit directly under it, one short
             * scroll away and still on the same page.
             *
             * The cards are a summary OF the map at every width (tapping one
             * opens its records and, when the sets agree, points the map at
             * them), so the section keeps its "Map summary" label and the heading
             * below is unchanged. From sm to lg they are above the map, as they
             * have been; from lg the two stop sharing the page vertically and
             * share it horizontally instead — the workspace becomes the app
             * sidebar, the map, and this summary, the map takes the viewport's
             * remaining height, and the page has nothing left to scroll.
             *
             * The summary stays FIRST in the source at every width, including
             * the phone's, so the reading order for a screen reader (and the box
             * a pane opens into, and the tests that read the cards before the
             * map) is unchanged — only the phone's drawing order moves. */}
            {/* The row's own floor is the map's floor: the map never renders
                shorter than the canvas it replaces, and a viewport too short to
                honour that scrolls the page rather than clipping the terrain.
                Without it the canvas would simply be cut off, because the
                section that holds it is `overflow-hidden` at a height the row
                is allowed to shrink. */}
            {/* The filter rail on its own full-width line, above both columns.
                It is `hidden lg:flex` because below lg the Filters button and
                its sheet own this job — see the mobile bar inside the map card,
                which is now the card's only header band. The bottom border is
                what the selected tab's indicator sits on. */}
            {mapExperience.filters.length > 0 && (
                <div
                    className="hidden w-full min-w-0 flex-wrap items-end gap-x-1 border-b border-gray-200 lg:flex dark:border-white/10"
                    aria-label="Map status filter"
                    role="group"
                >
                    <MapFilterRail
                        filters={mapExperience.filters}
                        showPendingReports={mapExperience.showPendingReports}
                        selectedFilter={responderMapFilter}
                        onSelectFilter={setResponderMapFilter}
                        getCount={getFilterCount}
                    />
                </div>
            )}

            {/* The summary column is `clamp`ed, not fixed. A hard 340px column
                left the map ~360px at a 1024px viewport — a phone-sized canvas
                beside a full-size column — while a hard 280px left the section's
                own heading and hint too little room to sit on one line. Between
                288px and 332px it tracks the viewport instead: the map keeps the
                width it needs at the small end, and at 1280px the column lands
                at ~307px, which is still 637px of rail for the filter row that
                has to fit in one line there. */}
            {/* One row, three arrangements — and the phone's is the map first.

                A column flex rather than the `space-y` stack it used to be, for
                one reason: `order`. On a phone this page IS the map, so the map
                leads it and the KPI band follows as the summary it is; from sm
                the two are ordered as they always were (the numbers, then the
                canvas), and from lg the grid places them explicitly and order
                stops mattering. Only the drawing order changes — the summary
                stays FIRST in the DOM, so the tab order, the pane's box and the
                tests that read the cards before the map are untouched. */}
            <div className="flex flex-col gap-3 sm:gap-5 lg:grid lg:min-h-[420px] lg:flex-1 lg:grid-cols-[minmax(0,1fr)_clamp(288px,24vw,332px)] lg:items-stretch lg:gap-4">
            {/* The summary box is the box a card's records open into. On a phone
                it hugs the two-by-two band instead of reserving a height: two
                rows of cards are the honest height, and the page is ~110px
                shorter for it — which, with the map at the top, is the
                difference between reaching the KPIs and scrolling past an empty
                box to do it.

                It still carries the map frame's own height from sm: a flat
                460px, and the column's share of the viewport from lg. While a
                card is open it takes the records pane's own phone height back
                (PHONE_PANE_BOX_CLASSES) — the pane renders into exactly this
                box, and a records list needs the room a KPI band does not, and
                on a phone more than the map's 4:3 frame now gives. The pane was
                always laid over this box; what changed is that the box no
                longer reserves any height while nothing is open. */}
            {/* The summary column, which is also where a card's records open.
                The pane takes the cards' own box — same column, same height,
                laid over the space they keep — so it neither overshoots the box
                the overview was standing in nor shrinks inside it, and the map
                never has to give up a pixel for it. The cards stay mounted while
                the pane is open so their counts keep their place in the DOM (and
                in the tests); the pane is simply what covers them, at every
                width. */}
            <div className="order-2 sm:order-1 lg:col-start-2 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col" data-testid="map-summary-column">
            <section ref={summaryBoxRef} className={`custom-scrollbar relative w-full sm:h-[460px] sm:max-h-none lg:h-auto lg:min-h-0 lg:flex-1 ${isSummaryPaneOpen
                ? `${PHONE_PANE_BOX_CLASSES} overflow-hidden`
                : 'h-auto overflow-y-auto'}`} aria-label="Map summary">
                {/* The cards keep their box while the pane is open: `invisible`
                    holds the space without painting it, which is what lets the
                    pane cover exactly the box the cards were standing in — the
                    same height to the pixel, whether the box carries three cards
                    or four. Unmounting them instead would let the box collapse
                    and the pane shrink to its own content, which is the one
                    thing this pane must not do. */}
                <div className={`lg:flex lg:h-full lg:min-h-0 lg:flex-col ${isSummaryPaneOpen ? 'invisible' : ''}`}>
                {/* One row, and a hint short enough to stay on it: the old line
                    was longer than the heading beside it, so at 340px it wrapped
                    and the section opened with two lines of 11px grey above the
                    numbers. The mobile wording is unchanged.

                    From lg it is a fixed first row of the column: the cards grid
                    below takes the rest and divides it between the tiles, so the
                    heading must not be the thing that stretches. */}
                <div className="flex items-baseline justify-between gap-3 px-1 lg:shrink-0">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600 dark:text-gray-300">Current overview</h2>
                    {/* gray-500, not gray-400: the hint is instructional text at
                        11px, and gray-400 on this background sits near 2.6:1 —
                        below the 4.5:1 a reader with low vision needs. gray-500
                        passes, and the heading stays a step above it in weight
                        and tracking rather than in a lighter grey. */}
                    <p className="min-w-0 truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        <span className="hidden sm:inline">Select to see records</span>
                        <span className="sm:hidden">Tap to view records</span>
                    </p>
                </div>
                {/* The KPI band: a two-by-two grid on a phone — pending review and
                    active incidents on the first row, resolved and risk zones on
                    the second — where the four cards used to take four rows and
                    ~110px more of the page than the map could spare.

                    Row order is the priority. The two counts an operator acts on
                    lead, and the two that report on the record behind them follow.
                    The cards themselves stay equal — one width, one padding, one
                    number size — because a band read at a glance cannot afford a
                    tile that looks more urgent than its neighbour: what tells the
                    reader which KPI matters is where it sits.

                    A guest has three cards (no pending set reaches an anonymous
                    viewer), so the odd one — always a primary — takes the full row
                    rather than leaving a hole beside it. */}
                {/* `auto-rows-fr` from lg: however many tiles there are (four for
                    a signed-in role, three for a guest), the column's remaining
                    height is divided equally between them, which is what keeps
                    the band's rhythm even rather than leaving the last of them a
                    different size. */}
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:mt-2 sm:grid-cols-1 sm:gap-3 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:gap-2" data-testid="map-summary-cards">
                    {metrics.map((metric, index) => (
                        <MetricStripItem
                            key={metric.id}
                            index={index}
                            className={metrics.length % 2 === 1 && PRIMARY_METRIC_IDS.has(metric.id) ? 'col-span-2 sm:col-span-1' : ''}
                            label={metric.label}
                            value={metric.value}
                            helper={metric.helper}
                            icon={metric.icon}
                            statusDot={metric.statusDot}
                            onClick={() => openOverviewMetric(metric)}
                            selected={mapSummaryPanel === `${OVERVIEW_PANEL_PREFIX}${metric.id}`}
                            loading={metric.loading}
                        />
                    ))}
                </div>
                </div>

                {/* The pane's slot: exactly the box the cards were occupying —
                    `inset-0` inside their own relative box — and the only part
                    of it a panel is ever given, at every width. Out of the way
                    while nothing is open.

                    The slot is a direct inset with no margin and no stack of
                    siblings above it: `space-y` on the box would have given it a
                    margin, and a margin on an `inset-0` element both shifts it
                    down and shortens it — 8px of the box's own surface left
                    showing above the pane, which is exactly the strip this pane
                    exists not to leave. */}
                <div
                    ref={summaryDockRef}
                    data-testid="map-summary-dock"
                    className={isSummaryPaneOpen
                        ? 'absolute inset-0 flex min-h-0 flex-col'
                        : 'hidden'}
                />
            </section>
            </div>

            {/* Same surface language as the summary cards beside it: one ring,
                one radius, one shadow. A border here and a ring there read as
                two different component families on a screen where they are two
                halves of the same row. */}
            <section ref={mapSectionRef} className="order-1 scroll-mt-20 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 sm:order-2 lg:col-start-1 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:p-2 dark:bg-[#0c1813]/90 dark:ring-white/10" aria-label="Live incident map">
                {/* Mobile and tablet controls only: the desktop rail is the
                    full-width bar above, so from lg the card holds nothing but
                    the canvas — which is the cleanest thing a map card can hold,
                    and worth ~46px of canvas height on a laptop. The sheet is
                    rendered here because this is where its trigger lives. */}
                <div className="flex flex-col gap-2 p-2 sm:gap-2.5 sm:p-2.5 lg:hidden">
                    {mapExperience.filters.length > 0 && (() => {
                        const isFiltered = responderMapFilter && responderMapFilter !== 'all';
                        const currentFilterObj = mapExperience.filters.find((f) => f.value === responderMapFilter);
                        const activeFilterLabel = currentFilterObj ? currentFilterObj.label : (responderMapFilter === 'risk-zones' ? 'Risk Zones' : 'Active Incidents');
                        const activeFilterCount = getFilterCount(responderMapFilter);
                        const activeFilterSummary = `${activeFilterLabel} · ${activeFilterCount}`;
                        // Config owns which statuses a tab shows, so it owns the dot
                        // too: 'dispatch' is a pair, and reading its colour off
                        // MAP_STATUS_CONFIG directly would have fallen back to gray
                        // — the colour of "unknown state". This is the same lookup
                        // the rail and the sheet read, so the summary dot cannot
                        // name a different colour than the tab it reports on.
                        const activeStatusDotClass = getRailDotClass(responderMapFilter);

                        return (
                            <>
                                {/* 1. Mobile & Tablet Filter Control Bar (< lg / < 1024px) */}
                                <div className="flex w-full items-center gap-2 lg:hidden">
                                    {/* Filters Trigger Button */}
                                    <button
                                        ref={mobileFilterTriggerRef}
                                        type="button"
                                        onClick={() => setIsMobileFilterOpen(true)}
                                        aria-expanded={isMobileFilterOpen}
                                        aria-haspopup="dialog"
                                        aria-label={`Filters${isFiltered ? ', 1 filter applied' : ''}`}
                                        className={`inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${isFiltered
                                            ? 'bg-brand-700 text-white ring-brand-700 dark:bg-brand-600 dark:ring-brand-500'
                                            : 'bg-white/95 text-gray-800 ring-gray-200/80 hover:bg-white hover:ring-gray-300 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10 dark:hover:bg-white/10'
                                            }`}
                                    >
                                        <HiOutlineFilter className={`h-3.5 w-3.5 ${isFiltered ? 'text-brand-100 dark:text-white' : 'text-brand-700 dark:text-sky-400'}`} aria-hidden="true" />
                                        <span>Filters</span>
                                        {isFiltered && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums text-brand-800">
                                                1
                                            </span>
                                        )}
                                    </button>

                                    {/* Active Filter Summary (plain text) and Clear Action */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                        <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-[11px] font-medium text-gray-600 sm:text-xs dark:text-gray-400">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${activeStatusDotClass}`} aria-hidden="true" />
                                            <span className="truncate">{activeFilterSummary}</span>
                                        </p>

                                        {isFiltered && (
                                            <button
                                                type="button"
                                                onClick={() => setResponderMapFilter('all')}
                                                aria-label="Clear active filter and show all"
                                                className="flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                                title="Clear filter"
                                            >
                                                <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile & Tablet Filter Bottom Sheet */}
                                <MapMobileFilterSheet
                                    isOpen={isMobileFilterOpen}
                                    onClose={() => setIsMobileFilterOpen(false)}
                                    filters={mapExperience.filters}
                                    selectedFilter={responderMapFilter}
                                    onSelectFilter={setResponderMapFilter}
                                    getFilterCount={getFilterCount}
                                    triggerRef={mobileFilterTriggerRef}
                                />

                            </>
                        );
                    })()}
                </div>

                <div className={`relative ${PHONE_MAP_FRAME_CLASSES} overflow-hidden rounded-lg sm:aspect-auto sm:h-[460px] lg:h-auto lg:flex-1`}>
                    {loading && safeCount(reports) === 0 && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 dark:bg-[#0c1813]/80 backdrop-blur-xs" aria-live="polite">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600 dark:border-gray-700 dark:border-t-brand-400" />
                                Loading map data…
                            </div>
                        </div>
                    )}
                    <MapView
                        reports={reports}
                        highRiskZones={highRiskZones}
                        locateRequest={mapLocateRequest || deepLinkedLocateRequest}
                        externalContextPanelOpen={Boolean(mapSummaryPanel)}
                        onEntityInspectorChange={handleMapInspectorChange}
                        // The summary box, so a pin's details stand in the column
                        // beside the map instead of covering it.
                        dockTarget={summaryDockNode}
                        className="h-full w-full"
                        focusLocation={focusLocation}
                        homeFocus={municipalityHomeFocus}
                        showPending={mapExperience.showPendingReports}
                        dataLoading={loading}
                        filterStatus={mapExperience.filters.length > 0 ? responderMapFilter : null}
                        canRespond={mapExperience.canRespond}
                        onRespondToReport={mapExperience.canRespond ? handleMapRespond : null}
                        canResolve={mapExperience.canResolve}
                        canResolveReport={mapExperience.canResolve ? canCurrentResponderResolve : null}
                        onResolveReport={mapExperience.canResolve ? handleMapResolve : null}
                        canVerify={mapExperience.canVerify}
                        canVerifyReport={isReportInResponderMunicipality}
                        onVerifyToReport={mapExperience.canVerify ? handleMapVerify : null}
                        onRejectToReport={mapExperience.canVerify ? handleMapReject : null}
                        viewerRole={user?.role || 'guest'}
                        viewer={user}
                        showDataState
                        enable3D
                        // Per role: operators open on the incidents in front of
                        // them, guests open on the whole island. The report set
                        // is already role-scoped by the API, so the camera
                        // inherits that boundary rather than needing one of its
                        // own, and the island view is the fallback whenever
                        // there is nothing to frame.
                        frameReportsOnOpen={mapExperience.framesReportsOnOpen}
                        pulseReportIds={pulseReportIds}
                    />
                    {/* One panel, one host at every width: portalled into the
                        slot in the summary box the cards just gave up, which is
                        the map's own height — so the records are never a sheet
                        at the bottom of the screen, below a map they describe,
                        nor a card laid across the map itself. Held back for the
                        one frame before the slot exists, which keeps an overlay
                        from flashing in the map's corner on the way in. */}
                    {hasSummaryPanel && summaryDockNode && (
                        <MapOverlayPanel
                            id={MAP_SUMMARY_PANEL_ID}
                            title={panelTitle}
                            description={panelDescription}
                            onClose={closeMapSummaryPanel}
                            closeLabel={panelCloseLabel}
                            presentation="contextual"
                            dockTarget={summaryDockNode}
                            accentClassName={summaryPanelAccent}
                            accentDotClassName={summaryPanelTone.dot}
                            contentKey={`${mapSummaryPanel}:${selectedActiveIncidentId || selectedActiveRiskZoneId || 'list'}`}
                        >
                            {isIncidentSummaryPanel && selectedActiveIncident && (
                                <>
                                    {/* A back control, not a back band: the pane's
                                        own header already separates itself from
                                        the body, so a second full-width ruled bar
                                        here only cut the pane into strips. */}
                                    <div className="px-4 pt-3 sm:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedActiveIncidentId('')}
                                            className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white cursor-pointer"
                                        >
                                            <HiOutlineArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                            Back to {activeOverviewMetric?.label || 'active incidents'}
                                        </button>
                                    </div>
                                    <MapIncidentDetails
                                        report={selectedActiveIncident}
                                        viewerRole={user?.role || 'guest'}
                                        viewer={user}
                                        canRespond={selectedIncidentCanRespond}
                                        canResolve={selectedIncidentCanResolve}
                                        canVerify={selectedIncidentCanVerify}
                                        canReject={selectedIncidentCanReject}
                                        actionLoading={panelActionLoading}
                                        onRespond={selectedIncidentCanRespond
                                            ? (report) => runPanelIncidentAction(handleMapRespond, report, 'Now responding to incident')
                                            : undefined}
                                        onResolve={selectedIncidentCanResolve
                                            ? (report) => runPanelIncidentAction(handleMapResolve, report, 'Opening resolution review')
                                            : undefined}
                                        onVerify={selectedIncidentCanVerify
                                            ? (report) => runPanelIncidentAction(handleMapVerify, report, 'Opening verification review')
                                            : undefined}
                                        onReject={selectedIncidentCanReject
                                            ? (report) => runPanelIncidentAction(handleMapReject, report, 'Opening rejection review')
                                            : undefined}
                                    />
                                </>
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && activeOverviewMetric?.loading && panelIncidentReports.length === 0 && (
                                <PanelLoadingState label="Loading matching reports…" />
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && activeOverviewMetric?.error && !activeOverviewMetric.loading && (
                                <PanelErrorState
                                    title={`Unable to load ${activeOverviewMetric.label.toLowerCase()}`}
                                    description={activeOverviewMetric.error}
                                    onRetry={activeOverviewMetric.requiresReporterRecords ? retryReporterOverviewReports : undefined}
                                />
                            )}
                            {/* The two operational queues, one click deep instead of
                                one tab wide: the panel narrows to a segment of the
                                set the card counts, and the map keeps showing the
                                tab's full set so the two numbers stay honest. */}
                            {/* Only while the list is what the pane is showing. A
                                single incident's details are not a queue, and
                                leaving this rail mounted under them put a control
                                for choosing a set at the very bottom of the page a
                                reader had just narrowed to one record. */}
                            {activeQueuePanelOpen && !selectedActiveIncident && activeQueueSegments.length > 0 && (
                                // Pinned to the top of the pane's own scroll region:
                                // the queue is a lens on the list below it, so
                                // switching lenses must not mean scrolling back up
                                // through the rows already being read.
                                <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 pb-2 pt-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-[#0c1813]/95 sm:px-5">
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                        Queue
                                    </p>
                                    {/* One recessed track with three options instead
                                        of three separate bordered pills: they are a
                                        single choice, and the pills made the strip
                                        read as three unrelated actions. The recessed
                                        track and the brand fill are the ones the Map
                                        | Analytics switch uses
                                        (DashboardViewSwitch), so the page still has
                                        one segmented-control language rather than two
                                        that happen to look similar.

                                        The options themselves are the compact size,
                                        not the header switch's: this rail is a lens
                                        over a dense list inside a pane, where every
                                        pixel of chrome pushes a record out of view.
                                        `py-1` on `text-xs` is a 24px row — the
                                        smallest target WCAG 2.2 (2.5.8) accepts —
                                        with `flex-1` making up the width, so the
                                        strip is shorter without becoming unclickable. */}
                                    <div
                                        role="group"
                                        aria-label="Active incident queue"
                                        className="flex w-full flex-wrap items-center gap-0.5 rounded-lg bg-gray-100/80 p-0.5 ring-1 ring-gray-200/80 dark:bg-white/5 dark:ring-white/10"
                                    >
                                        {activeQueueSegments.map((segment) => {
                                            const isSelected = activeQueueSegment === segment.value;
                                            return (
                                                <button
                                                    key={segment.value}
                                                    type="button"
                                                    onClick={() => setActiveQueueSegment(segment.value)}
                                                    aria-pressed={isSelected}
                                                    // The full queue name is the
                                                    // accessible name and the tooltip;
                                                    // the printed word is the short one,
                                                    // and neither is ellipsized — see
                                                    // `activeQueueSegments`.
                                                    aria-label={`${segment.label} (${segment.records.length})`}
                                                    title={segment.label}
                                                    // ring-offset so the focus ring stays visible on the
                                                    // brand-filled option, where a brand ring on a brand
                                                    // fill would vanish.
                                                    className={`inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${isSelected
                                                        ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-600'
                                                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                                                        }`}
                                                >
                                                    <span>{segment.shortLabel || segment.label}</span>
                                                    <span className={`shrink-0 tabular-nums ${isSelected ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        {segment.records.length}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {isIncidentSummaryPanel && !selectedActiveIncident && !activeOverviewMetric?.loading && !activeOverviewMetric?.error && (
                                <IncidentList
                                    reports={panelIncidentReports}
                                    emptyTitle={activeOverviewMetric?.emptyTitle || 'No active incidents'}
                                    emptyDescription={activeOverviewMetric?.emptyDescription
                                        || (mapExperience.filters.length > 0 && responderMapFilter !== 'all'
                                            ? 'No incidents match the selected map filter.'
                                            : 'There are no verified or handled incidents on the map.')}
                                    onInspect={(report) => setSelectedActiveIncidentId(String(report._id || report.id))}
                                    onLocate={locateActiveIncident}
                                    canLocate={canLocatePanelReport}
                                    currentUserId={currentUserId}
                                    showOwnershipBadge={isReporter}
                                />
                            )}
                            {isRiskZoneSummaryPanel && selectedActiveRiskZone && (
                                <>
                                    <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800 sm:px-5">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedActiveRiskZoneId('')}
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-gray-700 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-gray-200 dark:hover:text-sky-400 cursor-pointer"
                                        >
                                            <HiOutlineArrowLeft className="h-4 w-4" aria-hidden="true" />
                                            Back to {activeOverviewMetric?.label || 'active risk zones'}
                                        </button>
                                    </div>
                                    <HighRiskZoneDetails zone={selectedActiveRiskZone} />
                                </>
                            )}
                            {isRiskZoneSummaryPanel && !selectedActiveRiskZone && (
                                <RiskZoneList
                                    zones={highRiskZones}
                                    onInspect={(zone) => setSelectedActiveRiskZoneId(String(zone._id || zone.id))}
                                    onLocate={locateZone}
                                    loading={highRiskZonesLoading}
                                    error={highRiskZonesError}
                                    onRetry={onRetryHighRiskZones}
                                />
                            )}
                            {isTrustPointsPanel && <TrustPointsSummary value={reporterTrustPoints} />}
                        </MapOverlayPanel>
                    )}
                </div>
            </section>
            </div>

            {!isAuthenticated && (
                <section className="border-t border-gray-200 py-3.5 sm:py-4 lg:shrink-0 dark:border-white/10 sm:flex sm:items-center sm:justify-between sm:gap-4" aria-label="Public safety and reporter registration">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[13px] sm:text-sm font-semibold text-gray-900 dark:text-white break-words">
                            Sibuyan Island Emergency Network
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 break-words">
                            Incident feeds are public. Join as a verified reporter to submit real-time reports.
                        </p>
                    </div>
                    <div className="mt-2.5 flex flex-row flex-wrap items-center gap-x-3 gap-y-2 sm:mt-0 sm:shrink-0">
                        <Button
                            as={Link}
                            to="/register"
                            className="inline-flex items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-xs font-semibold px-3.5 min-h-[38px] sm:min-h-9"
                        >
                            <span>Become a reporter</span>
                        </Button>
                        <Link
                            to="/login"
                            className="inline-flex min-h-9 items-center text-xs font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-sky-400"
                        >
                            Sign in
                        </Link>
                    </div>
                </section>
            )}

        </div>
    );
};

export default DashboardMapWorkspace;
