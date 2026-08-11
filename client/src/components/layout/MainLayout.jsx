import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from '../../router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
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
    HiOutlineClock,
    HiOutlineChevronRight,
    HiOutlineUserAdd,
    HiOutlineChartBar,
} from 'react-icons/hi';

const NAV_LINK_BASE = 'group flex min-h-10 w-full min-w-0 items-center gap-3 rounded-sm px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950 border-l-2 border-transparent';
const getNavLinkClass = (active) => `${NAV_LINK_BASE} ${active
    ? 'border-brand-500 bg-brand-900/40 text-brand-100'
    : 'text-brand-300/50 hover:bg-brand-900/20 hover:text-brand-100'}`;
const NAV_ICON_CLASS = 'h-4 w-4 shrink-0';
const SECTION_CLASS = 'mt-5 pt-2';
const SECTION_HEADING_CLASS = 'mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-400/50';

const getAccountContext = (user) => {
    const roleLabels = {
        municipal_admin: 'Municipal admin',
        responder: user?.agency ? `${user.agency} responder` : 'Responder',
        reporter: 'Reporter',
    };
    const role = roleLabels[user?.role] || 'Account';
    return user?.assignedMunicipality ? `${role} · ${user.assignedMunicipality}` : role;
};

const MainLayout = ({ children }) => {
    const { user, logout, canSubmitReports, isAuthenticated } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const currentSearchParams = new URLSearchParams(location.search);
    const currentView = currentSearchParams.get('view');
    const currentPanel = currentSearchParams.get('panel');

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousDocumentOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousDocumentOverflow;
        };
    }, []);

    const navigation = [
        { name: 'Submit Report', href: '/report', icon: HiOutlineDocumentAdd, roles: ['reporter'], requireVerified: true },
        { name: 'My Reports', href: '/my-reports', icon: HiOutlineClipboardList, roles: ['reporter'] },
    ];

    const adminNavigation = [
        {
            name: 'Analytics Dashboard',
            href: '/dashboard',
            icon: HiOutlineChartBar,
            roles: ['municipal_admin'],
        },
        { name: 'Users', href: '/admin/users', icon: HiOutlineUsers },
        {
            name: 'Incident Reports',
            href: user?.role === 'responder' ? '/admin/reports?view=dispatch-queue' : '/admin/reports',
            icon: HiOutlineClipboardList,
        },
        { name: 'Risk Zones', href: '/admin/zones', icon: HiOutlineLocationMarker, roles: ['municipal_admin'] },
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
            if (user?.role === 'municipal_admin') return true;
            // Responders can only see dashboard and incident reports (no user management)
            if (user?.role === 'responder') {
                return item.href !== '/admin/users';
            }
            return false;
        })
        : [];

    return (
        <>
            <div className="fixed inset-0 flex min-h-0 overflow-hidden bg-white dark:bg-gray-950">
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
                    className={`fixed inset-y-0 left-0 z-50 flex w-[calc(100vw-2rem)] max-w-64 flex-col border-r border-emerald-900/40 bg-brand-950 transition-transform duration-200 ease-out lg:static lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    {/* Logo */}
                    <div className="flex min-h-20 items-center px-4">
                        {(() => {
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? '/admin'
                                        : '/';
                            return (
                                <NavLink to={homeHref} className="group flex min-w-0 items-center gap-2.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Sibuyan Alert home">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-brand-900/50 p-1 border border-brand-800/50">
                                        <img
                                            src="/icons/Alert.png"
                                            alt=""
                                            className="h-full w-full object-contain drop-shadow-sm"
                                        />
                                    </div>
                                    <span className="truncate text-sm font-black uppercase tracking-wider text-white sm:text-base">
                                        Sibuyan <span className="text-brand-400">Alert</span>
                                    </span>
                                </NavLink>
                            );
                        })()}
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close navigation menu"
                            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
                        >
                            <HiOutlineX className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="hide-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 pt-2">
                        {/* Quick Links - always visible */}
                        {(() => {
                            // Smart Home redirect based on role
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? '/admin'
                                        : '/';

                            const isHomeActive = !isAuthenticated
                                ? location.pathname === '/'
                                : user?.role === 'reporter'
                                    ? location.pathname === '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? location.pathname === '/admin'
                                        : location.pathname === '/';
                            const homeLabel = !isAuthenticated
                                ? 'Overview'
                                : user?.role === 'municipal_admin'
                                    ? 'Operations Dashboard'
                                    : user?.role === 'responder'
                                        ? 'Responder Dashboard'
                                        : 'Home';

                            return (
                                <div className="space-y-0.5">
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
                                             const isMapActive = location.pathname === '/dashboard'
                                                 && currentView === 'map'
                                                 && !currentPanel;
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
                            <div className={`${SECTION_CLASS} space-y-0.5`}>
                                <h3 className={SECTION_HEADING_CLASS}>
                                    Reporting Tools
                                </h3>
                                {filteredNav.map((item) => (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        className={({ isActive }) => getNavLinkClass(isActive)}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <item.icon className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">{item.name}</span>
                                    </NavLink>
                                ))}
                            </div>
                        )}

                        {/* Operations section for municipal administrators and responders. */}
                        {isAuthenticated && (user?.role === 'municipal_admin' || user?.role === 'responder') && filteredAdminNav.length > 0 && (
                            <div className={SECTION_CLASS}>
                                <h3 className={SECTION_HEADING_CLASS}>
                                    Operations
                                </h3>
                                <div className="space-y-0.5">
                                    {filteredAdminNav.map((item) => (
                                        <NavLink
                                            key={item.name}
                                            to={item.href}
                                            className={({ isActive }) => {
                                                const isIncidentReportsItem = item.href.startsWith('/admin/reports');
                                                const isHighRiskZonesItem = item.href === '/admin/zones';
                                                const isAnalyticsDashboard = item.href === '/dashboard';
                                                const adminItemActive = isAnalyticsDashboard
                                                    ? location.pathname === '/dashboard' && currentView !== 'map'
                                                    : isIncidentReportsItem
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
                    <div className="mt-auto border-t border-emerald-900/40 bg-brand-950 p-4">
                        {/* User Profile or Guest Login Prompt */}
                        {isAuthenticated ? (
                            <div className="flex flex-col gap-3">
                                <Link
                                    to="/profile"
                                    onClick={() => setSidebarOpen(false)}
                                    className="flex min-w-0 items-center gap-3 rounded-sm border border-brand-800/50 bg-brand-900/20 p-3 transition-colors hover:border-brand-700/50 hover:bg-brand-900/40 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-brand-950"
                                    aria-label="Open profile settings"
                                >
                                    <div className="h-9 w-9 shrink-0 rounded-sm bg-brand-800 p-0.5 border border-brand-700/50 overflow-hidden">
                                        {user?.avatar ? (
                                            <img
                                                src={resolveAssetUrl(user.avatar)}
                                                alt={user.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-brand-700 text-xs font-bold text-white">
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-[11px] font-bold uppercase tracking-wider text-white">{user?.name}</p>
                                        <p className="mt-0.5 break-words text-[10px] font-semibold uppercase tracking-wider text-brand-400/80">{getAccountContext(user)}</p>
                                    </div>
                                    <HiOutlineChevronRight className="h-4 w-4 shrink-0 text-brand-400/50" aria-hidden="true" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-sm border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-200/50 transition-colors hover:border-red-900/30 hover:bg-red-950/20 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                >
                                    <HiOutlineLogout className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-sm border border-brand-800/50 bg-brand-900/20 p-4">
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-brand-900 border border-brand-700/50">
                                        <HiOutlineGlobe className="h-4 w-4 text-brand-300" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-white">Guest mode</p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400/80">Limited access</p>
                                    </div>
                                </div>
                                <div className="space-y-2.5">
                                    <Link
                                        to="/login"
                                        onClick={() => setSidebarOpen(false)}
                                        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-sm bg-brand-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
                                    >
                                        <HiOutlineLogin className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        Sign In
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={() => setSidebarOpen(false)}
                                        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-sm border border-brand-700/50 bg-brand-900/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-200 transition-colors hover:border-brand-600/80 hover:bg-brand-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
                                    >
                                        <HiOutlineUserAdd className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        Become a Reporter
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-gray-950">
                    {/* Header */}
                    <header className="h-20 flex items-center justify-between px-4 sm:px-8 bg-white/80 backdrop-blur-md sticky top-0 z-30 dark:border-b dark:border-gray-800 dark:bg-gray-950/85">
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

                        <div className="flex items-center gap-2 sm:gap-4">
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
                    <main data-map-scroll-container className="custom-scrollbar relative z-0 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-8 pt-3 sm:px-6 sm:pt-4 lg:px-8 lg:pt-5">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </main>
                </div>
            </div>

        </>
    );
};

export default MainLayout;
