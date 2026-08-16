import {
    HiOutlineBadgeCheck,
    HiOutlineSwitchHorizontal,
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
    const { resolveDialog, transferDialog } = actions;
    const transferReasonLength = transferDialog.reason.trim().length;
    const transferInvalid = !transferDialog.targetMunicipalityId || transferReasonLength < 10;
    const currentMunicipalityId = transferDialog.report?.municipality?._id || transferDialog.report?.municipality;

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

            <Modal
                isOpen={transferDialog.open}
                onClose={actions.closeTransfer}
                title="Transfer incident"
                size="md"
            >
                <ReportPreview report={transferDialog.report} />
                <div className="space-y-4">
                    <label className="block">
                        <span className="text-sm font-semibold text-gray-800">Target municipality <span className="text-red-600">*</span></span>
                        <select
                            value={transferDialog.targetMunicipalityId}
                            onChange={(event) => actions.setTransferDialog((current) => ({ ...current, targetMunicipalityId: event.target.value }))}
                            className="mt-2 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        >
                            <option value="">Select municipality</option>
                            {actions.municipalities
                                .filter((item) => item._id?.toString() !== currentMunicipalityId?.toString())
                                .map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-sm font-semibold text-gray-800">Transfer reason <span className="text-red-600">*</span></span>
                        <textarea
                            value={transferDialog.reason}
                            onChange={(event) => actions.setTransferDialog((current) => ({ ...current, reason: event.target.value }))}
                            rows={4}
                            minLength={10}
                            required
                            aria-describedby="transfer-reason-help"
                            className="mt-2 w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                            placeholder="Explain the jurisdiction or mutual-aid reason"
                        />
                        <span id="transfer-reason-help" className={`mt-1 block text-xs ${transferReasonLength > 0 && transferReasonLength < 10 ? 'text-red-600' : 'text-gray-500'}`}>
                            Minimum 10 characters · {transferReasonLength}/10
                        </span>
                    </label>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    <DialogButton onClick={actions.closeTransfer}>Cancel</DialogButton>
                    <DialogButton onClick={actions.confirmTransfer} tone="violet" disabled={transferInvalid} loading={actions.transferLoading}>
                        <HiOutlineSwitchHorizontal className="h-4 w-4" aria-hidden="true" />
                        Confirm transfer
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
