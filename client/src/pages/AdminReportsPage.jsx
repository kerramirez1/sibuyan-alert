import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { adminAPI, reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import {
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineLocationMarker,
    HiOutlineLightningBolt,
    HiOutlineShieldCheck,
    HiOutlineBadgeCheck,
    HiOutlineGlobe,
    HiOutlineMap,
    HiOutlineSwitchHorizontal,
} from 'react-icons/hi';
import ImageViewer from '../components/ui/ImageViewer';
import MapView from '../components/map/MapView';
import ResponderUnitModal from '../components/ResponderUnitModal';

const AdminReportsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { subscribe } = useSocket();
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ status: '' });
    const [search, setSearch] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifyData, setVerifyData] = useState({ status: '', rejectionReason: '' });
    const [actionLoading, setActionLoading] = useState(false);
    const [respondLoading, setRespondLoading] = useState(null);
    // Resolve modal state
    const [resolveModalOpen, setResolveModalOpen] = useState(false);
    const [resolveNotes, setResolveNotes] = useState('');
    const [resolveLoading, setResolveLoading] = useState(false);
    const [showAll, setShowAll] = useState(false);

    // Transfer modal state
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({ targetMunicipalityId: '', reason: '' });
    const [transferLoading, setTransferLoading] = useState(false);
    const [municipalities, setMunicipalities] = useState([]);

    // Image viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);

    // Responder unit modal state
    const [unitModalOpen, setUnitModalOpen] = useState(false);
    const [respondingReportId, setRespondingReportId] = useState(null);

    const hasMunicipality = !!user?.assignedMunicipality;
    const isAdmin = ['admin', 'municipal_admin'].includes(user?.role);
    const isDispatchQueueView = searchParams.get('view') === 'dispatch-queue';

    useEffect(() => {
        fetchReports();
    }, [filter, showAll, isDispatchQueueView]);

    // Real-time: update report list when another responder claims a report
    useEffect(() => {
        const unsubRespond = subscribe('reportResponded', (data) => {
            setReports((prev) =>
                prev.map((r) =>
                    r._id === data.id
                        ? {
                            ...r,
                            status: 'responding',
                            respondedBy: data.respondedBy,
                            respondedAt: data.respondedAt,
                            responderAgency: data.respondedBy?.agency,
                        }
                        : r
                )
            );
        });

        const unsubResolve = subscribe('reportResolved', (data) => {
            setReports((prev) =>
                prev.map((r) =>
                    r._id === data.id
                        ? {
                            ...r,
                            status: 'resolved',
                            resolvedBy: data.resolvedBy,
                            resolvedAt: data.resolvedAt,
                            resolutionNotes: data.resolutionNotes,
                        }
                        : r
                )
            );
        });

        const unsubDelete = subscribe('reportDeleted', (data) => {
            setReports((prev) => prev.filter((r) => r._id !== data.id));
            // Refresh stats to keep counts accurate
            fetchReports();
        });

        const unsubTransferred = subscribe('reportTransferred', () => {
            fetchReports();
        });

        const unsubReporterUpdate = subscribe('reportUpdatedByReporter', (data) => {
            if (!data?.id || !data?.report?.reportUpdates) return;
            setReports((prev) =>
                prev.map((r) =>
                    r._id === data.id
                        ? { ...r, reportUpdates: data.report.reportUpdates }
                        : r
                )
            );
            setSelectedReport((prev) =>
                prev && prev._id === data.id
                    ? { ...prev, reportUpdates: data.report.reportUpdates }
                    : prev
            );
        });

        return () => {
            unsubRespond();
            unsubResolve();
            unsubDelete();
            unsubReporterUpdate();
            unsubTransferred();
        };
    }, [subscribe]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const params = {
                ...(isDispatchQueueView ? { status: 'verified' } : filter),
                search: search || undefined,
                ...(showAll ? { showAll: 'true' } : {}),
            };
            const response = await adminAPI.getReports(params);
            setReports(response.data.data.reports);
            setStats(response.data.data.stats);
        } catch (error) {
            console.error('Failed to fetch reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const openViewModal = (report) => {
        setSelectedReport(report);
        setViewModalOpen(true);
    };

    const openVerifyModal = (report, status) => {
        setSelectedReport(report);
        setVerifyData({ status, rejectionReason: '' });
        setVerifyModalOpen(true);
    };

    const openResolveModal = (report) => {
        setSelectedReport(report);
        setResolveNotes('');
        setResolveModalOpen(true);
    };

    const handleVerify = async () => {
        if (!selectedReport || !verifyData.status) return;

        setActionLoading(true);
        try {
            await adminAPI.verifyReport(selectedReport._id, {
                status: verifyData.status,
                rejectionReason: verifyData.rejectionReason, // Only used if rejected
            });

            toast.success(`Report ${verifyData.status} successfully`);
            setVerifyModalOpen(false);

            // If verified, reopen the view modal so user can immediately click Respond Now
            if (verifyData.status === 'verified') {
                setSelectedReport(prev => ({ ...prev, status: 'verified' }));
                setViewModalOpen(true);
            }

            fetchReports();
        } catch (error) {
            toast.error('Failed to update report status');
            console.error(error);
        } finally {
            setActionLoading(false);
        }
    };

    // Open unit selection modal (or auto-respond for agency-specific responders)
    const openUnitSelectionModal = (reportId) => {
        // Agency-specific responders bypass the unit modal — auto-respond with their account info
        if (user?.role === 'responder' && user?.agency) {
            handleUnitSelected({
                unitName: user.responderUnit || `${user.agency} - ${user.assignedMunicipality}`,
                unitType: user.agency,
            }, reportId);
            return;
        }
        setRespondingReportId(reportId);
        setUnitModalOpen(true);
    };

    // Handle unit selection and actual respond
    const handleUnitSelected = async (unitData, overrideReportId = null) => {
        const targetReportId = overrideReportId || respondingReportId;
        if (!targetReportId) return;

        setRespondLoading(targetReportId);
        try {
            const response = await adminAPI.respondToReport(targetReportId, {
                unitName: unitData.unitName,
                unitType: unitData.unitType,
            });
            toast.success(response.data.message, { duration: 4000 });

            // Refresh reports to get updated responders array
            fetchReports();

            if (viewModalOpen && selectedReport?._id === targetReportId) {
                setSelectedReport({ ...selectedReport, ...response.data.data });
            }
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to respond to report';
            if (error.response?.status === 409) {
            toast.error(msg, { duration: 5000 });
                fetchReports();
            } else {
                toast.error(msg);
            }
        } finally {
            setRespondLoading(null);
            setRespondingReportId(null);
        }
    };

    const handleResolve = async () => {
        if (!selectedReport) return;

        setResolveLoading(true);
        try {
            const response = await adminAPI.resolveReport(selectedReport._id, {
                resolutionNotes: resolveNotes,
            });

            toast.success(response.data.message, { duration: 4000 });
            setResolveModalOpen(false);

            // Update local state
            setReports((prev) =>
                prev.map((r) =>
                    r._id === selectedReport._id
                        ? {
                            ...r,
                            status: 'resolved',
                            resolvedBy: response.data.data.resolvedBy,
                            resolvedAt: response.data.data.resolvedAt,
                            resolutionNotes: resolveNotes,
                        }
                        : r
                )
            );

            // Close view modal if open
            if (viewModalOpen) {
                setViewModalOpen(false);
            }
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to resolve report';
            toast.error(msg);
        } finally {
            setResolveLoading(false);
        }
    };

    const openTransferModal = async (report) => {
        setSelectedReport(report);
        setTransferData({ targetMunicipalityId: '', reason: '' });
        setTransferModalOpen(true);

        if (municipalities.length === 0) {
            try {
                const response = await reportsAPI.getMunicipalities();
                setMunicipalities(response.data.data || []);
            } catch (error) {
                console.error('Failed to load municipalities:', error);
                toast.error('Failed to load neighboring municipalities');
            }
        }
    };

    const handleTransfer = async () => {
        if (!selectedReport || !transferData.targetMunicipalityId || !transferData.reason.trim()) return;

        if (transferData.reason.trim().length < 10) {
            toast.error('Transfer reason must be at least 10 characters long');
            return;
        }

        setTransferLoading(true);
        try {
            const response = await adminAPI.transferReport(selectedReport._id, {
                targetMunicipalityId: transferData.targetMunicipalityId,
                reason: transferData.reason,
            });

            toast.success(response.data.message || 'Report transferred successfully', { duration: 4000 });
            setTransferModalOpen(false);

            // Update local reports list
            setReports((prev) =>
                prev.map((r) =>
                    r._id === selectedReport._id
                        ? {
                            ...r,
                            municipality: transferData.targetMunicipalityId,
                            municipalityName: municipalities.find(m => m._id === transferData.targetMunicipalityId)?.name || r.municipalityName,
                            status: 'transferred',
                        }
                        : r
                )
            );

            // Close details modal if open
            if (viewModalOpen) {
                setViewModalOpen(false);
            }

            fetchReports();
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to transfer report';
            toast.error(msg);
        } finally {
            setTransferLoading(false);
        }
    };

    const handleDelete = async (reportId) => {
        if (!confirm('Are you sure you want to delete this report?')) return;

        try {
            await adminAPI.deleteReport(reportId);
            toast.success('Report deleted');
            fetchReports();
        } catch (error) {
            toast.error('Failed to delete report');
        }
    };

    const getAgencyLabel = (agency) => {
        if (!agency) return '';
        const labels = { MDRRMO: 'MDRRMO', PNP: 'PNP', SDH: 'Medical/SDH', BFP: 'BFP', LGU: 'MDRRMO' };
        return labels[agency] || agency;
    };

    const hasResponderAssigned = (report) => {
        const responderCount = Array.isArray(report.responders) ? report.responders.length : 0;
        return responderCount > 0 || Boolean(report.respondedBy);
    };

    const visibleReports = isDispatchQueueView
        ? reports.filter((report) =>
            report.status === 'transferred' ||
            (report.status === 'verified' && !hasResponderAssigned(report))
        )
        : reports;

    // Check if the current user is the assigned responder for a report
    const isAssignedResponder = (report) => {
        if (!user) return false;
        const currentUserId = (user._id || user.id)?.toString();
        const firstResponderId = report.respondedBy?._id || report.respondedBy;
        const isFirstResponder = firstResponderId?.toString() === currentUserId;
        const isJoinedResponder = report.responders?.some((entry) => {
            const responderId = entry.user?._id || entry.user;
            return responderId?.toString() === currentUserId;
        });
        return isFirstResponder || Boolean(isJoinedResponder);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'verified':
                return <span className="badge badge-verified">Verified</span>;
            case 'rejected':
                return <span className="badge badge-rejected">Rejected</span>;
            case 'responding':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Responding
                    </span>
                );
            case 'resolved':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        <HiOutlineBadgeCheck className="w-3.5 h-3.5" />
                        Resolved
                    </span>
                );
            default:
                return <span className="badge badge-pending">Pending</span>;
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'bg-red-800';
            case 'severe': return 'bg-danger-500';
            case 'moderate': return 'bg-accent-500';
            case 'minor': return 'bg-success-500';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">
                            {isDispatchQueueView ? 'Dispatch Queue' : 'Incident Reports'}
                            {hasMunicipality && (
                                <span className="text-gray-500 text-lg font-normal"> · {showAll ? 'All Sibuyan' : user.assignedMunicipality}</span>
                            )}
                        </h1>
                        <p className="text-gray-600">
                            {isDispatchQueueView
                                ? 'Verified incidents waiting for responder assignment'
                                : 'Review, verify, respond to, and resolve incident reports'}
                        </p>
                    </div>
                    {hasMunicipality && (
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm border shrink-0 ${showAll
                                ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700 shadow-brand-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                }`}
                        >
                            <HiOutlineGlobe className="w-4.5 h-4.5" />
                            {showAll ? 'Viewing: All Sibuyan' : 'View All Sibuyan'}
                        </button>
                    )}
                </div>

                {/* Stats */}
                {stats && (
                    <div className={`grid grid-cols-2 md:grid-cols-3 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-6`}>
                        <div className="card bg-gray-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                            <p className="text-sm text-gray-500">Total Reports</p>
                        </div>
                        {isAdmin && (
                            <div className="card bg-accent-50 flex flex-col justify-center">
                                <p className="text-2xl font-bold text-accent-600">{stats.pending}</p>
                                <p className="text-sm text-gray-500">Pending</p>
                            </div>
                        )}
                        <div className="card bg-success-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-success-600">{stats.verified}</p>
                            <p className="text-sm text-gray-500">Verified</p>
                        </div>
                        <div className="card bg-blue-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-blue-600">{stats.responding || 0}</p>
                            <p className="text-sm text-gray-500">Responding</p>
                        </div>
                        <div className="card bg-emerald-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-emerald-600">{stats.resolved || 0}</p>
                            <p className="text-sm text-gray-500">Resolved</p>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="card mb-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by address or description..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchReports()}
                                    className="input pl-10"
                                />
                            </div>
                        </div>
                        {isDispatchQueueView ? (
                            <div className="w-full sm:w-auto px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold border border-blue-100">
                                Filter: Verified + No Responder
                            </div>
                        ) : (
                            <select
                                value={filter.status}
                                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                                className="input w-full sm:w-auto"
                            >
                                <option value="">All Status</option>
                                {isAdmin && <option value="pending">Pending</option>}
                                <option value="verified">Verified</option>
                                <option value="responding">Responding</option>
                                <option value="resolved">Resolved</option>
                                {isAdmin && <option value="rejected">Rejected</option>}
                            </select>
                        )}
                    </div>
                </div>

                {/* Reports Table */}
                <div className="card p-0">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Location</th>
                                    <th>Reporter</th>
                                    <th>Severity</th>
                                    <th>Status</th>
                                    <th>Responder</th>
                                    <th>Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8">
                                            <div className="spinner mx-auto" />
                                        </td>
                                    </tr>
                                ) : visibleReports.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-gray-500">
                                            {isDispatchQueueView
                                                ? 'No verified incidents waiting for dispatch'
                                                : 'No reports found'}
                                        </td>
                                    </tr>
                                ) : (
                                    visibleReports.map((report) => (
                                        <tr key={report._id}>
                                            <td>
                                                <div className="flex items-start gap-2">
                                                    <HiOutlineLocationMarker className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                                                    <div>
                                                        <p className="font-medium text-gray-900 line-clamp-1 max-w-[200px]">
                                                            {report.address}
                                                        </p>
                                                        <p className="text-xs text-gray-500 line-clamp-1">
                                                            {report.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                                                        <span className="text-xs font-semibold text-primary-700">
                                                            {report.reporter?.name?.charAt(0) || '?'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{report.reporter?.name}</p>
                                                        {report.reporter?.isVerified && (
                                                            <span className="text-xs text-success-600">✓ Verified</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white ${getSeverityColor(report.severity)}`}>
                                                    {report.severity}
                                                </span>
                                            </td>
                                            <td>{getStatusBadge(report.status)}</td>
                                            <td>
                                                {report.respondedBy ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${report.status === 'resolved' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                                                            {report.status === 'resolved'
                                                                ? <HiOutlineBadgeCheck className="w-4 h-4 text-emerald-600" />
                                                                : <HiOutlineShieldCheck className="w-4 h-4 text-blue-600" />
                                                            }
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-gray-800">
                                                                {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {report.respondedBy?.name || 'Assigned'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="text-gray-500 text-sm">
                                                {formatDistanceToNow(new Date(report.incidentTime || report.accidentTime), { addSuffix: true })}
                                            </td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => openViewModal(report)}
                                                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg"
                                                        title="View Details"
                                                    >
                                                        <HiOutlineEye className="w-5 h-5" />
                                                    </button>

                                                    {/* RESPOND BUTTON — verified and responding reports (non-exclusive) */}
                                                    {user?.role === 'responder' && ['verified', 'transferred', 'responding'].includes(report.status) && (
                                                        <button
                                                            onClick={() => openUnitSelectionModal(report._id)}
                                                            disabled={respondLoading === report._id}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-wait"
                                                            title="Respond to this report"
                                                        >
                                                            {respondLoading === report._id ? (
                                                                <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                                                            ) : (
                                                                <HiOutlineLightningBolt className="w-5 h-5" />
                                                            )}
                                                        </button>
                                                    )}

                                                    {/* RESOLVE BUTTON — only the assigned responder can resolve */}
                                                    {report.status === 'responding' && isAssignedResponder(report) && (
                                                        <button
                                                            onClick={() => openResolveModal(report)}
                                                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                            title="Mark as Resolved"
                                                        >
                                                            <HiOutlineBadgeCheck className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    {['pending', 'transferred'].includes(report.status) && isAdmin && (
                                                        <>
                                                            <button
                                                                onClick={() => openVerifyModal(report, 'verified')}
                                                                className="p-2 text-success-600 hover:bg-success-50 rounded-lg"
                                                                title="Verify"
                                                            >
                                                                <HiOutlineCheckCircle className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => openVerifyModal(report, 'rejected')}
                                                                className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg"
                                                                title="Reject"
                                                            >
                                                                <HiOutlineXCircle className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {isAdmin && ['verified', 'responding', 'transferred'].includes(report.status) && (
                                                        <button
                                                            onClick={() => openTransferModal(report)}
                                                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                                                            title="Transfer Incident"
                                                        >
                                                            <HiOutlineSwitchHorizontal className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleDelete(report._id)}
                                                            className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg hover:text-danger-600"
                                                            title="Delete"
                                                        >
                                                            <HiOutlineTrash className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </motion.div>

            {/* View Modal */}
            <Modal
                isOpen={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                title="Report Details"
                size="lg"
            >
                {selectedReport && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Location</p>
                                <p className="font-medium">{selectedReport.address}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Coordinates</p>
                                <p className="font-medium">
                                    {selectedReport.coordinates.lat.toFixed(6)}, {selectedReport.coordinates.lng.toFixed(6)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Incident Time</p>
                                <p className="font-medium">
                                    {format(new Date(selectedReport.incidentTime || selectedReport.accidentTime), 'PPpp')}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Submitted</p>
                                <p className="font-medium">
                                    {formatDistanceToNow(new Date(selectedReport.createdAt), { addSuffix: true })}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Type</p>
                                <p className="font-medium capitalize">{selectedReport.incidentType || selectedReport.accidentType}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Severity</p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white ${getSeverityColor(selectedReport.severity)}`}>
                                    {selectedReport.severity}
                                </span>
                            </div>
                        </div>

                        {/* Pinned Location Map */}
                        <div className="relative">
                            <p className="text-sm text-gray-500 mb-2 font-semibold text-brand-900">Pinned Location</p>
                            <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-100 shadow-2xl shadow-gray-200/50 relative group">
                                <MapView
                                    reports={[selectedReport]}
                                    // When viewing a specific report in the modal, we force it to show regardless of status
                                    showPending={true}
                                    focusLocation={{
                                        lat: selectedReport.coordinates.lat,
                                        lng: selectedReport.coordinates.lng,
                                        zoom: 16
                                    }}
                                    className="h-full w-full"
                                />
                                <div className="absolute top-4 right-4 z-10">
                                    <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-xl border border-white/20 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                        <span className="text-[10px] font-black text-gray-800 uppercase tracking-tight">Incident Location</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p className="text-sm text-gray-500 mb-1">Description</p>
                            <p className="text-gray-700 bg-gray-50 rounded-xl p-4">
                                {selectedReport.description}
                            </p>
                        </div>

                        {Array.isArray(selectedReport.reportUpdates) && selectedReport.reportUpdates.length > 0 && (
                            <div className="p-4 border border-blue-100 bg-blue-50/40 rounded-xl">
                                <p className="text-sm font-semibold text-blue-900 mb-3">Reporter Updates</p>
                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {selectedReport.reportUpdates
                                        .slice()
                                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                        .map((item, idx) => (
                                            <div key={`${item.createdAt}-${idx}`} className="bg-white border border-blue-100 rounded-lg p-3">
                                                <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                                                    <span className="font-semibold text-blue-900">{item.author?.name || 'Reporter'}</span>
                                                    {item.tag && (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                            {item.tag.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                    <span className="text-gray-500">
                                                        {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : ''}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-700 break-words">{item.message}</p>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Responder Info */}
                        {selectedReport.respondedBy && (
                            <div className={`p-4 border rounded-xl ${selectedReport.status === 'resolved' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedReport.status === 'resolved' ? 'bg-emerald-200' : 'bg-blue-200'}`}>
                                        {selectedReport.status === 'resolved'
                                            ? <HiOutlineBadgeCheck className="w-5 h-5 text-emerald-700" />
                                            : <HiOutlineShieldCheck className="w-5 h-5 text-blue-700" />
                                        }
                                    </div>
                                    <div>
                                        <p className={`text-sm font-bold ${selectedReport.status === 'resolved' ? 'text-emerald-900' : 'text-blue-900'}`}>
                                            {selectedReport.status === 'resolved' ? 'Resolved' : 'Responding'} — {getAgencyLabel(selectedReport.respondedBy?.agency || selectedReport.responderAgency)}
                                        </p>
                                        <p className={`text-xs ${selectedReport.status === 'resolved' ? 'text-emerald-700' : 'text-blue-700'}`}>
                                            {selectedReport.respondedBy?.name}
                                            {selectedReport.respondedAt && (
                                                <> · Responded {formatDistanceToNow(new Date(selectedReport.respondedAt), { addSuffix: true })}</>
                                            )}
                                            {selectedReport.resolvedAt && (
                                                <> · Resolved {formatDistanceToNow(new Date(selectedReport.resolvedAt), { addSuffix: true })}</>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {selectedReport.resolutionNotes && (
                                    <div className="mt-3 pt-3 border-t border-emerald-200">
                                        <p className="text-xs font-semibold text-emerald-800 mb-1">Resolution Notes:</p>
                                        <p className="text-sm text-emerald-700">{selectedReport.resolutionNotes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedReport.images?.length > 0 && (
                            <div>
                                <p className="text-sm text-gray-500 mb-2">Photos</p>
                                <div className="grid grid-cols-3 gap-3">
                                    {selectedReport.images.map((img, i) => (
                                        <div
                                            key={i}
                                            className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-zoom-in relative group"
                                            onClick={() => {
                                                setViewerImage(img);
                                                setViewerOpen(true);
                                            }}
                                        >
                                            <img
                                                src={img}
                                                alt={`Photo ${i + 1}`}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                <HiOutlineEye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t flex flex-nowrap items-center justify-between gap-2 overflow-x-auto hide-scrollbar">
                            <div className="flex items-center gap-2 shrink-0">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setViewModalOpen(false);
                                        navigate(`/dashboard?view=map&lat=${selectedReport.coordinates.lat}&lng=${selectedReport.coordinates.lng}&zoom=16`);
                                    }}
                                    className="flex items-center gap-1.5"
                                >
                                    <HiOutlineMap className="w-4 h-4" />
                                    Map
                                </Button>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {user?.role === 'responder' && ['verified', 'transferred', 'responding'].includes(selectedReport.status) && (
                                    <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 flex items-center gap-1.5"
                                        onClick={() => {
                                            setViewModalOpen(false);
                                            openUnitSelectionModal(selectedReport._id);
                                        }}
                                        loading={respondLoading === selectedReport._id}
                                    >
                                        <HiOutlineLightningBolt className="w-4 h-4" />
                                        {selectedReport.status === 'responding' ? 'Join' : 'Respond'}
                                    </Button>
                                )}

                                {selectedReport.status === 'responding' && isAssignedResponder(selectedReport) && (
                                    <Button
                                        size="sm"
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25 flex items-center gap-1.5"
                                        onClick={() => {
                                            setViewModalOpen(false);
                                            openResolveModal(selectedReport);
                                        }}
                                    >
                                        <HiOutlineBadgeCheck className="w-4 h-4" />
                                        Resolve
                                    </Button>
                                )}

                                {isAdmin && ['verified', 'responding', 'transferred'].includes(selectedReport.status) && (
                                    <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/25 flex items-center gap-1.5"
                                        onClick={() => {
                                            setViewModalOpen(false);
                                            openTransferModal(selectedReport);
                                        }}
                                    >
                                        <HiOutlineSwitchHorizontal className="w-4 h-4" />
                                        Transfer
                                    </Button>
                                )}

                                {['pending', 'transferred'].includes(selectedReport.status) && isAdmin && (
                                    <>
                                         <Button
                                             size="sm"
                                             variant="success"
                                             onClick={() => {
                                                 setViewModalOpen(false);
                                                 openVerifyModal(selectedReport, 'verified');
                                             }}
                                             className="flex items-center gap-1.5"
                                         >
                                             <HiOutlineCheckCircle className="w-4 h-4" />
                                             Verify
                                         </Button>
                                         <Button
                                             size="sm"
                                             variant="danger"
                                             onClick={() => {
                                                 setViewModalOpen(false);
                                                 openVerifyModal(selectedReport, 'rejected');
                                             }}
                                             className="flex items-center gap-1.5"
                                         >
                                             <HiOutlineXCircle className="w-4 h-4" />
                                             Reject
                                         </Button>
                                     </>
                                 )}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Verify Modal */}
            <Modal
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                title={`${verifyData.status === 'verified' ? 'Verify' : 'Reject'} Report`}
                size="md"
            >
                {selectedReport && (
                    <div>
                        <div className="p-4 bg-gray-50 rounded-xl mb-6">
                            <p className="font-medium text-gray-900 mb-1">{selectedReport.address}</p>
                            <p className="text-sm text-gray-500">{selectedReport.description}</p>
                        </div>

                        {verifyData.status === 'rejected' && (
                            <div className="mb-6">
                                <label className="label">Rejection Reason (Required)</label>
                                <textarea
                                    value={verifyData.rejectionReason}
                                    onChange={(e) => setVerifyData({ ...verifyData, rejectionReason: e.target.value })}
                                    placeholder="Please provide a reason for rejection..."
                                    rows={3}
                                    className="input resize-none"
                                />
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => setVerifyModalOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant={verifyData.status === 'verified' ? 'success' : 'danger'}
                                onClick={handleVerify}
                                loading={actionLoading}
                                disabled={verifyData.status === 'rejected' && !verifyData.rejectionReason.trim()}
                                className="flex-1"
                            >
                                {verifyData.status === 'verified' ? 'Verify Report' : 'Reject Report'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Resolve Modal */}
            <Modal
                isOpen={resolveModalOpen}
                onClose={() => setResolveModalOpen(false)}
                title="Resolve Report"
                size="md"
            >
                {selectedReport && (
                    <div>
                        <div className="p-4 bg-gray-50 rounded-xl mb-4">
                            <p className="font-medium text-gray-900 mb-1">{selectedReport.address}</p>
                            <p className="text-sm text-gray-500 line-clamp-2">{selectedReport.description}</p>
                        </div>

                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
                            <div className="flex items-center gap-2 mb-2">
                                <HiOutlineBadgeCheck className="w-5 h-5 text-emerald-600" />
                                <p className="text-sm font-bold text-emerald-800">Mark this incident as resolved</p>
                            </div>
                            <p className="text-xs text-emerald-700">
                                This will notify the reporter that the incident has been addressed and close the report.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="label">Resolution Notes (Optional)</label>
                            <textarea
                                value={resolveNotes}
                                onChange={(e) => setResolveNotes(e.target.value)}
                                placeholder="Describe how the incident was resolved (e.g., 'Vehicles cleared, no injuries reported')..."
                                rows={4}
                                className="input resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => setResolveModalOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={handleResolve}
                                loading={resolveLoading}
                            >
                                <HiOutlineBadgeCheck className="w-5 h-5" />
                                Confirm Resolved
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Responder Unit Selection Modal */}
            <ResponderUnitModal
                isOpen={unitModalOpen}
                onClose={() => {
                    setUnitModalOpen(false);
                    setRespondingReportId(null);
                }}
                onSelect={handleUnitSelected}
                municipality={user?.assignedMunicipality || 'Cajidiocan'}
            />

            {/* Transfer Modal */}
            <Modal
                isOpen={transferModalOpen}
                onClose={() => setTransferModalOpen(false)}
                title="Transfer Incident Report"
                size="md"
            >
                {selectedReport && (
                    <div>
                        <div className="p-4 bg-gray-50 rounded-xl mb-4">
                            <p className="font-semibold text-gray-900 mb-1">Current Jurisdiction:</p>
                            <p className="text-sm text-gray-700 mb-2">{selectedReport.municipalityName || 'None'}</p>
                            <p className="font-semibold text-gray-900 mb-1">Incident Address:</p>
                            <p className="text-sm text-gray-600 line-clamp-2">{selectedReport.address}</p>
                        </div>

                        <div className="mb-4">
                            <label className="label">Target Municipality (Mutual Aid partner)</label>
                            <select
                                value={transferData.targetMunicipalityId}
                                onChange={(e) => setTransferData({ ...transferData, targetMunicipalityId: e.target.value })}
                                className="input"
                            >
                                <option value="">Select neighboring municipality...</option>
                                {municipalities
                                    .filter(m => {
                                        const currentMuniId = selectedReport.municipality?._id || selectedReport.municipality;
                                        return m._id !== currentMuniId;
                                    })
                                    .map(m => (
                                        <option key={m._id} value={m._id}>{m.name}</option>
                                    ))
                                }
                            </select>
                        </div>

                        <div className="mb-6">
                            <label className="label">Reason for Transfer (Min 10 characters)</label>
                            <textarea
                                value={transferData.reason}
                                onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
                                placeholder="e.g., Incident is closer to Magdiwang station; boundary road access..."
                                rows={4}
                                className="input resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => setTransferModalOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={handleTransfer}
                                loading={transferLoading}
                                disabled={!transferData.targetMunicipalityId || transferData.reason.trim().length < 10}
                            >
                                <HiOutlineSwitchHorizontal className="w-5 h-5" />
                                Confirm Transfer
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <ImageViewer
                isOpen={viewerOpen}
                imageSrc={viewerImage}
                onClose={() => {
                    setViewerOpen(false);
                    setViewerImage(null);
                }}
            />
        </div>
    );
};

export default AdminReportsPage;
