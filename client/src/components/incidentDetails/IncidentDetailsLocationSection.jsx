import { HiOutlineArrowRight, HiOutlineLocationMarker } from 'react-icons/hi';
import MapView from '../map/MapView';
import { getPhysicalMunicipality } from '../../utils/incidentDetails';
import { getCoordinates } from '../adminReports/incidentReportConfig';

const IncidentDetailsLocationSection = ({
    report = {},
    userRole = 'guest',
    showCoordinates = false,
    onOpenMap,
    transferLine = '',
    className = '',
}) => {
    const coordinates = getCoordinates(report);
    const municipality = getPhysicalMunicipality(report) || report.municipality?.name || '';
    const locationTitle = report.address || [report.barangay, municipality].filter(Boolean).join(', ') || 'Incident details';
    const locationContext = [report.barangay, municipality]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', ');

    return (
        <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`} aria-labelledby="incident-location-heading">
            <div className="flex items-start gap-2.5">
                <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <h3 id="incident-location-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                        Pinned location
                    </h3>
                    <p className="mt-1 break-words text-xs sm:text-sm font-semibold leading-5 text-gray-900 dark:text-gray-100">
                        {locationTitle}
                    </p>
                    {locationContext && locationContext !== locationTitle && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{locationContext}</p>
                    )}
                    {transferLine && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{transferLine}</p>
                    )}
                    {showCoordinates && (
                        <p className="mt-0.5 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                            {coordinates ? `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}` : 'Coordinates unavailable'}
                        </p>
                    )}

                    {coordinates && typeof onOpenMap === 'function' && (
                        <button
                            type="button"
                            onClick={() => onOpenMap(report)}
                            className="group mt-1.5 mb-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                            <span>Open full map</span>
                            <HiOutlineArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                        </button>
                    )}

                    {coordinates ? (
                        <div
                            data-testid="incident-location-preview"
                            className="incident-location-preview aspect-square w-full overflow-hidden rounded-2xl border border-gray-200/90 shadow-2xs dark:border-white/10 sm:aspect-auto sm:h-52"
                        >
                            <MapView
                                reports={[report]}
                                showPending
                                filterMode={userRole === 'municipal_admin' ? 'review' : 'response'}
                                filterStatus={report?.status || null}
                                viewerRole={userRole}
                                focusLocation={{ ...coordinates, zoom: 16 }}
                                className="h-full w-full"
                                disableScrollZoom={false}
                                mode="incident-preview"
                                enable3D={false}
                            />
                        </div>
                    ) : (
                        <div className="mt-2.5 flex h-28 items-center justify-center rounded-2xl border border-gray-200/90 bg-gray-50/60 dark:border-white/10 dark:bg-white/5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Location coordinates unavailable.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default IncidentDetailsLocationSection;
