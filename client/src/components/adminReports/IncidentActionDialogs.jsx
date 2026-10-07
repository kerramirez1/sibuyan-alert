import { useEffect, useRef } from 'react';
import {
    HiOutlineBadgeCheck,
    HiOutlineX,
} from 'react-icons/hi';
import Modal from '../ui/Modal';
import ResponderUnitModal from '../ResponderUnitModal';
import toast from '../../utils/appToast';
import { validateEvidenceImageFile } from '../../utils/evidenceImage';

const DialogButton = ({ children, onClick, tone = 'neutral', disabled = false, loading = false }) => {
    const tones = {
        neutral: 'border-transparent bg-white text-gray-700 hover:bg-gray-50',
        success: 'border-transparent bg-emerald-700 text-white hover:bg-emerald-800',
        danger: 'border-transparent bg-red-700 text-white hover:bg-red-800',
        violet: 'border-transparent bg-violet-700 text-white hover:bg-violet-800',
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled || loading}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 text-center text-sm font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
        >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {children}
        </button>
    );
};

const ReportPreview = ({ report }) => (
    <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-semibold text-gray-900">{report?.address || 'Incident report'}</p>
        <p className="mt-1 line-clamp-2 text-xs text-gray-600">{report?.description || 'No description provided'}</p>
    </div>
);

// Optional resolution photos for the Resolve dialog. Photos ride the same
// multipart resolve request and land in the report's `resolutionImages`
// field — separate from the reporter's evidence. Selection stays capped at
// the field's own 5-photo maximum.
const MAX_RESOLUTION_PHOTOS = 5;

const ResolutionPhotoPicker = ({ actions }) => {
    const { resolveDialog } = actions;
    const fileInputRef = useRef(null);
    const photos = Array.isArray(resolveDialog.resolutionPhotos) ? resolveDialog.resolutionPhotos : [];
    const existingCount = resolveDialog.report?.resolutionImages?.length || 0;
    const totalRemaining = Math.max(0, MAX_RESOLUTION_PHOTOS - existingCount);
    const addableSlots = Math.max(0, totalRemaining - photos.length);

    // Previews are object URLs created at selection time; revoke them when a
    // photo leaves the selection (removed, or the dialog closed and reset)
    // so they never leak.
    const previousPhotosRef = useRef([]);
    useEffect(() => {
        const currentIds = new Set(photos.map((photo) => photo.id));
        for (const photo of previousPhotosRef.current) {
            if (!currentIds.has(photo.id) && photo.preview) URL.revokeObjectURL(photo.preview);
        }
        previousPhotosRef.current = photos;
    }, [photos]);

    const handlePhotoChange = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length || addableSlots <= 0) return;
        const reportId = resolveDialog.report?._id || 'report';
        const valid = [];
        for (const file of files.slice(0, addableSlots)) {
            const validationError = validateEvidenceImageFile(file);
            if (validationError) {
                toast.error(`${file.name || 'File'} ${validationError}`);
            } else {
                // The photoId is minted once per selection and never
                // regenerated, so a retry after a failed resolve dedups
                // server-side instead of duplicating.
                valid.push({
                    id: `resolution-${reportId}-${Date.now()}-${valid.length}-${Math.random().toString(36).slice(2, 8)}`,
                    file,
                    preview: URL.createObjectURL(file),
                });
            }
        }
        if (!valid.length) return;
        actions.setResolveDialog((current) => ({
            ...current,
            resolutionPhotos: [...(Array.isArray(current.resolutionPhotos) ? current.resolutionPhotos : []), ...valid],
        }));
    };

    const removePhoto = (id) => {
        actions.setResolveDialog((current) => ({
            ...current,
            resolutionPhotos: (Array.isArray(current.resolutionPhotos) ? current.resolutionPhotos : []).filter((photo) => photo.id !== id),
        }));
    };

    return (
        <div className="mt-4">
            <span className="text-sm font-semibold text-gray-800">Resolution photos <span className="font-normal text-gray-500">(optional)</span></span>
            {totalRemaining > 0 ? (
                <>
                    <p className="mt-1 text-xs text-gray-500">
                        Attach up to {totalRemaining} photo{totalRemaining === 1 ? '' : 's'} proving the incident is resolved. They upload before the incident is closed.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        aria-label="Add resolution photos"
                        onChange={handlePhotoChange}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={addableSlots <= 0 || actions.resolveLoading}
                        className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Add photos
                    </button>
                    {photos.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {photos.map((photo) => (
                                <div key={photo.id} className="relative">
                                    <img src={photo.preview} alt="Resolution photo preview" className="h-20 w-full rounded-lg border border-gray-200 object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(photo.id)}
                                        aria-label="Remove resolution photo"
                                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                                    >
                                        <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <p className="mt-1 text-xs text-gray-500">This report already has the maximum of 5 resolution photos.</p>
            )}
        </div>
    );
};

const IncidentActionDialogs = ({ actions, municipality }) => {
    const { resolveDialog } = actions;

    return (
        <>
            <Modal
                isOpen={resolveDialog.open}
                onClose={actions.closeResolve}
                title="Resolve incident"
                size="md"
            >
                <ReportPreview report={resolveDialog.report} />
                <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    Confirm that the response is complete. The reporter will be notified and the incident will be closed.
                </p>
                <label className="block">
                    <span className="text-sm font-semibold text-gray-800">Resolution notes <span className="font-normal text-gray-500">(optional)</span></span>
                    <textarea
                        value={resolveDialog.resolutionNotes}
                        onChange={(event) => actions.setResolveDialog((current) => ({ ...current, resolutionNotes: event.target.value }))}
                        rows={4}
                        className="mt-2 w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        placeholder="Describe the response outcome"
                    />
                </label>
                <ResolutionPhotoPicker actions={actions} />
                <div className="mt-5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    <DialogButton onClick={actions.closeResolve}>Cancel</DialogButton>
                    <DialogButton onClick={actions.confirmResolve} tone="success" loading={actions.resolveLoading}>
                        <HiOutlineBadgeCheck className="h-4 w-4" aria-hidden="true" />
                        Confirm resolved
                    </DialogButton>
                </div>
            </Modal>

            <ResponderUnitModal
                isOpen={actions.unitDialog.open}
                onClose={actions.closeUnit}
                onSelect={actions.selectUnit}
                municipality={municipality || ''}
            />
        </>
    );
};

export default IncidentActionDialogs;
