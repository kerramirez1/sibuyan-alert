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
 */
const VIEW_OPTION_BASE = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

const OPTIONS = [
    { key: 'map', label: 'Map', href: '/dashboard' },
    { key: 'analytics', label: 'Analytics', href: '/dashboard?view=analytics' },
];

/**
 * A compact segmented control with no page furniture of its own.
 *
 * It used to be a full-width 1500px bar in a row of its own above the page
 * title. A panel that wide holding two words made a secondary control look like
 * the headline, and moving it right-aligned in that row left the rest of the
 * band empty — a 76px gap between the app bar and the heading that read as
 * unfinished space rather than as room for a control.
 *
 * Callers now drop it into the page header row, so the title leads and this sits
 * at its top-right, and the row costs nothing extra. The caller keeps it mounted
 * across view changes (see DashboardPage): it sits in the header of whichever
 * workspace is rendered, and each workspace is a lazy chunk, so a control
 * rendered nowhere else would vanish for as long as the other chunk takes to
 * load.
 *
 * The options keep their `min-h-8` hit height and stay real links.
 */
const DashboardViewSwitch = ({ active = 'map' }) => (
    <div
        role="group"
        aria-label="Dashboard view"
        className="inline-flex items-center gap-1 rounded-lg bg-gray-100/80 p-1 ring-1 ring-gray-200/80 dark:bg-white/5 dark:ring-white/10"
    >
        {OPTIONS.map((option) => {
            const isActive = option.key === active;

            return (
                <Link
                    key={option.key}
                    to={option.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${VIEW_OPTION_BASE} ${isActive
                        ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-600'
                        : 'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                >
                    {option.label}
                </Link>
            );
        })}
    </div>
);

export default DashboardViewSwitch;
