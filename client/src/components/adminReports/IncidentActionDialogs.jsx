import {
    HiOutlineBadgeCheck,
} from 'react-icons/hi';
import Modal from '../ui/Modal';
import ResponderUnitModal from '../ResponderUnitModal';

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
