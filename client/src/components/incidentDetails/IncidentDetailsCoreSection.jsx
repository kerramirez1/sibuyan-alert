import { format } from 'date-fns';
import { formatIncidentLabel } from '../../utils/incidentDetails';

const formatDate = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, 'MMM d, yyyy, h:mm a');
};

const DetailItem = ({ label, value, children }) => (
    <div className="py-2.5">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
            {children || value || 'Not specified'}
        </dd>
    </div>
);

const IncidentDetailsCoreSection = ({
    report = {},
    showOperationalFields = false,
    showReporterVerification = false,
    showReporterName = false,
    showCasualtiesSummary = false,
}) => {
    const incidentDate = report.incidentTime || report.accidentTime || report.createdAt;
    const incidentType = formatIncidentLabel(
        report.incidentType || report.accidentType || report.incidentCategory,
    );
    const municipality = report.municipalityName || report.municipality?.name || '';
    const barangay = report.barangay || 'Not specified';
    const casualties = report.casualties || {};
    const casualtyCount = Number(casualties.injured || 0) + Number(casualties.fatalities || 0);

    return (
        <section aria-labelledby="incident-overview-heading">
            <h3 id="incident-overview-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Overview
            </h3>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0 divide-y divide-gray-100 dark:divide-white/5 sm:grid-cols-2">
                <DetailItem label="Type">
                    <span className="capitalize">{incidentType}</span>
                </DetailItem>
                <DetailItem label="Severity">
                    <span className="capitalize">{report.severity || 'Moderate'}</span>
                </DetailItem>
                <DetailItem label="Incident time" value={formatDate(incidentDate)} />
                <DetailItem label="Submitted" value={formatDate(report.createdAt)} />
                <DetailItem label="Barangay" value={barangay} />
                <DetailItem label="Municipality" value={municipality || 'Sibuyan Island'} />

                {report.fireInvolved && (
                    <DetailItem label="Fire">
                        Yes {report.fireType ? `(${report.fireType.replace(/_/g, ' ')})` : ''}
                    </DetailItem>
                )}

                {showReporterName && (
                    <DetailItem label="Reporter">
                        {report.reporter?.name || 'Unknown reporter'}
                    </DetailItem>
                )}

                {showReporterVerification && (
                    <DetailItem label="Reporter account">
                        {report.reporter?.isVerified ? 'Verified' : 'Not verified'}
                    </DetailItem>
                )}

                {showCasualtiesSummary && (
                    <DetailItem label="Casualties">
                        {casualtyCount > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-300">
                                {casualties.injured || 0} injured, {casualties.fatalities || 0} fatal
                            </span>
                        ) : (
                            'None recorded'
                        )}
                    </DetailItem>
                )}

                {showOperationalFields && report.priority && (
                    <DetailItem label="Priority">
                        <span className="capitalize">{report.priority}</span>
                    </DetailItem>
                )}
            </dl>
        </section>
    );
};

export default IncidentDetailsCoreSection;
