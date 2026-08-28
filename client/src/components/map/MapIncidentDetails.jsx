import { useEffect, useState } from 'react';
import {
    HiOutlineChevronUp,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineTruck,
    HiOutlineX,
} from 'react-icons/hi';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import { getIncidentDetailViewModel, normalizeCasualties } from '../../utils/incidentDetails';
import { formatCleanAddress } from '../../utils/incidentAddress';
import { formatIncidentTime, formatIncidentRelativeTime } from '../../utils/dateTimeUtils';
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

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const MapIncidentDetailsSkeleton = () => (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5 animate-pulse" aria-label="Loading incident brief">
        <div className="flex gap-2">
            <div className="h-5 w-24 rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-5 w-20 rounded bg-gray-200 dark:bg-white/10" />
        </div>
        <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-white/10" />
        <div className="border-t border-b border-gray-200 py-3 dark:border-white/10">
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
    isOwner: explicitIsOwner = false,
    isOperational: explicitIsOperational = false,
    canRespond = false,
    canResolve = false,
    actionLoading = false,
    onRespond,
    onResolve,
    onToggleExpand,
    onClose,
    onViewImage,
}) => {
    const operational = useOperationalIncidentDetails(report, viewerRole);
    const displayedReport = operational.report || report;
    const details = getIncidentDetailViewModel(displayedReport);
    const [viewerItem, setViewerItem] = useState(null);

    const incidentId = displayedReport?._id || displayedReport?.id;
    useEffect(() => {
        setViewerItem(null);
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
    const isOperational = explicitIsOperational || operational.isOperationalViewer;
    const hasActions = Boolean(canRespond || canResolve);
    const statusCfg = MAP_STATUS_CONFIG[details.status] || MAP_STATUS_CONFIG.verified;

    const normalizedCasualties = normalizeCasualties(displayedReport?.casualties);
    const affectedArea = displayedReport?.affectedArea || {};
    const isPending = details.status === 'pending';

    const { injured, fatalities, missing, isAllZeroOrUnrecorded } = normalizedCasualties;

    const households = toPositiveNumber(affectedArea.householdsAffected);
    const evacuees = toPositiveNumber(affectedArea.evacuees);
    const radius = toPositiveNumber(affectedArea.radius);

    const hasImpactRecorded = households > 0 || evacuees > 0 || radius > 0;
    const allZeroOrUnrecorded = isAllZeroOrUnrecorded && !hasImpactRecorded;

    const evidenceDescriptor = displayedReport?.evidence;
    const effectiveViewerAccess = evidenceDescriptor?.viewerAccess === 'original' ? 'original' : 'redacted';
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

    // Privacy notice calculation based on viewer role, ownership, and evidence preview state
    const hasPrivacySafePreview = !isOperational && !ownsReport && totalEvidenceCount > 0;
    const relativeTime = details.incidentTime ? formatIncidentRelativeTime(details.incidentTime) : null;
    const lastUpdatedText = details.updatedAt ? ` Last updated ${formatIncidentRelativeTime(details.updatedAt)}.` : '';

    let privacyNotice = '';
    if (isOperational) {
        privacyNotice = 'This operational view contains protected incident information. Access to original evidence and sensitive coordination details is restricted by role.';
    } else if (ownsReport && isOriginalAllowed) {
        privacyNotice = `This is verified public safety information. Sensitive responder identities and internal coordination details are protected.${lastUpdatedText}`;
    } else if (hasPrivacySafePreview) {
        privacyNotice = `This is verified public safety information. Personal identities and original evidence are protected. A privacy-safe preview may be shown.${lastUpdatedText}`;
    } else {
        privacyNotice = `This is verified public safety information. Personal identities, evidence, and internal coordination details are protected.${lastUpdatedText}`;
    }

    const cleanAddress = formatCleanAddress({
        locationName: displayedReport?.locationName,
        address: displayedReport?.address || details.location,
        barangay: details.barangay,
        municipality: details.municipality,
        municipalityName: displayedReport?.municipalityName,
    });

    const severityLabel = details.severity
        ? details.severity.charAt(0).toUpperCase() + details.severity.slice(1).toLowerCase()
        : 'Moderate';

    const categoryLabel = details.typeLabel || (details.incidentCategory
        ? details.incidentCategory.charAt(0).toUpperCase() + details.incidentCategory.slice(1).toLowerCase()
        : 'Incident');

    return (
        <div className="flex flex-col">
            <div className="space-y-3.5 px-4 py-3 sm:px-5 sm:py-4">
                {/* 1. Incident Title & Key Categorization */}
                <div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            {isOperational ? 'Operational incident brief' : 'Incident brief'}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-medium text-gray-400 dark:text-gray-500">
                                {details.id ? `Ref: #${String(details.id).slice(-6).toUpperCase()}` : ''}
                            </span>
                            {typeof onClose === 'function' && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Close incident details"
                                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors dark:hover:bg-white/5 dark:hover:text-gray-200 cursor-pointer"
                                >
                                    <HiOutlineX className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <h3 className="mt-1.5 font-display text-base font-bold text-gray-950 sm:text-lg dark:text-white leading-snug break-words">
                        {details.title}
                    </h3>

                    {/* Status, Severity & Category Badges in Sentence Case */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                            <span className="capitalize">{details.status}</span>
                        </span>
                        <span className={`${BADGE_BASE} ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                            <span>{severityLabel}</span>
                        </span>
                        <span className={`${BADGE_BASE} border-gray-200/90 bg-gray-100 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300`}>
                            <span>{categoryLabel}</span>
                        </span>
                        {details.status === 'pending' && (
                            <span className={`${BADGE_BASE} border-amber-300 bg-amber-100/80 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200`}>
                                Awaiting verification
                            </span>
                        )}
                    </div>

                    {/* Deduplicated Location Line with Pin */}
                    <div className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-gray-700 dark:text-gray-300">
                        <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span className="min-w-0 break-words font-medium">{cleanAddress}</span>
                    </div>
                </div>

                {/* Mobile Peek Affordance Helper */}
                {onToggleExpand && (
                    <div className="sm:hidden pt-0.5">
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-2xs transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer"
                            aria-label="Expand full incident brief"
                        >
                            <span className="flex items-center gap-1.5">
                                <HiOutlineChevronUp className="h-4 w-4 animate-bounce text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                <span>Swipe up for incident details</span>
                            </span>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                Expand &rarr;
                            </span>
                        </button>
                    </div>
                )}

                {/* Error Banner with Retry */}
                {operational.error && (
                    <div className="flex flex-col gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <span>{operational.error}</span>
                        {operational.retryable && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                {/* 2. Immediate Safety Indicators (if any) */}
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

                {/* 3. Borderless Metadata Grid */}
                <dl className="grid grid-cols-1 border-t border-b border-gray-100 py-3 sm:grid-cols-2 gap-3 text-xs dark:border-white/10">
                    <div className="space-y-1.5">
                        <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Incident time</dt>
                            <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white tabular-nums">{formatIncidentTime(details.incidentTime)}</dd>
                            {relativeTime && (
                                <dd className="text-[11px] text-gray-500 dark:text-gray-400">{relativeTime}</dd>
                            )}
                        </div>
                        {respondingAgencies.length > 0 && (
                            <div className="pt-1">
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Responding agency</dt>
                                <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                                    <HiOutlineTruck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                                    <span>{respondingAgencies.join(', ')}</span>
                                </dd>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <div>
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Jurisdiction</dt>
                            <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white">{details.barangay}</dd>
                            <dd className="text-[11px] text-gray-500 dark:text-gray-400">{details.municipality}</dd>
                        </div>
                        {coordinatesText && (
                            <div className="pt-0.5">
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Coordinates</dt>
                                <dd className="mt-0.5 text-[11px] tabular-nums font-mono font-medium text-gray-500 dark:text-gray-400">GPS: {coordinatesText}</dd>
                            </div>
                        )}
                    </div>
                </dl>

                {/* 4. Description */}
                <section aria-labelledby="map-incident-description-heading">
                    <h4 id="map-incident-description-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                        {isOperational ? 'Operational description' : 'Public description'}
                    </h4>
                    <p className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                        {details.description || 'No incident description provided.'}
                    </p>
                </section>

                {/* 5. Casualties and Affected Area */}
                <section className="border-t border-gray-100 pt-3 dark:border-white/10" aria-labelledby="map-incident-casualties-heading">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h4 id="map-incident-casualties-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Casualties and affected area
                        </h4>
                        {isPending && (
                            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                Report pending verification
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-gray-200/80 bg-gray-50/50 p-2 text-center dark:border-white/10 dark:bg-[#07130e]">
                        <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Injured</span>
                            <span className={`mt-0.5 block text-base font-bold tabular-nums ${typeof injured === 'number' && injured > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                                {injured}
                            </span>
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Fatalities</span>
                            <span className={`mt-0.5 block text-base font-bold tabular-nums ${typeof fatalities === 'number' && fatalities > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                {fatalities}
                            </span>
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Missing</span>
                            <span className={`mt-0.5 block text-base font-bold tabular-nums ${typeof missing === 'number' && missing > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {missing}
                            </span>
                        </div>
                    </div>

                    {hasImpactRecorded && (
                        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {households > 0 && (
                                <div className="rounded-xl border border-gray-200/80 bg-gray-50/50 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Households</dt>
                                    <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{households}</dd>
                                </div>
                            )}
                            {evacuees > 0 && (
                                <div className="rounded-xl border border-gray-200/80 bg-gray-50/50 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Evacuees</dt>
                                    <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{evacuees}</dd>
                                </div>
                            )}
                            {radius > 0 && (
                                <div className="rounded-xl border border-gray-200/80 bg-gray-50/50 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Affected radius</dt>
                                    <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white tabular-nums">{radius} meters</dd>
                                </div>
                            )}
                        </dl>
                    )}

                    {allZeroOrUnrecorded && !isPending && (
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">
                            No casualties or affected-area impacts recorded.
                        </p>
                    )}
                </section>

                {/* 6. Evidence Photos / Previews */}
                <section className="border-t border-gray-100 pt-3 dark:border-white/10" aria-labelledby="map-incident-evidence-heading">
                    <h4 id="map-incident-evidence-heading" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-950 dark:text-white mb-2">
                        <HiOutlinePhotograph className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
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
                </section>

                {/* 7. Privacy & Security Notice */}
                <div className="flex items-start gap-2 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <HiOutlineShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    <p>{privacyNotice}</p>
                </div>
            </div>

            {/* 8. Sticky Actions Footer */}
            {hasActions && (
                <div className="sticky bottom-0 z-10 border-t border-gray-200/80 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/10 dark:bg-[#0c1813]/95 sm:px-5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
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
