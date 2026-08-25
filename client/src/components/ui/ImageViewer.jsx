import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineEyeOff,
    HiOutlineLockClosed,
    HiOutlineMinus,
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

/**
 * High-performance, minimal viewport-portaled evidence inspection viewer.
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
    imageSrc = '',
    onClose = () => {},
    alt = '',
    viewerAccess = null,
}) => {
    const [isZoomed, setIsZoomed] = useState(false);
    const [hasLoadError, setHasLoadError] = useState(false);
    const closeButtonRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    // 1. Authoritative access determination strictly from server item descriptor
    const effectiveViewerAccess = item?.viewerAccess
        ? item.viewerAccess
        : (viewerAccess === 'original' ? 'original' : 'redacted');
    const isRedacted = effectiveViewerAccess === 'redacted';

    // 2. Resolve normalized model fields
    const sourceKind = item?.sourceKind || (isRedacted ? 'redacted-preview' : 'authorized-original');
    const rawCandidateSrc = isRedacted
        ? (item ? (item.redactedPreviewUrl || '') : imageSrc || '')
        : (item?.src || item?.originalUrl || imageSrc || '');
    const indexNumber = (item?.index !== undefined && item?.index !== null ? item.index : 0) + 1;

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

    // Handle keyboard shortcuts (Escape to close, + / - to zoom, 0 to reset)
    const handleKeyDown = useCallback((event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            onClose();
        } else if (event.key === '+' || event.key === '=') {
            setIsZoomed(true);
        } else if (event.key === '-') {
            setIsZoomed(false);
        } else if (event.key === '0' || event.key === 'r' || event.key === 'R') {
            setIsZoomed(false);
        }
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleKeyDown]);

    // Development-only diagnostic console trace for evidence verification
    useEffect(() => {
        if (isOpen && import.meta.env.DEV && item) {
            console.debug('🔍 [ImageViewer Diagnostic]', {
                reportId: item?.reportId || item?.id,
                evidenceIndex: item?.index,
                sourceKind: item?.sourceKind || sourceKind,
                previewEndpoint: item?.redactedPreviewUrl || (isRedacted ? rawCandidateSrc : undefined),
                detectionStatus: item?.detectionStatus,
                redactionType: item?.redactionType,
                viewerAccess: effectiveViewerAccess,
            });
        }
    }, [isOpen, item, sourceKind, rawCandidateSrc, isRedacted, effectiveViewerAccess]);

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

    // 3. Strict provenance and security validation
    let isSecurityViolation = false;
    let violationMessage = '';

    if (isRedacted) {
        // Redacted mode security rules:
        // Must be sourceKind 'redacted-preview'
        // Must not be a protected GridFS URL or upload URL
        // Must not be a blob URL unless explicitly authorized as a redacted preview
        const containsGridFs = isProtectedOriginalFileUrl(rawCandidateSrc)
            || isProtectedOriginalFileUrl(item?.originalUrl)
            || isProtectedOriginalFileUrl(item?.redactedPreviewUrl)
            || isProtectedOriginalFileUrl(item?.url)
            || isProtectedOriginalFileUrl(imageSrc);

        const isUnauthorizedBlob = typeof rawCandidateSrc === 'string'
            && rawCandidateSrc.startsWith('blob:')
            && sourceKind !== 'redacted-preview';

        const isWrongSourceKind = sourceKind !== 'redacted-preview';
        const isNonCanonicalPreview = !isAuthorizedRedactedPreviewEndpoint(rawCandidateSrc);

        if (containsGridFs || isUnauthorizedBlob || isWrongSourceKind || isNonCanonicalPreview || item?.isForbiddenOriginal) {
            isSecurityViolation = true;
            violationMessage = 'Original evidence is protected.';
        } else if (!rawCandidateSrc) {
            isSecurityViolation = true;
            violationMessage = 'Evidence preview unavailable.';
        }
    } else {
        // Original mode security rules:
        if (!rawCandidateSrc) {
            isSecurityViolation = true;
            violationMessage = 'Original photo unavailable.';
        }
    }

    const effectiveSrc = isSecurityViolation ? '' : resolveAssetUrl(rawCandidateSrc);

    const displayAlt = item?.alt
        || alt
        || (isRedacted
            ? `Incident evidence photo ${indexNumber}, faces blurred for privacy`
            : `Incident evidence photo ${indexNumber}`);

    // 4. Dynamic privacy footer label derived from server detectionStatus & redactionType
    const detectionStatus = item?.detectionStatus;
    const redactionType = item?.redactionType;
    const isPrivacyFallback = detectionStatus === 'detector_failed'
        || detectionStatus === 'derivative_failed'
        || detectionStatus === 'full_image_fallback'
        || redactionType === 'fallback_blur'
        || redactionType === 'svg_fallback';

    const totalCount = Number(item?.total ?? item?.totalCount ?? item?.count);
    const hasMultiple = Number.isFinite(totalCount) && totalCount > 1;
    const headerTitle = hasMultiple ? `Evidence photo ${indexNumber} of ${totalCount}` : `Evidence photo ${indexNumber}`;

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
        if (item?.isOwner) {
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
            {/* Dedicated Operational Inspection Surface with Proportional Footprint */}
            <div
                className="relative flex flex-col justify-between w-full h-full sm:h-auto sm:max-h-[85vh] sm:w-auto sm:max-w-4xl sm:min-w-[320px] rounded-none sm:rounded-xl border-0 sm:border border-[#334047] bg-[#151A1F] shadow-xl overflow-hidden pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:py-0"
                onClick={(e) => e.stopPropagation()}
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

                    {/* Clearly Grouped Toolbar Controls */}
                    <div className="flex items-center justify-end gap-1 sm:gap-1.5 rounded-lg border border-[#334047] bg-[#1C242B] p-1 text-[#F5F7F6] shrink-0">
                        {/* Reset Zoom */}
                        {!isSecurityViolation && !hasLoadError && (
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
                        {!isSecurityViolation && !hasLoadError && (
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
                        {!isSecurityViolation && !hasLoadError && (
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

                {/* 2. Proportional Image Canvas (Dominant visual focus, neutral background, zero text overlays) */}
                <div
                    className="flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-[#1C242B] p-2 sm:p-4"
                    onClick={() => {
                        if (!isSecurityViolation && !hasLoadError) {
                            setIsZoomed(!isZoomed);
                        }
                    }}
                >
                    {isSecurityViolation ? (
                        <div
                            role="alert"
                            className="flex flex-col items-center justify-center rounded-lg bg-[#151A1F] border border-[#334047] p-6 sm:p-8 text-center max-w-sm"
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
                            className={`max-h-[calc(100dvh-120px)] sm:max-h-[calc(85vh-120px)] max-w-full rounded-sm object-contain select-none transition-transform duration-200 ${
                                isZoomed ? 'scale-125 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                            }`}
                        />
                    )}
                </div>

                {/* 3. Small Opaque Footer Status Area (Strictly outside and below image) */}
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
