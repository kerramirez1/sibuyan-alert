import { useEffect, useState } from 'react';
import {
    HiOutlineChevronUp,
    HiOutlineExclamationCircle,
} from 'react-icons/hi';
import useOperationalIncidentDetails from '../../hooks/useOperationalIncidentDetails';
import { formatIncidentLabel, getIncidentDetailViewModel, getTransferLine, normalizeCasualties } from '../../utils/incidentDetails';
import { getIncidentVisibilityRules } from '../../utils/incidentDetailsVisibility';
import { getMapCoordinates } from '../../utils/mapReports';
import { formatIncidentTime, formatIncidentRelativeTime } from '../../utils/dateTimeUtils';
import Button from '../ui/Button';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import ImageViewer from '../ui/ImageViewer';
import { Skeleton } from '../ui/Skeleton';

/* Severity keeps the sole hue encoding on this sheet; status stays achromatic. */
const SEVERITY_DOT = {
    minor: 'bg-emerald-500',
    moderate: 'bg-amber-500',
    severe: 'bg-orange-500',
    critical: 'bg-red-500',
};

/* Compact metadata item matching Admin/Responder Overview DetailItem */
const DetailItem = ({ label, value, children }) => (
    <div className="py-2">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
            {children || value || 'Not specified'}
        </dd>
    </div>
);

/* Casualty figures as a plain stat row: label over numeral, hairline-separated. */
const CasualtyStat = ({ label, count }) => (
    <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {label}
        </span>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
            {count}
        </p>
    </div>
);

const MapIncidentDetailsSkeleton = () => (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5" role="status" aria-busy="true" aria-label="Loading incident brief">
        <span className="sr-only">Loading incident brief</span>
        {/* Header status line */}
        <Skeleton variant="text" className="h-3.5 w-40 rounded" />
        {/* Title & Ref */}
        <div className="space-y-1.5">
            <Skeleton variant="text" className="h-6 w-4/5 rounded-lg" />
            <Skeleton variant="text" className="h-3.5 w-1/3 rounded" />
        </div>
        {/* Overview dl grid */}
        <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-white/5">
            <Skeleton variant="text" className="h-3.5 w-24" />
            <div className="grid grid-cols-2 gap-3 pt-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-1">
                        <Skeleton variant="text" className="h-2.5 w-16" />
                        <Skeleton variant="text" className="h-3.5 w-24" />
                    </div>
                ))}
            </div>
            {/* Casualty summary 3-column */}
            <div className="pt-2 border-t border-gray-100 dark:border-white/5 space-y-2">
                <Skeleton variant="text" className="h-2.5 w-28" />
                <div className="grid grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-1">
                            <Skeleton variant="text" className="h-2 w-12" />
                            <Skeleton variant="text" className="h-5 w-6 mt-1" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const MapIncidentDetails = ({
    report,
    viewerRole = 'guest',
    viewer = null,
    isOwner: explicitIsOwner = false,
    isOperational: explicitIsOperational = false,
    canRespond = false,
    canResolve = false,
    canVerify = false,
    canReject = false,
    actionLoading = false,
    onRespond,
    onResolve,
    onVerify,
    onReject,
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
    const hasActions = Boolean(canRespond || canResolve || canVerify || canReject);

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
    const transferLine = getTransferLine(displayedReport, {
        assignedMunicipality: viewer?.assignedMunicipality,
        isOwner: ownsReport,
    });
    const transferMatch = transferLine.match(/^Transferred\s+(to|from)\s+(.+)$/i);
    const transferDetail = transferMatch
        ? { label: `Transferred ${transferMatch[1].toLowerCase()}`, value: transferMatch[2] }
        : null;

    return (
        <div className="flex flex-col">
            <div className="space-y-2.5 px-4 py-3 sm:px-5 sm:py-3.5">
                {/* 1. Incident Brief */}
                <div>
                    {typeof onBack === 'function' && (
                        <div className="pb-2">
                            <button
                                type="button"
                                onClick={onBack}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
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

                    {/* Status plain text; severity keeps the sole hue encoding */}
                    <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <span className="capitalize">{details.status}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="inline-flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[details.severity] || SEVERITY_DOT.moderate}`} aria-hidden="true" />
                            <span>{severityLabel}</span>
                        </span>
                        {details.status === 'pending' && (
                            <>
                                <span aria-hidden="true"> · </span>
                                <span>Awaiting verification</span>
                            </>
                        )}
                    </p>
                </div>

                {/* Mobile Peek Affordance */}
                {onToggleExpand && (
                    <div className="sm:hidden pt-0.5">
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="flex w-full items-center justify-between gap-2 py-2 text-xs font-semibold text-brand-700 dark:text-sky-400 cursor-pointer"
                            aria-label="Expand full incident brief"
                        >
                            <span>Swipe up for incident details</span>
                            <HiOutlineChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                <section className="border-t border-gray-100 pt-2 dark:border-white/10" aria-labelledby="map-incident-overview-heading">
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
                        {transferDetail && (
                            <DetailItem label={transferDetail.label} value={transferDetail.value} />
                        )}
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
                    <div className="border-t border-gray-100 pt-2 dark:border-white/5">
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                            Casualty summary
                        </h5>

                        <div className="grid grid-cols-3 gap-3">
                            <CasualtyStat label="Injured" count={injured} />
                            <CasualtyStat label="Fatalities" count={fatalities} />
                            <CasualtyStat label="Missing" count={missing} />
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
                    <section className="border-t border-gray-100 pt-2 dark:border-white/10" aria-labelledby="map-incident-description-heading">
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
                <section className="border-t border-gray-100 pt-2 dark:border-white/10" aria-labelledby="map-incident-evidence-heading">
                    <h4 id="map-incident-evidence-heading" className="text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
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
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{privacyNotice}</p>
                </div>
            </div>

            {/* 7. Sticky Actions Footer */}
            {hasActions && (
                <div className="z-10 border-t border-gray-200/80 bg-gray-50/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-white/[0.03] sm:px-5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {canVerify && (
                            <Button
                                onClick={() => onVerify?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Verify report
                            </Button>
                        )}

                        {canReject && (
                            <Button
                                variant="dangerOutline"
                                onClick={() => onReject?.(displayedReport)}
                                loading={actionLoading}
                                loadingLabel="Please wait..."
                                className="w-full sm:w-auto text-xs min-h-[44px] sm:min-h-8"
                            >
                                Reject report
                            </Button>
                        )}

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
