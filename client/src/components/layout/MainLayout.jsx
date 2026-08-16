import { useCallback, useEffect, useRef, useState } from 'react';
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

const NAV_LINK_BASE = 'group flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950 border-l-2 border-transparent';
const getNavLinkClass = (active) => `${NAV_LINK_BASE} ${active
    ? 'border-brand-500 bg-brand-900/40 text-brand-100'
    : 'text-brand-300/50 hover:bg-brand-900/20 hover:text-brand-100'}`;
const NAV_ICON_CLASS = 'h-4 w-4 shrink-0';
const SECTION_CLASS = 'mt-4 pt-1';
const SECTION_HEADING_CLASS = 'mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-400/50';

const getAccountContext = (user) => {
    const roleLabels = {
        municipal_admin: 'Municipal admin',
        responder: user?.agency === 'LGU' ? 'MDRRMO responder' : (user?.agency ? `${user.agency} responder` : 'Responder'),
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
    const menuButtonRef = useRef(null);
    const closeButtonRef = useRef(null);

    // Focus management: focus close button on open, restore to hamburger on close
    const openDrawer = useCallback(() => {
        setSidebarOpen(true);
        requestAnimationFrame(() => {
            closeButtonRef.current?.focus();
        });
    }, []);

    const closeDrawer = useCallback(() => {
        setSidebarOpen(false);
        requestAnimationFrame(() => {
            menuButtonRef.current?.focus();
        });
    }, []);

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

    // Close drawer on Escape key
    useEffect(() => {
        if (!sidebarOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') closeDrawer();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [sidebarOpen, closeDrawer]);

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
                            onClick={closeDrawer}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar */}
                <aside
                    aria-label="Primary navigation"
                    className={`fixed inset-y-0 left-0 z-50 flex w-[min(80vw,320px)] flex-col border-r border-emerald-900/40 bg-brand-950 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out lg:static lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    {/* Logo Header */}
                    <div className="flex h-14 items-center justify-between border-b border-emerald-900/30 px-3.5 lg:h-16 lg:px-4">
                        {(() => {
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? '/admin'
                                        : '/';
                            return (
                                <NavLink to={homeHref} className="group flex min-w-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Sibuyan Alert home">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-brand-800/50 bg-brand-900/50 p-1">
                                        <img
                                            src="/icons/Alert.png"
                                            alt=""
                                            className="h-full w-full object-contain drop-shadow-xs"
                                        />
                                    </div>
                                    <span className="truncate text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
                                        Sibuyan <span className="text-brand-400">Alert</span>
                                    </span>
                                </NavLink>
                            );
                        })()}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={closeDrawer}
                            aria-label="Close navigation menu"
                            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-900/60 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
                        >
                            <HiOutlineX className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="hide-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 pt-2">
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
                                        onClick={closeDrawer}
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
                                        onClick={closeDrawer}
                                    >
                                        <HiOutlineGlobe className={NAV_ICON_CLASS} aria-hidden="true" />
                                        <span className="truncate">Map</span>
                                     </NavLink>

                                     <NavLink
                                        to="/accident-history"
                                        className={({ isActive }) => getNavLinkClass(isActive)}
                                        onClick={closeDrawer}
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
                                        onClick={closeDrawer}
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
                                            onClick={closeDrawer}
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
                    <div className="mt-auto border-t border-emerald-900/40 bg-brand-950/80 p-2.5 lg:p-3">
                        {/* User Profile or Guest Login Prompt */}
                        {isAuthenticated ? (
                            <div className="flex flex-col gap-2">
                                <Link
                                    to="/profile"
                                    onClick={closeDrawer}
                                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-brand-800/50 bg-brand-900/20 p-2 transition-colors hover:border-brand-700/50 hover:bg-brand-900/40 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-brand-950"
                                    aria-label="Open profile settings"
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-700/50 bg-brand-800 p-0.5 text-xs font-bold text-white">
                                        {user?.avatar ? (
                                            <img
                                                src={resolveAssetUrl(user.avatar)}
                                                alt={user.name}
                                                className="h-full w-full object-cover rounded-md"
                                            />
                                        ) : (
                                            user?.name?.charAt(0).toUpperCase() || 'U'
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-bold uppercase tracking-wider text-white">{user?.name}</p>
                                        <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wider text-brand-400/80">{getAccountContext(user)}</p>
                                    </div>
                                    <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-brand-400/50" aria-hidden="true" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-lg border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-200/50 transition-colors hover:border-red-900/30 hover:bg-red-950/20 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                >
                                    <HiOutlineLogout className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-emerald-900/40 bg-brand-900/25 p-3">
                                <div className="mb-2.5 flex items-center gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-800/40 bg-brand-900/60 text-emerald-400 shadow-2xs">
                                        <HiOutlineGlobe className="h-3.5 w-3.5" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-white">Guest mode</p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Limited access</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Link
                                        to="/login"
                                        onClick={closeDrawer}
                                        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
                                    >
                                        <HiOutlineLogin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        Sign In
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={closeDrawer}
                                        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-emerald-800/50 bg-brand-900/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200 transition-colors hover:border-emerald-700 hover:bg-brand-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
                                    >
                                        <HiOutlineUserAdd className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                    <header className="h-16 flex items-center justify-between border-b border-gray-200/80 bg-white/85 px-4 backdrop-blur-md sticky top-0 z-30 dark:border-white/10 dark:bg-gray-950/85 sm:px-8">
                        <button
                            ref={menuButtonRef}
                            type="button"
                            onClick={openDrawer}
                            aria-label="Open navigation menu"
                            aria-expanded={sidebarOpen}
                            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden dark:text-gray-300 dark:hover:bg-white/10"
                        >
                            <HiOutlineMenu className="w-5 h-5" />
                        </button>

                        <div className="hidden lg:flex items-center gap-2.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Sibuyan Island <span className="text-gray-300 dark:text-gray-600">·</span> <strong className="font-semibold text-gray-900 dark:text-white">Alert System Active</strong>
                            </span>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {isAuthenticated && <NotificationBell />}
                            {!isAuthenticated && (
                                <Link
                                    to="/login"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                                >
                                    <HiOutlineLogin className="h-3.5 w-3.5" />
                                    <span>Sign In</span>
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
