import { useEffect, useMemo, useState } from 'react';
import { HiOutlineEyeOff, HiOutlinePhotograph, HiOutlineRefresh, HiOutlineShieldCheck } from 'react-icons/hi';
import {
    isAuthorizedRedactedPreviewEndpoint,
    isProtectedOriginalFileUrl,
    normalizeEvidenceDescriptor,
} from '../../utils/evidenceModel';
import {
    fetchProtectedBlob,
    getCachedBlobUrl,
} from '../../utils/blobCache';
import ImageViewer from '../ui/ImageViewer';
import { SkeletonThumbnail } from '../ui/Skeleton';

const EvidenceThumbnail = ({
    item,
    index,
    viewerAccess = 'redacted',
    isOwner = false,
    compact = false,
    thumbnailSize = 'sm',
    onView,
}) => {
    const [state, setState] = useState({ url: '', loading: true, error: '' });
    const [reloadKey, setReloadKey] = useState(0);
    const isOriginalAllowed = viewerAccess === 'original';
    const isBlurred = viewerAccess === 'redacted';

    const sizeClasses = compact
        ? (thumbnailSize === 'md'
            ? 'w-36 sm:w-44 md:w-48 lg:w-52 h-24 sm:h-28 md:h-32 lg:h-36 shrink-0 max-w-full'
            : 'w-24 h-24 sm:w-28 sm:h-24 shrink-0')
        : 'aspect-square w-full';

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const load = async () => {
            try {
                if (isBlurred) {
                    // Security rule: In redacted mode, only a valid server-generated redacted preview endpoint is permitted
                    if (item?.isForbiddenOriginal) {
                        if (isMounted) setState({ url: '', loading: false, error: 'Original evidence is protected' });
                        return;
                    }
                    const redactedUrl = item?.redactedPreviewUrl;
                    if (!redactedUrl || !isAuthorizedRedactedPreviewEndpoint(redactedUrl) || isProtectedOriginalFileUrl(redactedUrl)) {
                        if (isMounted) {
                            setState({
                                url: '',
                                loading: false,
                                error: item?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable',
                            });
                        }
                        return;
                    }
                    if (isMounted) setState({ url: redactedUrl, loading: false, error: '' });
                    return;
                }

                // Original mode (server-authorized report owner or operational personnel)
                const originalSource = item?.originalUrl || item?.src;
                if (!originalSource) {
                    if (isMounted) setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
                    return;
                }

                if (!isProtectedOriginalFileUrl(originalSource)) {
                    if (isMounted) setState({ url: originalSource, loading: false, error: '' });
                    return;
                }

                if (!isOriginalAllowed) {
                    if (isMounted) setState({ url: '', loading: false, error: 'Not authorized' });
                    return;
                }

                // Synchronous cache hit
                const cached = getCachedBlobUrl(originalSource);
                if (cached) {
                    if (isMounted) setState({ url: cached, loading: false, error: '' });
                    return;
                }

                const result = await fetchProtectedBlob(originalSource, { signal: controller.signal });
                if (isMounted) {
                    setState({ url: result.url, loading: false, error: '' });
                }
            } catch (error) {
                if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
                if (isMounted) {
                    setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
                }
            }
        };

        load();
        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [item?.redactedPreviewUrl, item?.originalUrl, item?.src, item?.isForbiddenOriginal, isBlurred, isOriginalAllowed, reloadKey]);

    if (state.loading) {
        return (
            <SkeletonThumbnail
                sizeClasses={sizeClasses}
                label={`Loading evidence photo ${index + 1}`}
                className="border border-gray-200 dark:border-white/10"
            />
        );
    }

    if (state.error || item?.isForbiddenOriginal || item?.isUnavailable) {
        const errorText = state.error || (item?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable');
        const isRetryable = Boolean(state.error && !item?.isForbiddenOriginal && !item?.isUnavailable);
        return (
            <div
                className={`flex ${sizeClasses} flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-2 text-center text-[11px] leading-tight text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400`}
                role="alert"
            >
                <HiOutlinePhotograph className="mb-1 h-4 w-4 opacity-60 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2 px-1">{errorText}</span>
                {isRetryable && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setState({ url: '', loading: true, error: '' });
                            setReloadKey((k) => k + 1);
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer"
                    >
                        <HiOutlineRefresh className="h-3 w-3" />
                        <span>Retry</span>
                    </button>
                )}
            </div>
        );
    }

    if (isBlurred) {
        // Redacted thumbnail
        const badgeLabel = (item?.detectionStatus === 'detector_failed' || item?.redactionType === 'fallback_blur')
            ? 'Privacy preview'
            : (item?.detectionStatus === 'no_faces_detected' || item?.redactionType === 'none')
                ? 'Scene preview'
            : (item?.detectionStatus === 'processing' || item?.redactionType === 'privacy_preview' || item?.redactionType === 'public_soft_blur' || item?.detectionStatus === 'privacy_derivative')
                ? 'Privacy-safe preview'
                : 'Faces blurred for privacy';

        return (
            <button
                type="button"
                onClick={() => onView({
                    ...item,
                    src: state.url,
                    viewerAccess: 'redacted',
                    sourceKind: 'redacted-preview',
                }, index)}
                className={`group relative ${sizeClasses} overflow-hidden rounded-xl border border-gray-200/90 bg-gray-900 shadow-2xs transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 cursor-zoom-in`}
                title={`${badgeLabel} · Click to view larger. Original evidence is available only to the report owner and authorized municipal personnel.`}
                aria-label={`Incident evidence photo ${index + 1}, faces blurred for privacy`}
            >
                <img
                    src={state.url}
                    alt={item.alt || `Incident evidence photo ${index + 1}, faces blurred for privacy`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                />
                <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-xs text-[9px] font-semibold text-gray-200 whitespace-nowrap leading-none pointer-events-none shadow-2xs">
                    <HiOutlineEyeOff className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                    <span>Protected</span>
                </span>
                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onView({
                ...item,
                src: state.url || item.src,
                viewerAccess: 'original',
                sourceKind: 'authorized-original',
            }, index)}
            className={`group relative ${sizeClasses} overflow-hidden rounded-xl border border-gray-200/90 bg-gray-100 shadow-2xs transition-all hover:border-brand-500 hover:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#07130e] cursor-pointer`}
            aria-label={`View evidence photo ${index + 1}`}
        >
            <img
                src={state.url || item.src}
                alt={item.alt || `Incident evidence photo ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
                decoding="async"
            />
            {isOwner && (
                <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-xs text-[9px] font-semibold text-white whitespace-nowrap leading-none pointer-events-none shadow-2xs">
                    <HiOutlineShieldCheck className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                    <span>Your upload</span>
                </span>
            )}
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </button>
    );
};

const StackedEvidenceDeck = ({
    items = [],
    viewerAccess = 'redacted',
    isOwner = false,
    onView,
}) => {
    const firstItem = items[0];
    const count = items.length;
    const [state, setState] = useState({ url: '', loading: true, error: '' });
    const [reloadKey, setReloadKey] = useState(0);
    const isOriginalAllowed = viewerAccess === 'original';
    const isBlurred = viewerAccess === 'redacted';

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const load = async () => {
            try {
                if (isBlurred) {
                    if (firstItem?.isForbiddenOriginal) {
                        if (isMounted) setState({ url: '', loading: false, error: 'Original evidence is protected' });
                        return;
                    }
                    const redactedUrl = firstItem?.redactedPreviewUrl;
                    if (!redactedUrl || !isAuthorizedRedactedPreviewEndpoint(redactedUrl) || isProtectedOriginalFileUrl(redactedUrl)) {
                        if (isMounted) {
                            setState({
                                url: '',
                                loading: false,
                                error: firstItem?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable',
                            });
                        }
                        return;
                    }
                    if (isMounted) setState({ url: redactedUrl, loading: false, error: '' });
                    return;
                }

                const originalSource = firstItem?.originalUrl || firstItem?.src;
                if (!originalSource) {
                    if (isMounted) setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
                    return;
                }

                if (!isProtectedOriginalFileUrl(originalSource)) {
                    if (isMounted) setState({ url: originalSource, loading: false, error: '' });
                    return;
                }

                if (!isOriginalAllowed) {
                    if (isMounted) setState({ url: '', loading: false, error: 'Not authorized' });
                    return;
                }

                // Synchronous cache hit
                const cached = getCachedBlobUrl(originalSource);
                if (cached) {
                    if (isMounted) setState({ url: cached, loading: false, error: '' });
                    return;
                }

                const result = await fetchProtectedBlob(originalSource, { signal: controller.signal });
                if (isMounted) {
                    setState({ url: result.url, loading: false, error: '' });
                }
            } catch (error) {
                if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
                if (isMounted) {
                    setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
                }
            }
        };

        load();
        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [firstItem?.redactedPreviewUrl, firstItem?.originalUrl, firstItem?.src, firstItem?.isForbiddenOriginal, isBlurred, isOriginalAllowed, reloadKey]);

    if (state.loading) {
        return (
            <div
                className="relative w-28 h-24 sm:w-32 sm:h-26 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5"
                aria-label="Loading evidence photo 1"
            />
        );
    }

    if (state.error || firstItem?.isForbiddenOriginal || firstItem?.isUnavailable) {
        const errorText = state.error || (firstItem?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable');
        const isRetryable = Boolean(state.error && !firstItem?.isForbiddenOriginal && !firstItem?.isUnavailable);
        return (
            <div
                className="flex w-28 h-24 sm:w-32 sm:h-26 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-2 text-center text-[11px] leading-tight text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400"
                role="alert"
            >
                <HiOutlinePhotograph className="mb-1 h-4 w-4 opacity-60 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2 px-1">{errorText}</span>
                {isRetryable && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setState({ url: '', loading: true, error: '' });
                            setReloadKey((k) => k + 1);
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer"
                    >
                        <HiOutlineRefresh className="h-3 w-3" />
                        <span>Retry</span>
                    </button>
                )}
            </div>
        );
    }

    const badgeLabel = (firstItem?.detectionStatus === 'detector_failed' || firstItem?.redactionType === 'fallback_blur')
        ? 'Privacy preview'
        : (firstItem?.detectionStatus === 'no_faces_detected' || firstItem?.redactionType === 'none')
            ? 'Scene preview'
        : (firstItem?.detectionStatus === 'processing' || firstItem?.redactionType === 'privacy_preview' || firstItem?.redactionType === 'public_soft_blur' || firstItem?.detectionStatus === 'privacy_derivative')
            ? 'Privacy-safe preview'
            : 'Faces blurred for privacy';

    const buttonAriaLabel = isBlurred
        ? 'Incident evidence photo 1, faces blurred for privacy'
        : `View evidence photo 1: ${firstItem?.alt || firstItem?.filename || 'Incident scene'}`;

    return (
        <div className="relative inline-block pt-1 pb-1 pr-3">
            <button
                type="button"
                onClick={() => onView(firstItem, 0)}
                className="group relative w-28 h-24 sm:w-32 sm:h-26 cursor-pointer select-none text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl"
                title={isBlurred ? `${badgeLabel} · Click to view larger. Original evidence is available only to the report owner and authorized municipal personnel.` : 'Click to view evidence'}
                aria-label={buttonAriaLabel}
            >
                {/* Layered stack edge: a single offset outline implies depth without motion */}
                {count >= 2 && (
                    <div className="absolute inset-0 translate-x-1 rounded-xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5 pointer-events-none" aria-hidden="true" />
                )}

                {/* Layer 1: Front Primary Card */}
                <div className="relative w-full h-full rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-white/10 dark:bg-[#07130e]">
                    {/* Top-Left: Compact Privacy / Ownership Badge */}
                    {isOwner ? (
                        <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-xs text-[9px] font-semibold text-white whitespace-nowrap leading-none pointer-events-none shadow-2xs">
                            <HiOutlineShieldCheck className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                            <span>Your upload</span>
                        </span>
                    ) : isBlurred ? (
                        <span className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-xs text-[9px] font-semibold text-gray-200 whitespace-nowrap leading-none pointer-events-none shadow-2xs">
                            <HiOutlineEyeOff className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                            <span>Protected</span>
                        </span>
                    ) : null}

                    {/* Primary Thumbnail Image */}
                    <img
                        src={state.url || firstItem?.src}
                        alt={firstItem?.alt || 'Incident evidence photo 1'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />

                    {/* Bottom-Right: remaining-photo count */}
                    {count > 1 && (
                        <span className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-md bg-gray-950/80 text-[10px] font-bold tabular-nums text-white pointer-events-none">
                            <span>+{count - 1}</span>
                        </span>
                    )}
                </div>
            </button>
        </div>
    );
};

const ProtectedEvidenceGallery = ({
    images = [],
    evidence = null,
    accessLevel = null,
    isOwner = false,
    isOperational = false,
    variant = 'grid',
    compact = false,
    thumbnailSize = 'sm',
    size = null,
    onViewImage,
}) => {
    const [viewer, setViewer] = useState(null);

    // 1. Authoritative normalization from server evidence descriptor ONLY
    const normalizedDescriptor = useMemo(() => {
        const isOperationalEffective = accessLevel === 'original' || isOperational;
        return normalizeEvidenceDescriptor(evidence, {
            isOwner,
            isOperational: isOperationalEffective,
            rawImages: (isOperationalEffective || isOwner) ? images : [],
        });
    }, [evidence, accessLevel, isOwner, isOperational, images]);

    const isOriginalAuthorized = normalizedDescriptor.viewerAccess === 'original';
    const viewerAccess = isOriginalAuthorized ? 'original' : 'redacted';
    const rawList = normalizedDescriptor.items;
    const isStacked = variant === 'stacked';
    const isCompact = compact || variant === 'compact';
    const effectiveThumbnailSize = size || thumbnailSize || (variant === 'compact' ? 'sm' : 'sm');

    if (!rawList.length) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200/90 bg-gray-50/60 p-3 text-xs text-gray-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                <HiOutlinePhotograph className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                <span>No evidence attached.</span>
            </div>
        );
    }

    const viewImage = (item, index) => {
        if (!item) return;
        const payload = {
            ...item,
            index,
            items: rawList,
            total: rawList.length,
        };
        if (onViewImage) {
            onViewImage(payload, index, rawList);
        } else {
            setViewer(payload);
        }
    };

    if (isStacked) {
        return (
            <div className="space-y-2">
                <StackedEvidenceDeck
                    items={rawList}
                    viewerAccess={viewerAccess}
                    isOwner={isOriginalAuthorized && isOwner}
                    onView={viewImage}
                />

                {!isOriginalAuthorized && (
                    <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        <span>Original evidence is available only to the report owner and authorized municipal personnel.</span>
                    </p>
                )}

                {!onViewImage && (
                    <ImageViewer
                        isOpen={Boolean(viewer)}
                        item={viewer}
                        onClose={() => setViewer(null)}
                        entityLabel="Evidence photo"
                    />
                )}
            </div>
        );
    }

    const containerClasses = isCompact
        ? 'flex flex-wrap items-center gap-2.5 pt-1'
        : 'grid grid-cols-2 gap-2 sm:grid-cols-3';

    return (
        <div className="space-y-2">
            <div className={containerClasses}>
                {rawList.map((item, index) => (
                    <EvidenceThumbnail
                        key={item.id || `${item.src}-${index}`}
                        item={item}
                        index={index}
                        viewerAccess={viewerAccess}
                        isOwner={isOriginalAuthorized && isOwner}
                        compact={isCompact}
                        thumbnailSize={effectiveThumbnailSize}
                        onView={viewImage}
                    />
                ))}
            </div>

            {!isOriginalAuthorized && (
                <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>Original evidence is available only to the report owner and authorized municipal personnel.</span>
                </p>
            )}

            {!onViewImage && (
                <ImageViewer
                    isOpen={Boolean(viewer)}
                    item={viewer}
                    onClose={() => setViewer(null)}
                    entityLabel="Evidence photo"
                />
            )}
        </div>
    );
};

export default ProtectedEvidenceGallery;
