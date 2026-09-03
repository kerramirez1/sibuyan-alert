import { useEffect, useMemo, useState } from 'react';
import {
    HiOutlineArrowsExpand,
    HiOutlineExternalLink,
    HiOutlinePhotograph,
} from 'react-icons/hi';
import { getMapRiskTypeConfig } from '../../config/mapVisuals';
import {
    fetchProtectedBlob,
    getCachedBlobUrl,
} from '../../utils/blobCache';
import ImageViewer from '../ui/ImageViewer';

const SEVERITY_BADGES = {
    critical: {
        label: 'Critical severity',
        badge: 'border-red-200/90 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300',
        dot: 'bg-red-600',
    },
    high: {
        label: 'High severity',
        badge: 'border-orange-200/90 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300',
        dot: 'bg-orange-500',
    },
    medium: {
        label: 'Medium severity',
        badge: 'border-amber-200/90 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
        dot: 'bg-amber-500',
    },
    low: {
        label: 'Low severity',
        badge: 'border-emerald-200/90 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
};

const extractCoordinates = (item) => {
    if (!item) return null;
    let lat;
    let lng;

    if (item.coordinates && typeof item.coordinates.lat !== 'undefined' && typeof item.coordinates.lng !== 'undefined') {
        lat = Number(item.coordinates.lat);
        lng = Number(item.coordinates.lng);
    } else if (typeof item.lat !== 'undefined' && typeof item.lng !== 'undefined') {
        lat = Number(item.lat);
        lng = Number(item.lng);
    } else if (Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
        lat = Number(item.coordinates[1]);
        lng = Number(item.coordinates[0]);
    } else if (item.location?.coordinates && Array.isArray(item.location.coordinates) && item.location.coordinates.length >= 2) {
        lat = Number(item.location.coordinates[1]);
        lng = Number(item.location.coordinates[0]);
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
    }
    return null;
};

const RiskZonePhotoThumbnail = ({ photo, index, hasMultiple = false, onView }) => {
    const [state, setState] = useState({ url: '', loading: true, error: false });

    useEffect(() => {
        const controller = new AbortController();

        const loadPhoto = async () => {
            const rawUrl = photo?.url || photo?.src || (typeof photo === 'string' ? photo : '');
            if (!rawUrl) {
                setState({ url: '', loading: false, error: true });
                return;
            }

            if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
                setState({ url: rawUrl, loading: false, error: false });
                return;
            }

            // Synchronous cache hit
            const cached = getCachedBlobUrl(rawUrl);
            if (cached) {
                setState({ url: cached, loading: false, error: false });
                return;
            }

            try {
                const result = await fetchProtectedBlob(rawUrl, { signal: controller.signal });
                setState({ url: result.url, loading: false, error: false });
            } catch (err) {
                if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
                setState({ url: '', loading: false, error: true });
            }
        };

        loadPhoto();

        return () => {
            controller.abort();
        };
    }, [photo?.url, photo?.src, photo]);

    if (state.loading) {
        return (
            <div
                className="aspect-square w-full animate-pulse rounded-xl border border-gray-200/90 bg-gray-100 dark:border-white/10 dark:bg-white/5"
                aria-label={`Loading reference photo ${index + 1}`}
            />
        );
    }

    if (state.error || !state.url) {
        return (
            <div
                className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-gray-200/90 bg-gray-50/80 p-2 text-center text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400"
                aria-label={`Reference photo ${index + 1} preview unavailable`}
            >
                <HiOutlinePhotograph className="h-5 w-5 opacity-40 mb-1" aria-hidden="true" />
                <span>Preview unavailable</span>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onView(index)}
            aria-label={`View reference photo ${index + 1}: ${photo.originalName || 'Hazard area'}`}
            className="group relative aspect-square w-full overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 shadow-2xs hover:border-emerald-500/70 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all cursor-pointer dark:border-white/10 dark:bg-white/5"
        >
            <img
                src={state.url}
                alt={photo.originalName || `Hazard reference photo ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                onError={() => setState({ url: '', loading: false, error: true })}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur-xs">
                    <HiOutlineArrowsExpand className="h-4 w-4" aria-hidden="true" />
                </span>
            </div>
            {hasMultiple && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                    #{index + 1}
                </span>
            )}
        </button>
    );
};

const HighRiskZoneDetails = ({
    zone,
    _viewerRole = 'guest',
}) => {
    const [viewerIndex, setViewerIndex] = useState(null);

    const coordinates = useMemo(() => extractCoordinates(zone), [zone]);
    const photos = useMemo(() => (Array.isArray(zone?.photos) ? zone.photos : []), [zone?.photos]);

    const severityConfig = SEVERITY_BADGES[zone?.severity] || SEVERITY_BADGES.medium;
    const riskTypeConfig = getMapRiskTypeConfig(zone?.type);

    const viewerItems = useMemo(() => {
        return photos.map((photo, idx) => {
            const url = photo?.url || photo?.src || (typeof photo === 'string' ? photo : '');
            return {
                id: photo?._id || `risk-zone-photo-${idx}`,
                url,
                src: url,
                originalUrl: url,
                entityLabel: 'Field reference',
                caption: photo?.originalName ? `Reference photo: ${photo.originalName}` : undefined,
                sourceKind: 'authorized-original',
                viewerAccess: 'original',
            };
        });
    }, [photos]);

    const handleOpenViewer = (index) => {
        setViewerIndex(index);
    };

    const handleCloseViewer = () => {
        setViewerIndex(null);
    };

    return (
        <div className="space-y-4 p-4 sm:p-5 text-gray-900 dark:text-white">
            {/* 1. Header: Badges & Jurisdiction */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${severityConfig.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${severityConfig.dot}`} aria-hidden="true" />
                        <span>{severityConfig.label}</span>
                    </span>

                    <span className="inline-flex items-center rounded-md border border-gray-200/90 bg-gray-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                        {zone?.municipality || 'Sibuyan Island'}
                        {zone?.barangay ? ` · ${zone.barangay}` : ''}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active zone</span>
                    </span>
                </div>

                {/* 2. Zone Name & Description */}
                <div>
                    <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-gray-950 dark:text-white break-words leading-snug">
                        {zone?.name || 'High-Risk Zone'}
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-600 dark:text-gray-300 break-words">
                        {zone?.description || 'No description provided for this hazard zone.'}
                    </p>
                </div>
            </div>

            {/* 3. Flat Borderless Metadata Grid */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2 border-t border-gray-100 dark:border-white/5">
                <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                        Hazard type
                    </dt>
                    <dd className="text-xs font-semibold text-gray-900 dark:text-white">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${riskTypeConfig.badge}`}>
                            {riskTypeConfig.label}
                        </span>
                    </dd>
                </div>

                <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                        Coverage radius
                    </dt>
                    <dd className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                        {Number.isFinite(Number(zone?.radius)) && Number(zone?.radius) > 0
                            ? `${Number(zone.radius)} m radius`
                            : 'Not specified'}
                    </dd>
                </div>

                {coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng) && (
                    <div className="col-span-2 min-w-0">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">
                            GPS location
                        </dt>
                        <dd className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                            {coordinates.lat.toFixed(4)}° N, {coordinates.lng.toFixed(4)}° E
                        </dd>
                    </div>
                )}
            </dl>

            {/* 4. Field Reference Photos Section */}
            <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <HiOutlinePhotograph className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                            Field reference
                        </h4>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                        {photos.length === 1 ? '1 photo' : `${photos.length} photos`}
                    </span>
                </div>

                {photos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {photos.map((photo, index) => (
                            <RiskZonePhotoThumbnail
                                key={photo?._id || photo?.filename || `photo-${index}`}
                                photo={photo}
                                index={index}
                                hasMultiple={photos.length > 1}
                                onView={handleOpenViewer}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/50 p-3 text-xs text-gray-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                        <HiOutlinePhotograph className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <span>No reference photos attached for this hazard zone.</span>
                    </div>
                )}
            </div>

            {/* 5. External Location Reference (Google Maps) */}
            {coordinates && (
                <div className="border-t border-gray-200/90 pt-3.5 dark:border-white/10">
                    <a
                        href={`https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                    >
                        <span>Open in Google Maps</span>
                        <HiOutlineExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                    </a>
                </div>
            )}

            {/* Viewport Portaled ImageViewer Modal */}
            {viewerIndex !== null && (
                <ImageViewer
                    isOpen={viewerIndex !== null}
                    items={viewerItems}
                    initialIndex={viewerIndex}
                    onClose={handleCloseViewer}
                    viewerAccess="original"
                    entityLabel="Field reference"
                />
            )}
        </div>
    );
};

export default HighRiskZoneDetails;
