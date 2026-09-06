import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineArrowsExpand,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineEyeOff,
    HiOutlineLockClosed,
    HiOutlineMinus,
    HiOutlinePhotograph,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
    HiOutlineX,
} from 'react-icons/hi';
import { resolveAssetUrl } from '../../utils/assets';
import {
    isAuthorizedRedactedPreviewEndpoint,
    isProtectedOriginalFileUrl,
} from '../../utils/evidenceModel';
import {
    fetchProtectedBlob,
    getCachedBlobUrl,
    preloadProtectedBlob,
} from '../../utils/blobCache';

/**
 * Modernized, distraction-free viewport-portaled evidence inspection viewer with multi-evidence navigation.
 * 
 * Security Boundary:
 * - When viewing in redacted mode (effectiveViewerAccess === 'redacted'), the viewer accepts
 *   ONLY normalized items with sourceKind: 'redacted-preview'.
 * - If a protected GridFS URL or raw image URL is provided in redacted mode, it displays
 *   a privacy safety banner instead of rendering the original bytes.
 * - No download button is exposed in this map evidence viewer to protect public-safety privacy.
 * - Portaled directly to document.body to ensure true viewport-level stacking over drawers and map overlays.
 */
const ImageViewer = ({
    isOpen = false,
    item = null,
    items = null,
    initialIndex = 0,
    imageSrc = '',
    onClose = () => {},
    alt = '',
    viewerAccess = null,
    entityLabel = 'Evidence photo',
}) => {
    const itemsList = useMemo(() => {
        if (Array.isArray(items) && items.length > 0) return items;
        if (Array.isArray(item?.items) && item.items.length > 0) return item.items;
        if (item && typeof item === 'object') return [item];
        return [];
    }, [items, item]);

    const itemsCount = itemsList.length;
    const declaredTotal = Number(item?.total ?? item?.totalCount ?? item?.count);
    const totalItems = Number.isFinite(declaredTotal) && declaredTotal > itemsCount ? declaredTotal : itemsCount;
    const hasMultiple = totalItems > 1;

    const resolvedInitialIndex = typeof item?.index === 'number'
        ? item.index
        : (typeof initialIndex === 'number' ? initialIndex : 0);

    const [activeIndex, setActiveIndex] = useState(resolvedInitialIndex);
    const [isZoomed, setIsZoomed] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [hasLoadError, setHasLoadError] = useState(false);
    const [blobUrl, setBlobUrl] = useState('');
    const [isLoadingBlob, setIsLoadingBlob] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const activeRequestIdRef = useRef(0);
    const closeButtonRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    // Sync activeIndex strictly whenever modal opens or initial target changes
    useEffect(() => {
        if (isOpen) {
            const targetIdx = typeof item?.index === 'number'
                ? item.index
                : (typeof initialIndex === 'number' ? initialIndex : 0);
            const clamped = Math.max(0, Math.min(targetIdx, Math.max(0, itemsList.length - 1)));
            setActiveIndex(clamped);
        }
    }, [isOpen, item?.index, initialIndex, itemsList.length]);

    // Active item resolution
    const currentItem = (itemsList.length > 0 && itemsList[activeIndex])
        ? itemsList[activeIndex]
        : (item || null);

    const canGoPrev = hasMultiple && activeIndex > 0;
    const canGoNext = hasMultiple && activeIndex < totalItems - 1;

    // Reset zoom, rotation, and error states on active item change
    useEffect(() => {
        setIsZoomed(false);
        setRotation(0);
        setHasLoadError(false);
    }, [activeIndex, currentItem?.id, currentItem?.src, currentItem?.originalUrl, currentItem?.redactedPreviewUrl]);

    // Eager background preloading of adjacent images to eliminate navigation latency
    useEffect(() => {
        if (!isOpen || itemsList.length <= 1) return;

        const preloadIndices = [];
        if (activeIndex > 0) preloadIndices.push(activeIndex - 1);
        if (activeIndex < itemsList.length - 1) preloadIndices.push(activeIndex + 1);

        preloadIndices.forEach((idx) => {
            const adjacentItem = itemsList[idx];
            if (!adjacentItem) return;

            const adjacentAccess = adjacentItem.viewerAccess === 'original' ? 'original' : 'redacted';

            if (adjacentAccess === 'redacted') {
                const targetUrl = adjacentItem.redactedPreviewUrl || (isAuthorizedRedactedPreviewEndpoint(adjacentItem.src) ? adjacentItem.src : '');
                if (targetUrl && typeof window !== 'undefined' && typeof Image !== 'undefined') {
                    try {
                        const preloadImg = new Image();
                        preloadImg.src = resolveAssetUrl(targetUrl);
                    } catch {
                        // Ignore background preload failures gracefully
                    }
                }
            } else {
                const raw = adjacentItem.src || adjacentItem.originalUrl || '';
                if (raw) {
                    if (isProtectedOriginalFileUrl(raw) || raw.startsWith('/api/files')) {
                        preloadProtectedBlob(raw);
                    } else if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
                        try {
                            const preloadImg = new Image();
                            preloadImg.src = resolveAssetUrl(raw);
                        } catch {
                            // Ignore background preload failures gracefully
                        }
                    }
                }
            }
        });
    }, [isOpen, activeIndex, itemsList]);

    // Fetch protected original binaries when navigating in original mode
    useEffect(() => {
        if (!isOpen || !currentItem) {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        const effectiveAccess = currentItem?.viewerAccess === 'original'
            ? 'original'
            : (viewerAccess === 'original' && (!currentItem || currentItem.viewerAccess === 'original') ? 'original' : 'redacted');

        if (effectiveAccess === 'redacted') {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        const rawSrc = currentItem?.src || currentItem?.originalUrl || imageSrc || '';
        // If already a blob URL or not a protected URL, use directly
        if (!rawSrc || typeof rawSrc !== 'string' || rawSrc.startsWith('blob:') || !isProtectedOriginalFileUrl(rawSrc)) {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        // Instant synchronous cache hit (0ms load without loading spinner)
        const cachedUrl = getCachedBlobUrl(rawSrc);
        if (cachedUrl) {
            setBlobUrl(cachedUrl);
            setIsLoadingBlob(false);
            setHasLoadError(false);
            return undefined;
        }

        const currentRequestId = ++activeRequestIdRef.current;
        const controller = new AbortController();

        setIsLoadingBlob(true);
        setHasLoadError(false);

        const fetchProtected = async () => {
            try {
                const result = await fetchProtectedBlob(rawSrc, { signal: controller.signal });
                
                // Discard stale responses if user already navigated to another item
                if (currentRequestId !== activeRequestIdRef.current) {
                    return;
                }

                setBlobUrl(result.url);
            } catch (err) {
                if (currentRequestId !== activeRequestIdRef.current) return;
                if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
                setHasLoadError(true);
            } finally {
                if (currentRequestId === activeRequestIdRef.current) {
                    setIsLoadingBlob(false);
                }
            }
        };

        fetchProtected();

        return () => {
            controller.abort();
        };
    }, [isOpen, currentItem, activeIndex, viewerAccess, imageSrc, reloadKey]);

    // Navigation and rotation callbacks
    const handlePrev = useCallback(() => {
        if (canGoPrev) {
            setActiveIndex((prev) => Math.max(0, prev - 1));
        }
    }, [canGoPrev]);

    const handleNext = useCallback(() => {
        if (canGoNext) {
            setActiveIndex((prev) => Math.min(totalItems - 1, prev + 1));
        }
    }, [canGoNext, totalItems]);

    const handleRotate = useCallback(() => {
        setRotation((prev) => (prev + 90) % 360);
    }, []);

    // Reset zoom, error state, and manage focus restoration on open/close
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        if (!isOpen) {
            setIsZoomed(false);
            setRotation(0);
            setHasLoadError(false);
            if (previousActiveElementRef.current?.focus) {
                previousActiveElementRef.current.focus();
            }
        } else {
            previousActiveElementRef.current = document.activeElement;
            const timer = setTimeout(() => {
                closeButtonRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Handle keyboard shortcuts (Escape, ArrowLeft, ArrowRight, + / -, r / 0)
    const handleKeyDown = useCallback((event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            onClose();
        } else if (event.key === 'ArrowLeft') {
            event.stopPropagation();
            handlePrev();
        } else if (event.key === 'ArrowRight') {
            event.stopPropagation();
            handleNext();
        } else if (event.key === '+' || event.key === '=') {
            setIsZoomed(true);
        } else if (event.key === '-') {
            setIsZoomed(false);
        } else if (event.key === 'r' || event.key === 'R') {
            handleRotate();
        } else if (event.key === '0') {
            setIsZoomed(false);
            setRotation(0);
        }
    }, [onClose, handlePrev, handleNext, handleRotate]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleKeyDown]);

    // Development-only diagnostic console trace for evidence verification
    useEffect(() => {
        if (isOpen && import.meta.env.DEV && currentItem) {
            const access = currentItem?.viewerAccess || (viewerAccess === 'original' ? 'original' : 'redacted');
            console.debug('🔍 [ImageViewer Diagnostic]', {
                reportId: currentItem?.reportId || currentItem?.id,
                evidenceIndex: activeIndex,
                totalItems,
                sourceKind: currentItem?.sourceKind || (access === 'redacted' ? 'redacted-preview' : 'authorized-original'),
                previewEndpoint: currentItem?.redactedPreviewUrl || (access === 'redacted' ? (currentItem?.src || imageSrc) : undefined),
                detectionStatus: currentItem?.detectionStatus,
                redactionType: currentItem?.redactionType,
                viewerAccess: access,
            });
        }
    }, [isOpen, currentItem, activeIndex, totalItems, viewerAccess, imageSrc]);

    // Body scroll lock while modal is active
    useEffect(() => {
        if (!isOpen) return undefined;
        if (typeof document === 'undefined') return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    // 1. Authoritative access determination strictly from server item descriptor (fail-closed)
    const effectiveViewerAccess = currentItem?.viewerAccess === 'original'
        ? 'original'
        : (viewerAccess === 'original' && (!currentItem || currentItem.viewerAccess === 'original') ? 'original' : 'redacted');
    const isRedacted = effectiveViewerAccess === 'redacted';

    // 2. Resolve normalized model fields
    const sourceKind = currentItem?.sourceKind || (isRedacted ? 'redacted-preview' : 'authorized-original');
    const rawCandidateSrc = isRedacted
        ? (currentItem?.redactedPreviewUrl || '')
        : (currentItem?.src || currentItem?.originalUrl || imageSrc || '');
    const displayIndexNumber = activeIndex + 1;

    // 3. Strict provenance and security validation
    let isSecurityViolation = false;
    let violationMessage = '';

    if (isRedacted) {
        // Redacted mode security rules:
        // Must be sourceKind 'redacted-preview'
        // Must not be a protected GridFS URL or upload URL
        // Must not be a blob URL unless explicitly authorized as a redacted preview
        const containsGridFs = isProtectedOriginalFileUrl(rawCandidateSrc)
            || isProtectedOriginalFileUrl(currentItem?.originalUrl)
            || isProtectedOriginalFileUrl(currentItem?.redactedPreviewUrl)
            || isProtectedOriginalFileUrl(currentItem?.url)
            || isProtectedOriginalFileUrl(imageSrc);

        const isUnauthorizedBlob = typeof rawCandidateSrc === 'string'
            && rawCandidateSrc.startsWith('blob:')
            && sourceKind !== 'redacted-preview';

        const isWrongSourceKind = sourceKind !== 'redacted-preview';
        const isNonCanonicalPreview = !isAuthorizedRedactedPreviewEndpoint(rawCandidateSrc);

        if (containsGridFs || isUnauthorizedBlob || isWrongSourceKind || isNonCanonicalPreview || currentItem?.isForbiddenOriginal) {
            isSecurityViolation = true;
            violationMessage = 'Original evidence is protected.';
        } else if (!rawCandidateSrc) {
            isSecurityViolation = true;
            violationMessage = 'Evidence preview unavailable.';
        }
    } else {
        // Original mode security rules:
        if (!rawCandidateSrc && !blobUrl) {
            isSecurityViolation = true;
            violationMessage = 'Original photo unavailable.';
        }
    }

    const effectiveSrc = isSecurityViolation
        ? ''
        : (blobUrl || resolveAssetUrl(rawCandidateSrc));

    const displayAlt = currentItem?.alt
        || alt
        || (isRedacted
            ? `Incident evidence photo ${displayIndexNumber}, faces blurred for privacy`
            : `Incident evidence photo ${displayIndexNumber}`);

    // 4. Dynamic privacy footer label derived from server detectionStatus & redactionType
    const detectionStatus = currentItem?.detectionStatus;
    const redactionType = currentItem?.redactionType;
    const isPrivacyFallback = detectionStatus === 'detector_failed'
        || detectionStatus === 'derivative_failed'
        || detectionStatus === 'full_image_fallback'
        || redactionType === 'fallback_blur'
        || redactionType === 'svg_fallback';

    const resolvedEntityLabel = currentItem?.entityLabel || entityLabel || 'Evidence photo';

    const headerTitle = hasMultiple
        ? `${resolvedEntityLabel} ${displayIndexNumber} of ${totalItems}`
        : (currentItem?.title || `${resolvedEntityLabel} preview`);

    const renderFooterBadge = () => {
        // If there's an error, security violation, or no effective source, do not render a misleading "faces redacted" or "scene preview" message!
        if (isSecurityViolation || hasLoadError || currentItem?.isUnavailable || !effectiveSrc) {
            if (isRedacted) {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Evidence unavailable for privacy</span>
                    </div>
                );
            }
            return (
                <div className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                    <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>Evidence unavailable</span>
                </div>
            );
        }

        if (isRedacted) {
            if (redactionType === 'public_soft_blur' || detectionStatus === 'privacy_derivative') {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Original evidence restricted</span>
                    </div>
                );
            }
            if (detectionStatus === 'no_faces_detected' || redactionType === 'none') {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                        <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                        <span>Clean scene preview · Scene details preserved</span>
                    </div>
                );
            }

            if (detectionStatus === 'invalid_image') {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Evidence unavailable for privacy</span>
                    </div>
                );
            }

            if (isPrivacyFallback) {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Detail visibility limited</span>
                    </div>
                );
            }

            if (detectionStatus === 'processing' || redactionType === 'privacy_preview') {
                return (
                    <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Verification in progress</span>
                    </div>
                );
            }

            // Default faces_detected / face_blur
            return (
                <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                    <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Faces redacted for privacy · Scene details preserved</span>
                </div>
            );
        }

        // Original view
        if (currentItem?.isOwner) {
            return (
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90 font-medium">
                    <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Owner access · Original evidence</span>
                </div>
            );
        }

        return (
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Original evidence · Operational access</span>
            </div>
        );
    };

    if (typeof document === 'undefined' || !document.body) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 sm:bg-gray-950/95 p-0 sm:p-4 md:p-6 select-none"
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged evidence image viewer"
        >
            {/* Dedicated Operational Inspection Surface with Distraction-Free Dark Presentation */}
            <div
                className="relative flex flex-col justify-between w-full h-full sm:h-[82vh] sm:max-h-[760px] sm:min-h-[460px] md:min-h-[480px] sm:w-[88vw] md:w-[72vw] lg:w-[56vw] sm:max-w-2xl rounded-none sm:rounded-2xl bg-[#12161A] overflow-hidden pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:py-0"
                onClick={(e) => e.stopPropagation()}
                data-testid="evidence-viewer-surface"
            >
                {/* 1. Streamlined Header Bar with Minimalist Counter & Utility Controls */}
                <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-white/5 bg-[#12161A]/80 z-10">
                    <div className="min-w-0 flex-1">
                        <h3
                            id="evidence-viewer-title"
                            className="text-xs sm:text-sm font-semibold text-gray-300 tracking-wide break-words line-clamp-2"
                            title={headerTitle}
                        >
                            {headerTitle}
                        </h3>
                    </div>

                    {/* Grouped Utility Toolbar (Rotate + Zoom + Reset + Close) */}
                    <div className="flex items-center justify-end gap-1 text-gray-300 shrink-0">
                        {/* Rotate Image */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <button
                                type="button"
                                onClick={handleRotate}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer"
                                title="Rotate image 90° (R)"
                                aria-label="Rotate image"
                            >
                                <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}

                        {/* Reset Zoom & Rotation */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <button
                                type="button"
                                onClick={() => { setIsZoomed(false); setRotation(0); }}
                                disabled={!isZoomed && rotation === 0}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                                title="Reset view to fit (0)"
                                aria-label="Reset image zoom"
                            >
                                <HiOutlineArrowsExpand className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}

                        {/* Zoom In / Zoom Out Toggle */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <button
                                type="button"
                                onClick={() => setIsZoomed(!isZoomed)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer"
                                title={isZoomed ? 'Zoom out image (-)' : 'Zoom in image (+)'}
                                aria-label={isZoomed ? 'Zoom out image' : 'Zoom in image'}
                            >
                                {isZoomed ? (
                                    <HiOutlineMinus className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        )}

                        {/* Close Button */}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer ml-1"
                            title="Close image viewer (Escape)"
                            aria-label="Close image viewer"
                        >
                            <HiOutlineX className="h-4.5 w-4.5" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* 2. Floating Image Stage with Elegant Side Navigation Chevrons */}
                <div
                    className="relative flex-1 min-h-0 min-h-[300px] sm:min-h-[400px] w-full flex items-center justify-center overflow-hidden bg-transparent p-2 sm:p-4"
                    data-testid="evidence-viewer-canvas"
                    onClick={() => {
                        if (!isSecurityViolation && !hasLoadError && !isLoadingBlob) {
                            setIsZoomed(!isZoomed);
                        }
                    }}
                >
                    {/* Floating Side Previous Button */}
                    {hasMultiple && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePrev();
                            }}
                            disabled={!canGoPrev}
                            aria-label={`Previous ${resolvedEntityLabel.toLowerCase()}`}
                            title={`Previous ${resolvedEntityLabel.toLowerCase()} (Left Arrow)`}
                            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full text-white/80 drop-shadow-md hover:bg-black/50 hover:backdrop-blur-xs hover:text-white transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-0 sm:disabled:opacity-20 disabled:pointer-events-none sm:disabled:pointer-events-auto sm:disabled:cursor-not-allowed cursor-pointer"
                        >
                            <HiOutlineChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                        </button>
                    )}

                    {/* Floating Side Next Button */}
                    {hasMultiple && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNext();
                            }}
                            disabled={!canGoNext}
                            aria-label={`Next ${resolvedEntityLabel.toLowerCase()}`}
                            title={`Next ${resolvedEntityLabel.toLowerCase()} (Right Arrow)`}
                            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full text-white/80 drop-shadow-md hover:bg-black/50 hover:backdrop-blur-xs hover:text-white transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-0 sm:disabled:opacity-20 disabled:pointer-events-none sm:disabled:pointer-events-auto sm:disabled:cursor-not-allowed cursor-pointer"
                        >
                            <HiOutlineChevronRight className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                        </button>
                    )}

                    {isLoadingBlob ? (
                        <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-col items-center justify-center p-6 text-center text-gray-400"
                            data-testid="evidence-loading-indicator"
                        >
                            <div className="relative mb-3 flex items-center justify-center">
                                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" aria-hidden="true" />
                                <HiOutlinePhotograph className="absolute h-4 w-4 sm:h-5 sm:w-5 text-gray-400 opacity-70" aria-hidden="true" />
                            </div>
                            <p className="text-xs sm:text-sm font-medium text-gray-200">Loading protected evidence&hellip;</p>
                            <p className="mt-1 text-[11px] text-gray-400">Verifying and retrieving authorized asset</p>
                        </div>
                    ) : isSecurityViolation ? (
                        <div
                            role="alert"
                            className="flex flex-col items-center justify-center rounded-xl bg-[#151A1F] p-6 sm:p-8 text-center max-w-sm shadow-lg border border-white/5"
                            data-testid="evidence-security-alert"
                        >
                            <div className="rounded-full bg-amber-500/10 p-3 text-amber-400 mb-3">
                                <HiOutlineLockClosed className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-gray-200 mb-1">{violationMessage}</h4>
                            <p className="text-[11px] sm:text-xs text-gray-400">
                                {isRedacted
                                    ? 'This evidence item is restricted for privacy or currently unavailable.'
                                    : 'Unable to load original photo. Please verify your network and permissions.'}
                            </p>
                        </div>
                    ) : hasLoadError ? (
                        <div
                            role="alert"
                            className="flex flex-col items-center justify-center rounded-xl bg-[#151A1F] p-6 sm:p-8 text-center max-w-sm shadow-lg border border-white/5"
                            data-testid="evidence-load-error-alert"
                        >
                            <div className="rounded-full bg-red-500/10 p-3 text-red-400 mb-3">
                                <HiOutlineLockClosed className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-gray-200 mb-1">Unable to load image</h4>
                            <p className="text-[11px] sm:text-xs text-gray-400 mb-3">The image could not be loaded or is temporarily unavailable.</p>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setHasLoadError(false);
                                    setReloadKey((k) => k + 1);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                            >
                                <HiOutlineRefresh className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Retry</span>
                            </button>
                        </div>
                    ) : (
                        <img
                            key={`${effectiveSrc}-${activeIndex}`}
                            src={effectiveSrc}
                            alt={displayAlt}
                            loading="eager"
                            decoding="async"
                            onError={() => setHasLoadError(true)}
                            style={rotation !== 0 ? { transform: `rotate(${rotation}deg)` } : undefined}
                            className={`max-h-full max-w-full rounded-sm object-contain select-none transition-transform duration-200 ${
                                isZoomed ? 'scale-125 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                            }`}
                        />
                    )}
                </div>

                {/* 3. Streamlined Clean Inline Footer Status Area */}
                <div className="shrink-0 px-4 py-2.5 sm:px-5 sm:py-3 border-t border-white/5 bg-[#12161A]/80 text-center pointer-events-none">
                    <div className="pointer-events-auto inline-flex items-center justify-center">
                        {renderFooterBadge()}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ImageViewer;
