import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineBadgeCheck,
    HiOutlineArrowRight,
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

const formatRelativeTime = (value) => {
    if (!value) return 'Time unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return formatDistanceToNow(date, { addSuffix: true });
};

export const IncidentStatusBadge = ({ status }) => (
    <OperationalStatusIndicator status={status} />
);

const TransferAcknowledgmentState = ({ report, neutral = false }) => {
    const transfer = getLatestTransfer(report);
    if (!transfer) return null;

    const acknowledged = Boolean(transfer.acknowledgedAt);
    const Icon = acknowledged ? HiOutlineCheckCircle : HiOutlineClock;

    return (
        <span className={`mt-2 flex max-w-full items-start gap-1.5 text-xs font-medium leading-4 ${neutral ? 'text-gray-500 dark:text-gray-400' : acknowledged ? 'text-emerald-700' : 'text-amber-700'}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-50 ${compact ? 'h-10 w-10 shrink-0 p-0' : 'min-h-11 w-full min-w-0 px-3 py-2.5'} ${tones[tone]}`}
        >
            <Icon className={`h-4 w-4 ${disabled ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {!compact && <span className="min-w-0 break-words text-center leading-tight">{label}</span>}
        </button>
    );
};

export const IncidentActionButtons = ({ report, user, actions, onInspect, compact = false, hideInspect = false }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report.status === 'responding';

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
                    disabled={actions.acknowledgeLoadingId === report._id}
                />
            )}
            {capabilities.canRespond && (
                <ActionButton
                    label={isResponding ? 'Join response' : 'Respond to incident'}
                    icon={HiOutlineLightningBolt}
                    onClick={() => actions.openRespond(report)}
                    tone="primary"
                    compact={compact}
                    disabled={actions.respondLoadingId === report._id}
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
                    disabled={actions.deleteLoadingId === report._id}
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
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${style.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
            {normalizedSeverity || 'Unspecified'}
        </span>
    );
};

export const OperationalStatusIndicator = ({ status }) => {
    const config = INCIDENT_STATUS[status];
    if (!config) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                {status || 'Unknown'}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dotClassName || 'bg-gray-400'}`} aria-hidden="true" />
            {config.label}
        </span>
    );
};

const getResponderAssignment = (report) => {
    const assignedUnit = Array.isArray(report.responders)
        ? report.responders.find((entry) => entry?.unitName || entry?.user?.name)
        : null;
    if (assignedUnit?.unitName) return assignedUnit.unitName;

    const responder = report.respondedBy || assignedUnit?.user;
    const responderName = responder?.name;
    const agency = getAgencyLabel(responder?.agency || assignedUnit?.unitType || report.responderAgency);
    if (responderName && agency !== 'Unassigned') return `${agency} · ${responderName}`;
    return responderName || (agency !== 'Unassigned' ? agency : 'Unassigned');
};


const AdminIncidentActions = ({ report, user, actions, onInspect, isSelected = false }) => {
    const capabilities = getIncidentCapabilities(user, report);

    return (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
                type="button"
                onClick={() => onInspect(report)}
                aria-expanded={isSelected}
                aria-controls={isSelected ? 'responder-incident-inspector' : undefined}
                className="group inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold uppercase tracking-wider text-gray-700 transition-colors hover:bg-gray-100/80 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white sm:w-auto sm:justify-start"
            >
                <span>Inspect report</span>
                <HiOutlineArrowRight className="h-3.5 w-3.5 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-gray-500 dark:group-hover:text-emerald-400" aria-hidden="true" />
            </button>

            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
                {capabilities.canVerify && (
                    <button
                        type="button"
                        onClick={() => actions.openReview(report, 'verified')}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-2xs transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                        title="Verify report"
                        aria-label="Verify report"
                    >
                        <HiOutlineCheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Verify</span>
                    </button>
                )}
                {capabilities.canReject && (
                    <button
                        type="button"
                        onClick={() => actions.openReview(report, 'rejected')}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-red-200/90 bg-red-50/80 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-2xs transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                        title="Reject report"
                        aria-label="Reject report"
                    >
                        <HiOutlineXCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reject</span>
                    </button>
                )}
                {capabilities.canAcknowledgeTransfer && (
                    <button
                        type="button"
                        onClick={() => actions.acknowledgeTransfer(report)}
                        disabled={actions.acknowledgeLoadingId === report._id}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-violet-200/90 bg-violet-50/80 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-2xs transition-colors hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400"
                        title="Acknowledge transfer"
                        aria-label="Acknowledge transfer"
                    >
                        <HiOutlineCheckCircle className={`h-3.5 w-3.5 ${actions.acknowledgeLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                        <span>Acknowledge</span>
                    </button>
                )}
                {capabilities.canTransfer && (
                    <button
                        type="button"
                        onClick={() => actions.openTransfer(report)}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-violet-200/90 bg-violet-50/80 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-2xs transition-colors hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400"
                        title="Transfer report"
                        aria-label="Transfer report"
                    >
                        <HiOutlineSwitchHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Transfer</span>
                    </button>
                )}
                {capabilities.canDelete && (
                    <button
                        type="button"
                        onClick={() => actions.deleteReport(report)}
                        disabled={actions.deleteLoadingId === report._id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-400 shadow-2xs transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        title="Delete report"
                        aria-label="Delete report"
                    >
                        <HiOutlineTrash className={`h-3.5 w-3.5 ${actions.deleteLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
};

const ResponderIncidentActions = ({ report, user, actions, onInspect, isSelected = false }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report.status === 'responding';

    return (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
                type="button"
                onClick={() => onInspect(report)}
                aria-expanded={isSelected}
                aria-controls={isSelected ? 'responder-incident-inspector' : undefined}
                className="group inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold uppercase tracking-wider text-gray-700 transition-colors hover:bg-gray-100/80 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white sm:w-auto sm:justify-start"
            >
                <span>Inspect report</span>
                <HiOutlineArrowRight className="h-3.5 w-3.5 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700 dark:text-gray-500 dark:group-hover:text-emerald-400" aria-hidden="true" />
            </button>

            {capabilities.canRespond && (
                <button
                    type="button"
                    onClick={() => actions.openRespond(report)}
                    disabled={actions.respondLoadingId === report._id}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 sm:w-auto"
                >
                    <HiOutlineLightningBolt className={`h-3.5 w-3.5 ${actions.respondLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    {isResponding ? 'Join response' : 'Respond to incident'}
                </button>
            )}

            {capabilities.canResolve && (
                <button
                    type="button"
                    onClick={() => actions.openResolve(report)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 text-xs font-semibold uppercase tracking-wider text-gray-700 shadow-2xs transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-900 sm:w-auto"
                >
                    <HiOutlineBadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Resolve incident
                </button>
            )}
        </div>
    );
};

const IncidentListRow = ({ report, isSelected = false, actionSlot }) => {
    const latestUpdate = report.latestReporterUpdate
        || (Array.isArray(report.reportUpdates) ? report.reportUpdates[report.reportUpdates.length - 1] : null);
    const updateMeta = latestUpdate ? getReportUpdateMeta(latestUpdate.tag) : null;
    const assignment = getResponderAssignment(report);
    const resolved = report.status === 'resolved';
    const incidentType = report.incidentType || report.incidentCategory || report.accidentType || 'Incident';

    return (
        <article
            className={`min-w-0 rounded-2xl border px-3.5 py-4 transition-colors duration-150 sm:px-5 sm:py-4.5 ${isSelected
                ? 'border-gray-400 bg-gray-50 border-l-[3px] border-l-brand-600 shadow-2xs dark:border-gray-600 dark:bg-gray-900/70 dark:border-l-brand-500'
                : 'border-gray-200/90 bg-white hover:bg-gray-50/60 shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]'}`}
            data-status={report.status || 'unknown'}
            data-selected={isSelected ? 'true' : 'false'}
        >
            {isSelected && <span className="sr-only">Selected incident details are open.</span>}
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <IncidentSeverityIndicator severity={report.severity} />
                        <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">&middot;</span>
                        <OperationalStatusIndicator status={report.status} />
                    </div>
                    <h2 className={`mt-1.5 break-words font-display text-base font-bold leading-6 sm:text-lg ${resolved ? 'text-gray-800 dark:text-gray-200' : 'text-gray-950 dark:text-white'}`}>
                        {report.address || 'Address unavailable'}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm capitalize text-gray-600 dark:text-gray-300 sm:line-clamp-1">
                        {incidentType}
                        {report.description && <span className="normal-case text-gray-500 dark:text-gray-400"> &middot; {report.description}</span>}
                    </p>
                </div>
                <time
                    dateTime={getIncidentDate(report) || undefined}
                    className="shrink-0 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400 sm:pt-0.5 sm:text-right"
                >
                    {formatRelativeTime(getIncidentDate(report))}
                </time>
            </div>

            <div className="mt-2.5 flex flex-col gap-1 text-xs leading-5 text-gray-500 dark:text-gray-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
                <span>Reported by <span className="font-semibold text-gray-800 dark:text-gray-200">{report.reporter?.name || 'Unknown reporter'}</span></span>
                <span className="hidden text-gray-300 dark:text-gray-700 sm:inline" aria-hidden="true">&middot;</span>
                <span>{assignment === 'Unassigned' ? 'Unassigned' : <>Assigned to <span className="font-semibold text-gray-800 dark:text-gray-200">{assignment}</span></>}</span>
            </div>

            <TransferAcknowledgmentState report={report} neutral />

            {report.hasUnreadReporterUpdate && updateMeta && (
                <div className="mt-2.5 rounded-xl border border-brand-200/80 bg-brand-50/50 p-2.5 dark:border-brand-900/40 dark:bg-brand-950/20">
                    <p className="text-xs font-semibold text-brand-800 dark:text-emerald-300">New reporter update &middot; {updateMeta.label}</p>
                    {latestUpdate?.message && <p className="mt-0.5 line-clamp-2 text-xs text-brand-700 dark:text-emerald-400">{latestUpdate.message}</p>}
                </div>
            )}

            <div className="mt-3 border-t border-gray-100 pt-2 dark:border-white/5">
                {actionSlot}
            </div>
        </article>
    );
};

const ResponderIncidentRow = ({ report, user, actions, onInspect, isSelected = false }) => {
    return (
        <IncidentListRow
            report={report}
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
    <div className="divide-y divide-gray-100 border-y border-gray-200/80 dark:divide-white/5 dark:border-white/10" role="status" aria-live="polite">
        <span className="sr-only">Loading incident reports...</span>
        {[0, 1, 2].map((item) => (
            <div key={item} className="animate-pulse px-1 py-5 sm:px-2">
                <div className="h-3 w-36 rounded-md bg-gray-200 dark:bg-white/10" />
                <div className="mt-3 h-5 w-2/3 rounded-md bg-gray-200 dark:bg-white/10" />
                <div className="mt-2 h-3 w-1/2 rounded-md bg-gray-100 dark:bg-white/5" />
                <div className="mt-4 h-9 w-32 rounded-xl bg-gray-100 dark:bg-white/5" />
            </div>
        ))}
    </div>
);

const IncidentPagination = ({ pagination, onPageChange }) => {
    if (!pagination || pagination.pages <= 1) return null;

    return (
        <nav
            className="mt-4 flex flex-col gap-3 border-t border-gray-200/80 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Incident queue pages"
        >
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-left">
                Page <strong className="font-semibold text-gray-800 dark:text-gray-200">{pagination.page}</strong> of {pagination.pages}
                <span aria-hidden="true"> &middot; </span>{pagination.total} incidents
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                    type="button"
                    onClick={() => onPageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                    Previous
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
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
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center dark:border-red-900/50 dark:bg-red-950/20" role="alert">
                <p className="font-semibold text-red-900 dark:text-red-300">Incident queue unavailable</p>
                <p className="mt-1 text-xs sm:text-sm text-red-700 dark:text-red-400">{error}</p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex h-9 items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-xs font-semibold text-red-800 shadow-2xs transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-gray-700"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (reports.length === 0) {
        const responderEmptyCopy = {
            available: ['No incidents are waiting for dispatch', 'New verified or transferred incidents will appear here.'],
            municipalActive: ['No active municipal incidents', 'Verified, transferred, and responding incidents will appear here.'],
            active: ['You have no active responses', 'Start a response from the Available tab when an eligible incident needs your unit.'],
            history: ['No response history yet', 'Incidents resolved by your response unit will appear here.'],
        };
        const emptyCopy = (isResponder && responderEmptyCopy[responderView])
            || ['No incident reports found', 'Adjust the status or search filters and try again.'];
        return (
            <div className="rounded-2xl border border-dashed border-gray-200/90 bg-white p-10 text-center dark:border-white/10 dark:bg-white/5">
                <p className="font-semibold text-gray-900 dark:text-white">{emptyCopy[0]}</p>
                <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">{emptyCopy[1]}</p>
            </div>
        );
    }

    const RowComponent = isResponder ? ResponderIncidentRow : AdminIncidentRow;

    return (
        <section aria-label="Incident queue">
            <ul aria-label={isResponder ? "Responder incident list" : "Admin incident list"} className="flex flex-col gap-3">
                {reports.map((report) => (
                    <li key={report._id}>
                        <RowComponent
                            report={report}
                            user={user}
                            actions={actions}
                            onInspect={onInspect}
                            isSelected={String(report._id) === String(selectedReportId)}
                        />
                    </li>
                ))}
            </ul>

            <IncidentPagination pagination={pagination} onPageChange={onPageChange} lightweight />
        </section>
    );
};

export default IncidentQueue;
