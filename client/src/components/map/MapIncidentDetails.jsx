import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineArrowRight,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineTruck,
} from 'react-icons/hi';
import { Link } from '../../router';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import { getIncidentDetailViewModel } from '../../utils/incidentDetails';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';
import Button from '../ui/Button';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import ImageViewer from '../ui/ImageViewer';

const SEVERITY_STYLES = {
    minor: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    moderate: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300',
    severe: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300',
    critical: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300',
};

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider';

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

const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const formatCasualtyDisplay = (value, isPending = false) => {
    if (isPending) {
        if (value !== undefined && value !== null && value !== '' && Number(value) > 0) {
            return Number(value);
        }
        return 'Pending verification';
    }
    if (value === undefined || value === null || value === '') {
        return 'Not recorded';
    }
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 'Not recorded';
};

const MapIncidentDetailsSkeleton = () => (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5 animate-pulse" aria-label="Loading incident brief">
        <div className="flex gap-2">
            <div className="h-5 w-24 rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-5 w-20 rounded bg-gray-200 dark:bg-white/10" />
        </div>
        <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-white/10" />
        <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <div className="grid grid-cols-2 gap-3">
                <div className="h-10 rounded bg-gray-100 dark:bg-white/5" />
                <div className="h-10 rounded bg-gray-100 dark:bg-white/5" />
            </div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
            <div className="h-4 w-full rounded bg-gray-100 dark:bg-white/5 mb-1.5" />
            <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-white/5" />
        </div>
        <div className="grid grid-cols-3 gap-2">
            <div className="h-14 rounded-lg bg-gray-100 dark:bg-white/5" />
            <div className="h-14 rounded-lg bg-gray-100 dark:bg-white/5" />
            <div className="h-14 rounded-lg bg-gray-100 dark:bg-white/5" />
        </div>
    </div>
);

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
    const [viewerImage, setViewerImage] = useState(null);

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
        viewerRole === 'reporter'
        && (displayedReport?.isOwnedByCurrentUser || details.isOwnedByCurrentUser)
    );
    const isOperational = operational.isOperationalViewer;
    const hasActions = Boolean(onLocate || (ownsReport && details.id) || canRespond || canResolve);
    const statusCfg = MAP_STATUS_CONFIG[details.status] || MAP_STATUS_CONFIG.verified;

    const casualties = displayedReport?.casualties || {};
    const affectedArea = displayedReport?.affectedArea || {};
    const isPending = details.status === 'pending';

    const injuredDisplay = formatCasualtyDisplay(casualties.injured, isPending);
    const fatalitiesDisplay = formatCasualtyDisplay(casualties.fatalities, isPending);
    const missingDisplay = formatCasualtyDisplay(casualties.missing, isPending);

    const households = toPositiveNumber(affectedArea.householdsAffected);
    const evacuees = toPositiveNumber(affectedArea.evacuees);
    const radius = toPositiveNumber(affectedArea.radius);

    const hasImpactRecorded = households > 0 || evacuees > 0 || radius > 0;
    const allZeroOrUnrecorded = (injuredDisplay === 0 || injuredDisplay === 'Not recorded')
        && (fatalitiesDisplay === 0 || fatalitiesDisplay === 'Not recorded')
        && (missingDisplay === 0 || missingDisplay === 'Not recorded')
        && !hasImpactRecorded;

    const rawEvidenceItems = Array.isArray(displayedReport?.evidence?.items)
        ? displayedReport.evidence.items
        : Array.isArray(displayedReport?.evidence) && displayedReport.evidence.length > 0
            ? displayedReport.evidence
            : Array.isArray(displayedReport?.images)
                ? displayedReport.images
                : [];

    const declaredEvidenceCount = Number(displayedReport?.evidence?.count ?? displayedReport?.evidenceCount);
    const totalEvidenceCount = Math.max(
        Number.isFinite(declaredEvidenceCount) && declaredEvidenceCount > 0 ? Math.floor(declaredEvidenceCount) : 0,
        rawEvidenceItems.length,
    );

    const evidenceAccessLevel = isOperational || ownsReport
        ? 'original'
        : 'blurred';

    const coordinates = displayedReport?.coordinates;
    const coordinatesText = Number.isFinite(Number(coordinates?.lat)) && Number.isFinite(Number(coordinates?.lng))
        ? `${Number(coordinates.lat).toFixed(4)}, ${Number(coordinates.lng).toFixed(4)}`
        : null;

    const respondingAgencies = details.respondingAgencies.length > 0
        ? details.respondingAgencies
        : displayedReport?.respondedBy?.agency
            ? [displayedReport.respondedBy.agency]
            : displayedReport?.responderAgency
                ? [displayedReport.responderAgency]
                : [];

    return (
        <div className="flex min-h-full flex-col">
            <div className="space-y-3.5 px-4 py-4 sm:px-5 sm:py-5">
                {/* 1. Incident Brief Header */}
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-800 dark:text-emerald-400">
                            {isOperational ? 'Operational incident brief' : 'Incident brief'}
                        </span>
                        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500">
                            {details.id ? `#${String(details.id).slice(-6).toUpperCase()}` : ''}
                        </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                            <span className="capitalize">{details.status}</span>
                        </span>
                        <span className={`${BADGE_BASE} ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                            <span className="capitalize">{details.severity}</span> severity
                        </span>
                        <span className={`${BADGE_BASE} border-gray-200/90 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300`}>
                            {details.typeLabel}
                        </span>
                        {details.status === 'pending' && (
                            <span className={`${BADGE_BASE} border-amber-300 bg-amber-100/80 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200`}>
                                Awaiting Verification
                            </span>
                        )}
                    </div>

                    <h3 className="mt-2.5 font-display text-base font-bold text-gray-950 sm:text-lg dark:text-white leading-snug">
                        {details.title}
                    </h3>
                    <div className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-gray-600 dark:text-gray-300">
                        <HiOutlineLocationMarker className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span className="min-w-0 break-words font-medium">{details.location}</span>
                    </div>
                </div>

                {/* Error Banner with Retry */}
                {operational.error && (
                    <div className="flex flex-col gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <span>{operational.error}</span>
                        {!operational.restricted && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                {/* 2. Immediate Safety Indicators */}
                {details.safetyIndicators.length > 0 && (
                    <section className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20" aria-labelledby="map-safety-indicators-heading">
                        <h4 id="map-safety-indicators-heading" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                            <HiOutlineExclamationCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {isOperational ? 'Critical incident indicators' : 'Public safety indicators'}
                        </h4>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                            {details.safetyIndicators.map((indicator) => (
                                <li
                                    key={indicator}
                                    className="rounded-md border border-amber-300/80 bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow-2xs dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200"
                                >
                                    {indicator}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* 3. Key Incident Facts */}
                <dl className="grid grid-cols-1 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 sm:grid-cols-2 sm:divide-x sm:divide-gray-200/80 dark:border-white/10 dark:bg-[#07130e] dark:sm:divide-white/10">
                    <div className="space-y-2 border-b border-gray-200/80 p-3 dark:border-white/10 sm:border-b-0">
                        <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Incident time</dt>
                            <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatDate(details.incidentTime)}</dd>
                            {formatRelativeDate(details.incidentTime) && (
                                <dd className="text-[11px] text-gray-500 dark:text-gray-400">{formatRelativeDate(details.incidentTime)}</dd>
                            )}
                        </div>
                        {respondingAgencies.length > 0 && (
                            <div className="pt-1">
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Responding agency</dt>
                                <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                                    <HiOutlineTruck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                                    <span>{respondingAgencies.join(', ')}</span>
                                </dd>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5 p-3">
                        <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Barangay / municipality</dt>
                            <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{details.barangay}</dd>
                            <dd className="text-xs text-gray-600 dark:text-gray-400">{details.municipality}</dd>
                        </div>
                        {coordinatesText && (
                            <div className="pt-1">
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Coordinates</dt>
                                <dd className="mt-0.5 text-[11px] tabular-nums font-mono font-medium text-gray-600 dark:text-gray-300">GPS: {coordinatesText}</dd>
                            </div>
                        )}
                    </div>
                </dl>

                {/* 4. Public Description */}
                <section aria-labelledby="map-incident-description-heading">
                    <h4 id="map-incident-description-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {isOperational ? 'Operational description' : 'Public description'}
                    </h4>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                        {details.description || 'No incident description provided.'}
                    </p>
                </section>

                {/* 5. Casualties and Affected Area */}
                <section className="border-t border-gray-200/80 pt-3 dark:border-white/10" aria-labelledby="map-incident-casualties-heading">
                    <h4 id="map-incident-casualties-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                        Casualties and affected area
                    </h4>

                    <div className="mt-2 grid grid-cols-3 divide-x divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 dark:divide-white/10 dark:border-white/10 dark:bg-[#07130e]">
                        <div className="p-2.5 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Injured</p>
                            <p className={`mt-0.5 text-base font-bold tabular-nums ${typeof injuredDisplay === 'number' && injuredDisplay > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
                                {injuredDisplay}
                            </p>
                        </div>
                        <div className="p-2.5 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fatalities</p>
                            <p className={`mt-0.5 text-base font-bold tabular-nums ${typeof fatalitiesDisplay === 'number' && fatalitiesDisplay > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>
                                {fatalitiesDisplay}
                            </p>
                        </div>
                        <div className="p-2.5 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Missing</p>
                            <p className={`mt-0.5 text-base font-bold tabular-nums ${typeof missingDisplay === 'number' && missingDisplay > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
                                {missingDisplay}
                            </p>
                        </div>
                    </div>

                    {hasImpactRecorded && (
                        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {households > 0 && (
                                <div className="rounded-lg border border-gray-200/90 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Households</dt>
                                    <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{households}</dd>
                                </div>
                            )}
                            {evacuees > 0 && (
                                <div className="rounded-lg border border-gray-200/90 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Evacuees</dt>
                                    <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{evacuees}</dd>
                                </div>
                            )}
                            {radius > 0 && (
                                <div className="rounded-lg border border-gray-200/90 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Affected radius</dt>
                                    <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{radius} meters</dd>
                                </div>
                            )}
                        </dl>
                    )}

                    {allZeroOrUnrecorded && !isPending && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                            No casualties or affected-area impacts recorded.
                        </p>
                    )}
                </section>

                {/* 6. Evidence Photos */}
                <section className="border-t border-gray-200/80 pt-3 dark:border-white/10" aria-labelledby="map-incident-evidence-heading">
                    <h4 id="map-incident-evidence-heading" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                        <HiOutlinePhotograph className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>
                            {totalEvidenceCount > 0
                                ? ownsReport
                                    ? `Your evidence photos · ${totalEvidenceCount}`
                                    : evidenceAccessLevel === 'blurred'
                                        ? `Evidence preview · ${totalEvidenceCount}`
                                        : `Evidence photos · ${totalEvidenceCount}`
                                : 'Evidence photos'}
                        </span>
                    </h4>

                    <div className="mt-2">
                        <ProtectedEvidenceGallery
                            images={displayedReport?.images || []}
                            evidence={displayedReport?.evidence}
                            accessLevel={evidenceAccessLevel}
                            isOwner={ownsReport}
                            onViewImage={(url) => setViewerImage(url)}
                        />
                    </div>
                </section>

                {/* 7. Public / Owner Privacy Notice */}
                {!isOperational && (
                    <div className="flex items-start gap-2 border-t border-gray-200/80 pt-3 text-[11px] leading-relaxed text-gray-500 dark:border-white/10 dark:text-gray-400">
                        <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <p>
                            {ownsReport
                                ? 'This owner view keeps responder identities and internal coordination details private.'
                                : 'This is verified public safety information. Personal identities, evidence, and internal coordination details are not displayed here.'}
                            {details.updatedAt ? ` Last updated ${formatRelativeDate(details.updatedAt)}.` : ''}
                        </p>
                    </div>
                )}
            </div>

            {/* 8. Sticky Actions Footer */}
            {hasActions && (
                <div className="sticky bottom-0 z-10 mt-auto border-t border-gray-200/80 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95 sm:px-5">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            {onLocate && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={HiOutlineLocationMarker}
                                    onClick={() => onLocate(displayedReport)}
                                    className="w-full sm:w-auto cursor-pointer text-xs"
                                >
                                    View on map
                                </Button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {ownsReport && details.id && (
                                <Link
                                    to={`/my-reports?report=${encodeURIComponent(details.id)}`}
                                    className="group inline-flex items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md py-1.5 px-2 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                                >
                                    <span>Open my full report</span>
                                    <HiOutlineArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                                </Link>
                            )}

                            {canRespond && (
                                <Button
                                    onClick={() => onRespond?.(displayedReport)}
                                    loading={actionLoading}
                                    loadingLabel="Please wait..."
                                    className="w-full sm:w-auto text-xs"
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
                                    className="w-full sm:w-auto text-xs"
                                >
                                    Review resolution
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ImageViewer
                isOpen={Boolean(viewerImage)}
                imageSrc={viewerImage || ''}
                onClose={() => setViewerImage(null)}
            />
        </div>
    );
};

export default MapIncidentDetails;
