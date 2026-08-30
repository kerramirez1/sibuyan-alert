import { useEffect, useState } from 'react';
import {
    HiOutlineChevronUp,
    HiOutlineExclamationCircle,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
} from 'react-icons/hi';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import { formatIncidentLabel, getIncidentDetailViewModel, normalizeCasualties } from '../../utils/incidentDetails';
import { getIncidentVisibilityRules } from '../../utils/incidentDetailsVisibility';
import { getMapCoordinates } from '../../utils/mapReports';
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

/* Compact metadata item matching Admin/Responder Overview DetailItem */
const DetailItem = ({ label, value, children }) => (
    <div className="py-2">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
            {children || value || 'Not specified'}
        </dd>
    </div>
);

/* Casualty stat card matching Admin/Responder CasualtyStatCard */
const CasualtyStatCard = ({ label, count, tone = 'default' }) => {
    const toneStyles = {
        default: 'border-gray-200/80 bg-gray-50/70 text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white',
        danger: 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200',
        warning: 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
    };

    return (
        <div className={`rounded-xl border p-2 sm:p-2.5 text-center ${toneStyles[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</p>
            <p className="mt-0.5 text-sm sm:text-base font-bold tabular-nums">{count}</p>
        </div>
    );
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
                <div className="h-10 rounded bg-gray-100 dark:bg-white/5" />
                <div className="h-10 rounded bg-gray-100 dark:bg-white/5" />
            </div>
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
    onClose: _onClose,
    onBack,
    onViewImage,
}) => {
    const operational = useOperationalIncidentDetails(report, viewerRole);
    const displayedReport = operational.report || report;
    const details = getIncidentDetailViewModel(displayedReport);
    const [viewerItem, setViewerItem] = useState(null);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const isDescriptionLong = Boolean(details.description && details.description.length > 120);

    const incidentId = displayedReport?._id || displayedReport?.id;
    useEffect(() => {
        setViewerItem(null);
        setIsDescriptionExpanded(false);
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

    const visibility = getIncidentVisibilityRules({
        viewerRole,
        report: displayedReport,
        isOwner: ownsReport,
    });

    const isOperational = explicitIsOperational || operational.isOperationalViewer || visibility.isOperational;
    const hasActions = Boolean(canRespond || canResolve);
    const statusCfg = MAP_STATUS_CONFIG[details.status] || MAP_STATUS_CONFIG.verified;

    const normalizedCasualties = normalizeCasualties(displayedReport?.casualties);
    const { injured, fatalities, missing, isAllZeroOrUnrecorded } = normalizedCasualties;

    const evidenceDescriptor = displayedReport?.evidence;
    const effectiveViewerAccess = visibility.viewerAccess;
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

    const mapCoords = getMapCoordinates(displayedReport);
    const exactCoordinatesText = (visibility.showCoordinates && mapCoords)
        ? `${mapCoords.lat.toFixed(6)}, ${mapCoords.lng.toFixed(6)}`
        : null;

    const respondingAgencies = details.respondingAgencies.length > 0
        ? details.respondingAgencies
        : displayedReport?.respondedBy?.agency
            ? [displayedReport.respondedBy.agency]
            : displayedReport?.responderAgency
                ? [displayedReport.responderAgency]
                : [];

    const lastUpdatedText = details.updatedAt ? ` Last updated ${formatIncidentRelativeTime(details.updatedAt)}.` : '';

    const hasPrivacySafePreview = !isOperational && !ownsReport && totalEvidenceCount > 0;
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

    const severityLabel = details.severity
        ? details.severity.charAt(0).toUpperCase() + details.severity.slice(1).toLowerCase()
        : 'Moderate';

    const incidentTypeLabel = formatIncidentLabel(
        displayedReport?.incidentType || displayedReport?.accidentType || displayedReport?.incidentCategory,
    );

    const respondingAgencyText = respondingAgencies.length > 0 ? respondingAgencies.join(', ') : 'Awaiting assignment';

    return (
        <div className="flex flex-col">
            <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-3.5">
                {/* 1. Incident Brief */}
                <div>
                    {typeof onBack === 'function' && (
                        <div className="pb-2">
                            <button
                                type="button"
                                onClick={onBack}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                            >
                                <span>&larr;</span>
                                <span>Back to active incidents</span>
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Incident brief
                        </span>
                        {details.id && (
                            <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500">
                                Ref: #{String(details.id).slice(-6).toUpperCase()}
                            </span>
                        )}
                    </div>

                    <h3 className="mt-1 font-display text-base font-bold text-gray-950 sm:text-lg dark:text-white leading-snug break-words">
                        {details.title}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                            <span className="capitalize">{details.status}</span>
                        </span>
                        <span className={`${BADGE_BASE} ${SEVERITY_STYLES[details.severity] || SEVERITY_STYLES.moderate}`}>
                            <span>{severityLabel}</span>
                        </span>
                        {details.status === 'pending' && (
                            <span className={`${BADGE_BASE} border-amber-300 bg-amber-100/80 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200`}>
                                Awaiting verification
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Peek Affordance */}
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

                {/* Error Banner */}
                {operational.error && (
                    <div className="flex flex-col gap-2.5 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <span>{operational.error}</span>
                        {operational.retryable && (
                            <Button variant="dangerOutline" size="sm" onClick={operational.retry}>Retry</Button>
                        )}
                    </div>
                )}

                {/* 2. Overview — unified section with 2-column metadata grid + casualty summary */}
                <section className="border-t border-gray-100 pt-2.5 dark:border-white/10" aria-labelledby="map-incident-overview-heading">
                    <h4 id="map-incident-overview-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white mb-1">
                        Overview
                    </h4>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-0 divide-y divide-gray-100 dark:divide-white/5">
                        <DetailItem label="Incident type">
                            <span className="capitalize">{incidentTypeLabel}</span>
                        </DetailItem>
                        <DetailItem label="Severity">
                            <span className="capitalize">{details.severity || 'Moderate'}</span>
                        </DetailItem>
                        <DetailItem label="Incident time" value={formatIncidentTime(details.incidentTime)} />
                        <DetailItem label="Submitted time" value={formatIncidentTime(displayedReport?.createdAt)} />
                        <DetailItem label="Barangay" value={details.barangay || 'Not specified'} />
                        <DetailItem label="Municipality" value={details.municipality || 'Sibuyan Island'} />
                        {respondingAgencyText && (
                            <DetailItem label="Responding agency">
                                {respondingAgencyText}
                            </DetailItem>
                        )}
                        {exactCoordinatesText && (
                            <DetailItem label="Exact coordinates">
                                <span className="font-mono tabular-nums">{exactCoordinatesText}</span>
                            </DetailItem>
                        )}
                    </dl>

                    {/* Casualty summary — child of Overview */}
                    <div className="border-t border-gray-100 pt-2.5 dark:border-white/5">
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                            Casualty summary
                        </h5>

                        <div className="grid grid-cols-3 gap-2">
                            <CasualtyStatCard
                                label="Injured"
                                count={injured}
                                tone={typeof injured === 'number' && injured > 0 ? 'warning' : 'default'}
                            />
                            <CasualtyStatCard
                                label="Fatalities"
                                count={fatalities}
                                tone={typeof fatalities === 'number' && fatalities > 0 ? 'danger' : 'default'}
                            />
                            <CasualtyStatCard
                                label="Missing"
                                count={missing}
                                tone={typeof missing === 'number' && missing > 0 ? 'warning' : 'default'}
                            />
                        </div>

                        {isAllZeroOrUnrecorded && typeof injured !== 'number' && typeof fatalities !== 'number' && typeof missing !== 'number' && (
                            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">
                                No casualty information recorded.
                            </p>
                        )}
                    </div>
                </section>

                {/* 3. Safety Indicators (if any) */}
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

                {/* 4. Clamped Description */}
                {details.description && (
                    <section className="border-t border-gray-100 pt-2.5 dark:border-white/10" aria-labelledby="map-incident-description-heading">
                        <h4 id="map-incident-description-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                            {isOperational ? 'Operational description' : 'Description'}
                        </h4>
                        <p className={`whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800 dark:text-gray-200 ${!isDescriptionExpanded && isDescriptionLong ? 'line-clamp-3' : ''}`}>
                            {details.description}
                        </p>
                        {isDescriptionLong && (
                            <button
                                type="button"
                                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                                className="mt-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
                            >
                                {isDescriptionExpanded ? 'Show less' : 'Read more'}
                            </button>
                        )}
                    </section>
                )}

                {/* 5. Evidence Photos */}
                <section className="border-t border-gray-100 pt-2.5 dark:border-white/10" aria-labelledby="map-incident-evidence-heading">
                    <h4 id="map-incident-evidence-heading" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
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

                {/* 6. Static Privacy & Security Notice */}
                <div className="border-t border-gray-100 pt-2.5 dark:border-white/10">
                    <div className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        <HiOutlineShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <p>{privacyNotice}</p>
                    </div>
                </div>
            </div>

            {/* 7. Sticky Actions Footer */}
            {hasActions && (
                <div className="sticky bottom-0 z-10 border-t border-gray-200/80 bg-white max-sm:backdrop-blur-none sm:bg-white/95 sm:backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#0c1813] sm:dark:bg-[#0c1813]/95 sm:px-5">
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
