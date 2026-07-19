import { useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import NotificationBell from '../ui/NotificationBell';
import toast from 'react-hot-toast';
import { resolveAssetUrl } from '../../utils/assets';
import {
    HiOutlineHome,
    HiOutlineClipboardList,
    HiOutlineDocumentAdd,
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
    HiOutlineChevronRight,
    HiOutlineUserAdd,
} from 'react-icons/hi';

const NAV_LINK_BASE = 'group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1';
const getNavLinkClass = (active) => `${NAV_LINK_BASE} ${active
    ? 'bg-brand-50 font-semibold text-brand-800'
    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'}`;
const NAV_ICON_CLASS = 'h-[18px] w-[18px] shrink-0';
const SECTION_CLASS = 'mt-4 pt-1';
const SECTION_HEADING_CLASS = 'mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400';

const getAccountContext = (user) => {
    const roleLabels = {
        admin: 'System admin',
        municipal_admin: 'Municipal admin',
        responder: user?.agency ? `${user.agency} responder` : 'Responder',
        reporter: 'Reporter',
    };
    const role = roleLabels[user?.role] || 'Account';
    return user?.assignedMunicipality ? `${role} · ${user.assignedMunicipality}` : role;
};

const MainLayout = () => {
    const { user, logout, canSubmitReports, isAuthenticated, updateUser } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [dutyUpdating, setDutyUpdating] = useState(false);
    const location = useLocation();
    const currentView = new URLSearchParams(location.search).get('view');

    const navigation = [
        { name: 'Submit Report', href: '/report', icon: HiOutlineDocumentAdd, roles: ['reporter'], requireVerified: true },
        { name: 'My Reports', href: '/my-reports', icon: HiOutlineClipboardList, roles: ['reporter'] },
    ];

    const adminNavigation = [
        {
            name: 'Operations Dashboard',
            href: '/admin',
            icon: HiOutlineHome,
            roles: ['admin', 'municipal_admin'],
        },
        { name: 'Users', href: '/admin/users', icon: HiOutlineUsers },
        { name: 'Incident Reports', href: '/admin/reports', icon: HiOutlineClipboardList },
        { name: 'Risk Zones', href: '/admin/zones', icon: HiOutlineLocationMarker, roles: ['admin', 'municipal_admin'] },
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
            <div className="flex h-screen min-h-0 bg-white supports-[height:100dvh]:h-dvh">
                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            type="button"
                            aria-label="Close navigation menu"
                            className="fixed inset-0 z-40 bg-black/45 lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar */}
                <aside
                    aria-label="Primary navigation"
                    className={`fixed inset-y-0 left-0 z-50 flex w-[calc(100vw-2rem)] max-w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-out lg:static lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    {/* Logo */}
                    <div className="flex min-h-20 items-center px-4">
                        <NavLink to="/" className="group flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50 p-1">
                                <img
                                    src="/icons/Alert.png"
                                    alt="Sibuyan Alert Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <span className="min-w-0 font-display leading-none">
                                <span className="block whitespace-nowrap text-[17px] font-black tracking-tight text-brand-900 sm:text-lg">
                                    Accident<span className="text-brand-600">Alert</span>
                                </span>
                                <span className="mt-1 block whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] text-brand-700/65 sm:text-[11px]">
                                    &amp; Mapping System
                                </span>
                            </span>
                        </NavLink>
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close navigation menu"
                            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
                        >
                            <HiOutlineX className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="hide-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-2">
                        {/* Quick Links - always visible */}
                        {(() => {
                            // Smart Home redirect based on role
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/'
                                    : (user?.role === 'admin' || user?.role === 'municipal_admin')
                                        ? '/dashboard'
                                        : user?.role === 'responder'
                                            ? '/admin'
                                            : '/';

                            const isHomeActive = !isAuthenticated
                                ? location.pathname === '/'
                                : user?.role === 'reporter'
                                    ? location.pathname === '/'
                                    : (user?.role === 'admin' || user?.role === 'municipal_admin')
                                        ? location.pathname === '/dashboard' && currentView !== 'map'
                                        : user?.role === 'responder'
                                            ? location.pathname === '/admin'
                                            : location.pathname === '/';
                            const homeLabel = user?.role === 'admin' || user?.role === 'municipal_admin'
                                ? 'Analytics Dashboard'
                                : user?.role === 'responder'
                                    ? 'Responder Dashboard'
                                    : 'Home';

                            return (
                                <div className="space-y-1">
                                    <NavLink
                                        to={homeHref}
                                        end={!isAuthenticated}
                                        className={() => getNavLinkClass(isHomeActive)}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineHome className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">{homeLabel}</span>
                                    </NavLink>

                                    <NavLink
                                        to="/dashboard?view=map"
                                        className={() => {
                                            const isMapActive = location.pathname === '/dashboard' && currentView === 'map';
                                            return getNavLinkClass(isMapActive);
                                        }}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineGlobe className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">Map</span>
                                    </NavLink>

                                    <NavLink
                                        to="/accident-history"
                                        className={({ isActive }) => getNavLinkClass(isActive)}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <HiOutlineClock className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">Accident History</span>
                                    </NavLink>
                                </div>
                            );
                        })()}

                        {/* Authenticated Nav Items */}
                        {isAuthenticated && filteredNav.length > 0 && (
                            <div className={`${SECTION_CLASS} space-y-1`}>
                                <h3 className={SECTION_HEADING_CLASS}>
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
                                            return getNavLinkClass(active);
                                        }}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <item.icon className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">{item.name}</span>
                                    </NavLink>
                                ))}
                            </div>
                        )}

                        {/* Admin Section - Visible to admins and responders */}
                        {isAuthenticated && (user?.role === 'admin' || user?.role === 'municipal_admin' || user?.role === 'responder') && filteredAdminNav.length > 0 && (
                            <div className={SECTION_CLASS}>
                                <h3 className={SECTION_HEADING_CLASS}>
                                    Operations
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

                                                return getNavLinkClass(adminItemActive);
                                            }}
                                            onClick={() => setSidebarOpen(false)}
                                        >
                                            <item.icon className={NAV_ICON_CLASS} aria-hidden="true" />
                                            <span className="truncate">{item.name}</span>
                                        </NavLink>
                                    ))}
                                </div>
                            </div>
                        )}

                    </nav>

                    {/* Bottom Section */}
                    <div className="mt-auto space-y-3 border-t border-gray-100 bg-white p-3">
                        {/* Responder Duty Status */}
                        {isAuthenticated && user?.role === 'responder' && (
                            <div className="rounded-xl bg-gray-50 p-3">
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
                                    className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${user?.isOnDuty !== false
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
                            <div className="space-y-2">
                                <Link
                                    to="/profile"
                                    onClick={() => setSidebarOpen(false)}
                                    className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_1.25rem] items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                    aria-label="Open profile settings"
                                >
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-brand-200/50 p-0.5">
                                        {user?.avatar ? (
                                            <img
                                                src={resolveAssetUrl(user.avatar)}
                                                alt={user.name}
                                                className="h-full w-full rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="line-clamp-2 text-sm font-semibold leading-4 text-gray-900">{user?.name}</p>
                                        <p className="mt-1 break-words text-xs leading-4 text-gray-500">{getAccountContext(user)}</p>
                                    </div>
                                    <HiOutlineChevronRight className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-11 w-full items-center justify-start gap-2 rounded-lg px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                >
                                    <HiOutlineLogout className="h-5 w-5" aria-hidden="true" />
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="rounded-xl border border-brand-100 bg-white p-4">
                                    <div>
                                        <div className="mb-3 flex items-center gap-2.5">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                                                <HiOutlineGlobe className="h-5 w-5 text-brand-700" aria-hidden="true" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold leading-tight text-brand-900">Guest mode</p>
                                                <p className="text-[11px] text-brand-600">Limited access</p>
                                            </div>
                                        </div>
                                        <p className="mb-3.5 text-xs leading-relaxed text-gray-600">
                                            Sign in to submit reports, track incidents, and coordinate with responders.
                                        </p>
                                        <Link
                                            to="/login"
                                            onClick={() => setSidebarOpen(false)}
                                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                                        >
                                            <HiOutlineLogin className="w-4 h-4" />
                                            Sign In
                                            <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
                                        </Link>
                                    </div>
                                </div>

                                <Link
                                    to="/register"
                                    onClick={() => setSidebarOpen(false)}
                                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2.5 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                            type="button"
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open navigation menu"
                            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
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
                    <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-8 sm:px-6 lg:px-8 custom-scrollbar">
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
