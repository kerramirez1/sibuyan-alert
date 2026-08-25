import { useCallback, useEffect, useState } from 'react';
import {
    HiOutlineDownload,
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
 * High-performance full-screen image viewer modal.
 * 
 * Security Boundary:
 * - When viewing in redacted mode (effectiveViewerAccess === 'redacted'), the viewer accepts
 *   ONLY normalized items with sourceKind: 'redacted-preview'.
 * - If a protected GridFS URL or raw image URL is provided in redacted mode, it displays
 *   a privacy safety banner instead of rendering the original bytes.
 * - Downloads in redacted mode strictly enforce labeled filenames (evidence-N-redacted.jpg).
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

    // 1. Authoritative access determination strictly from item or explicitly authorized viewerAccess prop
    const effectiveViewerAccess = (item?.viewerAccess === 'original' || viewerAccess === 'original')
        ? 'original'
        : 'redacted';
    const isRedacted = effectiveViewerAccess === 'redacted';

    // 2. Resolve normalized model fields
    const sourceKind = item?.sourceKind || (isRedacted ? 'redacted-preview' : 'authorized-original');
    const rawCandidateSrc = isRedacted
        ? (item ? (item.redactedPreviewUrl || '') : imageSrc || '')
        : (item?.src || item?.originalUrl || imageSrc || '');
    const indexNumber = (item?.index !== undefined && item?.index !== null ? item.index : 0) + 1;

    // Reset zoom state on open/close
    useEffect(() => {
        if (!isOpen) {
            setIsZoomed(false);
        }
    }, [isOpen]);

    // Handle keyboard shortcuts (Escape to close, + / - to zoom)
    const handleKeyDown = useCallback((event) => {
        if (event.key === 'Escape') {
            onClose();
        } else if (event.key === '+' || event.key === '=') {
            setIsZoomed(true);
        } else if (event.key === '-') {
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

    // 4. Labeled download filename and attributes
    const downloadFilename = isRedacted
        ? `evidence-${indexNumber}-redacted.jpg`
        : `evidence-${indexNumber}.jpg`;

    const displayAlt = item?.alt
        || alt
        || (isRedacted
            ? `Incident evidence photo ${indexNumber}, faces blurred for privacy`
            : `Incident evidence photo ${indexNumber}`);

    // 5. Dynamic privacy footer label derived from server detectionStatus & redactionType
    const detectionStatus = item?.detectionStatus;
    const redactionType = item?.redactionType;
    const isPrivacyFallback = detectionStatus === 'detector_failed'
        || detectionStatus === 'derivative_failed'
        || detectionStatus === 'full_image_fallback'
        || redactionType === 'fallback_blur'
        || redactionType === 'svg_fallback';

    const renderFooterBadge = () => {
        if (isRedacted) {
            if (redactionType === 'public_soft_blur' || detectionStatus === 'privacy_derivative') {
                return (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur-md border border-white/10 shadow-lg">
                        <HiOutlineEyeOff className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                        <span>Privacy-safe preview · Details limited</span>
                    </div>
                );
            }
            if (detectionStatus === 'no_faces_detected' || redactionType === 'none') {
                return (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md border border-white/10 shadow-lg">
                        <HiOutlineShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                        <span>Clean scene preview · Scene details preserved</span>
                    </div>
                );
            }

            if (detectionStatus === 'invalid_image') {
                return (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur-md border border-white/10 shadow-lg">
                        <HiOutlineEyeOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Evidence unavailable for privacy</span>
                    </div>
                );
            }

            if (isPrivacyFallback) {
                return (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur-md border border-white/10 shadow-lg">
                        <HiOutlineEyeOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Detail visibility limited</span>
                    </div>
                );
            }

            if (detectionStatus === 'processing' || redactionType === 'privacy_preview') {
                return (
                    <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur-md border border-white/10 shadow-lg">
                        <HiOutlineEyeOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                        <span>Privacy-safe preview · Verification in progress</span>
                    </div>
                );
            }

            // Default faces_detected / face_blur
            return (
                <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md border border-white/10 shadow-lg">
                    <HiOutlineEyeOff className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Faces redacted for privacy · Scene details preserved</span>
                </div>
            );
        }

        // Original view
        if (item?.isOwner) {
            return (
                <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md border border-white/10 shadow-lg">
                    <HiOutlineShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    <span>Your upload · Viewing original unredacted evidence</span>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3.5 py-1 text-[11px] font-semibold text-emerald-300 backdrop-blur-md border border-white/10 shadow-lg">
                <HiOutlineShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                <span>Operational access · Viewing official unredacted evidence</span>
            </div>
        );
    };

    const headerTitle = isRedacted
        ? (redactionType === 'public_soft_blur' || detectionStatus === 'privacy_derivative'
            ? `Evidence photo ${indexNumber} (Privacy-safe preview)`
            : (detectionStatus === 'no_faces_detected' || redactionType === 'none'
            ? `Evidence photo ${indexNumber}`
            : (detectionStatus === 'processing' || redactionType === 'privacy_preview'
                ? `Evidence photo ${indexNumber} (Privacy-safe preview)`
                : (isPrivacyFallback
                    ? `Evidence photo ${indexNumber} (Privacy-safe preview)`
                    : `Evidence photo ${indexNumber} (Faces blurred for privacy)`))))
        : `Evidence photo ${indexNumber}`;

    const isSoftBlurOrPrivacySafe = isPrivacyFallback
        || redactionType === 'public_soft_blur'
        || redactionType === 'privacy_preview'
        || detectionStatus === 'privacy_derivative'
        || detectionStatus === 'processing'
        || detectionStatus === 'no_faces_detected'
        || redactionType === 'none';

    const downloadLabel = isRedacted
        ? (isSoftBlurOrPrivacySafe
            ? 'Download privacy-safe preview image'
            : 'Download preview image with faces blurred for privacy')
        : 'Download original evidence photo';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-3 sm:p-5 transition-opacity duration-200 animate-fade-in select-none"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged evidence image viewer"
        >
            {/* Top Header Bar */}
            <div
                className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 z-10 flex items-center justify-between pointer-events-none gap-2"
            >
                {/* Title */}
                <div className="rounded-full bg-black/60 px-3.5 py-1.5 backdrop-blur-md border border-white/10 text-white font-semibold text-xs sm:text-sm pointer-events-auto truncate max-w-[65%] sm:max-w-md shadow-md">
                    {headerTitle}
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    {/* Download Button */}
                    {!isSecurityViolation && effectiveSrc && (
                        <a
                            href={effectiveSrc}
                            download={downloadFilename}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            title={downloadLabel}
                            aria-label={downloadLabel}
                        >
                            <HiOutlineDownload className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
                        </a>
                    )}

                    {/* Reset Zoom */}
                    {!isSecurityViolation && (
                        <button
                            type="button"
                            onClick={() => setIsZoomed(false)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            title="Reset image zoom"
                            aria-label="Reset image zoom"
                        >
                            <HiOutlineRefresh className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
                        </button>
                    )}

                    {/* Zoom In / Out Toggle */}
                    {!isSecurityViolation && (
                        <button
                            type="button"
                            onClick={() => setIsZoomed(!isZoomed)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            title={isZoomed ? 'Zoom out image' : 'Zoom in image'}
                            aria-label={isZoomed ? 'Zoom out image' : 'Zoom in image'}
                        >
                            {isZoomed ? (
                                <HiOutlineMinus className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
                            ) : (
                                <HiOutlinePlus className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
                            )}
                        </button>
                    )}

                    {/* Close Button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-white/20 transition-colors backdrop-blur-md border border-white/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        title="Close image viewer (Escape)"
                        aria-label="Close image viewer"
                    >
                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Main Image Container */}
            <div
                className={`relative flex items-center justify-center max-h-[82vh] max-w-[88vw] transition-transform duration-200 overflow-hidden ${
                    isZoomed ? 'scale-125 cursor-zoom-out overflow-auto' : 'scale-100 cursor-zoom-in'
                }`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isSecurityViolation) {
                        setIsZoomed(!isZoomed);
                    }
                }}
            >
                {isSecurityViolation ? (
                    <div
                        role="alert"
                        className="flex flex-col items-center justify-center rounded-2xl bg-slate-900/90 border border-slate-700/80 p-6 sm:p-8 text-center max-w-md shadow-2xl backdrop-blur-md"
                    >
                        <div className="rounded-full bg-amber-500/10 p-3 text-amber-400 mb-3">
                            <HiOutlineLockClosed className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
                        </div>
                        <h4 className="text-sm font-semibold text-slate-100 mb-1">{violationMessage}</h4>
                        <p className="text-xs text-slate-400">
                            {isRedacted
                                ? 'This evidence item is restricted for privacy or currently unavailable.'
                                : 'Unable to load original photo. Please verify your network and permissions.'}
                        </p>
                    </div>
                ) : (
                    <img
                        src={effectiveSrc}
                        alt={displayAlt}
                        className="max-h-[80vh] max-w-[86vw] rounded-xl object-contain select-none shadow-2xl transition-transform"
                    />
                )}
            </div>

            {/* Bottom Footer Badge */}
            <div
                className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 pointer-events-none px-4 text-center"
            >
                <div className="pointer-events-auto">
                    {renderFooterBadge()}
                </div>

                {/* Keyboard Shortcut Hint */}
                <div className="hidden sm:flex items-center gap-2 text-[10px] text-white/50 tracking-wider uppercase select-none drop-shadow-xs">
                    <span>Press Esc to close</span>
                    <span>·</span>
                    <span>+/- to zoom</span>
                </div>
            </div>
        </div>
    );
};

export default ImageViewer;
