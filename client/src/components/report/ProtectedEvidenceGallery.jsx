import { useEffect, useState } from 'react';
import { HiOutlineEyeOff, HiOutlinePhotograph, HiOutlineShieldCheck } from 'react-icons/hi';
import { filesAPI } from '../../services/api';
import { resolveAssetUrl } from '../../utils/assets';
import ImageViewer from '../ui/ImageViewer';

const isProtectedGridFsUrl = (value) => typeof value === 'string' && /\/api\/files\//i.test(value);

const EvidenceThumbnail = ({
    source,
    index,
    accessLevel = 'blurred',
    isOwner = false,
    onView,
}) => {
    const [state, setState] = useState({ url: '', loading: true, error: '' });
    const isOriginalAllowed = accessLevel === 'original' || isOwner;
    const isBlurred = accessLevel === 'blurred' && !isOriginalAllowed;

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = '';

        const load = async () => {
            try {
                if (isBlurred) {
                    // Security guard: never request original GridFS URLs when in blurred mode
                    if (isProtectedGridFsUrl(source)) {
                        setState({ url: '', loading: false, error: 'Original evidence is protected' });
                        return;
                    }
                    setState({ url: resolveAssetUrl(source), loading: false, error: '' });
                    return;
                }

                if (!isProtectedGridFsUrl(source)) {
                    setState({ url: resolveAssetUrl(source), loading: false, error: '' });
                    return;
                }

                if (!isOriginalAllowed) {
                    setState({ url: '', loading: false, error: 'Not authorized' });
                    return;
                }

                const response = await filesAPI.getProtected(source, { signal: controller.signal });
                objectUrl = URL.createObjectURL(response.data);
                setState({ url: objectUrl, loading: false, error: '' });
            } catch (error) {
                if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
                setState({ url: '', loading: false, error: 'Unable to load photo' });
            }
        };

        load();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [source, isBlurred, isOriginalAllowed]);

    if (state.loading) {
        return (
            <div
                className="aspect-square animate-pulse rounded-lg border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5"
                aria-label={`Loading evidence photo ${index + 1}`}
            />
        );
    }

    if (state.error) {
        return (
            <div className="flex aspect-square flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400" role="alert">
                <HiOutlinePhotograph className="mb-1 h-5 w-5 opacity-60" aria-hidden="true" />
                <span>Evidence preview unavailable</span>
            </div>
        );
    }

    if (isBlurred) {
        return (
            <div
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200/90 bg-gray-900 shadow-2xs dark:border-white/10"
                title="Faces blurred for privacy · Original evidence is available only to the report owner and authorized municipal personnel."
                aria-label={`Incident evidence photo ${index + 1}, faces blurred for privacy`}
            >
                <img
                    src={state.url}
                    alt={`Incident evidence photo ${index + 1}, faces blurred for privacy`}
                    className="h-full w-full object-cover transition-transform duration-200"
                    loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-gray-950/85 via-gray-950/40 to-transparent p-2 text-white">
                    <div className="flex items-center gap-1 min-w-0">
                        <HiOutlineEyeOff className="h-3.5 w-3.5 text-emerald-400 shrink-0 drop-shadow-xs" aria-hidden="true" />
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-white truncate drop-shadow-xs">
                            Faces blurred for privacy
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onView(state.url, index)}
            className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-2xs transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-[#07130e] cursor-pointer"
            aria-label={`View evidence photo ${index + 1}`}
        >
            <img
                src={state.url}
                alt={`Incident evidence photo ${index + 1}`}
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
    accessLevel = 'blurred',
    isOwner = false,
    onViewImage,
}) => {
    const [viewer, setViewer] = useState(null);

    const normalizedItems = Array.isArray(evidence?.items)
        ? evidence.items
        : Array.isArray(evidence) && evidence.length > 0
            ? evidence
            : images;

    const rawList = normalizedItems.map((item, idx) => {
        if (typeof item === 'string') {
            return {
                id: String(idx),
                source: item,
                accessLevel,
                isOwner,
            };
        }
        return {
            id: item.id || String(idx),
            source: item.previewUrl || item.url || item.originalUrl || '',
            accessLevel: item.accessLevel || accessLevel,
            isOwner: item.isOwner !== undefined ? item.isOwner : isOwner,
        };
    }).filter((item) => Boolean(item.source));

    if (!rawList.length) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200/90 bg-gray-50/60 p-3 text-xs text-gray-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                <HiOutlinePhotograph className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                <span>No evidence attached.</span>
            </div>
        );
    }

    const effectiveAccessLevel = evidence?.accessLevel || accessLevel;
    const isOriginalAllowed = effectiveAccessLevel === 'original' || isOwner;

    const viewImage = (url, index) => {
        if (!isOriginalAllowed) return;
        if (onViewImage) onViewImage(url);
        else setViewer({ url, index });
    };

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {rawList.map((item, index) => (
                    <EvidenceThumbnail
                        key={item.id || `${item.source}-${index}`}
                        source={item.source}
                        index={index}
                        accessLevel={item.accessLevel || effectiveAccessLevel}
                        isOwner={item.isOwner !== undefined ? item.isOwner : isOwner}
                        onView={viewImage}
                    />
                ))}
            </div>

            {!isOriginalAllowed && (
                <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <HiOutlineShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>Original evidence is available only to the report owner and authorized municipal personnel.</span>
                </p>
            )}

            {!onViewImage && isOriginalAllowed && (
                <ImageViewer
                    isOpen={Boolean(viewer)}
                    imageSrc={viewer?.url || ''}
                    alt={viewer ? `Incident evidence ${viewer.index + 1}` : 'Incident evidence'}
                    onClose={() => setViewer(null)}
                />
            )}
        </div>
    );
};

export default ProtectedEvidenceGallery;
