import { HiOutlineArrowRight, HiOutlineLocationMarker } from 'react-icons/hi';
import MapView from '../map/MapView';
import { getCoordinates } from './incidentReportConfig';

const IncidentLocationPreview = ({
    report,
    userRole = 'guest',
    onOpenMap
}) => {
    const coordinates = getCoordinates(report);
    const municipality = report.municipalityName || report.municipality?.name || '';
    const locationTitle = report.address || [report.barangay, municipality].filter(Boolean).join(', ') || 'Incident details';
    const locationContext = [report.barangay, municipality]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', ');
        
    return (
        <section className="border-t border-gray-100 py-4 dark:border-gray-700" aria-labelledby="shared-location-heading">
            <div className="flex items-start gap-3">
                <HiOutlineLocationMarker className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <h3 id="shared-location-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Pinned location</h3>
                    <p className="mt-2 break-words text-sm font-medium leading-5 text-gray-900 dark:text-gray-100">{locationTitle}</p>
                    {locationContext && locationContext !== locationTitle && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{locationContext}</p>
                    )}
                    <p className="mt-1 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                        {coordinates ? `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}` : 'Coordinates unavailable'}
                    </p>
                    
                    {coordinates && typeof onOpenMap === 'function' && (
                        <button
                            type="button"
                            onClick={() => onOpenMap(report)}
                            className="group mt-2 mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-sm px-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:text-gray-300 dark:hover:text-white"
                        >
                            Open full map
                            <HiOutlineArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                        </button>
                    )}

                    {coordinates ? (
                        <div className="aspect-square w-full overflow-hidden rounded-sm border border-gray-300 dark:border-gray-700 sm:aspect-auto sm:h-56">
                            <MapView
                                reports={[report]}
                                showPending
                                filterMode={userRole === 'municipal_admin' ? 'review' : 'response'}
                                viewerRole={userRole}
                                focusLocation={{ ...coordinates, zoom: 16 }}
                                className="h-full w-full"
                                disableScrollZoom={true}
                                mode="incident-preview"
                                enable3D={false}
                            />
                        </div>
                    ) : (
                        <div className="mt-3 flex h-32 items-center justify-center rounded-sm border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Location coordinates unavailable.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default IncidentLocationPreview;
