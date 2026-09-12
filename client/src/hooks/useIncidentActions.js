import { useCallback, useState } from 'react';
import toast from '../utils/appToast';
import { adminAPI, reportsAPI } from '../services/api';
import { getIncidentCapabilities } from '../components/adminReports/incidentReportConfig';

const closedReview = { open: false, report: null, status: '', rejectionReason: '' };
const closedResolve = { open: false, report: null, resolutionNotes: '' };
const closedTransfer = { open: false, report: null, targetMunicipalityId: '', reason: '' };

const getApiError = (error, fallback) => error?.response?.data?.message || fallback;

const useIncidentActions = ({
    user,
    patchReport,
    removeReport,
    refreshReports,
    closeDetails,
    onResponseStarted,
    onIncidentResolved,
}) => {
    const [reviewDialog, setReviewDialog] = useState(closedReview);
    const [resolveDialog, setResolveDialog] = useState(closedResolve);
    const [transferDialog, setTransferDialog] = useState(closedTransfer);
    const [unitDialog, setUnitDialog] = useState({ open: false, report: null });
    const [municipalities, setMunicipalities] = useState([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [respondLoadingId, setRespondLoadingId] = useState(null);
    const [resolveLoading, setResolveLoading] = useState(false);
    const [transferLoading, setTransferLoading] = useState(false);
    const [acknowledgeLoadingId, setAcknowledgeLoadingId] = useState(null);
    const [deleteLoadingId, setDeleteLoadingId] = useState(null);

    const openReview = useCallback((report, status) => {
        const capabilities = getIncidentCapabilities(user, report);
        const allowed = status === 'verified' ? capabilities.canVerify : capabilities.canReject;
        if (!allowed) {
            toast.error('Only administrators can review this report at its current status.');
            return;
        }
        setTransferDialog(closedTransfer);
        setReviewDialog({ open: true, report, status, rejectionReason: '' });
    }, [user]);

    const confirmReview = useCallback(async () => {
        const { report, status, rejectionReason } = reviewDialog;
        if (!report || !report?._id || !status) return;
        if (status === 'rejected' && !rejectionReason.trim()) return;

        setReviewLoading(true);
        try {
            const payload = { status, rejectionReason };
            const response = await adminAPI.verifyReport(report?._id, payload);
            const serverReport = response.data?.data;
            const updatedReport = { ...report, ...(serverReport && typeof serverReport === 'object' && !Array.isArray(serverReport) ? serverReport : {}), status, rejectionReason };
            patchReport(report?._id, updatedReport);
            toast.success(response.data?.message || (status === 'verified' ? 'Incident verified successfully.' : `Report ${status} successfully`));
            setReviewDialog(closedReview);
            await refreshReports({ silent: true });
        } catch (error) {
            toast.error(getApiError(error, 'Failed to update report status'));
        } finally {
            setReviewLoading(false);
        }
    }, [patchReport, refreshReports, reviewDialog]);

    const performRespond = useCallback(async (report, unitData) => {
        if (!report || !report?._id || !getIncidentCapabilities(user, report).canRespond) {
            toast.error('Responder action is not available for this incident.');
            return;
        }

        setRespondLoadingId(report?._id);
        try {
            const response = await adminAPI.respondToReport(report?._id, {
                unitName: unitData?.unitName,
                unitType: unitData?.unitType,
            });
            const serverData = response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data) ? response.data.data : {};
            patchReport(report?._id, { ...serverData, status: 'responding' });
            toast.success(response.data?.message || 'Response started');
            setUnitDialog({ open: false, report: null });
            if (onResponseStarted) {
                onResponseStarted({ ...report, ...serverData, status: 'responding' });
            } else {
                await refreshReports({ silent: true });
            }
        } catch (error) {
            toast.error(getApiError(error, 'Failed to respond to report'));
            if (error?.response?.status === 409) await refreshReports({ silent: true });
        } finally {
            setRespondLoadingId(null);
        }
    }, [onResponseStarted, patchReport, refreshReports, user]);

    const openRespond = useCallback((report) => {
        if (!getIncidentCapabilities(user, report).canRespond) {
            toast.error('Responder action is not available for this incident.');
            return;
        }

        if (user?.agency) {
            performRespond(report, {
                unitName: user?.responderUnit || `${user?.agency} - ${user?.assignedMunicipality || 'Sibuyan'}`,
                unitType: user?.agency,
            });
            return;
        }

        setUnitDialog({ open: true, report });
    }, [performRespond, user]);

    const selectUnit = useCallback((unitData) => {
        performRespond(unitDialog.report, unitData);
    }, [performRespond, unitDialog.report]);

    const openResolve = useCallback((report) => {
        if (!getIncidentCapabilities(user, report).canResolve) {
            toast.error('Only an assigned responder can resolve this incident.');
            return;
        }
        setResolveDialog({ open: true, report, resolutionNotes: '' });
    }, [user]);

    const confirmResolve = useCallback(async () => {
        const { report, resolutionNotes } = resolveDialog;
        if (!report || !report?._id || !getIncidentCapabilities(user, report).canResolve) return;

        setResolveLoading(true);
        try {
            const response = await adminAPI.resolveReport(report?._id, { resolutionNotes });
            const serverData = response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data) ? response.data.data : {};
            patchReport(report?._id, {
                ...serverData,
                status: 'resolved',
                resolutionNotes,
            });
            toast.success(response.data?.message || 'Incident resolved');
            setResolveDialog(closedResolve);
            if (onIncidentResolved) {
                onIncidentResolved({ ...report, ...serverData, status: 'resolved', resolutionNotes });
            } else {
                await refreshReports({ silent: true });
            }
        } catch (error) {
            toast.error(getApiError(error, 'Failed to resolve report'));
        } finally {
            setResolveLoading(false);
        }
    }, [onIncidentResolved, patchReport, refreshReports, resolveDialog, user]);

    const openTransfer = useCallback(async (report) => {
        if (!getIncidentCapabilities(user, report).canTransfer) {
            toast.error('Only administrators can transfer this incident.');
            return;
        }

        setReviewDialog(closedReview);
        setTransferDialog({ ...closedTransfer, open: true, report });
        if (municipalities.length > 0) return;

        try {
            const response = await reportsAPI.getMunicipalities();
            const data = response.data?.data;
            setMunicipalities(Array.isArray(data) ? data : []);
        } catch {
            toast.error('Failed to load neighboring municipalities');
        }
    }, [municipalities.length, user]);

    const confirmTransfer = useCallback(async () => {
        const { report, targetMunicipalityId, reason } = transferDialog;
        if (!report || !report?._id || !targetMunicipalityId || reason.trim().length < 10) return;

        if (!getIncidentCapabilities(user, report).canTransfer) {
            toast.error('Cannot transfer an incident with an ongoing response.');
            return;
        }

        setTransferLoading(true);
        try {
            const response = await adminAPI.transferReport(report?._id, {
                targetMunicipalityId,
                reason: reason.trim(),
            });
            const serverReport = response.data?.data;
            const municipalityName = (Array.isArray(municipalities) ? municipalities : []).find((item) => String(item?._id) === String(targetMunicipalityId))?.name;
            const updatedReport = {
                ...report,
                ...(serverReport && typeof serverReport === 'object' && !Array.isArray(serverReport) ? serverReport : {}),
                municipality: targetMunicipalityId,
                municipalityName: municipalityName || report?.municipalityName,
                status: 'transferred',
            };
            patchReport(report?._id, updatedReport);
            toast.success(response.data?.message || 'Report transferred successfully');
            setTransferDialog(closedTransfer);
            await refreshReports({ silent: true });
        } catch (error) {
            toast.error(getApiError(error, 'Failed to transfer report'));
        } finally {
            setTransferLoading(false);
        }
    }, [municipalities, patchReport, refreshReports, transferDialog]);

    const acknowledgeTransfer = useCallback(async (report) => {
        if (!getIncidentCapabilities(user, report).canAcknowledgeTransfer) {
            toast.error('Only the current target municipal administrator can acknowledge this transfer.');
            return;
        }
        if (!report?._id) return;

        setAcknowledgeLoadingId(report?._id);
        try {
            const response = await adminAPI.acknowledgeTransfer(report?._id);
            const serverData = response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data) ? response.data.data : {};
            patchReport(report?._id, serverData);
            toast.success(response.data?.message || 'Transfer acknowledged');
            await refreshReports({ silent: true });
        } catch (error) {
            toast.error(getApiError(error, 'Failed to acknowledge transfer'));
        } finally {
            setAcknowledgeLoadingId(null);
        }
    }, [patchReport, refreshReports, user]);

    const deleteReport = useCallback(async (report) => {
        if (!getIncidentCapabilities(user, report).canDelete) {
            toast.error('Only administrators can delete incident reports.');
            return;
        }
        if (!report?._id) return;
        if (!window.confirm('Are you sure you want to delete this report?')) return;

        setDeleteLoadingId(report?._id);
        try {
            await adminAPI.deleteReport(report?._id);
            removeReport(report?._id);
            closeDetails(report?._id);
            toast.success('Report deleted');
            await refreshReports({ silent: true });
        } catch (error) {
            toast.error(getApiError(error, 'Failed to delete report'));
        } finally {
            setDeleteLoadingId(null);
        }
    }, [closeDetails, refreshReports, removeReport, user]);

    const dismissReport = useCallback(async (report) => {
        if (!getIncidentCapabilities(user, report).canDismiss) {
            toast.error('Only the originating municipality can remove a transferred report from its queue.');
            return;
        }
        if (!report?._id) return;
        if (!window.confirm('Remove this transferred report from your queue? The owning municipality keeps full access.')) return;

        setDeleteLoadingId(report?._id);
        try {
            const response = await adminAPI.dismissReport(report?._id);
            removeReport(report?._id);
            closeDetails(report?._id);
            toast.success(response.data?.message || 'Report removed from your queue');
            await refreshReports({ silent: true });
        } catch (error) {
            toast.error(getApiError(error, 'Failed to remove report from queue'));
        } finally {
            setDeleteLoadingId(null);
        }
    }, [closeDetails, refreshReports, removeReport, user]);

    return {
        reviewDialog,
        setReviewDialog,
        closeReview: () => setReviewDialog(closedReview),
        confirmReview,
        reviewLoading,
        unitDialog,
        closeUnit: () => setUnitDialog({ open: false, report: null }),
        selectUnit,
        respondLoadingId,
        resolveDialog,
        setResolveDialog,
        closeResolve: () => setResolveDialog(closedResolve),
        confirmResolve,
        resolveLoading,
        transferDialog,
        setTransferDialog,
        closeTransfer: () => setTransferDialog(closedTransfer),
        confirmTransfer,
        transferLoading,
        municipalities,
        acknowledgeLoadingId,
        deleteLoadingId,
        openReview,
        openRespond,
        openResolve,
        openTransfer,
        acknowledgeTransfer,
        deleteReport,
        dismissReport,
    };
};

export default useIncidentActions;
