import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from '../router';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useIncidentReports from '../hooks/useIncidentReports';
import useIncidentActions from '../hooks/useIncidentActions';
import IncidentQueueControls from '../components/adminReports/IncidentQueueControls';
import IncidentQueue from '../components/adminReports/IncidentQueue';
import IncidentDetailsDrawer from '../components/adminReports/IncidentDetailsDrawer';
import IncidentActionDialogs from '../components/adminReports/IncidentActionDialogs';
import ImageViewer from '../components/ui/ImageViewer';
import { getCoordinates } from '../components/adminReports/incidentReportConfig';
import { notificationsAPI } from '../services/api';
import { normalizeNotificationId } from '../utils/notificationNavigation';

const AdminReportsPage = () => {
    const { user } = useAuth();
    const { subscribe, setUnreadCount } = useSocket();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [viewerImage, setViewerImage] = useState(null);
    const markedNotificationRef = useRef(new Set());
    const isDispatchQueueView = searchParams.get('view') === 'dispatch-queue';
    const initialStatus = searchParams.get('status') || '';
    const focusedReportId = normalizeNotificationId(searchParams.get('report'));
    const notificationId = normalizeNotificationId(searchParams.get('notification'));
    const highlightedUpdateId = normalizeNotificationId(searchParams.get('update'));
    const openedFromNotification = searchParams.get('source') === 'notification';

    const reportState = useIncidentReports({
        subscribe,
        isDispatchQueueView,
        initialStatus,
        focusedReportId,
    });

    useEffect(() => {
        if (!notificationId || !focusedReportId || reportState.selectedReport?._id !== focusedReportId) return;
        if (markedNotificationRef.current.has(notificationId)) return;
        markedNotificationRef.current.add(notificationId);

        notificationsAPI.markAsRead(notificationId)
            .then((response) => {
                const unreadCount = response.data?.data?.unreadCount;
                if (Number.isFinite(unreadCount)) setUnreadCount(unreadCount);
            })
            .catch((error) => {
                markedNotificationRef.current.delete(notificationId);
                console.error('Failed to mark opened incident notification as read:', error);
            });
    }, [focusedReportId, notificationId, reportState.selectedReport?._id, setUnreadCount]);

    const closeDetails = useCallback((reportId) => {
        const targetReportId = typeof reportId === 'string' ? reportId : null;
        reportState.setSelectedReport((current) => (
            !targetReportId || current?._id === targetReportId ? null : current
        ));
        if (focusedReportId && (!targetReportId || targetReportId === focusedReportId)) {
            const nextParams = new URLSearchParams(searchParams);
            ['report', 'source', 'notification', 'update'].forEach((key) => nextParams.delete(key));
            const nextQuery = nextParams.toString();
            navigate(`/admin/reports${nextQuery ? `?${nextQuery}` : ''}`, { replace: true });
        }
    }, [focusedReportId, navigate, reportState.setSelectedReport, searchParams]);

    const actions = useIncidentActions({
        user,
        patchReport: reportState.patchReport,
        removeReport: reportState.removeReport,
        refreshReports: reportState.refreshReports,
        closeDetails,
    });

    const queueActions = useMemo(() => ({
        openReview: actions.openReview,
        openRespond: actions.openRespond,
        openResolve: actions.openResolve,
        openTransfer: actions.openTransfer,
        acknowledgeTransfer: actions.acknowledgeTransfer,
        deleteReport: actions.deleteReport,
        respondLoadingId: actions.respondLoadingId,
        acknowledgeLoadingId: actions.acknowledgeLoadingId,
        deleteLoadingId: actions.deleteLoadingId,
    }), [
        actions.acknowledgeLoadingId,
        actions.acknowledgeTransfer,
        actions.deleteLoadingId,
        actions.deleteReport,
        actions.openRespond,
        actions.openResolve,
        actions.openReview,
        actions.openTransfer,
        actions.respondLoadingId,
    ]);

    const openMap = useCallback((report) => {
        const coordinates = getCoordinates(report);
        if (!coordinates) return;
        reportState.setSelectedReport(null);
        navigate(`/dashboard?view=map&lat=${coordinates.lat}&lng=${coordinates.lng}&zoom=16`);
    }, [navigate, reportState.setSelectedReport]);

    const openImage = useCallback((image) => setViewerImage(image), []);

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden">
            <IncidentQueueControls
                role={user?.role}
                municipality={user?.assignedMunicipality}
                isDispatchQueueView={isDispatchQueueView}
                stats={reportState.stats}
                resultCount={reportState.visibleReports.length}
                status={reportState.status}
                setStatus={reportState.setStatus}
                searchDraft={reportState.searchDraft}
                setSearchDraft={reportState.setSearchDraft}
                appliedSearch={reportState.appliedSearch}
                applySearch={reportState.applySearch}
                clearFilters={reportState.clearFilters}
                onRefresh={() => reportState.refreshReports()}
                loading={reportState.loading}
            />

            <IncidentQueue
                reports={reportState.visibleReports}
                loading={reportState.loading}
                error={reportState.error}
                onRetry={() => reportState.refreshReports()}
                user={user}
                actions={queueActions}
                onInspect={reportState.inspectReport}
                isDispatchQueueView={isDispatchQueueView}
            />

            <IncidentDetailsDrawer
                report={reportState.selectedReport}
                user={user}
                actions={queueActions}
                onClose={closeDetails}
                onOpenMap={openMap}
                onViewImage={openImage}
                highlightedUpdateId={highlightedUpdateId}
                openedFromNotification={openedFromNotification}
            />

            <IncidentActionDialogs
                actions={actions}
                municipality={user?.assignedMunicipality}
            />

            <ImageViewer
                isOpen={Boolean(viewerImage)}
                imageSrc={viewerImage}
                alt="Incident evidence"
                onClose={() => setViewerImage(null)}
            />
        </div>
    );
};

export default AdminReportsPage;
