import { useEffect, useState } from 'react';
import { HiOutlineExclamation, HiOutlinePhotograph } from 'react-icons/hi';
import { filesAPI } from '../../services/api';
import { resolveAssetUrl } from '../../utils/assets';
import ImageViewer from '../ui/ImageViewer';

const isProtectedGridFsUrl = (value) => typeof value === 'string' && /\/api\/files\//i.test(value);

const EvidenceThumbnail = ({ source, index, onView }) => {
    const [state, setState] = useState({ url: '', loading: true, error: '' });

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = '';

        const load = async () => {
            try {
                if (!isProtectedGridFsUrl(source)) {
                    setState({ url: resolveAssetUrl(source), loading: false, error: '' });
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
    }, [source]);

    if (state.loading) {
        return <div className="aspect-square animate-pulse rounded-xl border border-gray-200 bg-gray-100" aria-label={`Loading evidence photo ${index + 1}`} />;
    }

    if (state.error) {
        return (
            <div className="flex aspect-square flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-3 text-center text-xs text-red-700">
                <HiOutlineExclamation className="mb-1 h-5 w-5" aria-hidden="true" />
                {state.error}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onView(state.url, index)}
            className="aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={`View evidence photo ${index + 1}`}
        >
            <img src={state.url} alt={`Incident evidence ${index + 1}`} className="h-full w-full object-cover" />
        </button>
    );
};

const ProtectedEvidenceGallery = ({ images = [], onViewImage }) => {
    const [viewer, setViewer] = useState(null);

    if (!images.length) {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                <HiOutlinePhotograph className="h-5 w-5 shrink-0" aria-hidden="true" />
                No evidence photos were submitted.
            </div>
        );
    }

    const viewImage = (url, index) => {
        if (onViewImage) onViewImage(url);
        else setViewer({ url, index });
    };

    return (
        <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((image, index) => (
                    <EvidenceThumbnail key={`${image}-${index}`} source={image} index={index} onView={viewImage} />
                ))}
            </div>
            {!onViewImage && (
                <ImageViewer
                    isOpen={Boolean(viewer)}
                    imageSrc={viewer?.url || ''}
                    alt={viewer ? `Incident evidence ${viewer.index + 1}` : 'Incident evidence'}
                    onClose={() => setViewer(null)}
                />
            )}
        </>
    );
};

export default ProtectedEvidenceGallery;
