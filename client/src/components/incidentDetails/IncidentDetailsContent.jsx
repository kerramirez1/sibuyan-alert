import { formatDistanceToNow } from 'date-fns';
import { HiOutlineExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';
import { getIncidentVisibilityRules } from '../../utils/incidentDetailsVisibility';
import { getTransferLine } from '../../utils/incidentDetails';
import { getReportUpdateMeta } from '../../utils/notificationNavigation';
import { normalizeMunicipalityKey } from '../../utils/safeCollection';
import { getMapStatusDot } from '../../config/mapVisuals';
import IncidentDetailsLocationSection from './IncidentDetailsLocationSection';
import IncidentDetailsCoreSection from './IncidentDetailsCoreSection';
import IncidentDetailsDescriptionSection from './IncidentDetailsDescriptionSection';
import IncidentDetailsEvidenceSection from './IncidentDetailsEvidenceSection';
import IncidentDetailsCoordinationSection from './IncidentDetailsCoordinationSection';
import IncidentDetailsRestrictedNotice from './IncidentDetailsRestrictedNotice';
import { Skeleton, SkeletonCard } from '../ui/Skeleton';

const UPDATE_ALERT_STYLES = {
    red: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
    emerald: 'border-brand-200 bg-brand-50 text-brand-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100',
};

const formatRelativeDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
};

const IncidentDetailsContent = ({
    report = {},
    viewerRole = 'guest',
    user = null,
    loading = false,
    error = '',
    restricted = false,
    onRetry,
    onOpenMap,
    onViewImage,
    highlightedUpdateId = '',
    openedFromNotification = false,
    className = '',
}) => {
    const role = user?.role || viewerRole;
    const isOwner = Boolean(
        report.isOwnedByCurrentUser
        || (user?._id && String(report.reporter?._id || report.reporter) === String(user._id))
    );
    const visibility = getIncidentVisibilityRules({
        viewerRole: role,
        report,
        isOwner,
    });

    const viewerMunicipality = normalizeMunicipalityKey(user?.assignedMunicipality);
    const reportMunicipality = normalizeMunicipalityKey(report?.municipalityName);
    const isOriginatingTransferredViewer = Boolean(
        viewerMunicipality
        && reportMunicipality
        && viewerMunicipality !== reportMunicipality
        && (
            normalizeMunicipalityKey(report?.originalMunicipalityName) === viewerMunicipality
            || (Array.isArray(report?.transferHistory) && report.transferHistory.some(
                (t) => normalizeMunicipalityKey(t?.fromMunicipalityName) === viewerMunicipality
            ))
        )
    );

    const updates = Array.isArray(report.reportUpdates)
        ? [...report.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const effectiveHighlightedUpdateId = highlightedUpdateId || report.highlightedReporterUpdateId || '';
    const highlightedUpdate = updates.find((update) => String(update._id || update.id) === String(effectiveHighlightedUpdateId))
        || (report.hasUnreadReporterUpdate ? (report.latestReporterUpdate || updates[0]) : null)
        || (openedFromNotification ? updates[0] : null);
    const highlightedUpdateMeta = highlightedUpdate ? getReportUpdateMeta(highlightedUpdate.tag) : null;

    const safetyIndicators = [];
    if (report.roadBlocked) safetyIndicators.push('Road blocked');

    if (!report?._id && loading) {
        return (
            <div className={`space-y-4 ${className}`} role="status" aria-busy="true" aria-label="Loading incident details">
                <span className="sr-only">Loading incident details</span>
                <SkeletonCard className="space-y-3">
                    <Skeleton variant="text" className="h-4 w-32" />
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="space-y-1">
                                <Skeleton variant="text" className="h-2.5 w-16" />
                                <Skeleton variant="text" className="h-3.5 w-24" />
                            </div>
                        ))}
                    </div>
                </SkeletonCard>
                <SkeletonCard className="h-28" />
            </div>
        );
    }

    // The dossier's sections are separated by space, not by rules.
    //
    // Each one used to open with its own `border-t`, directly above a 14px pad,
    // inside a stack that already spaced them apart — a hairline for every
    // boundary while the gap said the same thing twice, and headings set in
    // 11px tracked caps said it a third time. What is left is one line per
    // group that is a group: the status and error cards, the highlighted update,
    // the records inside response coordination, and the header's own boundary.
    // A rule still marks a real edge; it no longer draws one between two
    // paragraphs.
    return (
        <div className={`space-y-5 ${className}`}>
            {loading && (
                <div className="rounded-xl border border-blue-200/80 bg-blue-50/80 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200" role="status">
                    Loading protected incident details&hellip;
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                    <div className="flex items-start gap-2">
                        <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{error}</span>
                    </div>
                    {!restricted && typeof onRetry === 'function' && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                        >
                            <HiOutlineRefresh className="h-3.5 w-3.5" aria-hidden="true" />
                            Retry
                        </button>
                    )}
                </div>
            )}

            {isOriginatingTransferredViewer && (
                <section aria-labelledby="transferred-jurisdiction-heading">
                    <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getMapStatusDot('transferred')}`} aria-hidden="true" />
                        <h3 id="transferred-jurisdiction-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Jurisdiction Transferred
                        </h3>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                        This incident was transferred to <span className="font-semibold text-gray-900 dark:text-white">{report.municipalityName}</span> for active response coordination. It remains visible in your dashboard as a read-only historical record.
                    </p>
                </section>
            )}

            {report.status === 'pending' && (
                <section aria-labelledby="pending-verification-heading">
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                        <h3 id="pending-verification-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Awaiting Admin Verification
                        </h3>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                        This incident report was recently submitted and is pending formal verification by a municipal administrator.
                    </p>
                </section>
            )}

            {report.verifiedBy ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Verified by {report.verifiedBy?.name || 'Unknown'}
                </p>
            ) : null}

            {highlightedUpdate && highlightedUpdateMeta && (
                <section
                    className={`rounded-xl border p-3.5 ${UPDATE_ALERT_STYLES[highlightedUpdateMeta.tone] || UPDATE_ALERT_STYLES.amber}`}
                    aria-labelledby="highlighted-update-heading"
                >
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">Latest reporter update</p>
                    <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                        <h3 id="highlighted-update-heading" className="text-xs sm:text-sm font-bold">
                            {highlightedUpdateMeta.label}
                        </h3>
                        {formatRelativeDate(highlightedUpdate.createdAt) && (
                            <time dateTime={new Date(highlightedUpdate.createdAt).toISOString()} className="text-xs opacity-75 tabular-nums">
                                {formatRelativeDate(highlightedUpdate.createdAt).trim()}
                            </time>
                        )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed">{highlightedUpdate.message}</p>
                    {/* The caveat is set apart by size and opacity rather than by
                        a rule inside the card: a line above a footnote that is
                        already smaller, dimmer and spaced reads as a second
                        border in a strip that has one. */}
                    <p className="mt-2 text-[11px] font-medium opacity-75">
                        Reporter-provided information. Confirm it against the incident record before acting.
                    </p>
                </section>
            )}

            {/* 1. Core overview with internal Casualty Summary and single unified reporter entry */}
            <IncidentDetailsCoreSection
                report={report}
                showOperationalFields={visibility.showOperationalDetails}
                showReporterVerification={visibility.showReporterInfo}
                showReporterName={visibility.showReporterInfo}
                showReporterContact={visibility.showReporterContact}
                showCasualtiesSummary={!visibility.showOperationalDetails}
                showCasualties={visibility.showOperationalDetails || visibility.isOwner}
            />

            {/* 2. Description */}
            <IncidentDetailsDescriptionSection
                description={report.description}
                safetyIndicators={safetyIndicators}
                isOperational={visibility.showOperationalDetails}
            />

            {/* 3. Pinned Location Map Preview */}
            <IncidentDetailsLocationSection
                report={report}
                userRole={role}
                showCoordinates={visibility.showCoordinates}
                onOpenMap={onOpenMap}
                transferLine={getTransferLine(report, {
                    assignedMunicipality: user?.assignedMunicipality,
                    isOwner,
                })}
            />

            {/* 4. Evidence Photos (when permitted) */}
            {visibility.showEvidence && (
                <IncidentDetailsEvidenceSection
                    evidence={report.evidence}
                    images={visibility.isOperational || visibility.isOwner ? (report.images || []) : []}
                    evidenceCount={Number(report.evidenceCount ?? report.evidence?.evidenceCount ?? report.evidence?.count) || 0}
                    accessLevel={visibility.isOperational || visibility.isOwner ? 'original' : (report.evidence?.viewerAccess || 'redacted')}
                    isOwner={visibility.isOwner}
                    isOperational={visibility.isOperational}
                    onViewImage={onViewImage}
                    collapsible
                    defaultOpen={Boolean(report.images?.length || report.evidence?.items?.length || report.evidenceCount)}
                />
            )}

            {/* 4b. Resolution Photos — the responder's proof of resolution, a
                separate identity from the reporter's evidence. Only resolved
                incidents can have them (stored atomically with the resolve). */}
            {visibility.showEvidence && report?.status === 'resolved' && (
                <IncidentDetailsEvidenceSection
                    images={visibility.isOperational || visibility.isOwner ? (report.resolutionImages || []) : []}
                    evidenceCount={(report.resolutionImages || []).length}
                    accessLevel={visibility.isOperational || visibility.isOwner ? 'original' : 'redacted'}
                    isOwner={visibility.isOwner}
                    isOperational={visibility.isOperational}
                    onViewImage={onViewImage}
                    collapsible
                    defaultOpen={Boolean(report.resolutionImages?.length)}
                    heading={`Resolution photos (${(report.resolutionImages || []).length})`}
                    labelVariant="resolution"
                />
            )}

            {/* 5. Response Coordination (when permitted) */}
            {visibility.showResponseCoordination && (
                <IncidentDetailsCoordinationSection
                    report={report}
                    showTransfers={visibility.showTransferHistory}
                    highlightedUpdateId={highlightedUpdateId}
                />
            )}

            {/* 6. Restricted Notice (for guest/public) */}
            {visibility.showRestrictedNotice && (
                <IncidentDetailsRestrictedNotice isOwner={isOwner} />
            )}
        </div>
    );
};

export default IncidentDetailsContent;
