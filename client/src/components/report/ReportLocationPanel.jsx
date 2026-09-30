import {
    HiCheck,
    HiOutlineCursorClick,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
} from 'react-icons/hi';
import MapView from '../map/MapView';

// Plain-text status paired with semantic icons and distinct styling so
// states are communicated through text, iconography, and contrast, not color alone.
const STATUS_CONFIG = {
    idle: {
        label: 'Location required',
        badgeClass: 'border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300',
        Icon: HiOutlineExclamationCircle,
    },
    detecting: {
        label: 'Acquiring GPS',
        badgeClass: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200',
        Icon: null,
    },
    confirming: {
        label: 'Confirm location',
        badgeClass: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-200',
        Icon: HiOutlineCursorClick,
    },
    selected: {
        label: 'Location selected',
        badgeClass: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200',
        Icon: HiOutlineLocationMarker,
    },
    confirmed: {
        label: 'Location confirmed',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300',
        Icon: HiCheck,
    },
};

const ReportLocationPanel = ({
    locationStatus,
    geoLoading,
    gpsAccuracy,
    selectedLocation,
    userLocation,
    focusLocation,
    detectLocation,
    retryLocation,
    confirmLocation,
    handleLocationSelect,
    formData,
    handleChange,
    locationError,
}) => {
    const isAcquiringLocation = geoLoading || locationStatus === 'detecting';
    const currentConfig = STATUS_CONFIG[locationStatus] || STATUS_CONFIG.idle;
    const StatusIcon = currentConfig.Icon;

    return (
        <section aria-labelledby="location-heading">
            <div className="flex items-center justify-between gap-2">
                {/* The top stepper is the single visual progress system; the
                    step position stays available to assistive tech here. */}
                <p className="sr-only">
                    Step 1 of 4
                </p>
                <p
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${currentConfig.badgeClass}`}
                    role="status"
                    aria-live="polite"
                >
                    {isAcquiringLocation ? (
                        <>
                            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                            <span>Acquiring GPS…</span>
                        </>
                    ) : (
                        <>
                            {StatusIcon && <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            <span>{currentConfig.label}</span>
                        </>
                    )}
                </p>
            </div>
            <h2 id="location-heading" tabIndex={-1} className="section-title mt-1.5 sm:mt-2 focus:outline-none">
                Incident location
            </h2>
            <p className="section-description mt-1 text-xs sm:text-[13px] text-gray-600 dark:text-gray-300">
                Select a location on the map or use GPS to set the incident coordinates.
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                Address or coordinates are required (<span className="required-mark" aria-hidden="true">*</span>).
            </p>

            {/* Interactive map with location control */}
            <div className="relative mt-3 h-[240px] w-full min-h-0 overflow-hidden rounded-lg border border-gray-200 sm:h-[300px] lg:h-[360px] xl:h-[400px] dark:border-white/10">
                {/* Compact coordinates chip when pin is placed; screen-reader notice when unpinned to avoid visual clutter */}
                {selectedLocation && Number.isFinite(selectedLocation.lat) && Number.isFinite(selectedLocation.lng) ? (
                    <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-mono text-gray-700 shadow-xs dark:border-white/10 dark:bg-gray-900 dark:text-gray-200">
                        <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                locationStatus === 'confirmed' ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            aria-hidden="true"
                        />
                        <span className="truncate">
                            {locationStatus === 'confirmed' ? 'Confirmed pin' : 'Selected pin'}: {Number(selectedLocation.lat).toFixed(4)}, {Number(selectedLocation.lng).toFixed(4)}
                        </span>
                    </div>
                ) : (
                    <span className="sr-only">Default island view · No pin placed</span>
                )}

                <MapView
                    mode="report-location"
                    onLocationSelect={handleLocationSelect}
                    selectedLocation={selectedLocation}
                    locationStatus={locationStatus}
                    userLocation={userLocation}
                    enable3D={false}
                    focusLocation={focusLocation}
                    gpsAccuracy={gpsAccuracy}
                    className="h-full w-full"
                    // Placement surface, not an exploration surface: no zoom/compass
                    // group and no scale bar. Pin drag, scroll/pinch zoom, and the
                    // "My location" action below cover all positioning tasks.
                    showNavigationControl={false}
                    showScaleControl={false}
                />

                <button
                    type="button"
                    onClick={detectLocation}
                    disabled={isAcquiringLocation}
                    aria-label="Use my current GPS location"
                    className="absolute bottom-2.5 right-2.5 z-10 inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-800 shadow-sm hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-75 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:ring-sky-400 before:absolute before:-inset-2 before:content-['']"
                >
                    {isAcquiringLocation ? (
                        <>
                            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent dark:border-emerald-400" aria-hidden="true" />
                            <span>Locating…</span>
                        </>
                    ) : (
                        <>
                            <HiOutlineLocationMarker className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                            <span className="whitespace-nowrap">My location</span>
                        </>
                    )}
                </button>
            </div>

            {/* GPS confirmation row */}
            {locationStatus === 'confirming' && (
                <div className="mt-3 flex flex-col gap-2.5 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-white">Confirm the GPS position. </span>
                        Estimated accuracy: {gpsAccuracy ? `${Math.round(gpsAccuracy)} meters` : 'unavailable'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 max-[420px]:gap-1.5 sm:flex sm:shrink-0">
                        <button
                            type="button"
                            onClick={retryLocation}
                            className="btn-outline min-h-11 whitespace-nowrap max-[420px]:min-h-10 max-[420px]:px-3 max-[420px]:py-2 max-[420px]:text-[13px] sm:min-h-9"
                        >
                            Adjust
                        </button>
                        <button
                            type="button"
                            onClick={confirmLocation}
                            className="btn-primary min-h-11 whitespace-nowrap max-[420px]:min-h-10 max-[420px]:px-3 max-[420px]:py-2 max-[420px]:text-[13px] sm:min-h-9"
                        >
                            Confirm location
                        </button>
                    </div>
                </div>
            )}

            {/* Location fields */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="field-label">
                        Address or landmark <span className="required-mark" aria-hidden="true">*</span><span className="sr-only">(required)</span>
                    </span>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        required
                        aria-required="true"
                        aria-invalid={Boolean(locationError)}
                        aria-describedby={locationError ? 'location-error' : undefined}
                        placeholder="Near Municipal Hall, Poblacion"
                        className="field-control"
                    />
                </label>
                <label className="block">
                    <span className="field-label">
                        Barangay <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>
                    </span>
                    <input
                        type="text"
                        name="barangay"
                        value={formData.barangay}
                        onChange={handleChange}
                        placeholder="Poblacion"
                        className="field-control"
                    />
                </label>
                {locationError && (
                    <p id="location-error" className="text-xs font-medium text-red-600 sm:col-span-2 dark:text-red-400">
                        {locationError}
                    </p>
                )}
            </div>
        </section>
    );
};

export default ReportLocationPanel;
