import { format } from 'date-fns';
import { formatIncidentLabel, normalizeCasualties } from '../../utils/incidentDetails';

const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy, h:mm a');
};

const AGENCY_LABELS = {
    pnp: 'Philippine National Police',
    bfp: 'Bureau of Fire Protection',
    mdrrmo: 'MDRRMO Rescue',
    rhu: 'Rural Health Unit',
    rhui: 'Rural Health Unit',
    coastguard: 'Philippine Coast Guard',
};

const formatAgency = (agency) => {
    if (!agency) return '';
    const key = String(agency).toLowerCase().trim();
    return AGENCY_LABELS[key] || agency;
};

const getRespondingAgencyText = (report) => {
    if (Array.isArray(report.respondingAgencies) && report.respondingAgencies.length > 0) {
        return report.respondingAgencies.map((a) => formatAgency(a)).join(', ');
    }
    if (report.respondedBy?.agency) {
        return formatAgency(report.respondedBy.agency);
    }
    if (report.responderAgency) {
        return formatAgency(report.responderAgency);
    }
    return '';
};

const DetailItem = ({ label, value, children }) => (
    <div className="py-2.5">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
            {children || value || 'Not specified'}
        </dd>
    </div>
);

const CasualtyStatCard = ({ label, count, tone = 'default' }) => {
    const toneStyles = {
        default: 'border-gray-200/80 bg-gray-50/70 text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white',
        danger: 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200',
        warning: 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
    };

    return (
        <div className={`rounded-xl border p-2.5 sm:p-3 text-center sm:text-left ${toneStyles[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</p>
            <p className="mt-1 text-sm sm:text-base font-bold tabular-nums">{count}</p>
        </div>
    );
};

export const CasualtySummaryRow = ({ casualties = {}, totalPeopleAffected = 0, className = '' }) => {
    const normalized = normalizeCasualties(casualties);
    const { injured, fatalities, missing } = normalized;

    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Casualty summary
                </h4>
                {totalPeopleAffected > 0 && (
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        Reported people affected: <span className="font-semibold text-gray-900 dark:text-white">{totalPeopleAffected}</span>
                    </span>
                )}
            </div>

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
        </div>
    );
};

const IncidentDetailsCoreSection = ({
    report = {},
    showOperationalFields = false,
    showReporterVerification = false,
    showReporterName = false,
    showReporterContact = false,
    showCasualtiesSummary = false,
    showCasualties = false,
}) => {
    const incidentDate = report.incidentTime || report.accidentTime || report.createdAt;
    const incidentType = formatIncidentLabel(
        report.incidentType || report.accidentType || report.incidentCategory,
    );
    const municipality = report.municipalityName || report.municipality?.name || '';
    const barangay = report.barangay || 'Not specified';
    const respondingAgency = getRespondingAgencyText(report);

    const normalizedCasualties = normalizeCasualties(report.casualties);
    const { injured, fatalities, missing, totalPeopleAffected } = normalizedCasualties;

    const renderInternalCasualties = showCasualties || showOperationalFields;

    return (
        <section aria-labelledby="incident-overview-heading" className="space-y-3">
            <h3 id="incident-overview-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Overview
            </h3>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0 divide-y divide-gray-100 dark:divide-white/5 sm:grid-cols-2">
                <DetailItem label="Incident type">
                    <span className="capitalize">{incidentType}</span>
                </DetailItem>
                <DetailItem label="Severity">
                    <span className="capitalize">{report.severity || 'Moderate'}</span>
                </DetailItem>
                <DetailItem label="Incident time" value={formatDate(incidentDate)} />
                <DetailItem label="Submitted time" value={formatDate(report.createdAt)} />
                <DetailItem label="Barangay" value={barangay} />
                <DetailItem label="Municipality" value={municipality || 'Sibuyan Island'} />

                {respondingAgency && (
                    <DetailItem label="Responding agency">
                        {respondingAgency}
                    </DetailItem>
                )}

                {showReporterName && (
                    <DetailItem label="Reporter">
                        <span className="block">{report.reporter?.name || 'Unknown reporter'}</span>
                        {showReporterContact && report.reporter?.email && (
                            <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 break-all">
                                {report.reporter.email}
                            </span>
                        )}
                    </DetailItem>
                )}

                {showReporterVerification && (
                    <DetailItem label="Reporter account status">
                        {report.reporter?.isVerified ? 'Verified' : 'Not verified'}
                    </DetailItem>
                )}

                {showOperationalFields && report.priority && (
                    <DetailItem label="Priority">
                        <span className="capitalize">{report.priority}</span>
                    </DetailItem>
                )}

                {report.fireInvolved && (
                    <DetailItem label="Fire">
                        Yes {report.fireType ? `(${report.fireType.replace(/_/g, ' ')})` : ''}
                    </DetailItem>
                )}

                {showCasualtiesSummary && !renderInternalCasualties && (
                    <DetailItem label="Casualties">
                        {totalPeopleAffected > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                                {injured} injured · {fatalities} fatalities · {missing} missing
                            </span>
                        ) : (
                            'None recorded'
                        )}
                    </DetailItem>
                )}
            </dl>

            {/* Internal Casualty Summary inside the Overview container */}
            {renderInternalCasualties && (
                <CasualtySummaryRow
                    casualties={report.casualties}
                    totalPeopleAffected={totalPeopleAffected}
                    className="border-t border-gray-100 pt-3 dark:border-white/5"
                />
            )}
        </section>
    );
};

export default IncidentDetailsCoreSection;
