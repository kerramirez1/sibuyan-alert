import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineArrowRight,
    HiOutlineBadgeCheck,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineEye,
    HiOutlineLightningBolt,
    HiOutlineSwitchHorizontal,
    HiOutlineTrash,
    HiOutlineXCircle,
} from 'react-icons/hi';
import {
    getAgencyLabel,
    getIncidentCapabilities,
    getIncidentDate,
    getLatestTransfer,
    INCIDENT_STATUS,
    SEVERITY_INDICATOR_STYLES,
} from './incidentReportConfig';
import { getReportUpdateMeta } from '../../utils/notificationNavigation';
import { getTransferOrigin } from '../../utils/incidentDetails';
import { getReportIncidentTypeLabel } from '../../config/incidentTypes';
import { getMapStatusDot } from '../../config/mapVisuals';
import { Skeleton, SkeletonButton } from '../ui/Skeleton';

// Erroneous future incident times (beyond clock-skew tolerance) render as an
// absolute timestamp with a quiet flag instead of a confusing "in X hours".
// Stored values are never mutated to fix display.
const FUTURE_TIME_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour

const getTimeDisplay = (value) => {
    const fallback = { text: 'Time unavailable', absolute: undefined, isFuture: false };
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    const absolute = format(date, 'MMM d, yyyy, h:mm a');
    const isFuture = date.getTime() - Date.now() > FUTURE_TIME_TOLERANCE_MS;
    return {
        text: isFuture ? absolute : formatDistanceToNow(date, { addSuffix: true }),
        absolute,
        isFuture,
    };
};

export const IncidentStatusBadge = ({ status }) => (
    <OperationalStatusIndicator status={status} />
);

/**
 * Whether the receiving office has taken a transfer up.
 *
 * Laid out inline rather than as a block of its own: provenance and
 * acknowledgement are two halves of one fact about one transfer, so they belong
 * on one line. Stacked, every transferred row in the queue spent a second line
 * saying something its reader already had to read together anyway.
 */
const TransferAcknowledgmentState = ({ report, neutral = false }) => {
    const transfer = getLatestTransfer(report);
    if (!transfer) return null;

    const acknowledged = Boolean(transfer.acknowledgedAt);
    const Icon = acknowledged ? HiOutlineCheckCircle : HiOutlineClock;

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${neutral ? 'text-gray-500 dark:text-gray-400' : acknowledged ? 'text-emerald-700' : 'text-amber-700'}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{acknowledged ? 'Transfer acknowledged' : 'Awaiting acknowledgment'}</span>
        </span>
    );
};

const ActionButton = ({ label, icon: Icon, onClick, tone = 'neutral', compact = false, disabled = false }) => {
    const tones = {
        neutral: 'border-transparent text-gray-700 hover:bg-gray-50',
        success: 'border-transparent text-emerald-700 hover:bg-emerald-50',
        danger: 'border-transparent text-red-700 hover:bg-red-50',
        primary: 'border-transparent text-blue-700 hover:bg-blue-50',
        violet: 'border-transparent text-violet-700 hover:bg-violet-50',
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:cursor-wait disabled:opacity-50 ${compact ? 'h-11 w-11 shrink-0 p-0 sm:h-10 sm:w-10' : 'min-h-10 w-full min-w-0 px-3 py-3 sm:py-2'} ${tones[tone]}`}
        >
            {compact && <Icon className="h-4 w-4" aria-hidden="true" />}
            {!compact && <span className="min-w-0 break-words text-center leading-tight">{label}</span>}
        </button>
    );
};

export const IncidentActionButtons = ({ report, user, actions, onInspect, compact = false, hideInspect = false }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report?.status === 'responding';

    return (
        <div className={compact
            ? 'flex w-full flex-wrap items-center justify-center gap-2'
            : 'grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2'}>
            {!hideInspect && (
                <ActionButton
                    label="Inspect report"
                    icon={HiOutlineEye}
                    onClick={() => onInspect(report)}
                    compact={compact}
                />
            )}
            {capabilities.canAcknowledgeTransfer && (
                <ActionButton
                    label="Acknowledge transfer"
                    icon={HiOutlineCheckCircle}
                    onClick={() => actions.acknowledgeTransfer(report)}
                    tone="violet"
                    compact={compact}
                    disabled={actions.acknowledgeLoadingId === report?._id}
                />
            )}
            {capabilities.canRespond && (
                <ActionButton
                    label={isResponding ? 'Join response' : 'Respond to incident'}
                    icon={HiOutlineLightningBolt}
                    onClick={() => actions.openRespond(report)}
                    tone="primary"
                    compact={compact}
                    disabled={actions.respondLoadingId === report?._id}
                />
            )}
            {capabilities.canResolve && (
                <ActionButton
                    label="Resolve incident"
                    icon={HiOutlineBadgeCheck}
                    onClick={() => actions.openResolve(report)}
                    tone="success"
                    compact={compact}
                />
            )}
            {capabilities.canVerify && (
                <ActionButton
                    label="Verify report"
                    icon={HiOutlineCheckCircle}
                    onClick={() => actions.openReview(report, 'verified')}
                    tone="success"
                    compact={compact}
                />
            )}
            {capabilities.canReject && (
                <ActionButton
                    label="Reject report"
                    icon={HiOutlineXCircle}
                    onClick={() => actions.openReview(report, 'rejected')}
                    tone="danger"
                    compact={compact}
                />
            )}
            {capabilities.canTransfer && (
                <ActionButton
                    label="Transfer report"
                    icon={HiOutlineSwitchHorizontal}
                    onClick={() => actions.openTransfer(report)}
                    tone="violet"
                    compact={compact}
                />
            )}
            {capabilities.canDelete && (
                <ActionButton
                    label="Delete report"
                    icon={HiOutlineTrash}
                    onClick={() => actions.deleteReport(report)}
                    tone="danger"
                    compact={compact}
                    disabled={actions.deleteLoadingId === report?._id}
                />
            )}
        </div>
    );
};

export const IncidentSeverityIndicator = ({ severity }) => {
    const normalizedSeverity = typeof severity === 'string' ? severity.toLocaleLowerCase() : '';
    const style = SEVERITY_INDICATOR_STYLES[normalizedSeverity]
        || { dot: 'bg-gray-400', text: 'text-gray-600 dark:text-gray-300' };

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${style.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
            {normalizedSeverity || 'Unspecified'}
        </span>
    );
};

export const OperationalStatusIndicator = ({ status }) => {
    const config = INCIDENT_STATUS[status];
    if (!config) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                {status || 'Unknown'}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dotClassName || 'bg-gray-400'}`} aria-hidden="true" />
            {config.label}
        </span>
    );
};

const getResponderAssignment = (report) => {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return 'Unassigned';
    const assignedUnit = Array.isArray(report.responders)
        ? report.responders.filter(Boolean).find((entry) => entry?.unitName || entry?.user?.name)
        : null;
    if (assignedUnit?.unitName) return assignedUnit.unitName;

    const responder = report?.respondedBy || assignedUnit?.user;
    const responderName = responder?.name;
    const agency = getAgencyLabel(responder?.agency || assignedUnit?.unitType || report?.responderAgency);
    if (responderName && agency !== 'Unassigned') return `${agency} · ${responderName}`;
    return responderName || (agency !== 'Unassigned' ? agency : 'Unassigned');
};


/**
 * A secondary row action.
 *
 * Outlined, with the semantic colour kept in the border and the text rather than
 * a filled tint. The filled tints were visually louder than the "Inspect report"
 * button beside them, which inverted the hierarchy — the action that opens the
 * record read as the least prominent thing in the row.
 *
 * The colour still carries the meaning (verify is blue, reject is red, a
 * transfer is violet) and the label is always rendered, so nothing here depends
 * on colour alone.
 */
const SecondaryActionButton = ({ label, ariaLabel, tone, onClick, disabled = false, className = '' }) => {
    const tones = {
        verify: 'border-blue-300 text-blue-800 hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/40',
        reject: 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40',
        transfer: 'border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-900/60 dark:text-violet-300 dark:hover:bg-violet-950/40',
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={ariaLabel}
            aria-label={ariaLabel}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-50 sm:min-h-9 ${tones[tone]} ${className}`}
        >
            <span>{label}</span>
        </button>
    );
};

/**
 * Opening a record — the same control on the admin and responder rows.
 *
 * Text affordance, not an icon-only glyph: on mobile the arrow rendered
 * orphaned on its own line with no border and no label, reading as decoration
 * rather than the way into the dossier. `View details` plus the arrow is quiet
 * but unmistakably a control; the underline on hover and the focus ring are
 * what make it findable and operable for pointer and keyboard users alike.
 *
 * The accessible name stays `Inspect report` via `aria-label` (the visible
 * text is the friendlier "View details"); `title` gives it back to a pointer.
 * `aria-expanded` / `aria-controls` are unchanged: the inspector is still what
 * this opens, and the tests that drive it that way still hold.
 */
const InspectReportButton = ({ report, onInspect, isSelected = false }) => (
    <button
        type="button"
        onClick={() => onInspect(report)}
        aria-expanded={isSelected}
        aria-controls={isSelected ? 'responder-incident-inspector' : undefined}
        title="Inspect report"
        aria-label="Inspect report"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 px-1 text-[13px] font-semibold text-[var(--accent-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
        <span>View details</span>
        <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
);

const AdminIncidentActions = ({ report, user, actions, onInspect, isSelected = false }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const hasWorkingAction = capabilities.canVerify
        || capabilities.canReject
        || capabilities.canAcknowledgeTransfer
        || capabilities.canTransfer
        || capabilities.canDismiss;

    return (
        <div className="flex w-full flex-row flex-wrap items-center gap-1.5 sm:justify-between">
            {/* w-full on mobile so Verify/Reject keep their full-width flex-1
                sizing exactly as before; content-width on sm+ so
                justify-between can push the group right. */}
            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
            {capabilities.canVerify && (
                    <SecondaryActionButton
                        label="Verify"
                        ariaLabel="Verify report"
                        tone="verify"
                        onClick={() => actions.openReview(report, 'verified')}
                        className="flex-1 sm:flex-none"
                    />
                )}
                {capabilities.canReject && (
                    <SecondaryActionButton
                        label="Reject"
                        ariaLabel="Reject report"
                        tone="reject"
                        onClick={() => actions.openReview(report, 'rejected')}
                        className="flex-1 sm:flex-none"
                    />
                )}
                {capabilities.canAcknowledgeTransfer && (
                    <SecondaryActionButton
                        label="Acknowledge"
                        ariaLabel="Acknowledge transfer"
                        tone="transfer"
                        onClick={() => actions.acknowledgeTransfer(report)}
                        disabled={actions.acknowledgeLoadingId === report?._id}
                    />
                )}
                {capabilities.canTransfer && (
                    <SecondaryActionButton
                        label="Transfer"
                        ariaLabel="Transfer report"
                        tone="transfer"
                        onClick={() => actions.openTransfer(report)}
                    />
                )}
                {capabilities.canDismiss && (
                    <button
                        type="button"
                        onClick={() => actions.dismissReport(report)}
                        disabled={actions.deleteLoadingId === report?._id}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-[13px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-50 sm:min-h-9 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        title="Remove this transferred report from your queue"
                        aria-label="Remove transferred report from queue"
                    >
                        <span>Remove</span>
                    </button>
                )}

                {/* Destructive, and set apart from the working actions: a hairline,
                    then a quiet control that only shows its colour on hover or
                    focus. Still labelled, still a full-size target. */}
                {capabilities.canDelete && (
                    <>
                        {hasWorkingAction && (
                            <span className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" aria-hidden="true" />
                        )}
                        <button
                            type="button"
                            onClick={() => actions.deleteReport(report)}
                            disabled={actions.deleteLoadingId === report?._id}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-wait disabled:opacity-50 sm:h-9 sm:w-9 dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            title="Delete report"
                            aria-label="Delete report"
                        >
                            <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </>
                )}
            </div>

            {/* View details sits last on mobile where the workflow actions lead;
                on sm+ order-first returns it to the left while justify-between
                pushes the buttons right — the original desktop arrangement.
                The span (not the shared button) carries the ordering so the
                responder row is untouched. */}
            <span className="order-last sm:order-first inline-flex">
                <InspectReportButton report={report} onInspect={onInspect} isSelected={isSelected} />
            </span>
        </div>
    );
};

/**
 * The responder row's primary action.
 *
 * `Respond` and `Resolve` are the same thing to the reader — the step this
 * responder takes on this incident — and they can never both render, so they
 * share one treatment.
 *
 * They did not before, and the row lost its anchor because of it: "Respond to
 * incident" was filled while "Resolve incident" was a plain outline, so as soon
 * as an incident was assigned to the responder, both buttons in the row read as
 * outlines and nothing looked primary — unlike the admin row, where a filled
 * "Inspect report" holds the row together. Same class of action, two different
 * weights, depending on which one happened to apply.
 */
const RESPONDER_PRIMARY_ACTION_CLASS = 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-[13px] font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 dark:bg-brand-600 dark:text-white dark:hover:bg-brand-500 sm:w-auto';

const ResponderIncidentActions = ({ report, user, actions, onInspect, isSelected = false }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report?.status === 'responding';

    return (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <InspectReportButton report={report} onInspect={onInspect} isSelected={isSelected} />

            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            {capabilities.canRespond && (
                <button
                    type="button"
                    onClick={() => actions.openRespond(report)}
                    disabled={actions.respondLoadingId === report?._id}
                    className={RESPONDER_PRIMARY_ACTION_CLASS}
                >
                    {isResponding ? 'Join response' : 'Respond to incident'}
                </button>
            )}

            {capabilities.canResolve && (
                <button
                    type="button"
                    onClick={() => actions.openResolve(report)}
                    className={RESPONDER_PRIMARY_ACTION_CLASS}
                >
                    Resolve incident
                </button>
            )}
            </div>
        </div>
    );
};

const IncidentListRow = ({ report, user = null, isSelected = false, actionSlot }) => {
    const safeReport = report && typeof report === 'object' && !Array.isArray(report) ? report : {};
    const latestUpdate = safeReport.latestReporterUpdate
        || (Array.isArray(safeReport.reportUpdates) ? safeReport.reportUpdates.filter(Boolean)[safeReport.reportUpdates.filter(Boolean).length - 1] : null);
    const updateMeta = latestUpdate ? getReportUpdateMeta(latestUpdate?.tag) : null;
    const assignment = getResponderAssignment(safeReport);
    const resolved = safeReport.status === 'resolved';
    const incidentType = getReportIncidentTypeLabel(safeReport, 'Incident');
    // Acknowledged transfers keep their downstream status (e.g. responding),
    // so provenance needs its own line — the status badge alone can't show it.
    // Origin viewers read "to", everyone else reads "from".
    // Read once: the row needs to know both whether there is a transfer, and what
    // the line about it says.
    const latestTransfer = getLatestTransfer(safeReport);
    const transferOrigin = getTransferOrigin(safeReport);
    const viewerMunicipality = user?.assignedMunicipality?.trim().toLocaleLowerCase() || '';
    const transferLine = transferOrigin
        ? (viewerMunicipality && viewerMunicipality === transferOrigin.trim().toLocaleLowerCase()
            ? `Transferred to ${safeReport.municipalityName || 'another municipality'}`
            : `Transferred from ${transferOrigin}`)
        : '';
    const timeDisplay = getTimeDisplay(getIncidentDate(safeReport));

    return (
        <article
            className={`min-w-0 border-l-[3px] px-4 py-5 sm:px-5 ${isSelected
                ? 'border-l-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-l-transparent'}`}
            data-status={safeReport.status || 'unknown'}
            data-selected={isSelected ? 'true' : 'false'}
        >
            {isSelected && <span className="sr-only">Selected incident details are open.</span>}
            {/* Severity and response state are separate facts — how bad it is,
                versus how far along the response is — so they are divided by a
                hairline rather than a middot, which read as one compound badge.
                Both keep their own label and their own colour; neither is
                carried by colour alone. */}
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="record-state-group min-w-0">
                    <IncidentSeverityIndicator severity={safeReport.severity} />
                    <span className="record-state-group__divider" aria-hidden="true" />
                    <OperationalStatusIndicator status={safeReport.status} />
                </div>
                <time
                    dateTime={getIncidentDate(safeReport) || undefined}
                    title={timeDisplay.absolute}
                    className="shrink-0 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400 sm:pt-0.5 sm:text-right"
                >
                    {timeDisplay.text}
                    {timeDisplay.isFuture && (
                        <span className="ml-1.5 font-normal text-amber-600 dark:text-amber-400">
                            check time
                        </span>
                    )}
                </time>
            </div>

            {/* The strongest content in the record: where it happened. */}
            <h2 className={`mt-2 break-words text-base font-semibold leading-6 sm:text-[17px] ${resolved ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                {safeReport.address || 'Address unavailable'}
            </h2>
            <p className="mt-1 line-clamp-1 text-[13px] text-gray-600 dark:text-gray-300">
                {incidentType}
                {safeReport.description && <span className="normal-case text-gray-500 dark:text-gray-400"> &middot; {safeReport.description}</span>}
            </p>

            {/* Labels stay quiet, values carry the weight, and the pair spreads
                into columns so the record's width is used rather than trailing
                off into empty space. */}
            <div className="record-meta mt-3">
                <p className="record-meta__item">
                    <span className="record-meta__label">Reported by</span>
                    <span className="record-meta__value">{safeReport.reporter?.name || 'Unknown reporter'}</span>
                </p>
                <p className="record-meta__item">
                    {assignment !== 'Unassigned' && (
                        <span className="record-meta__label">Assigned to</span>
                    )}
                    {assignment === 'Unassigned'
                        ? <span className="record-meta__value record-meta__value--muted">Unassigned · needs unit</span>
                        : <span className="record-meta__value">{assignment}</span>}
                </p>
            </div>

            {/* Provenance and acknowledgement, on one line. `flex-wrap` is what
                keeps that true down to a phone: the pair drops to a second line
                only when the row genuinely cannot hold it. */}
            {(latestTransfer || transferLine) && (
                <div
                    data-transfer-summary="true"
                    className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5"
                >
                    {latestTransfer && <TransferAcknowledgmentState report={safeReport} neutral />}
                    {latestTransfer && transferLine && (
                        <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">&middot;</span>
                    )}
                    {transferLine && (
                        <span className="flex min-w-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getMapStatusDot('transferred')}`} aria-hidden="true" />
                            <span>{transferLine}</span>
                        </span>
                    )}
                </div>
            )}

            {safeReport.hasUnreadReporterUpdate && updateMeta && (
                <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <p className="text-xs font-semibold text-brand-800 dark:text-sky-300">New reporter update &middot; {updateMeta.label}</p>
                    {latestUpdate?.message && <p className="mt-0.5 line-clamp-2 text-xs text-brand-700 dark:text-sky-400">{latestUpdate.message}</p>}
                </div>
            )}

            <div className="mt-3.5 border-t border-[var(--border)] pt-3">
                {actionSlot}
            </div>
        </article>
    );
};

const ResponderIncidentRow = ({ report, user, actions, onInspect, isSelected = false }) => {
    return (
        <IncidentListRow
            report={report}
            user={user}
            isSelected={isSelected}
            actionSlot={
                <ResponderIncidentActions
                    report={report}
                    user={user}
                    actions={actions}
                    onInspect={onInspect}
                    isSelected={isSelected}
                />
            }
        />
    );
};

const AdminIncidentRow = ({ report, user, actions, onInspect, isSelected = false }) => {
    return (
        <IncidentListRow
            report={report}
            user={user}
            isSelected={isSelected}
            actionSlot={
                <AdminIncidentActions
                    report={report}
                    user={user}
                    actions={actions}
                    onInspect={onInspect}
                    isSelected={isSelected}
                />
            }
        />
    );
};

const IncidentQueueSkeleton = () => (
    <div className="divide-y divide-gray-100 border-y border-gray-200/80 dark:divide-white/5 dark:border-white/10" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading incident reports...</span>
        {[0, 1, 2].map((item) => (
            <div key={item} className="px-1 py-5 sm:px-2 space-y-3">
                <Skeleton variant="text" role={null} className="h-3 w-36 rounded-md" />
                <Skeleton variant="text" role={null} className="h-5 w-2/3 rounded-md" />
                <Skeleton variant="text" role={null} className="h-3 w-1/2 rounded-md opacity-80" />
                <div className="pt-2">
                    <SkeletonButton role={null} size="h-9 w-32" />
                </div>
            </div>
        ))}
    </div>
);

const IncidentPagination = ({ pagination, onPageChange }) => {
    const page = Number(pagination?.page);
    const pages = Number(pagination?.pages);
    const total = Number(pagination?.total);
    if (!pagination || !Number.isFinite(pages) || pages <= 1) return null;
    const safePage = Number.isFinite(page) ? page : 1;
    const safeTotal = Number.isFinite(total) ? total : 0;

    return (
        <nav
            className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Incident queue pages"
        >
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-left">
                Page <strong className="font-semibold text-gray-800 dark:text-gray-200">{safePage}</strong> of {pages}
                <span aria-hidden="true"> &middot; </span>{safeTotal} incidents
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                    type="button"
                    onClick={() => onPageChange(safePage - 1)}
                    disabled={safePage <= 1}
                    className="btn-outline"
                >
                    Previous
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(safePage + 1)}
                    disabled={safePage >= pages}
                    className="btn-outline"
                >
                    Next
                </button>
            </div>
        </nav>
    );
};

const IncidentQueue = ({
    reports,
    loading,
    error,
    onRetry,
    user,
    actions,
    onInspect,
    responderView,
    pagination,
    onPageChange,
    selectedReportId = '',
}) => {
    const isResponder = user?.role === 'responder';

    if (loading) {
        return <IncidentQueueSkeleton />;
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/20" role="alert">
                <p className="text-sm font-semibold text-red-900 dark:text-red-300">Incident queue unavailable</p>
                <p className="mt-1 text-[13px] text-red-700 dark:text-red-400">{error}</p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-[13px] font-medium text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:h-9 dark:border-red-800 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-gray-700"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (!Array.isArray(reports) || reports.filter(Boolean).length === 0) {
        const responderEmptyCopy = {
            available: ['No incidents are waiting for dispatch', 'New verified or transferred incidents will appear here.'],
            municipalActive: ['No active municipal incidents', 'Verified, transferred, and responding incidents will appear here.'],
            active: ['You have no active responses', 'Start a response from the Available tab when an eligible incident needs your unit.'],
            history: ['No response history yet', 'Incidents resolved by your response unit will appear here.'],
        };
        const emptyCopy = (isResponder && responderEmptyCopy[responderView])
            || ['No incident reports found', 'Adjust the status or search filters and try again.'];
        return (
            <div className="surface-panel p-10 text-center">
                <p className="section-title">{emptyCopy[0]}</p>
                <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">{emptyCopy[1]}</p>
            </div>
        );
    }

    const RowComponent = isResponder ? ResponderIncidentRow : AdminIncidentRow;
    const safeReports = (Array.isArray(reports) ? reports.filter(Boolean) : []);

    return (
        <section aria-label="Incident queue">
            <ul aria-label={isResponder ? "Responder incident list" : "Admin incident list"} className="surface-panel divide-y divide-[var(--border)] overflow-hidden">
                {safeReports.map((report, index) => (
                    <li key={report?._id ?? index}>
                        <RowComponent
                            report={report}
                            user={user}
                            actions={actions}
                            onInspect={onInspect}
                            isSelected={String(report?._id) === String(selectedReportId)}
                        />
                    </li>
                ))}
            </ul>

            <IncidentPagination pagination={pagination} onPageChange={onPageChange} lightweight />
        </section>
    );
};

export default IncidentQueue;
