import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineClock,
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

const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy, h:mm a');
};

const Detail = ({ label, value }) => (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value || 'Not available'}</dd>
    </div>
);

const Section = ({ id, icon: Icon, title, children }) => (
    <section className="mt-5 border-t border-gray-200 pt-5" aria-labelledby={id}>
        <h5 id={id} className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
            {title}
        </h5>
        <div className="mt-3">{children}</div>
    </section>
);

const OperationalIncidentSections = ({ report }) => {
    const casualties = report.casualties || {};
    const affectedArea = report.affectedArea || {};
    const updates = Array.isArray(report.reportUpdates)
        ? [...report.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const responders = Array.isArray(report.responders) ? report.responders : [];
    const transfers = Array.isArray(report.transferHistory) ? [...report.transferHistory].reverse() : [];
    const accuracy = Number(report.locationCapture?.accuracyMeters);
    const reporterContactVisible = Boolean(report.reporter?.email);

    return (
        <>
            <Section id="operational-facts-heading" icon={HiOutlineDocumentText} title="Operational details">
                <dl className="grid grid-cols-2 gap-2">
                    <Detail label="Priority" value={report.priority} />
                    <Detail label="Reported" value={formatDate(report.reportedAt || report.createdAt)} />
                    <Detail label="Fire involved" value={report.fireInvolved ? (report.fireType?.replaceAll('_', ' ') || 'Yes') : 'No'} />
                    <Detail label="Location source" value={report.locationCapture?.source?.replaceAll('_', ' ') || report.locationConfidence?.replaceAll('_', ' ')} />
                    <Detail label="GPS accuracy" value={Number.isFinite(accuracy) ? `${Math.round(accuracy)} meters` : 'Not recorded'} />
                    <Detail label="Coordinates" value={Number.isFinite(Number(report.coordinates?.lat)) && Number.isFinite(Number(report.coordinates?.lng)) ? `${Number(report.coordinates.lat).toFixed(6)}, ${Number(report.coordinates.lng).toFixed(6)}` : 'Not available'} />
                </dl>
            </Section>

            <Section id="casualty-details-heading" icon={HiOutlineShieldCheck} title="Casualties and affected area">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Detail label="Injured" value={String(Number(casualties.injured) || 0)} />
                    <Detail label="Fatalities" value={String(Number(casualties.fatalities) || 0)} />
                    <Detail label="Missing" value={String(Number(casualties.missing) || 0)} />
                    <Detail label="Households affected" value={String(Number(affectedArea.householdsAffected) || 0)} />
                    <Detail label="Evacuees" value={String(Number(affectedArea.evacuees) || 0)} />
                    <Detail label="Affected radius" value={Number(affectedArea.radius) > 0 ? `${affectedArea.radius} meters` : 'Not recorded'} />
                </dl>
            </Section>

            <Section id="evidence-heading" icon={HiOutlinePhotograph} title={`Evidence photos (${report.images?.length || 0})`}>
                <ProtectedEvidenceGallery images={report.images || []} />
            </Section>

            <Section id="reporter-contact-heading" icon={HiOutlineUser} title="Reporter information">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-900">{report.reporter?.name || 'Reporter name unavailable'}</p>
                    <p className="mt-1 text-xs text-gray-500">{report.reporter?.isVerified ? 'Verified reporter account' : 'Account verification not confirmed'}</p>
                    {reporterContactVisible ? (
                        <a href={`mailto:${report.reporter.email}`} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                            <HiOutlineMail className="h-4 w-4" aria-hidden="true" />
                            {report.reporter.email}
                        </a>
                    ) : (
                        <p className="mt-3 text-xs leading-5 text-gray-500">Contact details become available after you join the response.</p>
                    )}
                </div>
            </Section>

            <Section id="situation-updates-heading" icon={HiOutlineClock} title={`Situation updates (${updates.length})`}>
                {updates.length ? (
                    <ol className="space-y-2">
                        {updates.map((update, index) => (
                            <li key={update.id || `${update.createdAt}-${index}`} className="rounded-xl border border-gray-200 p-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    <span className="font-semibold text-gray-900">{update.author?.name || 'Reporter'}</span>
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{String(update.tag || 'general').replaceAll('_', ' ')}</span>
                                    {update.createdAt && <span>{formatDistanceToNow(new Date(update.createdAt), { addSuffix: true })}</span>}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{update.message}</p>
                            </li>
                        ))}
                    </ol>
                ) : <p className="text-sm text-gray-500">No situation updates have been submitted.</p>}
            </Section>

            <Section id="response-team-heading" icon={HiOutlineTruck} title="Response coordination">
                {responders.length || report.respondedBy ? (
                    <div className="space-y-2">
                        {responders.map((responder, index) => (
                            <div key={responder.id || `${responder.unitName}-${index}`} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                                <p className="text-sm font-semibold text-blue-950">{responder.unitName || responder.user?.name || 'Response unit'}</p>
                                <p className="mt-1 text-xs text-blue-700">{responder.unitType || responder.user?.agency || 'Responder'}{responder.respondedAt ? ` · Joined ${formatDate(responder.respondedAt)}` : ''}</p>
                                {responder.notes && <p className="mt-2 text-sm text-blue-900">{responder.notes}</p>}
                            </div>
                        ))}
                        {!responders.length && report.respondedBy && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                                {report.respondedBy.name || 'Assigned responder'} · {report.respondedBy.agency || report.responderAgency || 'Response unit'}
                            </div>
                        )}
                    </div>
                ) : <p className="text-sm text-gray-500">No response unit is assigned yet.</p>}
            </Section>

            {transfers.length > 0 && (
                <Section id="transfer-history-heading" icon={HiOutlineSwitchHorizontal} title="Transfer history">
                    <ol className="space-y-2">
                        {transfers.map((transfer, index) => (
                            <li key={transfer.id || `${transfer.transferredAt}-${index}`} className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                                <p className="text-sm font-semibold text-violet-950">{transfer.fromMunicipalityName || 'Previous municipality'} to {transfer.toMunicipalityName || 'Target municipality'}</p>
                                <p className="mt-1 text-xs text-violet-700">Transferred {formatDate(transfer.transferredAt)} · {transfer.acknowledgedAt ? 'Acknowledged' : 'Awaiting acknowledgement'}</p>
                                {transfer.reason && <p className="mt-2 text-sm text-violet-900">{transfer.reason}</p>}
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {report.status === 'resolved' && (
                <Section id="resolution-heading" icon={HiOutlineShieldCheck} title="Resolution record">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-950">Resolved {formatDate(report.resolvedAt)}</p>
                        <p className="mt-1 text-xs text-emerald-700">{report.resolvedBy?.name || 'Authorized responder'}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-emerald-900">{report.resolutionNotes || 'No resolution notes were recorded.'}</p>
                    </div>
                </Section>
            )}

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-900">
                <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Restricted operational record. Use this information only for authorized incident response and coordination.
            </div>
        </>
    );
};

export default OperationalIncidentSections;
