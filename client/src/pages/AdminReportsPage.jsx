import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from '../router';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import useIncidentReports from '../hooks/useIncidentReports';
import useIncidentActions from '../hooks/useIncidentActions';
import useOperationalIncidentDetails from '../hooks/useOperationalIncidentDetails';
import IncidentQueueControls from '../components/adminReports/IncidentQueueControls';
import IncidentQueue from '../components/adminReports/IncidentQueue';
import IncidentDetailsDrawer from '../components/adminReports/IncidentDetailsDrawer';
import IncidentActionDialogs from '../components/adminReports/IncidentActionDialogs';
import ImageViewer from '../components/ui/ImageViewer';
import {
    getCoordinates,
    getResponderViewFromQuery,
    RESPONDER_QUEUE_VIEWS,
} from '../components/adminReports/incidentReportConfig';
import { notificationsAPI } from '../services/api';
import { normalizeNotificationId } from '../utils/notificationNavigation';

const AdminReportsPage = () => {
    const { user } = useAuth();
    const { subscribe, setUnreadCount } = useSocket();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [viewerImage, setViewerImage] = useState(null);
    const markedNotificationRef = useRef(new Set());
    const responderView = user?.role === 'responder'
        ? getResponderViewFromQuery(searchParams.get('view'))
        : 'all';
    const initialStatus = searchParams.get('status') || '';
    const focusedReportId = normalizeNotificationId(searchParams.get('report'));
    const notificationId = normalizeNotificationId(searchParams.get('notification'));
    const highlightedUpdateId = normalizeNotificationId(searchParams.get('update'));
    const openedFromNotification = searchParams.get('source') === 'notification';

    const reportState = useIncidentReports({
        subscribe,
        responderView,
        initialStatus,
        focusedReportId,
    });
    const detailState = useOperationalIncidentDetails(reportState.selectedReport, user?.role);

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

    const openResponderReport = useCallback((view, report) => {
        if (user?.role !== 'responder' || !report?._id) return;
        const params = new URLSearchParams({
            view: RESPONDER_QUEUE_VIEWS[view],
            report: String(report._id),
        });
        navigate(`/admin/reports?${params.toString()}`);
    }, [navigate, user?.role]);
    const handleResponseStarted = useCallback(
        (report) => openResponderReport('active', report),
        [openResponderReport],
    );
    const handleIncidentResolved = useCallback(
        (report) => openResponderReport('history', report),
        [openResponderReport],
    );

    const actions = useIncidentActions({
        user,
        patchReport: reportState.patchReport,
        removeReport: reportState.removeReport,
        refreshReports: reportState.refreshReports,
        closeDetails,
        onResponseStarted: handleResponseStarted,
        onIncidentResolved: handleIncidentResolved,
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
        const params = new URLSearchParams({
            view: 'map',
            lat: String(coordinates.lat),
            lng: String(coordinates.lng),
            zoom: '16',
            pitch: '0',
            bearing: '0',
            delay: '500',
            duration: '1600',
            focus: `${report._id}-${Date.now()}`,
            report: String(report._id),
            returnView: RESPONDER_QUEUE_VIEWS[responderView] || '',
        });
        navigate(`/dashboard?${params.toString()}`);
    }, [navigate, reportState.setSelectedReport, responderView]);

    const changeResponderView = useCallback((view) => {
        const queryValue = RESPONDER_QUEUE_VIEWS[view];
        navigate(`/admin/reports${queryValue ? `?view=${queryValue}` : ''}`);
    }, [navigate]);

    const openImage = useCallback((image) => setViewerImage(image), []);

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden">
            <IncidentQueueControls
                role={user?.role}
                municipality={user?.assignedMunicipality}
                responderView={responderView}
                onResponderViewChange={changeResponderView}
                stats={reportState.stats}
                resultCount={reportState.pagination.total}
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
                responderView={responderView}
                pagination={reportState.pagination}
                onPageChange={reportState.setPage}
            />

            <IncidentDetailsDrawer
                report={detailState.report}
                user={user}
                actions={queueActions}
                onClose={closeDetails}
                onOpenMap={openMap}
                onViewImage={openImage}
                detailLoading={detailState.loading}
                detailError={detailState.error}
                detailRestricted={detailState.restricted}
                onRetryDetails={detailState.retry}
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
