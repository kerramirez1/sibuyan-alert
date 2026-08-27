import {
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
    HiOutlineSearch,
} from 'react-icons/hi';
import MapView from '../map/MapView';

const STATUS_CONFIG = {
    idle: {
        label: 'Location required',
        badge: 'border-gray-200/90 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300',
        dot: 'bg-gray-400',
    },
    detecting: {
        label: 'Acquiring GPS',
        badge: 'border-blue-200/90 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
        dot: 'bg-blue-500',
    },
    confirming: {
        label: 'Confirm location',
        badge: 'border-amber-200/90 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    selected: {
        label: 'Map location selected',
        badge: 'border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    confirmed: {
        label: 'Location confirmed',
        badge: 'border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
};

const ReportLocationPanel = ({
    locationStatus,
    geoLoading,
    gpsAccuracy,
    selectedLocation,
    userLocation,
    focusLocation,
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    setSearchResults,
    detectLocation,
    retryLocation,
    confirmLocation,
    handleSearch,
    selectSearchResult,
    handleLocationSelect,
    formData,
    handleChange,
    locationError,
}) => {
    const status = STATUS_CONFIG[locationStatus] || STATUS_CONFIG.idle;

    const submitSearch = (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleSearch();
    };

    return (
        <section
            className="overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90"
            aria-labelledby="location-heading"
        >
            {/* Header & Controls */}
            <div className="border-b border-gray-200/80 bg-gray-50/70 p-3 sm:p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                {/* Step 1 Title on Left, Status Badge on Right */}
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <HiOutlineLocationMarker className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex flex-col justify-center">
                            <p className="text-[9.5px] xs:text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 leading-none">
                                Step 1 of 4
                            </p>
                            <h2 id="location-heading" className="mt-0.5 text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white leading-none truncate">
                                Incident location
                            </h2>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center">
                        <span className={`inline-flex h-6.5 sm:h-7 items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-[10px] xs:text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap select-none ${status.badge}`}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot} ${locationStatus === 'detecting' ? 'animate-pulse' : ''}`} aria-hidden="true" />
                            <span>{status.label}</span>
                        </span>
                    </div>
                </div>

                {/* Instructional Text */}
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed sm:leading-normal">
                    Pin the incident location so authorities can verify and dispatch the report.
                </p>

                {/* Search Bar & Actions */}
                <div className="relative mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 gap-2" role="search">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">Search for an incident location</span>
                            <HiOutlineSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') submitSearch(event);
                                }}
                                placeholder="Search landmark or place (e.g. Cajidiocan Port)"
                                className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={submitSearch}
                            disabled={isSearching || !searchQuery.trim()}
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/15 cursor-pointer"
                        >
                            {isSearching ? 'Searching…' : 'Search'}
                        </button>
                    </div>

                    {locationStatus === 'idle' ? (
                        <button
                            type="button"
                            onClick={detectLocation}
                            disabled={geoLoading}
                            className="relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap before:absolute before:-inset-1 before:content-['']"
                        >
                            <HiOutlineLocationMarker className="h-3.5 w-3.5 shrink-0 text-emerald-200 dark:text-emerald-300" aria-hidden="true" />
                            <span>{geoLoading ? 'Locating…' : 'Use my location'}</span>
                        </button>
                    ) : ['selected', 'confirmed'].includes(locationStatus) ? (
                        <button
                            type="button"
                            onClick={retryLocation}
                            className="relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-bold uppercase tracking-wider text-gray-700 shadow-2xs transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer whitespace-nowrap before:absolute before:-inset-1 before:content-['']"
                        >
                            <span>Change</span>
                        </button>
                    ) : null}

                    {searchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200/90 bg-white shadow-lg dark:divide-white/5 dark:border-white/10 dark:bg-[#0c1813]">
                            {searchResults.map((result) => (
                                <button
                                    key={result.placeId || `${result.lat}-${result.lng}`}
                                    type="button"
                                    onClick={() => selectSearchResult(result)}
                                    className="block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                                >
                                    <span className="block truncate text-xs font-semibold text-gray-950 dark:text-white">
                                        {result.displayName?.split(',')[0]}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">
                                        {result.displayName}
                                    </span>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setSearchResults([])}
                                className="w-full px-3.5 py-2 text-center text-xs font-medium text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
                            >
                                Close results
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Interactive Map View */}
            <div className="aspect-[4/3] w-full min-h-0 overflow-hidden sm:aspect-auto sm:h-[320px] lg:h-[360px]">
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
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <button
                            type="button"
                            onClick={retryLocation}
                            className="relative inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-amber-800 shadow-2xs transition-colors hover:bg-amber-50 sm:flex-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 cursor-pointer before:absolute before:-inset-1.5 before:content-['']"
                        >
                            Adjust
                        </button>
                        <button
                            type="button"
                            onClick={confirmLocation}
                            className="relative inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-amber-800 sm:flex-none dark:bg-amber-600 dark:hover:bg-amber-500 cursor-pointer before:absolute before:-inset-1.5 before:content-['']"
                        >
                            <HiOutlineCheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Confirm location</span>
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
