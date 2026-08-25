import { formatDistanceToNow } from 'date-fns';
import { HiOutlineClock, HiOutlineExclamationCircle, HiOutlineRefresh, HiOutlineSwitchHorizontal } from 'react-icons/hi';
import { getIncidentVisibilityRules } from '../../utils/incidentDetailsVisibility';
import { getReportUpdateMeta } from '../../utils/notificationNavigation';
import IncidentDetailsLocationSection from './IncidentDetailsLocationSection';
import IncidentDetailsCoreSection from './IncidentDetailsCoreSection';
import IncidentDetailsDescriptionSection from './IncidentDetailsDescriptionSection';
import IncidentDetailsCasualtiesSection from './IncidentDetailsCasualtiesSection';
import IncidentDetailsEvidenceSection from './IncidentDetailsEvidenceSection';
import IncidentDetailsReporterSection from './IncidentDetailsReporterSection';
import IncidentDetailsCoordinationSection from './IncidentDetailsCoordinationSection';
import IncidentDetailsRestrictedNotice from './IncidentDetailsRestrictedNotice';

const UPDATE_ALERT_STYLES = {
    red: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
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

    const isOriginatingTransferredViewer = Boolean(
        user?.assignedMunicipality
        && report?.municipalityName
        && user.assignedMunicipality.toLowerCase() !== report.municipalityName.toLowerCase()
        && (
            report.originalMunicipalityName?.toLowerCase() === user.assignedMunicipality.toLowerCase()
            || (Array.isArray(report.transferHistory) && report.transferHistory.some(
                (t) => t?.fromMunicipalityName?.toLowerCase() === user.assignedMunicipality.toLowerCase()
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
    if (report.fireInvolved) safetyIndicators.push('Fire or explosion involved');

    return (
        <div className={`space-y-4 ${className}`}>
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
                <section
                    className="rounded-xl border border-violet-200 bg-violet-50/90 p-3.5 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100"
                    aria-labelledby="transferred-jurisdiction-heading"
                >
                    <div className="flex items-start gap-2.5">
                        <HiOutlineSwitchHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <h3 id="transferred-jurisdiction-heading" className="text-xs sm:text-sm font-bold">
                                Jurisdiction Transferred
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-violet-800 dark:text-violet-200">
                                This incident was transferred to <span className="font-semibold">{report.municipalityName}</span> for active response coordination. It remains visible in your dashboard as a read-only historical record.
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {report.status === 'pending' && (
                <section
                    className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
                    aria-labelledby="pending-verification-heading"
                >
                    <div className="flex items-start gap-2.5">
                        <HiOutlineClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <h3 id="pending-verification-heading" className="text-xs sm:text-sm font-bold">
                                Awaiting Admin Verification
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                                This incident report was recently submitted and is pending formal verification by a municipal administrator.
                            </p>
                        </div>
                    </div>
                </section>
            )}

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
                    <p className="mt-2 border-t border-current/15 pt-2 text-[11px] font-medium opacity-75">
                        Reporter-provided information. Confirm it against the incident record before acting.
                    </p>
                </section>
            )}

            {/* 1. Core overview */}
            <IncidentDetailsCoreSection
                report={report}
                showOperationalFields={visibility.showOperationalDetails}
                showReporterVerification={visibility.showReporterInfo}
                showReporterName={visibility.showReporterInfo}
                showCasualtiesSummary={!visibility.showOperationalDetails}
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
            />

            {/* 4. Casualties & Affected Area */}
            <IncidentDetailsCasualtiesSection
                report={report}
            />

            {/* 5. Evidence Photos (when permitted) */}
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

            {/* 6. Reporter Info (when permitted) */}
            {visibility.showReporterInfo && (
                <IncidentDetailsReporterSection
                    reporter={report.reporter}
                    showContact={visibility.showReporterContact}
                />
            )}

            {/* 7. Response Coordination (when permitted) */}
            {visibility.showResponseCoordination && (
                <IncidentDetailsCoordinationSection
                    report={report}
                    showTransfers={visibility.showTransferHistory}
                    highlightedUpdateId={highlightedUpdateId}
                />
            )}

            {/* 8. Restricted Notice (for guest/public) */}
            {visibility.showRestrictedNotice && (
                <IncidentDetailsRestrictedNotice isOwner={isOwner} />
            )}
        </div>
    );
};

export default IncidentDetailsContent;
