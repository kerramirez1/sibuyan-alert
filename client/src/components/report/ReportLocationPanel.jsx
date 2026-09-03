import {
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
} from 'react-icons/hi';
import MapView from '../map/MapView';

const STATUS_CONFIG = {
    idle: {
        label: 'Location required',
        badge: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300',
        dot: 'bg-gray-400',
    },
    detecting: {
        label: 'Acquiring GPS',
        badge: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
        dot: 'bg-blue-500',
    },
    confirming: {
        label: 'Confirm location',
        badge: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    selected: {
        label: 'Location selected',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        dot: 'bg-emerald-600',
    },
    confirmed: {
        label: 'Location confirmed',
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        dot: 'bg-emerald-600',
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
    const status = STATUS_CONFIG[locationStatus] || STATUS_CONFIG.idle;
    const isAcquiringLocation = geoLoading || locationStatus === 'detecting';

    return (
        <section
            className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
            aria-labelledby="location-heading"
        >
            {/* Header & Controls */}
            <div className="space-y-1.5 border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                {/* Step Eyebrow & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase">
                        Step 1 of 4
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.badge}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot} ${isAcquiringLocation ? 'animate-pulse' : ''}`} aria-hidden="true" />
                        <span>{status.label}</span>
                    </span>
                </div>

                {/* Main Section Title & Instructions */}
                <div>
                    <h2 id="location-heading" className="text-lg sm:text-xl font-bold font-display text-gray-950 dark:text-white">
                        Incident Location
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                        Click on the map or use your GPS location to set the exact incident coordinates.
                    </p>
                </div>
            </div>

            {/* Interactive Map View with Floating Location Control */}
            <div className="relative h-[240px] sm:h-[300px] lg:h-[360px] xl:h-[400px] w-full min-h-0 overflow-hidden">
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

                {/* Floating "Use My Location" Button (Bottom-Right) */}
                <button
                    type="button"
                    onClick={detectLocation}
                    disabled={isAcquiringLocation}
                    aria-label="Use my current GPS location"
                    className="absolute bottom-3 right-3 z-10 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 hover:bg-white active:bg-gray-100 text-emerald-900 dark:text-emerald-300 dark:bg-[#0c1813]/90 dark:hover:bg-[#0c1813] text-xs font-bold border border-gray-200/90 dark:border-white/15 shadow-md backdrop-blur-xs transition-all active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                    {isAcquiringLocation ? (
                        <>
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent animate-spin shrink-0" aria-hidden="true" />
                            <span>Locating…</span>
                        </>
                    ) : (
                        <>
                            <HiOutlineLocationMarker className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                            <span className="whitespace-nowrap">My location</span>
                        </>
                    )}
                </button>
            </div>

            {/* GPS Confirmation Banner */}
            {locationStatus === 'confirming' && (
                <div className="flex flex-col gap-2.5 border-t border-amber-200/80 bg-amber-50/80 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <div>
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
                            Confirm the GPS position
                        </p>
                        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                            Estimated accuracy: {gpsAccuracy ? `${Math.round(gpsAccuracy)} meters` : 'unavailable'}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 xs:flex-row xs:flex-wrap xs:items-center sm:flex-nowrap">
                        <button
                            type="button"
                            onClick={retryLocation}
                            className="relative inline-flex h-8 w-full items-center justify-center whitespace-nowrap rounded-lg border border-amber-300 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-amber-800 shadow-2xs transition-colors hover:bg-amber-50 xs:w-auto xs:flex-1 sm:flex-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 cursor-pointer before:absolute before:-inset-1.5 before:content-['']"
                        >
                            Adjust
                        </button>
                        <button
                            type="button"
                            onClick={confirmLocation}
                            className="relative inline-flex h-8 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-700 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-amber-800 xs:w-auto xs:flex-1 sm:flex-none dark:bg-amber-600 dark:hover:bg-amber-500 cursor-pointer before:absolute before:-inset-1.5 before:content-['']"
                        >
                            <HiOutlineCheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="whitespace-nowrap">Confirm location</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Location Fields */}
            <div className="grid gap-3 border-t border-gray-200/80 p-3.5 sm:grid-cols-2 sm:p-4 dark:border-white/10 bg-gray-50/30 dark:bg-white/[0.01]">
                <label className="flex h-full flex-col">
                    <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        Address or landmark <span className="text-emerald-700 dark:text-emerald-400">*</span>
                    </span>
                    <div className="mt-auto">
                        <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            aria-invalid={Boolean(locationError)}
                            aria-describedby={locationError ? 'location-error' : undefined}
                            placeholder="Near Municipal Hall, Poblacion"
                            className={`h-9 w-full rounded-xl border bg-white px-3 text-xs font-semibold text-gray-800 shadow-2xs outline-none transition focus:ring-2 dark:bg-[#07130e] dark:text-gray-200 ${locationError
                                ? 'border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-800'
                                : 'border-gray-200/90 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-white/10'
                                }`}
                        />
                    </div>
                </label>
                <label className="flex h-full flex-col">
                    <span className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        Barangay
                    </span>
                    <div className="mt-auto">
                        <input
                            type="text"
                            name="barangay"
                            value={formData.barangay}
                            onChange={handleChange}
                            placeholder="Poblacion"
                            className="h-9 w-full rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-800 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                        />
                    </div>
                </label>
                {locationError && (
                    <p id="location-error" className="text-xs font-medium text-red-600 sm:col-span-2">
                        {locationError}
                    </p>
                )}
            </div>
        </section>
    );
};

export default ReportLocationPanel;
