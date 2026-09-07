import { formatDistanceToNow } from 'date-fns';
import {
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
import { Skeleton, SkeletonButton } from '../ui/Skeleton';

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
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:cursor-wait disabled:opacity-50 ${compact ? 'h-11 w-11 shrink-0 p-0 sm:h-10 sm:w-10' : 'min-h-10 w-full min-w-0 px-3 py-3 sm:py-2'} ${tones[tone]}`}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
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
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${style.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
            {normalizedSeverity || 'Unspecified'}
        </span>
    );
};

export const OperationalStatusIndicator = ({ status }) => {
    const config = INCIDENT_STATUS[status];
    if (!config) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                {status || 'Unknown'}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
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
                className="inline-flex min-h-10 w-full items-center justify-start rounded-md px-2 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white sm:w-auto sm:py-0.5"
            >
                <span>Inspect report</span>
            </button>

            <div className="flex flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                {capabilities.canVerify && (
                    <button
                        type="button"
                        onClick={() => actions.openReview(report, 'verified')}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[13px] font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
                        title="Verify report"
                        aria-label="Verify report"
                    >
                        <HiOutlineCheckCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Verify</span>
                    </button>
                )}
                {capabilities.canReject && (
                    <button
                        type="button"
                        onClick={() => actions.openReview(report, 'rejected')}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] font-medium text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                        title="Reject report"
                        aria-label="Reject report"
                    >
                        <HiOutlineXCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Reject</span>
                    </button>
                )}
                {capabilities.canAcknowledgeTransfer && (
                    <button
                        type="button"
                        onClick={() => actions.acknowledgeTransfer(report)}
                        disabled={actions.acknowledgeLoadingId === report._id}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[13px] font-medium text-violet-700 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-wait disabled:opacity-50 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300"
                        title="Acknowledge transfer"
                        aria-label="Acknowledge transfer"
                    >
                        <HiOutlineCheckCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Acknowledge</span>
                    </button>
                )}
                {capabilities.canTransfer && (
                    <button
                        type="button"
                        onClick={() => actions.openTransfer(report)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                        title="Transfer report"
                        aria-label="Transfer report"
                    >
                        <HiOutlineSwitchHorizontal className="h-4 w-4" aria-hidden="true" />
                        <span>Transfer</span>
                    </button>
                )}
                {capabilities.canDelete && (
                    <button
                        type="button"
                        onClick={() => actions.deleteReport(report)}
                        disabled={actions.deleteLoadingId === report._id}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 hover:bg-gray-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-wait disabled:opacity-50 sm:h-9 sm:w-9 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-red-400"
                        title="Delete report"
                        aria-label="Delete report"
                    >
                        <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                {capabilities.canDismiss && (
                    <button
                        type="button"
                        onClick={() => actions.dismissReport(report)}
                        disabled={actions.deleteLoadingId === report._id}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-[13px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-wait disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        title="Remove this transferred report from your queue"
                        aria-label="Remove transferred report from queue"
                    >
                        <span>Remove</span>
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
                className="inline-flex min-h-10 w-full items-center justify-start rounded-md px-2 py-3 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white sm:w-auto sm:py-0.5"
            >
                <span>Inspect report</span>
            </button>

            {capabilities.canRespond && (
                <button
                    type="button"
                    onClick={() => actions.openRespond(report)}
                    disabled={actions.respondLoadingId === report._id}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-[13px] font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 sm:w-auto"
                >
                    <HiOutlineLightningBolt className="h-4 w-4" aria-hidden="true" />
                    {isResponding ? 'Join response' : 'Respond to incident'}
                </button>
            )}

            {capabilities.canResolve && (
                <button
                    type="button"
                    onClick={() => actions.openResolve(report)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-[13px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 sm:w-auto"
                >
                    <HiOutlineBadgeCheck className="h-4 w-4 text-emerald-600 dark:text-sky-400" aria-hidden="true" />
                    Resolve incident
                </button>
            )}
        </div>
    );
};

const IncidentListRow = ({ report, user = null, isSelected = false, actionSlot }) => {
    const latestUpdate = report.latestReporterUpdate
        || (Array.isArray(report.reportUpdates) ? report.reportUpdates[report.reportUpdates.length - 1] : null);
    const updateMeta = latestUpdate ? getReportUpdateMeta(latestUpdate.tag) : null;
    const assignment = getResponderAssignment(report);
    const resolved = report.status === 'resolved';
    const incidentType = report.incidentType || report.incidentCategory || report.accidentType || 'Incident';
    // Acknowledged transfers keep their downstream status (e.g. responding),
    // so provenance needs its own line — the status badge alone can't show it.
    // Origin viewers read "to", everyone else reads "from".
    const transferOrigin = getTransferOrigin(report);
    const viewerMunicipality = user?.assignedMunicipality?.trim().toLocaleLowerCase() || '';
    const transferLine = transferOrigin
        ? (viewerMunicipality && viewerMunicipality === transferOrigin.trim().toLocaleLowerCase()
            ? `Transferred to ${report.municipalityName || 'another municipality'}`
            : `Transferred from ${transferOrigin}`)
        : '';

    return (
        <article
            className={`min-w-0 rounded-lg border px-4 py-4 sm:px-5 ${isSelected
                ? 'border-gray-300 border-l-2 border-l-emerald-700 bg-gray-50 dark:border-gray-600 dark:border-l-emerald-500 dark:bg-white/[0.03]'
                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-[#0c1813]/90 dark:hover:bg-white/[0.02]'}`}
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
                    <h2 className={`mt-1.5 break-words text-[15px] font-semibold leading-6 sm:text-base ${resolved ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                        {report.address || 'Address unavailable'}
                    </h2>
                    <p className="mt-0.5 line-clamp-1 text-[13px] capitalize text-gray-600 dark:text-gray-300">
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
                <span>{assignment === 'Unassigned' ? <span className="font-medium text-amber-700 dark:text-amber-400">Unassigned · needs unit</span> : <>Assigned to <span className="font-medium text-gray-700 dark:text-gray-200">{assignment}</span></>}</span>
            </div>

            <TransferAcknowledgmentState report={report} neutral />

            {transferLine && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
                    <span>{transferLine}</span>
                </p>
            )}

            {report.hasUnreadReporterUpdate && updateMeta && (
                <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <p className="text-xs font-semibold text-brand-800 dark:text-sky-300">New reporter update &middot; {updateMeta.label}</p>
                    {latestUpdate?.message && <p className="mt-0.5 line-clamp-2 text-xs text-brand-700 dark:text-sky-400">{latestUpdate.message}</p>}
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
    if (!pagination || pagination.pages <= 1) return null;

    return (
        <nav
            className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between"
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
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                >
                    Previous
                </button>
                <button
                    type="button"
                    onClick={() => onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
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
            <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{emptyCopy[0]}</p>
                <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">{emptyCopy[1]}</p>
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
