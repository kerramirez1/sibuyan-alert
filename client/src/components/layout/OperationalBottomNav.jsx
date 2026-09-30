import { NavLink, useLocation } from '../../router';
import {
    HiOutlineClipboardList,
    HiOutlineGlobe,
    HiOutlineHome,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
} from 'react-icons/hi';

/**
 * Thumb-reach bottom navigation for the operational roles (municipal admin and
 * responder), mirroring the reporter bar.
 *
 * Reporters already had one. Admin and responder did not, so on a phone the two
 * roles whose work is time-sensitive — triage and dispatch — reached everything
 * through the hamburger drawer, which is the farthest tap from a thumb. The bar
 * carries the four destinations each role opens most, taken from the order the
 * desktop sidebar already uses rather than invented here.
 *
 * Deliberately no center FAB: the reporter's bar has one because "submit a
 * report" is the single action that role exists to take. Neither operational
 * role has an equivalent create action, so a fake centerpiece would be
 * decoration that competes with the real work.
 *
 * `Zones` resolves differently per role on purpose: a municipal admin manages
 * hazard zones on their own page (`/admin/zones`), while a responder reads them
 * on the map, so their tap opens the map with the hazard panel already showing.
 * Same word, the right destination for each role.
 */
const NAV_ITEM_CLASS = (isActive) => [
    'flex min-h-[44px] flex-col items-center justify-center gap-px rounded-lg text-[9px] font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    isActive
        ? 'text-brand-700 dark:text-sky-400'
        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white',
].join(' ');

const OperationalBottomNav = ({ role }) => {
    const location = useLocation();
    const isResponder = role === 'responder';
    const isOnMap = location.pathname === '/dashboard';
    const panel = new URLSearchParams(location.search).get('panel');
    const isDispatchView = new URLSearchParams(location.search).get('view') === 'dispatch-queue';

    const items = [
        { key: 'home', label: 'Home', href: '/admin', icon: HiOutlineHome, active: location.pathname === '/admin' },
        isResponder
            ? {
                key: 'dispatch',
                label: 'Dispatch',
                href: '/admin/reports?view=dispatch-queue',
                icon: HiOutlineClipboardList,
                active: location.pathname === '/admin/reports' && isDispatchView,
            }
            : {
                key: 'reports',
                label: 'Reports',
                href: '/admin/reports',
                icon: HiOutlineClipboardList,
                active: location.pathname === '/admin/reports' && !isDispatchView,
            },
        {
            key: 'map',
            label: 'Map',
            href: '/dashboard',
            icon: HiOutlineGlobe,
            // Every /dashboard state is the map now that analytics moved behind
            // ?view=analytics, so the only thing left to exclude is the hazard
            // panel, which the fourth item owns.
            active: isOnMap && panel !== 'zones',
        },
        isResponder
            ? {
                key: 'hazards',
                label: 'Hazards',
                href: '/dashboard?panel=zones',
                icon: HiOutlineLightningBolt,
                active: isOnMap && panel === 'zones',
            }
            : {
                key: 'zones',
                label: 'Zones',
                href: '/admin/zones',
                icon: HiOutlineLocationMarker,
                active: location.pathname === '/admin/zones',
            },
    ];

    return (
        <nav
            aria-label="Operational quick navigation"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md md:hidden dark:border-white/10 dark:bg-gray-950/95"
        >
            <div className="mx-auto grid max-w-md grid-cols-4 items-end px-2">
                {items.map((item) => (
                    <NavLink
                        key={item.key}
                        to={item.href}
                        aria-label={item.label}
                        aria-current={item.active ? 'page' : undefined}
                        className={() => NAV_ITEM_CLASS(item.active)}
                    >
                        <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default OperationalBottomNav;
