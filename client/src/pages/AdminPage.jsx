import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { adminAPI, analyticsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineUsers,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineArrowRight,
    HiOutlineTrendingUp,
    HiOutlineLocationMarker,
    HiOutlineGlobe,
} from 'react-icons/hi';

const ReportLogoIcon = ({ className = 'w-6 h-6' }) => (
    <img src="/icons/report.logo.png" alt="Report icon" className={`${className} object-contain`} />
);

const AdminPage = () => {
    const { user, updateUser } = useAuth();
    const { subscribe } = useSocket();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [dutyUpdating, setDutyUpdating] = useState(false);

    const hasMunicipality = !!user?.assignedMunicipality;

    useEffect(() => {
        if (!user) return;

        if (user.role === 'responder') {
            fetchOnlineUsers();
            return;
        }

        fetchDashboardStats();
        fetchOnlineUsers();
    }, [showAll, user?.role, user?.assignedMunicipality]);

    // Fetch online users
    const fetchOnlineUsers = async () => {
        try {
            const params = showAll ? {} : (user?.assignedMunicipality ? { municipality: user.assignedMunicipality } : {});
            const response = await adminAPI.getOnlineUsers(params);
            setOnlineUsers(response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch online users:', error);
        }
    };

    // Re-fetch dashboard stats when a report is deleted, verified, responded, or resolved
    useEffect(() => {
        const unsub1 = subscribe('reportDeleted', () => {
            fetchDashboardStats();
        });
        const unsub2 = subscribe('reportVerified', () => {
            fetchDashboardStats();
        });
        const unsub3 = subscribe('reportResponded', () => {
            fetchDashboardStats();
        });
        const unsub4 = subscribe('reportResolved', () => {
            fetchDashboardStats();
        });
        const unsub8 = subscribe('reportUpdatedByReporter', () => {
            fetchDashboardStats();
        });
        const unsub5 = subscribe('userOnline', () => { fetchOnlineUsers(); });
        const unsub6 = subscribe('userOffline', () => { fetchOnlineUsers(); });
        const unsub7 = subscribe('onlineUsersUpdate', () => { fetchOnlineUsers(); });
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); };
    }, [subscribe]);

    const fetchDashboardStats = async () => {
        if (user?.role === 'responder') {
            return;
        }

        try {
            const params = showAll ? { showAll: 'true' } : {};
            const response = await analyticsAPI.getAdmin(params);
            setStats(response.data.data);
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleDutyStatus = async () => {
        if (!user || user.role !== 'responder') return;
        setDutyUpdating(true);
        try {
            const response = await adminAPI.updateMyDutyStatus({ isOnDuty: !(user.isOnDuty !== false) });
            updateUser({ ...user, isOnDuty: response.data.data.isOnDuty });
            fetchOnlineUsers();
        } catch (error) {
            console.error('Failed to update duty status:', error);
        } finally {
            setDutyUpdating(false);
        }
    };

    // Responders don't have access to dashboard stats - redirect to reports
    if (user?.role === 'responder') {
        return (
            <div>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                        <div>
                            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">
                                Responder Dashboard
                                {user?.assignedMunicipality && <span className="text-gray-500 text-lg font-normal"> · {user.assignedMunicipality}</span>}
                            </h1>
                            <p className="text-gray-600">
                                Coordinate emergency response and manage incident reports.
                            </p>
                        </div>
                        <button
                            onClick={handleToggleDutyStatus}
                            disabled={dutyUpdating}
                            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${user?.isOnDuty !== false
                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                } ${dutyUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {dutyUpdating ? 'Updating...' : user?.isOnDuty !== false ? 'On Duty' : 'Off Duty'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        <Link
                            to="/admin/reports"
                            className="card-hover block ring-2 ring-brand-500 ring-offset-2"
                        >
                            <div className="flex items-start justify-between">
                                <div className="stat-icon bg-gradient-to-br from-primary-500 to-primary-700">
                                    <ReportLogoIcon className="w-5 h-5" />
                                </div>
                                <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">
                                    View & Respond
                                </span>
                            </div>
                            <p className="text-xl font-bold text-gray-900 mt-4 mb-1">
                                Incident Reports
                            </p>
                            <p className="text-sm text-gray-500">View, respond to, and resolve incident reports</p>
                        </Link>
                        <Link
                            to="/dashboard?view=map"
                            className="card-hover block"
                        >
                            <div className="flex items-start justify-between">
                                <div className="stat-icon bg-gradient-to-br from-success-500 to-success-700">
                                    <HiOutlineLocationMarker className="w-6 h-6" />
                                </div>
                            </div>
                            <p className="text-xl font-bold text-gray-900 mt-4 mb-1">
                                Safety Awareness Map
                            </p>
                            <p className="text-sm text-gray-500">View incidents and high-risk zones on the map</p>
                        </Link>
                    </div>

                    {/* Active Now — Responder View */}
                    {onlineUsers.length > 0 && (
                        <div className="card">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                                <h2 className="text-lg font-semibold text-gray-900">Active Now</h2>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                    {onlineUsers.length} online
                                </span>
                            </div>
                            <div className="space-y-2">
                                {onlineUsers.map((activeUser) => (
                                    <div
                                        key={activeUser.userId}
                                        className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100"
                                    >
                                        <div className="relative">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm ${activeUser.role === 'responder' ? 'bg-gradient-to-br from-orange-500 to-orange-700' :
                                                activeUser.role === 'municipal_admin' ? 'bg-gradient-to-br from-blue-500 to-blue-700' :
                                                    'bg-gradient-to-br from-gray-400 to-gray-600'
                                                }`}>
                                                {activeUser.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{activeUser.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${activeUser.role === 'responder' ? 'bg-orange-100 text-orange-700' :
                                                    activeUser.role === 'municipal_admin' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {activeUser.role === 'municipal_admin' ? 'mun. admin' : activeUser.role}
                                                </span>
                                                {activeUser.role === 'responder' && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${activeUser.isOnDuty !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
                                                        }`}>
                                                        {activeUser.isOnDuty !== false ? 'On Duty' : 'Off Duty'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="spinner" />
            </div>
        );
    }

    const statCards = [
        {
            title: 'Total Users',
            value: stats?.users.total || 0,
            icon: HiOutlineUsers,
            color: 'from-primary-500 to-primary-700',
            link: '/admin/users',
        },
        {
            title: 'Pending Verifications',
            value: stats?.users.pendingVerifications || 0,
            icon: HiOutlineClock,
            color: 'from-accent-500 to-accent-700',
            link: '/admin/users?status=pending',
            highlight: true,
        },
        {
            title: 'Total Reports',
            value: stats?.reports.total || 0,
            iconSrc: '/icons/report.logo.png',
            color: 'from-success-500 to-success-700',
            link: '/admin/reports',
        },
        {
            title: 'Pending Reports',
            value: stats?.reports.pending || 0,
            icon: HiOutlineExclamation,
            color: 'from-danger-500 to-danger-700',
            link: '/admin/reports?status=pending',
            highlight: true,
        },
        {
            title: 'High-Risk Zones',
            value: 'Manage',
            icon: HiOutlineLocationMarker,
            color: 'from-orange-500 to-red-600',
            link: '/admin/zones',
            isAction: true,
        },
    ];

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">
                            Responder Dashboard
                            {user?.agency && <span className="text-brand-600"> — {user.agency === 'LGU' ? 'MDRRMO' : user.agency}</span>}
                            {user?.assignedMunicipality && <span className="text-gray-500 text-lg font-normal"> · {showAll ? 'All Sibuyan' : user.assignedMunicipality}</span>}
                        </h1>
                        <p className="text-gray-600">
                            Manage reports, verify reporters, and coordinate emergency response.
                        </p>
                    </div>
                    {hasMunicipality && (
                        <button
                            onClick={() => { setLoading(true); setShowAll(!showAll); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm border ${showAll
                                ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700 shadow-brand-500/25'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                }`}
                        >
                            <HiOutlineGlobe className="w-4.5 h-4.5" />
                            {showAll ? 'Viewing: All Sibuyan' : 'View All Sibuyan'}
                        </button>
                    )}
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {statCards.map((stat, index) => (
                        <motion.div
                            key={stat.title}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Link
                                to={stat.link}
                                className={`card-hover block ${stat.highlight && stat.value > 0 ? 'ring-2 ring-accent-500 ring-offset-2' : ''}`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`stat-icon bg-gradient-to-br ${stat.color}`}>
                                        {stat.iconSrc ? (
                                            <ReportLogoIcon className="w-5 h-5" />
                                        ) : (
                                            <stat.icon className="w-6 h-6" />
                                        )}
                                    </div>
                                    {stat.highlight && stat.value > 0 && (
                                        <span className="px-2 py-0.5 bg-accent-100 text-accent-700 text-xs font-semibold rounded-full">
                                            Action needed
                                        </span>
                                    )}
                                </div>
                                <p className="text-3xl font-bold text-gray-900 mt-4 mb-1">
                                    {stat.value}
                                </p>
                                <p className="text-sm text-gray-500">{stat.title}</p>
                            </Link>
                        </motion.div>
                    ))}
                </div>

                {/* Active Users Section */}
                {onlineUsers.length > 0 && (
                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                                <h2 className="text-lg font-semibold text-gray-900">Active Now</h2>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                    {onlineUsers.length} online
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {onlineUsers.map((activeUser) => (
                                <div
                                    key={activeUser.userId}
                                    className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all"
                                >
                                    <div className="relative">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${activeUser.role === 'admin' ? 'bg-gradient-to-br from-red-500 to-red-700' :
                                            activeUser.role === 'municipal_admin' ? 'bg-gradient-to-br from-blue-500 to-blue-700' :
                                                activeUser.role === 'responder' ? 'bg-gradient-to-br from-orange-500 to-orange-700' :
                                                    activeUser.role === 'reporter' ? 'bg-gradient-to-br from-purple-500 to-purple-700' :
                                                        'bg-gradient-to-br from-gray-400 to-gray-600'
                                            }`}>
                                            {activeUser.avatar ? (
                                                <img src={activeUser.avatar} alt={activeUser.name} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                activeUser.name?.charAt(0).toUpperCase() || '?'
                                            )}
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow"></div>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate max-w-[150px]">{activeUser.name}</p>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${activeUser.role === 'admin' ? 'bg-red-100 text-red-700' :
                                                activeUser.role === 'municipal_admin' ? 'bg-blue-100 text-blue-700' :
                                                    activeUser.role === 'responder' ? 'bg-orange-100 text-orange-700' :
                                                        activeUser.role === 'reporter' ? 'bg-purple-100 text-purple-700' :
                                                            'bg-gray-100 text-gray-600'
                                                }`}>
                                                {activeUser.role === 'municipal_admin' ? 'mun. admin' : activeUser.role}
                                            </span>
                                            {activeUser.assignedMunicipality && (
                                                <span className="text-[10px] text-gray-400 font-medium">{activeUser.assignedMunicipality}</span>
                                            )}
                                            {activeUser.role === 'responder' && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${activeUser.isOnDuty !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
                                                    }`}>
                                                    {activeUser.isOnDuty !== false ? 'On Duty' : 'Off Duty'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Barangay Incidents Breakdown */}
                {stats?.reportsByBarangay?.length > 0 && (
                    <div className="card mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <HiOutlineLocationMarker className="w-5 h-5 text-red-500" />
                                <h2 className="text-lg font-semibold text-gray-900">Incidents per Barangay</h2>
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                                    Verified Reports
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2.5">
                            {stats.reportsByBarangay.map((item, idx) => {
                                const maxCount = stats.reportsByBarangay[0]?.count || 1;
                                const pct = Math.round((item.count / maxCount) * 100);
                                return (
                                    <div key={item.barangay} className="flex items-center gap-3 group">
                                        <span className="text-xs font-bold text-gray-400 w-5 text-right">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{item.barangay}</p>
                                                <div className="flex items-center gap-3 text-xs shrink-0 ml-2">
                                                    <span className="font-bold text-gray-900">{item.count} incident{item.count !== 1 ? 's' : ''}</span>
                                                    {item.injured > 0 && (
                                                        <span className="text-amber-600 font-semibold">{item.injured} injured</span>
                                                    )}
                                                    {item.fatalities > 0 && (
                                                        <span className="text-red-600 font-semibold">{item.fatalities} fatal</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500 group-hover:from-red-600 group-hover:to-orange-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Recent Reports */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">Recent Reports</h2>
                            <Link
                                to="/admin/reports"
                                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                                View all <HiOutlineArrowRight className="w-4 h-4" />
                            </Link>
                        </div>

                        {stats?.recentReports?.length > 0 ? (
                            <div className="space-y-3">
                                {stats.recentReports.map((report) => (
                                    <div
                                        key={report._id}
                                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                                    >
                                        <div className={`w-2 h-2 rounded-full ${report.status === 'pending' ? 'bg-accent-500' :
                                            report.status === 'verified' ? 'bg-success-500' : 'bg-danger-500'
                                            }`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {report.address || 'Location pending'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                by {report.reporter?.name || 'Unknown'} • {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                                            </p>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${report.status === 'pending' ? 'bg-accent-100 text-accent-700' :
                                            report.status === 'verified' ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'
                                            }`}>
                                            {report.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-8">No reports yet</p>
                        )}
                    </div>

                    {/* Recent Users */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900">Recent Users</h2>
                            <Link
                                to="/admin/users"
                                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                                View all <HiOutlineArrowRight className="w-4 h-4" />
                            </Link>
                        </div>

                        {stats?.recentUsers?.length > 0 ? (
                            <div className="space-y-3">
                                {stats.recentUsers.map((user) => (
                                    <div
                                        key={user._id}
                                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${user.role === 'admin' ? 'bg-gradient-to-br from-danger-500 to-danger-700' :
                                            user.role === 'reporter' ? 'bg-gradient-to-br from-primary-500 to-primary-700' :
                                                'bg-gradient-to-br from-gray-400 to-gray-600'
                                            }`}>
                                            {user.name?.charAt(0).toUpperCase() || '?'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {user.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {user.email}
                                            </p>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-danger-100 text-danger-700' :
                                            user.role === 'reporter' ? 'bg-primary-100 text-primary-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-8">No users yet</p>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="mt-6 card bg-gradient-to-r from-primary-600 to-primary-800 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <HiOutlineTrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-white/80 text-sm">Reports This Month</p>
                            <p className="text-2xl font-bold">{stats?.reports.thisMonth || 0}</p>
                        </div>
                        <div className="ml-auto text-right">
                            <p className="text-white/80 text-sm">This Week</p>
                            <p className="text-2xl font-bold">{stats?.reports.thisWeek || 0}</p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default AdminPage;
