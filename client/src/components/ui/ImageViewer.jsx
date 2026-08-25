import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
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
import { filesAPI } from '../../services/api';

/**
 * High-performance, minimal viewport-portaled evidence inspection viewer with multi-evidence navigation.
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
    const [hasLoadError, setHasLoadError] = useState(false);
    const [blobUrl, setBlobUrl] = useState('');
    const [isLoadingBlob, setIsLoadingBlob] = useState(false);

    const activeRequestIdRef = useRef(0);
    const closeButtonRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    // Sync activeIndex whenever modal opens or items list changes
    useEffect(() => {
        if (isOpen) {
            const targetIdx = typeof item?.index === 'number'
                ? item.index
                : (typeof initialIndex === 'number' ? initialIndex : 0);
            const clamped = Math.max(0, Math.min(targetIdx, Math.max(0, itemsList.length - 1)));
            setActiveIndex(clamped);
        }
    }, [isOpen, item, items, initialIndex, itemsList.length]);

    // Active item resolution
    const currentItem = (itemsList.length > 0 && itemsList[activeIndex])
        ? itemsList[activeIndex]
        : (item || null);

    const canGoPrev = hasMultiple && activeIndex > 0;
    const canGoNext = hasMultiple && activeIndex < totalItems - 1;

    // Reset zoom and error states on item change
    useEffect(() => {
        setIsZoomed(false);
        setHasLoadError(false);
    }, [activeIndex, currentItem?.id, currentItem?.src, currentItem?.originalUrl, currentItem?.redactedPreviewUrl]);

    // Fetch protected original binaries when navigating in original mode
    useEffect(() => {
        if (!isOpen || !currentItem) {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        const effectiveAccess = currentItem?.viewerAccess
            ? currentItem.viewerAccess
            : (viewerAccess === 'original' ? 'original' : 'redacted');

        if (effectiveAccess === 'redacted') {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        const rawSrc = currentItem?.src || currentItem?.originalUrl || imageSrc || '';
        // If already a blob URL or not a protected URL, use directly
        if (!rawSrc || rawSrc.startsWith('blob:') || !isProtectedOriginalFileUrl(rawSrc)) {
            setBlobUrl('');
            setIsLoadingBlob(false);
            return undefined;
        }

        const currentRequestId = ++activeRequestIdRef.current;
        const controller = new AbortController();
        let createdUrl = '';

        setIsLoadingBlob(true);
        setHasLoadError(false);

        const fetchProtected = async () => {
            try {
                const response = await filesAPI.getProtected(rawSrc, { signal: controller.signal });
                
                // Discard stale responses if user already navigated to another item
                if (currentRequestId !== activeRequestIdRef.current) {
                    return;
                }

                createdUrl = URL.createObjectURL(response.data);
                setBlobUrl(createdUrl);
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
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [isOpen, currentItem, activeIndex, viewerAccess, imageSrc]);

    // Navigation callbacks
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

    // Reset zoom, error state, and manage focus restoration on open/close
    useEffect(() => {
        if (!isOpen) {
            setIsZoomed(false);
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

    // Handle keyboard shortcuts (Escape, ArrowLeft, ArrowRight, + / -, 0/r)
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
        } else if (event.key === '0' || event.key === 'r' || event.key === 'R') {
            setIsZoomed(false);
        }
    }, [onClose, handlePrev, handleNext]);

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
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    // 1. Authoritative access determination strictly from server item descriptor
    const effectiveViewerAccess = currentItem?.viewerAccess
        ? currentItem.viewerAccess
        : (viewerAccess === 'original' ? 'original' : 'redacted');
    const isRedacted = effectiveViewerAccess === 'redacted';

    // 2. Resolve normalized model fields
    const sourceKind = currentItem?.sourceKind || (isRedacted ? 'redacted-preview' : 'authorized-original');
    const rawCandidateSrc = isRedacted
        ? (currentItem ? (currentItem.redactedPreviewUrl || '') : imageSrc || '')
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

    const headerTitle = hasMultiple
        ? `Evidence photo ${displayIndexNumber} of ${totalItems}`
        : `Evidence photo ${displayIndexNumber}`;

    const renderFooterBadge = () => {
        if (isRedacted) {
            if (redactionType === 'public_soft_blur' || detectionStatus === 'privacy_derivative') {
                return (
                    <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Original evidence restricted</span>
                    </div>
                );
            }
            if (detectionStatus === 'no_faces_detected' || redactionType === 'none') {
                return (
                    <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                        <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                        <span>Clean scene preview · Scene details preserved</span>
                    </div>
                );
            }

            if (detectionStatus === 'invalid_image') {
                return (
                    <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Evidence unavailable for privacy</span>
                    </div>
                );
            }

            if (isPrivacyFallback) {
                return (
                    <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Detail visibility limited</span>
                    </div>
                );
            }

            if (detectionStatus === 'processing' || redactionType === 'privacy_preview') {
                return (
                    <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Verification in progress</span>
                    </div>
                );
            }

            // Default faces_detected / face_blur
            return (
                <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                    <HiOutlineEyeOff className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Faces redacted for privacy · Scene details preserved</span>
                </div>
            );
        }

        // Original view
        if (currentItem?.isOwner) {
            return (
                <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                    <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Original evidence · Report owner</span>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-1.5 rounded-md border border-[#334047] bg-[#1C242B] px-3 py-1 text-xs text-[#F5F7F6]">
                <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Original evidence · Operational access</span>
            </div>
        );
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4 md:p-6 select-none animate-fade-in"
            onClick={(e) => {
                e.stopPropagation();
                onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged evidence image viewer"
        >
            {/* Dedicated Operational Inspection Surface with Stable, Predictable Layout */}
            <div
                className="relative flex flex-col justify-between w-full h-full sm:h-[82vh] sm:max-h-[820px] sm:min-h-[480px] md:min-h-[520px] sm:w-[92vw] md:w-[85vw] sm:max-w-4xl rounded-none sm:rounded-xl border-0 sm:border border-[#334047] bg-[#151A1F] shadow-xl overflow-hidden pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:py-0"
                onClick={(e) => e.stopPropagation()}
                data-testid="evidence-viewer-surface"
            >
                {/* 1. Restrained Header Bar with Title and Toolbar Controls */}
                <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3 border-b border-[#334047] bg-[#151A1F] z-10">
                    <div className="min-w-0 flex-1">
                        <h3
                            id="evidence-viewer-title"
                            className="text-xs sm:text-sm font-semibold text-[#F5F7F6] tracking-wide break-words line-clamp-2"
                            title={headerTitle}
                        >
                            {headerTitle}
                        </h3>
                    </div>

                    {/* Grouped Toolbar Controls (Navigation + Zoom + Close) */}
                    <div className="flex items-center justify-end gap-1 sm:gap-1.5 rounded-lg border border-[#334047] bg-[#1C242B] p-1 text-[#F5F7F6] shrink-0">
                        {/* Multi-Evidence Previous Button */}
                        {hasMultiple && (
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={!canGoPrev}
                                aria-label="Previous evidence photo"
                                title="Previous evidence photo (Left Arrow)"
                                className="flex h-8 w-8 items-center justify-center rounded-md text-[#AAB5B8] hover:bg-[#334047]/60 hover:text-[#F5F7F6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <HiOutlineChevronLeft className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}

                        {/* Multi-Evidence Next Button */}
                        {hasMultiple && (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={!canGoNext}
                                aria-label="Next evidence photo"
                                title="Next evidence photo (Right Arrow)"
                                className="flex h-8 w-8 items-center justify-center rounded-md text-[#AAB5B8] hover:bg-[#334047]/60 hover:text-[#F5F7F6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <HiOutlineChevronRight className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}

                        {hasMultiple && (
                            <div className="h-4 w-px bg-[#334047] mx-0.5" aria-hidden="true" />
                        )}

                        {/* Reset Zoom */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <button
                                type="button"
                                onClick={() => setIsZoomed(false)}
                                disabled={!isZoomed}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-[#AAB5B8] hover:bg-[#334047]/60 hover:text-[#F5F7F6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Reset image zoom (0)"
                                aria-label="Reset image zoom"
                            >
                                <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}

                        {/* Zoom In / Zoom Out Toggle */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <button
                                type="button"
                                onClick={() => setIsZoomed(!isZoomed)}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-[#AAB5B8] hover:bg-[#334047]/60 hover:text-[#F5F7F6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer"
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

                        {/* Divider */}
                        {!isSecurityViolation && !hasLoadError && !isLoadingBlob && (
                            <div className="h-4 w-px bg-[#334047] mx-0.5" aria-hidden="true" />
                        )}

                        {/* Close Button */}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-[#AAB5B8] hover:bg-red-500/20 hover:text-red-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-95 cursor-pointer"
                            title="Close image viewer (Escape)"
                            aria-label="Close image viewer"
                        >
                            <HiOutlineX className="h-4.5 w-4.5" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* 2. Reserved Stable Image Canvas with Flanking Navigation */}
                <div
                    className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden bg-[#1C242B] p-2 sm:p-4"
                    data-testid="evidence-viewer-canvas"
                    onClick={() => {
                        if (!isSecurityViolation && !hasLoadError && !isLoadingBlob) {
                            setIsZoomed(!isZoomed);
                        }
                    }}
                >
                    {/* Flanking Previous Button on Desktop / Large Screen */}
                    {hasMultiple && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePrev();
                            }}
                            disabled={!canGoPrev}
                            aria-label="Previous evidence photo"
                            title="Previous evidence photo (Left Arrow)"
                            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-[#151A1F]/90 border border-[#334047] text-[#F5F7F6] shadow-md transition-all hover:bg-[#1C242B] hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-0 sm:disabled:opacity-25 disabled:pointer-events-none sm:disabled:pointer-events-auto sm:disabled:cursor-not-allowed cursor-pointer"
                        >
                            <HiOutlineChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                    )}

                    {/* Flanking Next Button on Desktop / Large Screen */}
                    {hasMultiple && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleNext();
                            }}
                            disabled={!canGoNext}
                            aria-label="Next evidence photo"
                            title="Next evidence photo (Right Arrow)"
                            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-[#151A1F]/90 border border-[#334047] text-[#F5F7F6] shadow-md transition-all hover:bg-[#1C242B] hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-0 sm:disabled:opacity-25 disabled:pointer-events-none sm:disabled:pointer-events-auto sm:disabled:cursor-not-allowed cursor-pointer"
                        >
                            <HiOutlineChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                    )}

                    {isLoadingBlob ? (
                        <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-col items-center justify-center p-6 text-center text-[#AAB5B8]"
                            data-testid="evidence-loading-indicator"
                        >
                            <div className="relative mb-3 flex items-center justify-center">
                                <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-2 border-[#334047] border-t-emerald-400 animate-spin" aria-hidden="true" />
                                <HiOutlinePhotograph className="absolute h-4 w-4 sm:h-5 sm:w-5 text-[#AAB5B8] opacity-70" aria-hidden="true" />
                            </div>
                            <p className="text-xs sm:text-sm font-medium text-[#F5F7F6]">Loading protected evidence&hellip;</p>
                            <p className="mt-1 text-[11px] text-[#AAB5B8]">Verifying and retrieving authorized asset</p>
                        </div>
                    ) : isSecurityViolation ? (
                        <div
                            role="alert"
                            className="flex flex-col items-center justify-center rounded-lg bg-[#151A1F] border border-[#334047] p-6 sm:p-8 text-center max-w-sm"
                            data-testid="evidence-security-alert"
                        >
                            <div className="rounded-full bg-amber-500/10 p-3 text-amber-400 mb-3">
                                <HiOutlineLockClosed className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-[#F5F7F6] mb-1">{violationMessage}</h4>
                            <p className="text-[11px] sm:text-xs text-[#AAB5B8]">
                                {isRedacted
                                    ? 'This evidence item is restricted for privacy or currently unavailable.'
                                    : 'Unable to load original photo. Please verify your network and permissions.'}
                            </p>
                        </div>
                    ) : hasLoadError ? (
                        <div
                            role="alert"
                            className="flex flex-col items-center justify-center rounded-lg bg-[#151A1F] border border-[#334047] p-6 sm:p-8 text-center max-w-sm"
                            data-testid="evidence-load-error-alert"
                        >
                            <div className="rounded-full bg-red-500/10 p-3 text-red-400 mb-3">
                                <HiOutlineLockClosed className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-[#F5F7F6] mb-1">Unable to load image</h4>
                            <p className="text-[11px] sm:text-xs text-[#AAB5B8]">The image could not be loaded or is temporarily unavailable.</p>
                        </div>
                    ) : (
                        <img
                            src={effectiveSrc}
                            alt={displayAlt}
                            onError={() => setHasLoadError(true)}
                            className={`max-h-full max-w-full rounded-sm object-contain select-none transition-transform duration-200 ${
                                isZoomed ? 'scale-125 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                            }`}
                        />
                    )}
                </div>

                {/* 3. Small Opaque Footer Status Area */}
                <div className="shrink-0 px-4 py-2 sm:px-5 sm:py-2.5 border-t border-[#334047] bg-[#151A1F] text-center pointer-events-none">
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
