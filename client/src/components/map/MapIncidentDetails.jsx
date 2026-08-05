import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineClock,
    HiOutlineExclamationCircle,
    HiOutlineExternalLink,
    HiOutlineLocationMarker,
    HiOutlineShieldCheck,
} from 'react-icons/hi';
import { Link } from '../../router';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import { getIncidentDetailViewModel } from '../../utils/incidentDetails';
import OperationalIncidentSections from './OperationalIncidentSections';

const STATUS_STYLES = {
    verified: 'border-blue-200 bg-blue-50 text-blue-700',
    transferred: 'border-violet-200 bg-violet-50 text-violet-700',
    responding: 'border-red-200 bg-red-50 text-red-700',
    resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
};

const SEVERITY_STYLES = {
    minor: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    moderate: 'border-amber-200 bg-amber-50 text-amber-700',
    severe: 'border-orange-200 bg-orange-50 text-orange-700',
    critical: 'border-red-200 bg-red-50 text-red-700',
};

const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy, h:mm a');
};

const formatRelativeDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
};

const MapIncidentDetails = ({
    report,
    viewerRole = 'guest',
    canRespond = false,
    canResolve = false,
    actionLoading = false,
    onLocate,
    onRespond,
    onResolve,
}) => {
    const operational = useOperationalIncidentDetails(report, viewerRole);
    const displayedReport = operational.report || report;
    const details = getIncidentDetailViewModel(displayedReport);
    const ownsReport = viewerRole === 'reporter' && details.isOwnedByCurrentUser;
    const showOperationalDetails = operational.isOperationalViewer
        && displayedReport?.detailAccess === 'operational'
        && displayedReport?.detailCompleteness === 'full'
        && !operational.restricted;

    return (
        <div className="max-h-[min(72vh,42rem)] overflow-y-auto px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLES[details.status] || STATUS_STYLES.verified}`}>
                    {details.status}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                    {details.severity} severity
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                    {details.typeLabel}
                </span>
            </div>

            <h4 className="mt-4 font-display text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">
                {details.title}
            </h4>
            <div className="mt-2 flex items-start gap-2 text-sm leading-6 text-gray-600">
                <HiOutlineLocationMarker className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
                <span>{details.location}</span>
            </div>

            {operational.loading && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="status">
                    Loading protected operational details...
                </div>
            )}

            {operational.error && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
                    <span>{operational.error}</span>
                    {!operational.restricted && (
                        <button type="button" onClick={operational.retry} className="min-h-10 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-red-100">
                            Retry
                        </button>
                    )}
                </div>
            )}

            <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Incident time</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">{formatDate(details.incidentTime)}</dd>
                    {formatRelativeDate(details.incidentTime) && <dd className="mt-0.5 text-xs text-gray-500">{formatRelativeDate(details.incidentTime)}</dd>}
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Barangay / municipality</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">{details.barangay}</dd>
                    <dd className="mt-0.5 text-xs text-gray-500">{details.municipality}</dd>
                </div>
            </dl>

            <section className="mt-4" aria-labelledby="incident-description-heading">
                <h5 id="incident-description-heading" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {showOperationalDetails ? 'Operational description' : 'Public description'}
                </h5>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{details.description}</p>
            </section>

            {!showOperationalDetails && details.safetyIndicators.length > 0 && (
                <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3" aria-labelledby="safety-indicators-heading">
                    <h5 id="safety-indicators-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                        <HiOutlineExclamationCircle className="h-4 w-4" aria-hidden="true" />
                        Public safety indicators
                    </h5>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {details.safetyIndicators.map((indicator) => (
                            <li key={indicator} className="rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-amber-900">{indicator}</li>
                        ))}
                    </ul>
                </section>
            )}

            {!showOperationalDetails && details.respondingAgencies.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-gray-200 p-3">
                    <HiOutlineClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-semibold text-gray-900">Responding agency</p>
                        <p className="mt-0.5 text-xs text-gray-600">{details.respondingAgencies.join(', ')}</p>
                    </div>
                </div>
            )}

            {showOperationalDetails ? (
                <OperationalIncidentSections report={displayedReport} />
            ) : (
                <div className="mt-4 flex items-start gap-2 border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500">
                    <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <p>
                        This is verified public safety information. Personal identities, evidence, and internal coordination details are not displayed here.
                        {details.updatedAt ? ` Last updated ${formatRelativeDate(details.updatedAt)}.` : ''}
                    </p>
                </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onLocate?.(displayedReport)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                    <HiOutlineLocationMarker className="h-4 w-4" aria-hidden="true" />
                    View incident on map
                </button>

                {ownsReport && details.id && (
                    <Link
                        to={`/my-reports?report=${encodeURIComponent(details.id)}`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                        Open my full report
                        <HiOutlineExternalLink className="h-4 w-4" aria-hidden="true" />
                    </Link>
                )}

                {canRespond && (
                    <button
                        type="button"
                        onClick={() => onRespond?.(displayedReport)}
                        disabled={actionLoading}
                        className="min-h-11 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {actionLoading ? 'Please wait…' : 'Respond to incident'}
                    </button>
                )}

                {canResolve && (
                    <button
                        type="button"
                        onClick={() => onResolve?.(displayedReport)}
                        disabled={actionLoading}
                        className="min-h-11 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {actionLoading ? 'Please wait…' : 'Review resolution'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default MapIncidentDetails;
