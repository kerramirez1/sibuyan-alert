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
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import Button from '../ui/Button';
import OperationalIncidentSections from './OperationalIncidentSections';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';

const SEVERITY_STYLES = {
    minor: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    moderate: 'border-amber-200 bg-amber-50 text-amber-700',
    severe: 'border-orange-200 bg-orange-50 text-orange-700',
    critical: 'border-red-200 bg-red-50 text-red-700',
};

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold';

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
    const hasActions = Boolean(onLocate || (ownsReport && details.id) || canRespond || canResolve);
    const statusCfg = MAP_STATUS_CONFIG[details.status] || MAP_STATUS_CONFIG.verified;
    const ownerEvidenceImages = Array.isArray(displayedReport?.images) ? displayedReport.images : [];
    const ownerEvidenceCount = Math.max(
        Number.isFinite(Number(displayedReport?.evidenceCount)) ? Math.max(0, Math.floor(Number(displayedReport.evidenceCount))) : 0,
        ownerEvidenceImages.length,
    );
    const showOwnerEvidence = ownsReport && operational.isOwnerViewer && !operational.isOperationalViewer;

    return (
        <div className="flex min-h-full flex-col">
            <div className="px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                        <span className="capitalize">{details.status}</span>
                    </span>
                    <span className={`${BADGE_BASE} ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                        <span className="capitalize">{details.severity}</span> severity
                    </span>
                    <span className={`${BADGE_BASE} border-gray-200 bg-gray-50 text-gray-600`}>
                        {details.typeLabel}
                    </span>
                </div>

                <h3 className="mt-3 text-lg font-bold uppercase tracking-wider text-gray-950 sm:text-xl">
                    {details.title}
                </h3>
                <div className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-gray-600">
                    <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="min-w-0 break-words">{details.location}</span>
                </div>

                {operational.loading && (
                    <div className="mt-4 rounded-sm border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800" role="status">
                        {operational.isOperationalViewer
                            ? 'Loading protected operational details...'
                            : 'Loading your evidence photos...'}
                    </div>
                )}

                {operational.error && (
                    <div className="mt-4 flex flex-col gap-3 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
                        <span>{operational.error}</span>
                        {!operational.restricted && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                <dl className="mt-4 grid grid-cols-1 overflow-hidden rounded-sm border border-gray-300 bg-gray-50 sm:grid-cols-2 sm:divide-x sm:divide-gray-300">
                    <div className="border-b border-gray-300 p-3 sm:border-b-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Incident time</dt>
                        <dd className="mt-1 text-sm font-semibold text-gray-900">{formatDate(details.incidentTime)}</dd>
                        {formatRelativeDate(details.incidentTime) && (
                            <dd className="mt-0.5 text-xs text-gray-500">{formatRelativeDate(details.incidentTime)}</dd>
                        )}
                    </div>
                    <div className="p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Barangay / municipality</dt>
                        <dd className="mt-1 text-sm font-semibold text-gray-900">{details.barangay}</dd>
                        <dd className="mt-0.5 text-xs text-gray-500">{details.municipality}</dd>
                    </div>
                </dl>

                <section className="mt-4" aria-labelledby="incident-description-heading">
                    <h4 id="incident-description-heading" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {showOperationalDetails ? 'Operational description' : 'Public description'}
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{details.description}</p>
                </section>

                {details.safetyIndicators.length > 0 && (
                    <section className="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-3" aria-labelledby="safety-indicators-heading">
                        <h4 id="safety-indicators-heading" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            <HiOutlineExclamationCircle className="h-4 w-4" aria-hidden="true" />
                            {showOperationalDetails ? 'Critical incident indicators' : 'Public safety indicators'}
                        </h4>
                        <ul className="mt-2 flex flex-wrap gap-2">
                            {details.safetyIndicators.map((indicator) => (
                                <li key={indicator} className="rounded-sm border border-amber-200/50 bg-white/80 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900">{indicator}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {!showOperationalDetails && details.respondingAgencies.length > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-sm border border-gray-300 p-3">
                        <HiOutlineClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-900">Responding agency</p>
                            <p className="mt-0.5 text-xs text-gray-600">{details.respondingAgencies.join(', ')}</p>
                        </div>
                    </div>
                )}

                {showOperationalDetails ? (
                    <OperationalIncidentSections report={displayedReport} onRetryEvidence={operational.retry} />
                ) : (
                    <>
                        {showOwnerEvidence && !operational.loading && !operational.error && (
                            <section className="mt-4" aria-labelledby="owner-evidence-heading">
                                <h4 id="owner-evidence-heading" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Your evidence photos ({ownerEvidenceCount})
                                </h4>
                                <div className="mt-2">
                                    <ProtectedEvidenceGallery images={ownerEvidenceImages} />
                                </div>
                            </section>
                        )}
                        <div className="mt-4 flex items-start gap-2 border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500">
                            <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                            <p>
                                {showOwnerEvidence
                                    ? 'This owner view keeps responder identities and internal coordination details private.'
                                    : 'This is verified public safety information. Personal identities, evidence, and internal coordination details are not displayed here.'}
                                {details.updatedAt ? ` Last updated ${formatRelativeDate(details.updatedAt)}.` : ''}
                            </p>
                        </div>
                    </>
                )}
            </div>

            {hasActions && (
                <div className="sticky bottom-0 z-10 mt-auto border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {onLocate && (
                            <Button
                                variant="secondary"
                                icon={HiOutlineLocationMarker}
                                onClick={() => onLocate(displayedReport)}
                                fullWidth
                            >
                                View on map
                            </Button>
                        )}

                        {ownsReport && details.id && (
                            <Button
                                as={Link}
                                to={`/my-reports?report=${encodeURIComponent(details.id)}`}
                                icon={HiOutlineExternalLink}
                                iconPosition="right"
                                fullWidth
                            >
                                Open my full report
                            </Button>
                        )}

                        {canRespond && (
                            <Button
                                onClick={() => onRespond?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                fullWidth
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
                                fullWidth
                            >
                                Review resolution
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapIncidentDetails;
