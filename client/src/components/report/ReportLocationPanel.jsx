import MapView from '../map/MapView';

// Plain-text status; color carries no meaning here so it can never collide
// with the severity scale used elsewhere in the form.
const STATUS_LABEL = {
    idle: 'Location required',
    detecting: 'Acquiring GPS',
    confirming: 'Confirm location',
    selected: 'Location selected',
    confirmed: 'Location confirmed',
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
    const statusLabel = STATUS_LABEL[locationStatus] || STATUS_LABEL.idle;
    const isAcquiringLocation = geoLoading || locationStatus === 'detecting';

    return (
        <section aria-labelledby="location-heading">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Step 1 of 4
                </p>
                <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400" role="status">
                    {isAcquiringLocation ? 'Acquiring GPS…' : statusLabel}
                </p>
            </div>
            <h2 id="location-heading" className="mt-1 text-base font-bold text-gray-900 sm:text-lg dark:text-white">
                Incident location
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                Click on the map or use your GPS location to set the exact incident coordinates.
            </p>

            {/* Interactive map with location control */}
            <div className="relative mt-3 h-[240px] w-full min-h-0 overflow-hidden rounded-lg border border-gray-200 sm:h-[300px] lg:h-[360px] xl:h-[400px] dark:border-white/10">
                <MapView
                    mode="report-location"
                    onLocationSelect={handleLocationSelect}
                    selectedLocation={selectedLocation}
                    userLocation={userLocation}
                    enable3D
                    focusLocation={focusLocation}
                    gpsAccuracy={gpsAccuracy}
                    className="h-full w-full"
                />

                <button
                    type="button"
                    onClick={detectLocation}
                    disabled={isAcquiringLocation}
                    aria-label="Use my current GPS location"
                    className="absolute bottom-3 right-3 z-10 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-75 dark:border-white/15 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-[#14241c]"
                >
                    {isAcquiringLocation ? (
                        <>
                            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent dark:border-emerald-400" aria-hidden="true" />
                            <span>Locating…</span>
                        </>
                    ) : (
                        <span className="whitespace-nowrap">My location</span>
                    )}
                </button>
            </div>

            {/* GPS confirmation row */}
            {locationStatus === 'confirming' && (
                <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-white">Confirm the GPS position. </span>
                        Estimated accuracy: {gpsAccuracy ? `${Math.round(gpsAccuracy)} meters` : 'unavailable'}
                    </p>
                    <div className="flex shrink-0 gap-2">
                        <button
                            type="button"
                            onClick={retryLocation}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-3.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
                        >
                            Adjust
                        </button>
                        <button
                            type="button"
                            onClick={confirmLocation}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                            Confirm location
                        </button>
                    </div>
                </div>
            )}

            {/* Location fields */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Address or landmark <span className="text-emerald-700 dark:text-emerald-400" aria-hidden="true">*</span>
                    </span>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        aria-invalid={Boolean(locationError)}
                        aria-describedby={locationError ? 'location-error' : undefined}
                        placeholder="Near Municipal Hall, Poblacion"
                        className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 dark:bg-[#07130e] dark:text-gray-200 ${locationError
                            ? 'border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-800'
                            : 'border-gray-300 focus:border-emerald-600 focus:ring-emerald-600/15 dark:border-white/10'
                            }`}
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Barangay
                    </span>
                    <input
                        type="text"
                        name="barangay"
                        value={formData.barangay}
                        onChange={handleChange}
                        placeholder="Poblacion"
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
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
