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

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold';

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
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                        <span className="capitalize">{details.status}</span>
                    </span>
                    <span className={`${BADGE_BASE} ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                        <span className="capitalize">{details.severity}</span> severity
                    </span>
                    <span className={`${BADGE_BASE} border-gray-200/90 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300`}>
                        {details.typeLabel}
                    </span>
                </div>

                <h3 className="mt-2.5 font-display text-base font-bold uppercase tracking-wider text-gray-950 sm:text-lg dark:text-white">
                    {details.title}
                </h3>
                <div className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-gray-600 dark:text-gray-300">
                    <HiOutlineLocationMarker className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                    <span className="min-w-0 break-words">{details.location}</span>
                </div>

                {operational.loading && (
                    <div className="mt-3.5 rounded-xl border border-blue-200/80 bg-blue-50/80 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200" role="status">
                        {operational.isOperationalViewer
                            ? 'Loading protected operational details...'
                            : 'Loading your evidence photos...'}
                    </div>
                )}

                {operational.error && (
                    <div className="mt-3.5 flex flex-col gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <span>{operational.error}</span>
                        {!operational.restricted && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                <dl className="mt-3.5 grid grid-cols-1 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 sm:grid-cols-2 sm:divide-x sm:divide-gray-200/80 dark:border-white/10 dark:bg-[#07130e] dark:sm:divide-white/10">
                    <div className="border-b border-gray-200/80 p-3 dark:border-white/10 sm:border-b-0">
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Incident time</dt>
                        <dd className="mt-1 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{formatDate(details.incidentTime)}</dd>
                        {formatRelativeDate(details.incidentTime) && (
                            <dd className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{formatRelativeDate(details.incidentTime)}</dd>
                        )}
                    </div>
                    <div className="p-3">
                        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Barangay / municipality</dt>
                        <dd className="mt-1 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{details.barangay}</dd>
                        <dd className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{details.municipality}</dd>
                    </div>
                </dl>

                <section className="mt-3.5" aria-labelledby="incident-description-heading">
                    <h4 id="incident-description-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {showOperationalDetails ? 'Operational description' : 'Public description'}
                    </h4>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">{details.description}</p>
                </section>

                {details.safetyIndicators.length > 0 && (
                    <section className="mt-3.5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20" aria-labelledby="safety-indicators-heading">
                        <h4 id="safety-indicators-heading" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                            <HiOutlineExclamationCircle className="h-4 w-4" aria-hidden="true" />
                            {showOperationalDetails ? 'Critical incident indicators' : 'Public safety indicators'}
                        </h4>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                            {details.safetyIndicators.map((indicator) => (
                                <li key={indicator} className="rounded-md border border-amber-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">{indicator}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {!showOperationalDetails && details.respondingAgencies.length > 0 && (
                    <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-gray-200/90 p-2.5 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02]">
                        <HiOutlineClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white">Responding agency</p>
                            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{details.respondingAgencies.join(', ')}</p>
                        </div>
                    </div>
                )}

                {showOperationalDetails ? (
                    <OperationalIncidentSections report={displayedReport} onRetryEvidence={operational.retry} />
                ) : (
                    <>
                        {showOwnerEvidence && !operational.loading && !operational.error && (
                            <section className="mt-3.5" aria-labelledby="owner-evidence-heading">
                                <h4 id="owner-evidence-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    Your evidence photos ({ownerEvidenceCount})
                                </h4>
                                <div className="mt-2">
                                    <ProtectedEvidenceGallery images={ownerEvidenceImages} />
                                </div>
                            </section>
                        )}
                        <div className="mt-4 flex items-start gap-2 border-t border-gray-200/80 pt-3.5 text-xs leading-5 text-gray-500 dark:border-white/10 dark:text-gray-400">
                            <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-emerald-400" aria-hidden="true" />
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
                <div className="sticky bottom-0 z-10 mt-auto border-t border-gray-200/80 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95 sm:px-5">
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
