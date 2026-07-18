import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineBadgeCheck,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineEye,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
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
    SEVERITY_STYLES,
} from './incidentReportConfig';

const formatRelativeTime = (value) => {
    if (!value) return 'Time unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return formatDistanceToNow(date, { addSuffix: true });
};

export const IncidentStatusBadge = ({ status }) => {
    const config = INCIDENT_STATUS[status];
    if (!config) {
        return <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">{status || 'Unknown'}</span>;
    }

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`} aria-hidden="true" />
            {config.label}
        </span>
    );
};

const TransferAcknowledgmentState = ({ report }) => {
    const transfer = getLatestTransfer(report);
    if (!transfer) return null;

    const acknowledged = Boolean(transfer.acknowledgedAt);
    const Icon = acknowledged ? HiOutlineCheckCircle : HiOutlineClock;

    return (
        <span className={`mt-2 flex max-w-full items-start gap-1.5 text-xs font-medium leading-4 ${acknowledged ? 'text-emerald-700' : 'text-amber-700'}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{acknowledged ? 'Transfer acknowledged' : 'Awaiting acknowledgment'}</span>
        </span>
    );
};

const ActionButton = ({ label, icon: Icon, onClick, tone = 'neutral', compact = false, disabled = false }) => {
    const tones = {
        neutral: 'border-gray-200 text-gray-700 hover:bg-gray-50',
        success: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
        danger: 'border-red-200 text-red-700 hover:bg-red-50',
        primary: 'border-blue-200 text-blue-700 hover:bg-blue-50',
        violet: 'border-violet-200 text-violet-700 hover:bg-violet-50',
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

const IncidentSummary = ({ report }) => (
    <div className="min-w-0">
        <div className="flex items-start gap-2">
            <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold leading-5 text-gray-950">{report.address || 'Address unavailable'}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{report.description || 'No description provided'}</p>
            </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${SEVERITY_STYLES[report.severity] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                {report.severity || 'Unspecified'}
            </span>
            <span className="text-[11px] capitalize text-gray-500">
                {report.incidentType || report.incidentCategory || report.accidentType || 'Incident'}
            </span>
        </div>
    </div>
);

const ResponderSummary = ({ report }) => {
    const responder = report.respondedBy;
    if (!responder) return <span className="text-xs text-gray-400">Unassigned</span>;

    return (
        <div>
            <p className="text-xs font-semibold text-gray-800">{getAgencyLabel(responder.agency || report.responderAgency)}</p>
            <p className="text-xs text-gray-500">{responder.name || 'Assigned responder'}</p>
        </div>
    );
};

const IncidentQueue = ({ reports, loading, error, onRetry, user, actions, onInspect, isDispatchQueueView }) => {
    if (loading) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center" role="status">
                <div className="spinner mx-auto" />
                <p className="mt-3 text-sm text-gray-600">Loading incident reports…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
                <p className="font-semibold text-red-900">Incident queue unavailable</p>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">
                    Try again
                </button>
            </div>
        );
    }

    if (reports.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <p className="font-semibold text-gray-900">
                    {isDispatchQueueView ? 'No incidents are waiting for dispatch' : 'No incident reports found'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                    {isDispatchQueueView ? 'New verified or transferred incidents will appear here.' : 'Adjust the status or search filters and try again.'}
                </p>
            </div>
        );
    }

    return (
        <section aria-label="Incident queue">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:hidden">
                {reports.map((report) => (
                    <article key={report._id} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <IncidentSummary report={report} />
                            <div className="shrink-0 sm:max-w-40 sm:text-right">
                                <IncidentStatusBadge status={report.status} />
                                <TransferAcknowledgmentState report={report} />
                            </div>
                        </div>
                        <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-x-4 gap-y-3 border-y border-gray-100 py-3 text-xs">
                            <div>
                                <dt className="text-gray-500">Reporter</dt>
                                <dd className="mt-0.5 font-medium text-gray-800">{report.reporter?.name || 'Unknown reporter'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Incident time</dt>
                                <dd className="mt-0.5 font-medium text-gray-800">{formatRelativeTime(getIncidentDate(report))}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Responder</dt>
                                <dd className="mt-0.5"><ResponderSummary report={report} /></dd>
                            </div>
                        </dl>
                        <div className="mt-3">
                            <IncidentActionButtons report={report} user={user} actions={actions} onInspect={onInspect} />
                        </div>
                    </article>
                ))}
            </div>

            <div data-testid="incident-table" className="hidden w-full min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white 2xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                    <colgroup>
                        <col className="w-[27%]" />
                        <col className="w-[13%]" />
                        <col className="w-[18%]" />
                        <col className="w-[11%]" />
                        <col className="w-[13%]" />
                        <col className="w-[18%]" />
                    </colgroup>
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Incident</th>
                            <th className="px-4 py-3">Reporter</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Responder</th>
                            <th className="px-4 py-3">Incident time</th>
                            <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {reports.map((report) => (
                            <tr key={report._id} className="align-middle hover:bg-gray-50/70">
                                <td className="min-w-0 px-4 py-4"><IncidentSummary report={report} /></td>
                                <td className="min-w-0 px-4 py-4">
                                    <p className="break-words text-sm font-medium text-gray-800">{report.reporter?.name || 'Unknown reporter'}</p>
                                    <p className="text-xs text-gray-500">{report.reporter?.isVerified ? 'Verified account' : 'Reporter account'}</p>
                                </td>
                                <td className="px-4 py-4">
                                    <IncidentStatusBadge status={report.status} />
                                    <TransferAcknowledgmentState report={report} />
                                </td>
                                <td className="px-4 py-4"><ResponderSummary report={report} /></td>
                                <td className="px-4 py-4 text-sm leading-5 text-gray-600">{formatRelativeTime(getIncidentDate(report))}</td>
                                <td className="px-4 py-4">
                                    <IncidentActionButtons report={report} user={user} actions={actions} onInspect={onInspect} compact />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default IncidentQueue;
