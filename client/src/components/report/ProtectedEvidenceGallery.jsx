import { useEffect, useMemo, useState } from 'react';
import { HiOutlineEyeOff, HiOutlinePhotograph, HiOutlineShieldCheck } from 'react-icons/hi';
import { filesAPI } from '../../services/api';
import {
    isAuthorizedRedactedPreviewEndpoint,
    isProtectedOriginalFileUrl,
    normalizeEvidenceDescriptor,
} from '../../utils/evidenceModel';
import ImageViewer from '../ui/ImageViewer';

const EvidenceThumbnail = ({
    item,
    index,
    viewerAccess = 'redacted',
    isOwner = false,
    onView,
}) => {
    const [state, setState] = useState({ url: '', loading: true, error: '' });
    const isOriginalAllowed = viewerAccess === 'original';
    const isBlurred = viewerAccess === 'redacted';

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = '';

        const load = async () => {
            try {
                if (isBlurred) {
                    // Security rule: In redacted mode, only a valid server-generated redacted preview endpoint is permitted
                    if (item?.isForbiddenOriginal) {
                        setState({ url: '', loading: false, error: 'Original evidence is protected' });
                        return;
                    }
                    const redactedUrl = item?.redactedPreviewUrl;
                    if (!redactedUrl || !isAuthorizedRedactedPreviewEndpoint(redactedUrl) || isProtectedOriginalFileUrl(redactedUrl)) {
                        setState({
                            url: '',
                            loading: false,
                            error: item?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable',
                        });
                        return;
                    }
                    setState({ url: redactedUrl, loading: false, error: '' });
                    return;
                }

                // Original mode (server-authorized report owner or operational personnel)
                const originalSource = item?.originalUrl || item?.src;
                if (!originalSource) {
                    setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
                    return;
                }

                if (!isProtectedOriginalFileUrl(originalSource)) {
                    setState({ url: originalSource, loading: false, error: '' });
                    return;
                }

                if (!isOriginalAllowed) {
                    setState({ url: '', loading: false, error: 'Not authorized' });
                    return;
                }

                const response = await filesAPI.getProtected(originalSource, { signal: controller.signal });
                objectUrl = URL.createObjectURL(response.data);
                setState({ url: objectUrl, loading: false, error: '' });
            } catch (error) {
                if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
                setState({ url: '', loading: false, error: 'Evidence preview unavailable' });
            }
        };

        load();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [item?.redactedPreviewUrl, item?.originalUrl, item?.src, item?.isForbiddenOriginal, isBlurred, isOriginalAllowed]);

    if (state.loading) {
        return (
            <div
                className="aspect-square animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5"
                aria-label={`Loading evidence photo ${index + 1}`}
            />
        );
    }

    if (state.error || item?.isForbiddenOriginal || item?.isUnavailable) {
        const errorText = state.error || (item?.isForbiddenOriginal ? 'Original evidence is protected' : 'Evidence preview unavailable');
        return (
            <div className="flex aspect-square flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400" role="alert">
                <HiOutlinePhotograph className="mb-1 h-5 w-5 opacity-60" aria-hidden="true" />
                <span>{errorText}</span>
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
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200/90 bg-gray-900 shadow-2xs transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 cursor-zoom-in"
                title={`${badgeLabel} · Click to view larger. Original evidence is available only to the report owner and authorized municipal personnel.`}
                aria-label={`Incident evidence photo ${index + 1}, faces blurred for privacy`}
            >
                <img
                    src={state.url}
                    alt={item.alt || `Incident evidence photo ${index + 1}, faces blurred for privacy`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-gray-950/85 via-gray-950/40 to-transparent p-2 text-white">
                    <div className="flex items-center gap-1 min-w-0">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 text-emerald-400 shrink-0 drop-shadow-xs" aria-hidden="true" />
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-white truncate drop-shadow-xs">
                            {badgeLabel}
                        </span>
                    </div>
                </div>
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
            className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-2xs transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#07130e] cursor-pointer"
            aria-label={`View evidence photo ${index + 1}`}
        >
            <img
                src={state.url || item.src}
                alt={item.alt || `Incident evidence photo ${index + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
            />
            {isOwner && (
                <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-xs">
                    Your upload
                </div>
            )}
        </button>
    );
};

const ProtectedEvidenceGallery = ({
    images = [],
    evidence = null,
    accessLevel = null,
    isOwner = false,
    isOperational = false,
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

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {rawList.map((item, index) => (
                    <EvidenceThumbnail
                        key={item.id || `${item.src}-${index}`}
                        item={item}
                        index={index}
                        viewerAccess={viewerAccess}
                        isOwner={isOriginalAuthorized && isOwner}
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
                />
            )}
        </div>
    );
};

export default ProtectedEvidenceGallery;
