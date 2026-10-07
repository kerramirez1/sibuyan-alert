import { formatDistanceToNow } from 'date-fns';
import { formatIncidentTime as formatDate } from '../../utils/dateTimeUtils';
import {
    HiOutlineClock,
    HiOutlineChevronDown,
    HiOutlineDocumentText,
    HiOutlineLocationMarker,
    HiOutlineMail,
    HiOutlinePhotograph,
    HiOutlineShieldCheck,
    HiOutlineSwitchHorizontal,
    HiOutlineTruck,
    HiOutlineUser,
} from 'react-icons/hi';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import Button from '../ui/Button';
import { isVerifiedReportReporter } from '../../utils/reporterVerification';
import VerifiedReporterBadge from '../ui/VerifiedReporterBadge';

const formatRelativeTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
};

const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
};

const Detail = ({ label, value }) => (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value || 'Not available'}</dd>
    </div>
);

const DisclosureSection = ({ id, icon: Icon, title, summary, defaultOpen = false, children }) => (
    <details className="group overflow-hidden rounded-xl border border-gray-200 bg-white" open={defaultOpen || undefined}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <h5 id={id} className="text-sm font-bold text-gray-900">{title}</h5>
                    {summary && <span className="mt-0.5 block text-xs leading-5 text-gray-500">{summary}</span>}
                </span>
            </span>
            <HiOutlineChevronDown className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-gray-200 px-4 py-4" aria-labelledby={id}>{children}</div>
    </details>
);

const OperationalIncidentSections = ({ report = {}, onRetryEvidence }) => {
    const safeReport = (report && typeof report === 'object') ? report : {};
    const casualties = safeReport.casualties || {};
    const updates = Array.isArray(safeReport.reportUpdates)
        ? [...safeReport.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const responders = Array.isArray(safeReport.responders) ? safeReport.responders : [];
    const transfers = Array.isArray(safeReport.transferHistory) ? [...safeReport.transferHistory].reverse() : [];
    const images = Array.isArray(safeReport.images) ? safeReport.images : [];
    const resolutionImages = Array.isArray(safeReport.resolutionImages) ? safeReport.resolutionImages : [];
    const declaredEvidenceCount = Number(safeReport.evidenceCount);
    const evidenceCount = Math.max(
        Number.isFinite(declaredEvidenceCount) && declaredEvidenceCount > 0 ? Math.floor(declaredEvidenceCount) : 0,
        images.length,
    );
    const accuracy = Number(safeReport.locationCapture?.accuracyMeters);
    const coordinatesAvailable = Number.isFinite(Number(safeReport.coordinates?.lat))
        && Number.isFinite(Number(safeReport.coordinates?.lng));

    const impactDetails = [
        { label: 'Injured', value: toPositiveNumber(casualties.injured), unit: 'injured' },
        { label: 'Fatalities', value: toPositiveNumber(casualties.fatalities), unit: 'fatalities' },
        { label: 'Missing', value: toPositiveNumber(casualties.missing), unit: 'missing' },
    ].filter((detail) => detail.value > 0);
    const impactSummary = impactDetails.length
        ? impactDetails.map((detail) => `${detail.value} ${detail.unit}`).join(' · ')
        : 'No casualties recorded';
    const responseSummary = responders.length
        ? `${responders.length} response unit${responders.length === 1 ? '' : 's'} recorded`
        : safeReport.respondedBy
            ? 'One assigned response unit'
            : 'No response unit assigned';

    return (
        <div className="mt-5 space-y-3" aria-label="Protected operational information">
            <DisclosureSection
                id="operational-facts-heading"
                icon={HiOutlineDocumentText}
                title="Operational details"
                summary="Priority, reporting time, and incident conditions"
                defaultOpen
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Detail label="Priority" value={safeReport.priority} />
                    <Detail label="Reported" value={formatDate(safeReport.reportedAt || safeReport.createdAt)} />
                    <Detail label="Incident time" value={formatDate(safeReport.incidentTime)} />
                </dl>
            </DisclosureSection>

            <DisclosureSection
                id="casualty-details-heading"
                icon={HiOutlineShieldCheck}
                title="Casualties"
                summary={impactSummary}
                defaultOpen={impactDetails.length > 0}
            >
                {impactDetails.length ? (
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {impactDetails.map((detail) => (
                            <Detail
                                key={detail.label}
                                label={detail.label}
                                value={String(detail.value)}
                            />
                        ))}
                    </dl>
                ) : (
                    <p className="text-sm leading-6 text-gray-600">No casualties were recorded for this incident.</p>
                )}
            </DisclosureSection>

            <DisclosureSection
                id="evidence-heading"
                icon={HiOutlinePhotograph}
                title={`Evidence photos (${evidenceCount})`}
                summary="Protected images submitted with this report"
                defaultOpen={evidenceCount > 0}
            >
                {evidenceCount > images.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
                        <p className="text-sm font-semibold text-amber-900">Evidence references are temporarily unavailable.</p>
                        <p className="mt-1 text-xs leading-5 text-amber-800">The incident record indicates {evidenceCount} protected photo{evidenceCount === 1 ? '' : 's'}, but the secure image references were not returned.</p>
                        {onRetryEvidence && (
                            <Button className="mt-3" variant="secondary" size="sm" onClick={onRetryEvidence}>
                                Retry evidence
                            </Button>
                        )}
                    </div>
                ) : (
                    <ProtectedEvidenceGallery
                        images={images}
                        evidence={safeReport.evidence}
                        accessLevel="original"
                        isOperational={true}
                        variant="stacked"
                    />
                )}
            </DisclosureSection>

            <DisclosureSection
                id="resolution-photos-heading"
                icon={HiOutlinePhotograph}
                title={`Resolution photos (${resolutionImages.length})`}
                summary="Proof of resolution uploaded by the responder"
                defaultOpen={resolutionImages.length > 0}
            >
                <ProtectedEvidenceGallery
                    images={resolutionImages}
                    accessLevel="original"
                    isOperational={true}
                    variant="stacked"
                    labelVariant="resolution"
                />
            </DisclosureSection>

            <DisclosureSection
                id="reporter-contact-heading"
                icon={HiOutlineUser}
                title="Reporter information"
                summary={safeReport.reporter?.isVerified ? 'Verified reporter account' : 'Identity verification not confirmed'}
            >
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{safeReport.reporter?.name || 'Reporter name unavailable'}</p>
                        {isVerifiedReportReporter(safeReport.reporter) && (
                            <VerifiedReporterBadge size="sm" />
                        )}
                    </div>
                    {safeReport.reporter?.email ? (
                        <a href={`mailto:${safeReport.reporter.email}`} className="mt-3 inline-flex min-h-10 max-w-full items-center gap-2 break-all rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                            <HiOutlineMail className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {safeReport.reporter.email}
                        </a>
                    ) : (
                        <p className="mt-3 text-xs leading-5 text-gray-500">Contact details become available after you join the response.</p>
                    )}
                </div>
            </DisclosureSection>

            {updates.length > 0 && (
                <DisclosureSection
                    id="situation-updates-heading"
                    icon={HiOutlineClock}
                    title={`Situation updates (${updates.length})`}
                    summary="Latest reporter and field updates"
                    defaultOpen
                >
                    <ol className="space-y-2">
                        {updates.map((update, index) => (
                            <li key={update.id || `${update.createdAt}-${index}`} className="rounded-xl border border-gray-200 p-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    <span className="font-semibold text-gray-900">{update.author?.name || 'Reporter'}</span>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{String(update.tag || 'general').replaceAll('_', ' ')}</span>
                                    {formatRelativeTime(update.createdAt) && <span>{formatRelativeTime(update.createdAt)}</span>}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{update.message}</p>
                            </li>
                        ))}
                    </ol>
                </DisclosureSection>
            )}

            <DisclosureSection
                id="response-team-heading"
                icon={HiOutlineTruck}
                title="Response coordination"
                summary={responseSummary}
                defaultOpen={responders.length > 0 || Boolean(safeReport.respondedBy)}
            >
                {responders.length || safeReport.respondedBy ? (
                    <div className="space-y-2">
                        {responders.map((responder, index) => (
                            <div key={responder.id || `${responder.unitName}-${index}`} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                                <p className="text-sm font-semibold text-blue-950">{responder.unitName || responder.user?.name || 'Response unit'}</p>
                                <p className="mt-1 text-xs text-blue-700">
                                    {responder.unitType || responder.user?.agency || 'Responder'}
                                    {responder.respondedAt ? ` · Joined ${formatDate(responder.respondedAt)}` : ''}
                                </p>
                                {responder.notes && <p className="mt-2 text-sm text-blue-900">{responder.notes}</p>}
                            </div>
                        ))}
                        {!responders.length && safeReport.respondedBy && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                                {safeReport.respondedBy.name || 'Assigned responder'} · {safeReport.respondedBy.agency || safeReport.responderAgency || 'Response unit'}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">No response unit is assigned yet.</p>
                )}
            </DisclosureSection>

            {transfers.length > 0 && (
                <DisclosureSection
                    id="transfer-history-heading"
                    icon={HiOutlineSwitchHorizontal}
                    title="Transfer history"
                    summary={`${transfers.length} transfer record${transfers.length === 1 ? '' : 's'}`}
                >
                    {/* The transferred status wears the active blue, so a transfer record carries
                        the same hue as the status badge that names it. */}
                    <ol className="space-y-2">
                        {transfers.map((transfer, index) => (
                            <li key={transfer.id || `${transfer.transferredAt}-${index}`} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                                <p className="text-sm font-semibold text-blue-950">{transfer.fromMunicipalityName || 'Previous municipality'} to {transfer.toMunicipalityName || 'Target municipality'}</p>
                                <p className="mt-1 text-xs text-blue-700">Transferred {formatDate(transfer.transferredAt)} · {transfer.acknowledgedAt ? 'Acknowledged' : 'Awaiting acknowledgement'}</p>
                                {transfer.reason && <p className="mt-2 text-sm text-blue-900">{transfer.reason}</p>}
                            </li>
                        ))}
                    </ol>
                </DisclosureSection>
            )}

            {safeReport.status === 'resolved' && (
                <DisclosureSection
                    id="resolution-heading"
                    icon={HiOutlineShieldCheck}
                    title="Resolution record"
                    summary={`Resolved ${formatDate(safeReport.resolvedAt)}`}
                    defaultOpen
                >
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-950">Resolved {formatDate(safeReport.resolvedAt)}</p>
                        <p className="mt-1 text-xs text-emerald-700">{safeReport.resolvedBy?.name || 'Authorized responder'}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{safeReport.resolutionNotes || 'No resolution notes were recorded.'}</p>
                    </div>
                </DisclosureSection>
            )}

            <DisclosureSection
                id="location-verification-heading"
                icon={HiOutlineLocationMarker}
                title="Location verification"
                summary={coordinatesAvailable ? 'Coordinates and capture quality available' : 'Limited capture metadata'}
            >
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Detail label="Location source" value={safeReport.locationCapture?.source?.replaceAll('_', ' ') || safeReport.locationConfidence?.replaceAll('_', ' ')} />
                    <Detail label="GPS accuracy" value={Number.isFinite(accuracy) ? `${Math.round(accuracy)} meters` : 'Not recorded'} />
                    <div className="sm:col-span-2">
                        <Detail label="Coordinates" value={coordinatesAvailable ? `${Number(safeReport.coordinates.lat).toFixed(6)}, ${Number(safeReport.coordinates.lng).toFixed(6)}` : 'Not available'} />
                    </div>
                </dl>
            </DisclosureSection>

            <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-900">
                <HiOutlineShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Restricted operational record. Use this information only for authorized incident response and coordination.
            </div>
        </div>
    );
};

export default OperationalIncidentSections;
