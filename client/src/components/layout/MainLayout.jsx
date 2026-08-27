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

const NAV_LINK_BASE = 'group relative flex min-h-10 w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors border-l-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950';
const getNavLinkClass = (active) => `${NAV_LINK_BASE} ${active
    ? 'border-emerald-500 bg-brand-900/40 text-brand-100'
    : 'border-transparent text-brand-300/60 hover:bg-brand-900/20 hover:text-brand-100'}`;
const NAV_ICON_CLASS = 'h-[18px] w-[18px] shrink-0 transition-colors group-hover:text-emerald-300';

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

    const filteredNav = isAuthenticated
        ? navigation.filter((item) => {
            if (!item.roles.includes(user?.role)) return false;
            if (item.requireVerified && !canSubmitReports()) return false;
            return true;
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
                            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
                            onClick={closeDrawer}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar */}
                <aside
                    aria-label="Primary navigation"
                    className={`fixed inset-y-0 left-0 z-50 flex w-[min(80vw,320px)] flex-col border-r border-white/[0.08] bg-[#061e14] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out lg:static lg:w-[240px] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    {/* Brand Header */}
                    <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-3.5 lg:h-14 lg:px-4">
                        {(() => {
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? '/admin'
                                        : '/';
                            return (
                                <NavLink to={homeHref} className="group flex min-w-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Sibuyan Alert home">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-800/40 bg-emerald-950/70 p-1">
                                        <img
                                            src="/icons/Alert.png"
                                            alt=""
                                            className="h-full w-full object-contain"
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block font-display text-xs font-bold uppercase tracking-wider text-white">
                                            Sibuyan <span className="text-emerald-400">Alert</span>
                                        </span>
                                        <span className="block truncate text-[9px] font-bold uppercase tracking-widest text-emerald-300/50">
                                            Island Operations
                                        </span>
                                    </div>
                                </NavLink>
                            );
                        })()}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={closeDrawer}
                            aria-label="Close navigation menu"
                            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-300/70 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:hidden"
                        >
                            <HiOutlineX className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="hide-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-3 pt-2.5">
                        {/* Primary Home / Dashboard link */}
                        {(() => {
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
                                        : user?.role === 'reporter'
                                            ? 'Reporter Dashboard'
                                            : 'Home';

                            return (
                                <NavLink
                                    to={homeHref}
                                    end={!isAuthenticated}
                                    aria-current={isHomeActive ? 'page' : undefined}
                                    className={() => getNavLinkClass(isHomeActive)}
                                    onClick={closeDrawer}
                                >
                                    <HiOutlineHome className={NAV_ICON_CLASS} aria-hidden="true" />
                                    <span className="truncate">{homeLabel}</span>
                                </NavLink>
                            );
                        })()}

                        {/* Admin & Responder Incident Reports link */}
                        {isAuthenticated && (user?.role === 'municipal_admin' || user?.role === 'responder') && (
                            <NavLink
                                to={user?.role === 'responder' ? '/admin/reports?view=dispatch-queue' : '/admin/reports'}
                                aria-current={location.pathname === '/admin/reports' ? 'page' : undefined}
                                className={() => {
                                    const isReportsActive = location.pathname === '/admin/reports';
                                    return getNavLinkClass(isReportsActive);
                                }}
                                onClick={closeDrawer}
                            >
                                <HiOutlineClipboardList className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate">Incident Reports</span>
                            </NavLink>
                        )}

                        {/* Admin User Management Link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/admin/users"
                                aria-current={location.pathname === '/admin/users' ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <HiOutlineUsers className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate">Users</span>
                            </NavLink>
                        )}

                        {/* Reporter Navigation */}
                        {isAuthenticated && filteredNav.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                aria-current={location.pathname === item.href ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <item.icon className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate">{item.name}</span>
                            </NavLink>
                        ))}

                        {/* Mapping Link */}
                        <NavLink
                            to="/dashboard?view=map"
                            aria-current={location.pathname === '/dashboard' && currentView === 'map' && !currentPanel ? 'page' : undefined}
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

                        {/* Admin Risk Zones link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/admin/zones"
                                aria-current={location.pathname === '/admin/zones' ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <HiOutlineLocationMarker className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate">Risk Zones</span>
                            </NavLink>
                        )}

                        {/* Admin Analytics Dashboard link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/dashboard"
                                aria-current={location.pathname === '/dashboard' && currentView !== 'map' ? 'page' : undefined}
                                className={() => {
                                    const isAnalyticsActive = location.pathname === '/dashboard' && currentView !== 'map';
                                    return getNavLinkClass(isAnalyticsActive);
                                }}
                                onClick={closeDrawer}
                            >
                                <HiOutlineChartBar className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate">Analytics Dashboard</span>
                            </NavLink>
                        )}

                        {/* Accident History link */}
                        <NavLink
                            to="/accident-history"
                            aria-current={location.pathname === '/accident-history' ? 'page' : undefined}
                            className={({ isActive }) => getNavLinkClass(isActive)}
                            onClick={closeDrawer}
                        >
                            <HiOutlineClock className={NAV_ICON_CLASS} aria-hidden="true" />
                            <span className="truncate">Accident History</span>
                        </NavLink>
                    </nav>

                    {/* Account Footer */}
                    <div className="mt-auto border-t border-white/[0.08] bg-black/20 p-2.5 lg:p-3">
                        {isAuthenticated ? (
                            <div className="flex flex-col gap-1.5">
                                <Link
                                    to="/profile"
                                    onClick={closeDrawer}
                                    className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-white/[0.06] bg-brand-900/20 p-2 transition-colors hover:border-white/[0.12] hover:bg-brand-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950"
                                    aria-label="Open profile settings"
                                    title={user?.assignedMunicipality ? `${user?.name} · ${getAccountContext(user)}` : user?.name}
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-800/40 bg-emerald-950/80 p-0.5 text-xs font-bold text-emerald-100">
                                        {user?.avatar ? (
                                            <img
                                                src={resolveAssetUrl(user.avatar)}
                                                alt={user.name}
                                                className="h-full w-full object-cover rounded-xs"
                                            />
                                        ) : (
                                            user?.name?.charAt(0).toUpperCase() || 'U'
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-bold uppercase tracking-wider text-white group-hover:text-emerald-200 transition-colors">
                                            {user?.name}
                                        </p>
                                        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-emerald-300/70">
                                            {getAccountContext(user)}
                                        </p>
                                    </div>
                                    <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-emerald-400/40 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300" aria-hidden="true" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-9 w-full cursor-pointer items-center justify-start gap-2 rounded-md border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-300/50 transition-colors hover:border-red-900/30 hover:bg-red-950/20 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                >
                                    <HiOutlineLogout className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span>Sign out</span>
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-white/[0.06] bg-brand-900/25 p-3">
                                <div className="mb-2.5 flex items-center gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-800/40 bg-brand-900/60 text-emerald-400">
                                        <HiOutlineGlobe className="h-3.5 w-3.5" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-white">Guest mode</p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Public safety feed</p>
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
                    {/* Operational Header */}
                    <header className="h-14 sm:h-16 flex items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 backdrop-blur-md sticky top-0 z-30 dark:border-white/10 dark:bg-gray-950/90 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3">
                            <button
                                ref={menuButtonRef}
                                type="button"
                                onClick={openDrawer}
                                aria-label="Open navigation menu"
                                aria-expanded={sidebarOpen}
                                className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden dark:text-gray-300 dark:hover:bg-white/10"
                            >
                                <HiOutlineMenu className="w-5 h-5" />
                            </button>

                            <div className="flex flex-col">
                                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                                    Sibuyan Island Operations
                                </span>
                                <p className="hidden md:block text-[11px] text-gray-500 dark:text-gray-400">
                                    Cajidiocan <span className="text-gray-300 dark:text-gray-700">·</span> Magdiwang <span className="text-gray-300 dark:text-gray-700">·</span> San Fernando Municipal Alert System
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {isAuthenticated && <NotificationBell />}
                            {!isAuthenticated && (
                                <Link
                                    to="/login"
                                    className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 sm:px-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
