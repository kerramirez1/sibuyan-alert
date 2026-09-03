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
    const { subscribe, setUnreadCount, reconnectVersion } = useSocket();
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
        reconnectVersion,
        role: user?.role,
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

    const handleOpenReview = useCallback((report, status) => {
        reportState.setSelectedReport(report);
        actions.openReview(report, status);
    }, [actions, reportState]);

    const handleOpenTransfer = useCallback((report) => {
        reportState.setSelectedReport(report);
        actions.openTransfer(report);
    }, [actions, reportState]);

    const queueActions = useMemo(() => ({
        ...actions,
        openReview: handleOpenReview,
        openTransfer: handleOpenTransfer,
    }), [actions, handleOpenReview, handleOpenTransfer]);

    const openMap = useCallback((report) => {
        const coordinates = getCoordinates(report);
        if (!coordinates) return;
        reportState.setSelectedReport(null);
        const params = new URLSearchParams({
            view: 'map',
            report: String(report._id),
        });
        const returnView = RESPONDER_QUEUE_VIEWS[responderView];
        if (returnView) params.set('returnView', returnView);
        navigate(`/dashboard?${params.toString()}`);
    }, [navigate, reportState.setSelectedReport, responderView]);

    const changeResponderView = useCallback((view) => {
        const queryValue = RESPONDER_QUEUE_VIEWS[view];
        navigate(`/admin/reports${queryValue ? `?view=${queryValue}` : ''}`);
    }, [navigate]);

    const openImage = useCallback((image) => setViewerImage(image), []);

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1120px] overflow-x-hidden">
            <IncidentQueueControls
                role={user?.role}
                municipality={user?.assignedMunicipality}
                responderView={responderView}
                onResponderViewChange={changeResponderView}
                stats={reportState.stats}
                resultCount={reportState.pagination.total}
                lastUpdatedAt={reportState.lastUpdatedAt}
                status={reportState.status}
                setStatus={reportState.setStatus}
                searchDraft={reportState.searchDraft}
                setSearchDraft={reportState.setSearchDraft}
                appliedSearch={reportState.appliedSearch}
                applySearch={reportState.applySearch}
                clearFilters={reportState.clearFilters}
                onRefresh={() => reportState.refreshReports({ force: true })}
                loading={reportState.loading}
            />

            <IncidentQueue
                reports={reportState.visibleReports}
                loading={reportState.loading}
                error={reportState.error}
                onRetry={() => reportState.refreshReports({ force: true })}
                user={user}
                actions={queueActions}
                onInspect={reportState.inspectReport}
                responderView={responderView}
                pagination={reportState.pagination}
                onPageChange={reportState.setPage}
                selectedReportId={reportState.selectedReport?._id}
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
                item={typeof viewerImage === 'object' && viewerImage !== null ? viewerImage : null}
                imageSrc={typeof viewerImage === 'string' ? viewerImage : (viewerImage?.src || '')}
                alt="Incident evidence"
                onClose={() => setViewerImage(null)}
            />
        </div>
    );
};

export default AdminReportsPage;
