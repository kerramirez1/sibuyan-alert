import {
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
    HiOutlineSearch,
} from 'react-icons/hi';
import MapView from '../map/MapView';

const STATUS_CONFIG = {
    idle: { label: 'Location required', badge: 'border-gray-200 bg-gray-50 text-gray-600', dot: 'bg-gray-400' },
    detecting: { label: 'Acquiring GPS', badge: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
    confirming: { label: 'Confirm location', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    verified: { label: 'Location verified', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
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
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white" aria-labelledby="location-heading">
            <div className="border-b border-gray-200 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                                <HiOutlineLocationMarker className="h-4 w-4" />
                            </span>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Step 1</p>
                                <h2 id="location-heading" className="text-base font-semibold text-gray-900">Incident location</h2>
                            </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">Use GPS, search for a landmark, or select the exact position on the map.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${status.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${locationStatus === 'detecting' ? 'animate-pulse' : ''}`} />
                            {status.label}
                        </span>
                        {locationStatus === 'idle' ? (
                            <button type="button" onClick={detectLocation} disabled={geoLoading} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                                Use my location
                            </button>
                        ) : locationStatus === 'verified' ? (
                            <button type="button" onClick={retryLocation} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-gray-400">Change</button>
                        ) : null}
                    </div>
                </div>

                <div className="relative mt-4">
                    <div className="flex gap-2" role="search">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">Search for an incident location</span>
                            <HiOutlineSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') submitSearch(event);
                                }}
                                placeholder="Search landmark or place"
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                            />
                        </label>
                        <button type="button" onClick={submitSearch} disabled={isSearching || !searchQuery.trim()} className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40">
                            {isSearching ? 'Searching…' : 'Search'}
                        </button>
                    </div>

                    {searchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {searchResults.map((result) => (
                                <button
                                    key={result.place_id || `${result.lat}-${result.lon}`}
                                    type="button"
                                    onClick={() => selectSearchResult(result)}
                                    className="block w-full px-4 py-3 text-left hover:bg-gray-50"
                                >
                                    <span className="block truncate text-sm font-medium text-gray-900">{result.display_name.split(',')[0]}</span>
                                    <span className="mt-0.5 block truncate text-xs text-gray-500">{result.display_name}</span>
                                </button>
                            ))}
                            <button type="button" onClick={() => setSearchResults([])} className="w-full px-4 py-2.5 text-center text-xs font-medium text-gray-500 hover:bg-gray-50">Close results</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="h-[340px] sm:h-[430px] lg:h-[500px]">
                <MapView
                    onLocationSelect={handleLocationSelect}
                    selectedLocation={selectedLocation}
                    userLocation={userLocation}
                    focusLocation={focusLocation}
                    enable3D
                    gpsAccuracy={gpsAccuracy}
                    className="h-full w-full"
                />
            </div>

            {locationStatus === 'confirming' && (
                <div className="flex flex-col gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-amber-900">Confirm the GPS position</p>
                        <p className="mt-0.5 text-xs text-amber-700">Estimated accuracy: {gpsAccuracy ? `${Math.round(gpsAccuracy)} meters` : 'unavailable'}</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={retryLocation} className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:border-amber-400 sm:flex-none">Adjust</button>
                        <button type="button" onClick={confirmLocation} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 sm:flex-none">
                            <HiOutlineCheckCircle className="h-4 w-4" />
                            Confirm location
                        </button>
                    </div>
                </div>
            )}

            <div className="grid gap-3 border-t border-gray-200 p-4 sm:grid-cols-2 sm:p-5">
                <label>
                    <span className="text-xs font-medium text-gray-700">Address or landmark <span className="text-red-600">*</span></span>
                    <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        aria-invalid={Boolean(locationError)}
                        aria-describedby={locationError ? 'location-error' : undefined}
                        placeholder="Near Municipal Hall, Poblacion"
                        className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 ${locationError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-gray-400 focus:ring-gray-100'}`}
                    />
                </label>
                <label>
                    <span className="text-xs font-medium text-gray-700">Barangay</span>
                    <input type="text" name="barangay" value={formData.barangay} onChange={handleChange} placeholder="Poblacion" className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100" />
                </label>
                {locationError && <p id="location-error" className="text-xs font-medium text-red-600 sm:col-span-2">{locationError}</p>}
            </div>
        </section>
    );
};

export default ReportLocationPanel;
