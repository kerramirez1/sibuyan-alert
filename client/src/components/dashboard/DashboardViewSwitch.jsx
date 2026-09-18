import { Link } from '../../router';

/**
 * Map | Analytics switch for the one role that has both.
 *
 * The dashboard is the incident map for every role. Analytics is a
 * municipal_admin surface, so this control is rendered only for them — a switch
 * with one option is not a switch.
 *
 * Before this, the map was opt-in (`?view=map`) and analytics was the default, so
 * the municipal admin landed on charts while guests, reporters, and responders
 * all landed on the map. The role with incidents to triage was the one furthest
 * from the map, and their own nav carried a "Map" link and an "Analytics" link
 * that pointed at the same URL with different meanings.
 *
 * Links, not buttons: each view is a real URL, so it can be deep-linked, opened
 * in a new tab, and backed out of with the browser's back button. A button that
 * swapped state internally would take all three away for no gain.
 *
 * It renders outside the workspaces' <Suspense> on purpose. Both workspaces are
 * lazy chunks, so a control rendered inside one would disappear and reappear
 * with the chunk — the user would tap Analytics and watch the way back vanish
 * while the chart bundle loads.
 */
const VIEW_OPTION_BASE = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1';

const OPTIONS = [
    { key: 'map', label: 'Map', href: '/dashboard' },
    { key: 'analytics', label: 'Analytics', href: '/dashboard?view=analytics' },
];

const DashboardViewSwitch = ({ active = 'map' }) => (
    <div
        role="group"
        aria-label="Dashboard view"
        className="mx-auto mb-3 flex w-full max-w-[1500px] items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 sm:mb-4 dark:border-white/10 dark:bg-[#0c1813]/90"
    >
        {OPTIONS.map((option) => {
            const isActive = option.key === active;

            return (
                <Link
                    key={option.key}
                    to={option.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${VIEW_OPTION_BASE} ${isActive
                        ? 'bg-brand-700 text-white dark:bg-brand-600'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white'
                        }`}
                >
                    {option.label}
                </Link>
            );
        })}
    </div>
);

export default DashboardViewSwitch;
