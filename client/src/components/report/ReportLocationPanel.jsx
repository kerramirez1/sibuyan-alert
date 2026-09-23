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
        <section className="surface-panel p-5 sm:p-6" aria-labelledby="location-heading">
            <div className="flex items-baseline justify-between gap-2">
                <p className="page-eyebrow mb-0">
                    Step 1 of 4
                </p>
                <p className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-medium text-[var(--accent-text)]" role="status">
                    {isAcquiringLocation ? 'Acquiring GPS…' : statusLabel}
                </p>
            </div>
            <h2 id="location-heading" className="section-title mt-2">
                Incident location
            </h2>
            <p className="section-description">
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
                    className="absolute bottom-3 right-3 z-10 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text-primary)] shadow-sm hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-75"
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
                            className="btn-outline"
                        >
                            Adjust
                        </button>
                        <button
                            type="button"
                            onClick={confirmLocation}
                            className="btn-primary"
                        >
                            Confirm location
                        </button>
                    </div>
                </div>
            )}

            {/* Location fields */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="field-label">
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
                        className="field-control"
                    />
                </label>
                <label className="block">
                    <span className="field-label">
                        Barangay
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
