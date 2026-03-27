import { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import NotificationBell from '../ui/NotificationBell';
import toast from 'react-hot-toast';
import {
    HiOutlineHome,
    HiOutlineMap,
    HiOutlineClipboardList,
    HiOutlineLocationMarker,
    HiOutlineUsers,
    HiOutlineLogout,
    HiOutlineMenu,
    HiOutlineX,
    HiOutlineLogin,
    HiOutlineGlobe,
    HiOutlineStatusOnline,
    HiOutlineClock,
    HiOutlineArrowRight,
    HiOutlineUserAdd,
    HiOutlineUserCircle,
} from 'react-icons/hi';

const MainLayout = () => {
    const { user, logout, canSubmitReports, isAuthenticated, updateUser } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [dutyUpdating, setDutyUpdating] = useState(false);
    const location = useLocation();
    const currentView = new URLSearchParams(location.search).get('view');

    const navigation = [
        { name: 'Analytics Dashboard', href: '/dashboard', icon: HiOutlineMap, roles: ['admin', 'municipal_admin'] },
        { name: 'Submit Report', href: '/report', iconSrc: '/icons/report.logo.png', roles: ['reporter'], requireVerified: true },
        { name: 'My Reports', href: '/my-reports', icon: HiOutlineClipboardList, roles: ['reporter'] },
    ];

    const adminNavigation = [
        {
            name: (user?.role === 'admin' || user?.role === 'municipal_admin') ? 'Admin Dashboard' : 'Responder Dashboard',
            href: '/admin',
            icon: HiOutlineHome
        },
        { name: 'Manage Users', href: '/admin/users', icon: HiOutlineUsers },
        { name: 'Incident Reports', href: '/admin/reports', iconSrc: '/icons/report.logo.png' },
        { name: 'Manage High-Risk Zones', href: '/admin/zones', icon: HiOutlineLocationMarker, roles: ['admin', 'municipal_admin'] },
    ];

    const filteredNav = isAuthenticated
        ? navigation.filter((item) => {
            if (!item.roles.includes(user?.role)) return false;
            if (item.requireVerified && !canSubmitReports()) return false;
            return true;
        })
        : [];

    const filteredAdminNav = isAuthenticated
        ? adminNavigation.filter((item) => {
            if (item.roles && !item.roles.includes(user?.role)) return false;
            // Both super admin and municipal admin can manage users and reports
            if (user?.role === 'admin' || user?.role === 'municipal_admin') return true;
            // Responders can only see dashboard and incident reports (no user management)
            if (user?.role === 'responder') {
                return item.href !== '/admin/users';
            }
            return false;
        })
        : [];

    const handleToggleDutyStatus = async () => {
        if (!user || user.role !== 'responder') return;

        setDutyUpdating(true);
        try {
            const nextValue = !(user.isOnDuty !== false);
            const response = await adminAPI.updateMyDutyStatus({ isOnDuty: nextValue });
            updateUser({
                ...user,
                isOnDuty: response.data.data.isOnDuty,
            });
            toast.success(response.data.message || 'Duty status updated');
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to update duty status';
            toast.error(message);
        } finally {
            setDutyUpdating(false);
        }
    };



    return (
        <>
            <div className="flex h-screen bg-white">
                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar */}
                <aside
                    className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-brand-50/50 backdrop-blur-xl border-r border-brand-100 transform transition-transform duration-300 ease-out lg:transform-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                        } flex flex-col`}
                >
                    {/* Logo */}
                    <div className="h-24 flex items-center px-8">
                        <NavLink to="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 bg-white rounded-xl p-1 overflow-hidden flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:scale-105 transition-transform">
                                <img
                                    src="/icons/Alert.png"
                                    alt="Sibuyan Alert Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <span className="font-display font-bold text-2xl text-brand-900 tracking-tight">
                                Sibuyan <span className="text-brand-600">Alert</span>
                            </span>
                        </NavLink>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden ml-auto p-2 text-brand-600 hover:bg-brand-100 rounded-lg"
                        >
                            <HiOutlineX className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-5 space-y-1 overflow-y-auto custom-scrollbar">
                        {/* Quick Links - always visible */}
                        {(() => {
                            // Smart Home redirect based on role
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/my-reports'
                                    : (user?.role === 'admin' || user?.role === 'municipal_admin')
                                        ? '/dashboard'
                                        : user?.role === 'responder'
                                            ? '/admin'
                                            : '/';

                            const isHomeActive = !isAuthenticated
                                ? location.pathname === '/'
                                : user?.role === 'reporter'
                                    ? location.pathname === '/my-reports'
                                    : (user?.role === 'admin' || user?.role === 'municipal_admin')
                                        ? location.pathname === '/dashboard' && currentView !== 'map'
                                        : user?.role === 'responder'
                                            ? location.pathname === '/admin'
                                            : location.pathname === '/';

                            return (
                                <div className="space-y-1">
                                    <NavLink
                                        to={homeHref}
                                        end={!isAuthenticated}
                                        className={() =>
                                            `group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${isHomeActive
                                                ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-lg shadow-brand-500/25 translate-x-1 sidebar-link-active'
                                                : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                            }`
                                        }
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineHome className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
                                        <span>Home</span>
                                    </NavLink>

                                    <NavLink
                                        to="/dashboard?view=map"
                                        className={() => {
                                            const isMapActive = location.pathname === '/dashboard' && currentView === 'map';
                                            return `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${isMapActive
                                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-x-1 sidebar-link-active'
                                                : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                                }`;
                                        }}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineGlobe className="w-4.5 h-4.5" />
                                        <span>Public Map</span>
                                    </NavLink>

                                    <NavLink
                                        to="/accident-history"
                                        className={({ isActive }) =>
                                            `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${isActive
                                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-x-1 sidebar-link-active'
                                                : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                            }`
                                        }
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineClock className="w-4.5 h-4.5" />
                                        <span>Accident History</span>
                                    </NavLink>
                                </div>
                            );
                        })()}

                        {/* Authenticated Nav Items */}
                        {isAuthenticated && filteredNav.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-brand-100/60 space-y-1">
                                <h3 className="px-3 text-[10px] font-bold text-brand-900/40 uppercase tracking-wider mb-2">
                                    Reporting Tools
                                </h3>
                                {filteredNav.map((item) => (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        className={({ isActive }) => {
                                            // For items on /dashboard path, exclude map view
                                            const itemIsDashboard = item.href === '/dashboard';
                                            const active = itemIsDashboard
                                                ? location.pathname === '/dashboard' && currentView !== 'map'
                                                : isActive;
                                            return `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${active
                                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-x-1 sidebar-link-active'
                                                : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                                }`;
                                        }}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        {item.iconSrc ? (
                                            <span className="w-4.5 h-4.5 flex items-center justify-center flex-shrink-0">
                                                <img src={item.iconSrc} alt={`${item.name} icon`} className="w-3.5 h-3.5 object-contain" />
                                            </span>
                                        ) : (
                                            <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
                                        )}
                                        <span>{item.name}</span>
                                    </NavLink>
                                ))}
                            </div>
                        )}

                        {/* Admin Section - Visible to admins and responders */}
                        {isAuthenticated && (user?.role === 'admin' || user?.role === 'municipal_admin' || user?.role === 'responder') && filteredAdminNav.length > 0 && (
                            <div className="mt-5 pt-4">
                                <h3 className="px-3 text-[10px] font-bold text-brand-900/40 uppercase tracking-wider mb-2.5">
                                    Response & Management
                                </h3>
                                <div className="space-y-1">
                                    {filteredAdminNav.map((item) => (
                                        <NavLink
                                            key={item.name}
                                            to={item.href}
                                            className={({ isActive }) => {
                                                const isIncidentReportsItem = item.href === '/admin/reports';
                                                const isHighRiskZonesItem = item.href === '/admin/zones';
                                                const adminItemActive = isIncidentReportsItem
                                                    ? location.pathname === '/admin/reports'
                                                    : isHighRiskZonesItem
                                                        ? location.pathname === '/admin/zones'
                                                    : isActive;

                                                return `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${adminItemActive
                                                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-x-1 sidebar-link-active'
                                                    : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                                    }`;
                                            }}
                                            onClick={() => setSidebarOpen(false)}
                                        >
                                            {item.iconSrc ? (
                                                <span className="w-4.5 h-4.5 flex items-center justify-center flex-shrink-0">
                                                    <img src={item.iconSrc} alt={`${item.name} icon`} className="w-3.5 h-3.5 object-contain" />
                                                </span>
                                            ) : (
                                                <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
                                            )}
                                            <span>{item.name}</span>
                                        </NavLink>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Profile Settings — visible to all authenticated users */}
                        {isAuthenticated && (
                            <div className="mt-3 pt-3 border-t border-brand-100/60 space-y-1">
                                <h3 className="px-3 text-[10px] font-bold text-brand-900/40 uppercase tracking-wider mb-2">
                                    Account
                                </h3>
                                <NavLink
                                    to="/profile"
                                    className={({ isActive }) =>
                                        `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${isActive
                                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 translate-x-1'
                                            : 'text-brand-900/70 hover:bg-brand-100/80 hover:text-brand-900'
                                        }`
                                    }
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <HiOutlineUserCircle className="w-4.5 h-4.5 flex-shrink-0" />
                                    <span>Profile Settings</span>
                                </NavLink>
                            </div>
                        )}
                    </nav>

                    {/* Bottom Section */}
                    <div className="p-4 mt-auto space-y-4">
                        {/* Responder Duty Status */}
                        {isAuthenticated && user?.role === 'responder' && (
                            <div className="bg-white border border-brand-100 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold text-brand-900">Duty Status</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${user?.isOnDuty !== false
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-gray-200 text-gray-700'
                                        }`}>
                                        {user?.isOnDuty !== false ? 'On Duty' : 'Off Duty'}
                                    </span>
                                </div>
                                <button
                                    onClick={handleToggleDutyStatus}
                                    disabled={dutyUpdating}
                                    className={`w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-colors ${user?.isOnDuty !== false
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                                        } ${dutyUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    <HiOutlineStatusOnline className="w-3.5 h-3.5" />
                                    {dutyUpdating ? 'Updating...' : user?.isOnDuty !== false ? 'Set Off Duty' : 'Set On Duty'}
                                </button>
                            </div>
                        )}

                        {/* User Profile or Guest Login Prompt */}
                        {isAuthenticated ? (
                            <div className="flex items-center gap-2 px-1">
                                <div className="w-9 h-9 rounded-full bg-brand-200/50 p-0.5">
                                    {user?.avatar ? (
                                        <img
                                            src={user.avatar.startsWith('http') ? user.avatar : `${import.meta.env.VITE_API_URL || ''}/${user.avatar}`}
                                            alt={user.name}
                                            className="w-full h-full rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                                            {user?.name?.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-brand-900 truncate">{user?.name}</p>
                                    <p className="text-xs text-brand-500 truncate capitalize">
                                        {user?.role === 'admin' && user?.agency
                                            ? `${user.agency === 'LGU' ? 'MDRRMO' : user.agency} Responder`
                                            : user?.role}
                                        {user?.assignedMunicipality ? ` · ${user.assignedMunicipality}` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={logout}
                                    className="p-1.5 text-brand-400 hover:text-danger-500 hover:bg-danger-50 rounded-md transition-colors"
                                    title="Logout"
                                >
                                    <HiOutlineLogout className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Guest Welcome Card */}
                                <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-emerald-700 rounded-2xl p-4 shadow-lg shadow-brand-500/20">
                                    {/* Decorative elements */}
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 blur-xl" />
                                    <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full -ml-4 -mb-4 blur-lg" />

                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                                                <HiOutlineGlobe className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-white text-xs font-bold leading-tight">Guest Mode</p>
                                                <p className="text-brand-200 text-[10px]">Limited access</p>
                                            </div>
                                        </div>
                                        <p className="text-brand-100 text-[11px] leading-relaxed mb-3.5">
                                            Sign in to submit reports, track incidents, and coordinate with responders.
                                        </p>
                                        <Link
                                            to="/login"
                                            onClick={() => setSidebarOpen(false)}
                                            className="group flex items-center justify-center gap-2 w-full py-2.5 bg-white text-brand-700 font-bold text-xs rounded-xl hover:bg-brand-50 transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            <HiOutlineLogin className="w-4 h-4" />
                                            Sign In
                                            <HiOutlineArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                        </Link>
                                    </div>
                                </div>

                                <Link
                                    to="/register"
                                    onClick={() => setSidebarOpen(false)}
                                    className="group flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-white text-brand-700 border-2 border-brand-200 font-bold text-xs rounded-xl hover:bg-brand-50 hover:border-brand-300 transition-all"
                                >
                                    <HiOutlineUserAdd className="w-4 h-4" />
                                    Become a Reporter
                                </Link>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
                    {/* Header */}
                    <header className="h-20 flex items-center justify-between px-4 sm:px-8 bg-white/80 backdrop-blur-md sticky top-0 z-30">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 text-brand-600 hover:bg-brand-50 rounded-lg -ml-2"
                        >
                            <HiOutlineMenu className="w-6 h-6" />
                        </button>

                        <div className="hidden lg:flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                            <span className="text-sm font-medium text-brand-900/60">
                                Sibuyan Island <span className="text-brand-900 font-bold">Alert System Active</span>
                            </span>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-full text-xs font-medium text-brand-700">
                                <span>v2.0.0</span>
                            </div>
                            {isAuthenticated && <NotificationBell />}
                            {!isAuthenticated && (
                                <Link
                                    to="/login"
                                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-md"
                                >
                                    <HiOutlineLogin className="w-4 h-4" />
                                    Sign In
                                </Link>
                            )}
                        </div>
                    </header>

                    {/* Page Content Scrollable Area */}
                    <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <Outlet />
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>

        </>
    );
};

export default MainLayout;
