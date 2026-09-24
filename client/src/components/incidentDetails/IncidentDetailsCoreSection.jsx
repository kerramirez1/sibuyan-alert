import { format } from 'date-fns';
import { formatIncidentLabel, getPhysicalMunicipality, normalizeCasualties } from '../../utils/incidentDetails';
import { isVerifiedReportReporter } from '../../utils/reporterVerification';
import VerifiedReporterBadge from '../ui/VerifiedReporterBadge';

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

/* Casualty figures as a plain stat row: label over numeral, no boxes or tones.

   An unrecorded figure prints 0, at the same size and weight as a recorded one.
   One cell reading "Not recorded" inside the numeral scale was the only cell in
   the row that did not line up, and the reader of a summary is asking how many,
   not whether the office typed it. The null that means "not recorded" is still
   in the record and still written as "Not recorded" by the export
   (formatCasualtyMetric) — this row just answers the question it was asked.

   A zero steps down to the muted grey, so a row holding one real casualty and
   two empty fields is read as one casualty: at equal weight the zeros competed
   with the count that matters. Non-zero figures keep the plain dark numeral this
   row has always used — the colour ramp belongs to the map's casualty band. */
const CasualtyStatCard = ({ label, count }) => {
    const value = typeof count === 'number' ? count : 0;

    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${value > 0 ? 'text-gray-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                {value}
            </p>
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

            <div className="grid grid-cols-3 gap-3">
                <CasualtyStatCard
                    label="Injured"
                    count={injured}
                />
                <CasualtyStatCard
                    label="Fatalities"
                    count={fatalities}
                />
                <CasualtyStatCard
                    label="Missing"
                    count={missing}
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
    const municipality = getPhysicalMunicipality(report) || report.municipality?.name || '';
    const barangay = report.barangay || 'Not specified';
    const respondingAgency = getRespondingAgencyText(report);

    const normalizedCasualties = normalizeCasualties(report.casualties);
    // The numeric halves, so the one-line breakdown below cannot print a written
    // fallback where a count belongs. `totalPeopleAffected` is already the sum of
    // these, so an all-zero record still summarizes as "None recorded".
    const { injuredNum, fatalitiesNum, missingNum, totalPeopleAffected } = normalizedCasualties;

    const renderInternalCasualties = showCasualties || showOperationalFields;

    return (
        <section aria-labelledby="incident-overview-heading" className="space-y-3">
            <h3 id="incident-overview-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Overview
            </h3>
            {/* Facts are separated by their own rhythm — a 10px uppercase label
                over its value, 20px of padding per pair — rather than by rules.
                This grid had `divide-y`, which in a two-column grid rules the
                second cell of the *first* row (it is the second child) and none
                of the first: a half-width line above "Severity" and none above
                "Incident type". A separator that draws a table edge where there
                is no table is worse than no separator, so the rules are gone
                and the two columns are held together by the grid and the label
                step-down instead. */}
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-2">
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
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span>{report.reporter?.name || 'Unknown reporter'}</span>
                            {isVerifiedReportReporter(report.reporter) && (
                                <VerifiedReporterBadge size="sm" />
                            )}
                        </div>
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

                {showCasualtiesSummary && !renderInternalCasualties && (
                    <DetailItem label="Casualties">
                        {totalPeopleAffected > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                                {injuredNum} injured · {fatalitiesNum} fatalities · {missingNum} missing
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
                />
            )}
        </section>
    );
};

export default IncidentDetailsCoreSection;
