import { useId, useState } from 'react';
import { ID_IMAGE_ACCEPT, prepareIdentityImage, prepareVerificationImage } from '../../utils/identityImage';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

const ReporterIdResubmission = ({ onSubmit }) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [idFile, setIdFile] = useState(null);
    const [selfieFile, setSelfieFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const close = () => {
        if (loading) return;
        setOpen(false);
        setIdFile(null);
        setSelfieFile(null);
        setError('');
    };

    const submit = async (event) => {
        event.preventDefault();
        // A portal still bubbles through the profile form's React tree.
        event.stopPropagation();
        if (loading) return;
        setError('');
        setLoading(true);
        try {
            const preparedId = await prepareIdentityImage(idFile);
            const data = new FormData();
            data.append('idDocument', preparedId.file);
            if (selfieFile) {
                const preparedSelfie = await prepareVerificationImage(selfieFile, { subject: 'selfie', fallbackName: 'verification-selfie' });
                data.append('selfiePhoto', preparedSelfie.file);
            }
            const result = await onSubmit(data);
            if (!result?.success) {
                setError(result?.message || 'Your documents could not be submitted. Please try again.');
                return;
            }
            setOpen(false);
            setIdFile(null);
            setSelfieFile(null);
        } catch (requestError) {
            setError(requestError.message || 'Your documents could not be prepared. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>Resubmit ID</Button>
            <Modal isOpen={open} onClose={close} title="Resubmit verification documents" size="lg">
                <form onSubmit={submit} noValidate className="space-y-4">
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">Upload a clear ID photo for another municipal review. Your existing selfie is retained unless you choose a replacement.</p>
                    <div>
                        <label htmlFor={`${id}-document`} className="field-label">ID photo (required)</label>
                        <input id={`${id}-document`} type="file" accept={ID_IMAGE_ACCEPT} disabled={loading} className="field-control" onChange={(event) => { setIdFile(event.target.files?.[0] || null); setError(''); }} />
                    </div>
                    <div>
                        <label htmlFor={`${id}-selfie`} className="field-label">Replacement selfie (optional)</label>
                        <input id={`${id}-selfie`} type="file" accept={ID_IMAGE_ACCEPT} disabled={loading} className="field-control" onChange={(event) => { setSelfieFile(event.target.files?.[0] || null); setError(''); }} />
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">JPG, PNG, or WebP · maximum 5 MB each. Verification photos remain private.</p>
                    {error && <p role="alert" className="text-sm leading-relaxed text-red-700 dark:text-red-300">{error}</p>}
                    <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" disabled={loading} onClick={close}>Cancel</Button>
                        <Button type="submit" loading={loading} loadingLabel="Sending for review…">Send for review</Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default ReporterIdResubmission;
