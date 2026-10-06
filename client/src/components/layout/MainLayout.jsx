import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from '../../router';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
import OfflineBanner from '../ui/OfflineBanner';
import OperationalBottomNav from './OperationalBottomNav';
import ReportSearch from '../search/ReportSearch';
import { useOfflineReportSync } from '../../hooks/useOfflineReportSync';
import { resolveAssetUrl } from '../../utils/assets';
import { DASHBOARD_ANALYTICS_VIEW, resolveDashboardView } from '../../utils/dashboardView';
import { hasGlobalHeaderSearch } from '../../utils/globalSearch';
import { isVerifiedReporter } from '../../utils/reporterVerification';
import VerifiedReporterBadge from '../ui/VerifiedReporterBadge';
import {
    HiOutlineHome,
    HiOutlineClipboardList,
    HiOutlineDocumentAdd,
    HiOutlineLocationMarker,
    HiOutlineUsers,
    HiOutlineLogout,
    HiOutlineMenu,
    HiOutlineX,
    HiOutlineGlobe,
    HiOutlineClock,
    HiOutlineChartBar,
    HiOutlineSearch,
} from 'react-icons/hi';

const NAV_LINK_BASE = 'group relative flex min-h-10 w-full min-w-0 items-center gap-3 rounded-md px-3 py-3 text-[13px] font-medium transition-colors border-l-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950 sm:py-2 md:justify-center md:px-2 lg:justify-start lg:px-3';
const getNavLinkClass = (active) => `${NAV_LINK_BASE} ${active
    ? 'border-sky-300 bg-white/[0.08] text-white'
    : 'border-transparent text-slate-300/70 hover:bg-white/[0.06] hover:text-white'}`;
const NAV_ICON_CLASS = 'h-[18px] w-[18px] shrink-0 transition-colors group-hover:text-white';

const getAccountContext = (user) => {
    const roleLabels = {
        municipal_admin: 'Municipal admin',
        responder: user?.agency === 'LGU' ? 'MDRRMO responder' : (user?.agency ? `${user.agency} responder` : 'Responder'),
        reporter: 'Reporter',
    };
    const role = roleLabels[user?.role] || 'Account';
    return user?.assignedMunicipality ? `${role} · ${user.assignedMunicipality}` : role;
};

/*
 * `fitWindow` gives a page a box it can measure itself against.
 *
 * A page that must fill the viewport without scrolling has to be told how much
 * room it has, and a percentage height only resolves against a parent that has
 * a height of its own. Without this, such a page can only guess — the zones
 * workspace used to reconstruct main's content box as `calc(100dvh - 7.25rem)`,
 * which silently stopped being true the moment the window was short enough for
 * its floor to win, and the page scrolled as a whole. With the flag the wrapper
 * is exactly main's content box, so the page fills it and nothing is left over.
 */
const MainLayout = ({ children, fitWindow = false }) => {
    const { user, logout, canSubmitReports, isAuthenticated } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const currentSearchParams = new URLSearchParams(location.search);
    const currentView = currentSearchParams.get('view');
    const currentPanel = currentSearchParams.get('panel');
    const menuButtonRef = useRef(null);
    const closeButtonRef = useRef(null);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

    // Delivers reports filed while offline. Mounted at the authenticated layout
    // so a queued report is sent from wherever the reporter happens to be, not
    // only if they return to the report page. The hook delivers only the
    // signed-in reporter's own reports, so mounting it for every role is safe.
    useOfflineReportSync();

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

    useEffect(() => {
        setMobileSearchOpen(false);
    }, [location.pathname, location.search]);

    // Close drawer on Escape key
    useEffect(() => {
        if (!sidebarOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') closeDrawer();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [sidebarOpen, closeDrawer]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        if (sidebarOpen) {
            document.body.classList.add('mobile-sidebar-open');
        } else {
            document.body.classList.remove('mobile-sidebar-open');
        }
        return () => {
            document.body.classList.remove('mobile-sidebar-open');
        };
    }, [sidebarOpen]);

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

    const isReporter = isAuthenticated && user?.role === 'reporter';
    const canSubmit = isReporter && canSubmitReports();
    // /dashboard is the incident map for every role; analytics is opt-in.
    // `resolveDashboardView` is the same function DashboardPage renders from, so
    // the highlighted nav item can never disagree with the visible workspace.
    const isAnalyticsDashboard = location.pathname === '/dashboard'
        && resolveDashboardView({
            role: user?.role,
            requestedView: currentView,
            panelView: currentPanel,
        }) === DASHBOARD_ANALYTICS_VIEW;
    const isMapView = location.pathname === '/dashboard' && !isAnalyticsDashboard;

    // The application-wide search belongs to the map dashboard (/dashboard) and
    // nowhere else. Every other page answers questions about itself with its
    // own controls, so the header there is brand, notifications, and nothing
    // competing with them. The rule itself lives in utils/globalSearch so this
    // and any other caller agree.
    const showGlobalSearch = hasGlobalHeaderSearch(location.pathname);
    const isOperationalNavVisible = isAuthenticated
        && (user?.role === 'municipal_admin' || user?.role === 'responder');

    return (
        <>
            <div className={`fixed inset-0 flex min-h-0 overflow-hidden bg-[var(--surface)] ${sidebarOpen ? 'z-[95]' : ''}`}>
                <a href="#main-content" className="skip-link">Skip to content</a>
                {/* Mobile Sidebar Overlay: CSS fade avoids loading framer-motion
                    (~99 kB) on every authenticated page just for one transition. */}
                {sidebarOpen && (
                    <button
                        type="button"
                        aria-label="Close navigation menu"
                        className="overlay-fade-in fixed inset-0 z-[90] bg-black/50 md:hidden"
                        onClick={closeDrawer}
                    />
                )}

                {/* Sidebar */}
                <aside
                    aria-label="Primary navigation"
                    className={`fixed inset-y-0 left-0 z-[100] flex w-[min(80vw,320px)] flex-col border-r border-white/[0.08] bg-brand-950 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out md:static md:z-auto md:w-[76px] md:translate-x-0 lg:w-[260px] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    {/* Brand Header */}
                    <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-3.5 md:justify-center md:px-2 lg:justify-between lg:px-4">
                        {(() => {
                            const homeHref = !isAuthenticated
                                ? '/'
                                : user?.role === 'reporter'
                                    ? '/reporter'
                                    : (user?.role === 'municipal_admin' || user?.role === 'responder')
                                        ? '/admin'
                                        : '/';
                            return (
                                <NavLink to={homeHref} className="group flex min-w-0 items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" aria-label="Sibuyan Alert home">
                                    {/* Unified wordmark: the logo IS the letter S, sharing one
                                        flex line with "ibuyan Alert" and sized in em so the
                                        visible S glyph matches the text cap height. */}
                                    <span aria-hidden="true" className="min-w-0">
                                        <span className="flex items-center font-display text-base font-semibold tracking-tight text-white">
                                            <img
                                                src="/icons/Alert.png"
                                                alt=""
                                                className="h-[1.3em] w-[1.3em] shrink-0 object-contain"
                                            />
                                            <span className="-ml-[0.08em] leading-none md:sr-only lg:not-sr-only">
                                                ibuyan <span className="text-red-400">Alert</span>
                                            </span>
                                        </span>
                                        <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.12em] text-slate-300 md:sr-only lg:not-sr-only">
                                            Island Operations
                                        </span>
                                    </span>
                                </NavLink>
                            );
                        })()}
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={closeDrawer}
                            aria-label="Close navigation menu"
                            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300/70 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 md:hidden"
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
                            const homeLabel = isAuthenticated ? 'Dashboard' : 'Overview';

                            return (
                                <NavLink
                                    to={homeHref}
                                    title={homeLabel}
                                    end={!isAuthenticated}
                                    aria-current={isHomeActive ? 'page' : undefined}
                                    className={() => getNavLinkClass(isHomeActive)}
                                    onClick={closeDrawer}
                                >
                                    <HiOutlineHome className={NAV_ICON_CLASS} aria-hidden="true" />
                                    <span className="truncate md:sr-only lg:not-sr-only">{homeLabel}</span>
                                </NavLink>
                            );
                        })()}

                        {/* Admin & Responder Incident Reports link */}
                        {isAuthenticated && (user?.role === 'municipal_admin' || user?.role === 'responder') && (
                            <NavLink
                                to={user?.role === 'responder' ? '/admin/reports?view=dispatch-queue' : '/admin/reports'}
                                title="Incident Reports"
                                aria-current={location.pathname === '/admin/reports' ? 'page' : undefined}
                                className={() => {
                                    const isReportsActive = location.pathname === '/admin/reports';
                                    return getNavLinkClass(isReportsActive);
                                }}
                                onClick={closeDrawer}
                            >
                                <HiOutlineClipboardList className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate md:sr-only lg:not-sr-only">Incident Reports</span>
                            </NavLink>
                        )}

                        {/* Admin User Management Link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/admin/users"
                                title="Users"
                                aria-current={location.pathname === '/admin/users' ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <HiOutlineUsers className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate md:sr-only lg:not-sr-only">Users</span>
                            </NavLink>
                        )}

                        {/* Reporter Navigation */}
                        {isAuthenticated && filteredNav.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.href}
                                title={item.name}
                                aria-current={location.pathname === item.href ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <item.icon className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate md:sr-only lg:not-sr-only">{item.name}</span>
                            </NavLink>
                        ))}

                        {/* Mapping Link */}
                        <NavLink
                            to="/dashboard"
                            title="Map"
                            aria-current={isMapView ? 'page' : undefined}
                            className={() => getNavLinkClass(isMapView)}
                            onClick={closeDrawer}
                        >
                            <HiOutlineGlobe className={NAV_ICON_CLASS} aria-hidden="true" />
                            <span className="truncate md:sr-only lg:not-sr-only">Map</span>
                        </NavLink>

                        {/* Admin Risk Zones link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/admin/zones"
                                title="Risk Zones"
                                aria-current={location.pathname === '/admin/zones' ? 'page' : undefined}
                                className={({ isActive }) => getNavLinkClass(isActive)}
                                onClick={closeDrawer}
                            >
                                <HiOutlineLocationMarker className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate md:sr-only lg:not-sr-only">Risk Zones</span>
                            </NavLink>
                        )}

                        {/* Admin Analytics link */}
                        {isAuthenticated && user?.role === 'municipal_admin' && (
                            <NavLink
                                to="/dashboard?view=analytics"
                                title="Analytics"
                                aria-current={isAnalyticsDashboard ? 'page' : undefined}
                                className={() => getNavLinkClass(isAnalyticsDashboard)}
                                onClick={closeDrawer}
                            >
                                <HiOutlineChartBar className={NAV_ICON_CLASS} aria-hidden="true" />
                                <span className="truncate md:sr-only lg:not-sr-only">Analytics</span>
                            </NavLink>
                        )}

                        {/* Accident History link */}
                        <NavLink
                            to="/accident-history"
                            title="Accident History"
                            aria-current={location.pathname === '/accident-history' ? 'page' : undefined}
                            className={({ isActive }) => getNavLinkClass(isActive)}
                            onClick={closeDrawer}
                        >
                            <HiOutlineClock className={NAV_ICON_CLASS} aria-hidden="true" />
                            <span className="truncate md:sr-only lg:not-sr-only">Accident History</span>
                        </NavLink>
                    </nav>

                    {/* Account Footer */}
                    <div className="mt-auto border-t border-white/[0.08] bg-black/20 p-2.5 md:p-2 lg:p-3">
                        {isAuthenticated ? (
                            <div className="flex flex-col gap-1.5">
                                <Link
                                    to="/profile"
                                    onClick={closeDrawer}
                                    className="group flex min-h-[44px] min-w-0 items-center gap-2 rounded-md px-1 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1 focus-visible:ring-offset-brand-950 sm:min-h-0 md:justify-center lg:justify-start"
                                    aria-label="Open profile settings"
                                    title={user?.assignedMunicipality ? `${user?.name} · ${getAccountContext(user)}` : user?.name}
                                >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[11px] font-bold text-white">
                                        {user?.avatar ? (
                                            <img
                                                src={resolveAssetUrl(user.avatar)}
                                                alt={user.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            user?.name?.charAt(0).toUpperCase() || 'U'
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1 overflow-hidden md:sr-only lg:not-sr-only">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <p className="truncate min-w-0 text-[10px] font-bold uppercase leading-tight tracking-tight text-white">
                                                {user?.name}
                                            </p>
                                            {isVerifiedReporter(user) && (
                                                <VerifiedReporterBadge size="sm" variant="sidebar" />
                                            )}
                                        </div>
                                        <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold uppercase leading-tight tracking-normal text-slate-400">
                                            {getAccountContext(user)}
                                        </p>
                                    </div>
                                </Link>
                                <button
                                    type="button"
                                    onClick={logout}
                                    className="inline-flex min-h-9 w-full items-center justify-start gap-2 rounded-md border border-transparent px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:border-red-900/30 hover:bg-red-950/20 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:py-1.5 md:justify-center md:px-2 lg:justify-start lg:px-3"
                                >
                                    <HiOutlineLogout className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="md:sr-only lg:not-sr-only">Sign out</span>
                                </button>
                            </div>
                        ) : (
                            <div className="border-t border-white/[0.08] p-3">
                                <div className="mb-2.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white">Guest mode</p>
                                    <p className="text-xs text-slate-400">Public safety feed</p>
                                </div>
                                <div className="space-y-2">
                                    <Link
                                        to="/login"
                                        onClick={closeDrawer}
                                        className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950 sm:min-h-9"
                                    >
                                        Sign in
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={closeDrawer}
                                        className="flex min-h-[44px] w-full items-center justify-center rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-white/25 hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950 sm:min-h-9"
                                    >
                                        Become a reporter
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
                    {/* Operational Header */}
                    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-1.5 border-b border-[var(--border)] bg-[var(--surface)] px-2.5 sm:h-16 sm:gap-3 sm:px-4 lg:px-8">
                        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                            <button
                                ref={menuButtonRef}
                                type="button"
                                onClick={openDrawer}
                                aria-label="Open navigation menu"
                                aria-expanded={sidebarOpen}
                                className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--accent-text)] hover:bg-[var(--surface-hover)] md:hidden"
                            >
                                <HiOutlineMenu className="h-5 w-5" />
                            </button>

                            {/* Brand block: on mobile it fills the row beside the
                                hamburger; at md+ it anchors the header's left with
                                a capped width and truncation so it never collides
                                with the search field or the notification/sign-in
                                cluster. At lg+ the cap (384px) fits the full
                                municipality subtitle without ellipsis. The
                                subtitle shows only where it fits (lg+). */}
                            <div className="min-w-0 flex-1 px-1 md:max-w-48 md:flex-none md:px-0 lg:max-w-96">
                                <span className="block truncate font-display text-sm font-semibold leading-tight text-[var(--text-primary)] sm:text-base">
                                    Sibuyan Island Operations
                                </span>
                                <p className="hidden truncate text-[11px] text-gray-500 dark:text-gray-400 lg:block">
                                    Cajidiocan <span className="text-gray-300 dark:text-gray-700">·</span> Magdiwang <span className="text-gray-300 dark:text-gray-700">·</span> San Fernando Municipal Alert System
                                </p>
                            </div>
                        </div>

                        {/* Laptop/desktop: inline search bar in the top row, next to
                            the notification button. Map dashboard only —
                            elsewhere the brand takes the width and the header
                            stays a two-part composition rather than a three-part
                            one with a hole in the middle. */}
                        {isAuthenticated && showGlobalSearch && (
                            <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
                                <ReportSearch className="w-full max-w-md" />
                            </div>
                        )}

                        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                            {isAuthenticated && showGlobalSearch && (
                                <button
                                    type="button"
                                    onClick={() => setMobileSearchOpen((current) => !current)}
                                    aria-label="Search incident reports"
                                    aria-expanded={mobileSearchOpen}
                                    className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--accent-text)] hover:bg-[var(--surface-hover)] md:hidden"
                                >
                                    <HiOutlineSearch className="h-5 w-5" aria-hidden="true" />
                                </button>
                            )}
                            {isAuthenticated && <NotificationBell />}
                            {!isAuthenticated && (
                                <Link
                                    to="/login"
                                    className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-700 hover:bg-brand-800 active:bg-brand-900 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 px-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 cursor-pointer"
                                >
                                    Sign in
                                </Link>
                            )}
                        </div>
                    </header>

                    {/* Mobile: icon button in the header opens this row. Laptop
                        uses the inline top-row bar above. One search entry per
                        viewport; the server filters rows, detail routes re-check. */}
                    {isAuthenticated && showGlobalSearch && mobileSearchOpen && (
                        <div className="border-b border-gray-200/80 bg-white/95 px-3 pb-2.5 pt-1 sm:px-4 md:hidden dark:border-white/10 dark:bg-gray-950/95">
                            <ReportSearch className="mx-auto w-full max-w-xl" />
                        </div>
                    )}

                    {/* Offline state sits directly above the content so a
                        responder can never mistake stale data for live data. */}
                    <OfflineBanner />

                    {/* Offline grace mode: the session could not be revalidated,
                        so this is a degraded identity, not a live one. The
                        badge makes that unmistakable on every screen. */}
                    {user?.offline === true && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="flex items-start gap-3 border-b border-sky-300 bg-sky-50 px-4 py-2.5 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                        >
                            <span
                                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500"
                                aria-hidden="true"
                            />
                            <p className="text-xs leading-relaxed sm:text-sm">
                                <span className="font-semibold">Offline mode.</span>{' '}
                                Signed in as {user?.name || 'reporter'} from this device — the
                                session couldn&apos;t be verified right now. Reports are saved
                                on this device and sent automatically when you reconnect.
                            </p>
                        </div>
                    )}

                    {/* Page Content Scrollable Area. The keyed div re-runs the CSS
                        enter animation on navigation. Unlike the previous
                        AnimatePresence "wait" mode there is no exit delay, so the
                        next page mounts immediately and fades in.
                        Map workspace gets compact padding so the GIS canvas can
                        stretch to the viewport instead of stopping early.

                        `fitWindow` pages fill this box exactly (see the wrapper
                        below), so at lg main itself stops scrolling: a page that
                        is sized to fit can only ever overshoot by a rounding, and
                        clipping that is strictly better than a scrollbar on a
                        workspace whose halves already scroll inside themselves.
                        Below lg the flag changes nothing — these pages keep a
                        natural height and scroll like every other page, which is
                        what a phone needs. */}
                    <main id="main-content" tabIndex={-1} data-map-scroll-container className={isMapView
                        ? `custom-scrollbar relative z-0 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pt-1 sm:px-3 sm:pt-2 lg:px-2 lg:pt-0 ${isReporter || isOperationalNavVisible ? 'pb-20 md:pb-2' : 'pb-2'}`
                        : `custom-scrollbar relative z-0 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8 lg:pt-5 ${fitWindow ? 'lg:overflow-y-hidden ' : ''}${isReporter || isOperationalNavVisible ? 'pb-20 md:pb-8' : 'pb-8'}`}>
                        {/* `lg:h-full` and not plain `h-full`: a definite height
                            is only needed where the page sizes itself against it,
                            and at smaller sizes a forced 100% would put the page's
                            overflowing content under main's bottom padding. */}
                        <div key={location.pathname} className={fitWindow ? 'page-enter lg:h-full' : 'page-enter'}>
                            {children}
                        </div>
                    </main>

                    {/* Reporter mobile bottom nav: thumb-reach primary actions.
                        Sidebar stays for full navigation + desktop; this bar only
                        handles the 4 highest-frequency reporter destinations with
                        Submit as the center FAB. */}
                    {isReporter && (
                        <nav
                            aria-label="Reporter quick navigation"
                            className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md md:hidden dark:border-white/10 dark:bg-gray-950/95"
                        >
                            <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
                                <NavLink
                                    to="/reporter"
                                    aria-label="Reporter home"
                                    aria-current={location.pathname === '/reporter' ? 'page' : undefined}
                                    className={({ isActive }) => `flex min-h-[44px] flex-col items-center justify-center gap-px rounded-lg text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isActive || location.pathname === '/reporter' ? 'text-brand-700 dark:text-sky-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                                >
                                    <HiOutlineHome className="h-[18px] w-[18px]" aria-hidden="true" />
                                    <span>Home</span>
                                </NavLink>
                                <NavLink
                                    to="/my-reports"
                                    aria-label="My reports"
                                    aria-current={location.pathname === '/my-reports' ? 'page' : undefined}
                                    className={({ isActive }) => `flex min-h-[44px] flex-col items-center justify-center gap-px rounded-lg text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isActive ? 'text-brand-700 dark:text-sky-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                                >
                                    <HiOutlineClipboardList className="h-[18px] w-[18px]" aria-hidden="true" />
                                    <span>Reports</span>
                                </NavLink>
                                <div className="flex min-h-[44px] items-start justify-center">
                                    {canSubmit ? (
                                        <Link
                                            to="/report"
                                            aria-label="Submit incident report"
                                            className="inline-flex h-10 w-10 -translate-y-2 items-center justify-center rounded-full bg-red-600 text-white shadow-md shadow-red-600/30 transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 active:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
                                        >
                                            <HiOutlineDocumentAdd className="h-5 w-5" aria-hidden="true" />
                                        </Link>
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="inline-flex h-10 w-10 -translate-y-2 items-center justify-center rounded-full bg-gray-200 text-gray-400 dark:bg-white/10 dark:text-gray-500"
                                        >
                                            <HiOutlineDocumentAdd className="h-5 w-5" aria-hidden="true" />
                                        </span>
                                    )}
                                </div>
                                <NavLink
                                    to="/dashboard"
                                    aria-label="Live incident map"
                                    aria-current={isMapView ? 'page' : undefined}
                                    className={() => `flex min-h-[44px] flex-col items-center justify-center gap-px rounded-lg text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isMapView ? 'text-brand-700 dark:text-sky-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                                >
                                    <HiOutlineGlobe className="h-[18px] w-[18px]" aria-hidden="true" />
                                    <span>Map</span>
                                </NavLink>
                                <NavLink
                                    to="/accident-history"
                                    aria-label="Accident history"
                                    aria-current={location.pathname === '/accident-history' ? 'page' : undefined}
                                    className={({ isActive }) => `flex min-h-[44px] flex-col items-center justify-center gap-px rounded-lg text-[9px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isActive ? 'text-brand-700 dark:text-sky-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                                >
                                    <HiOutlineClock className="h-[18px] w-[18px]" aria-hidden="true" />
                                    <span>History</span>
                                </NavLink>
                            </div>
                        </nav>
                    )}

                    {/* Operational quick nav: same thumb-reach pattern for the two
                        roles that previously had only the hamburger drawer. */}
                    {isOperationalNavVisible && <OperationalBottomNav role={user?.role} />}
                </div>
            </div>

        </>
    );
};

export default MainLayout;
