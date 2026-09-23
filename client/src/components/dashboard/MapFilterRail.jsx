import { HiOutlineCollection } from 'react-icons/hi';
import { toSafeArray } from '../../utils/safeCollection';
import { MAP_ACTIVE_INCIDENT_CONFIG, MAP_STATUS_CONFIG } from '../../config/mapVisuals';

/**
 * The map's filter rail: the status tabs that scope a map view, and the hazard
 * layer plus the archive behind a divider on the same line.
 *
 * It lives here rather than inside the dashboard workspace because two views
 * draw the map — the operations workspace and the analytics workspace — and the
 * tabs are the one control they share. They used to be built twice, and the two
 * were not the same control: the analytics row rendered its selected state as
 * `border-b-2`, which no longer draws anything at all (see `MapRailTab`), so the
 * analytics legend had no selected tab while the map's rail had one. One
 * component, one selected state, whatever surface renders it.
 *
 * The composite sits on its own line ABOVE the map and summary row in the
 * operations workspace rather than inside the map card, and that placement is
 * why it is worth a component. Measured in the app's own font, the five controls
 * need 615px with one-digit counts, 645px with two and 667px with three — and the
 * narrowest desktop workspace, a 1024px viewport, is 720px wide. Full width they
 * therefore fit on one line at every desktop width, counts included, with ~50px
 * to spare. Inside the map card the rail had only the map column: ~400px at
 * 1024px, ~640px at 1280px, so on a laptop it wrapped onto a second row that cost
 * the canvas ~80px of height and read as a second, unrelated toolbar. The tabs
 * also now describe what they do — they scope the whole view, the canvas and the
 * record lists beside it — instead of looking like options of the map only.
 *
 * `group` decides the shape: status tabs first, then the hazard layer and the
 * archive behind a divider and a glyph, so a layer can never read as a fourth
 * status. A role changes what happens to a record, not what the rail is called —
 * see mapExperience. A caller that needs different wording per tab (or a
 * different, narrower filter set, as analytics does) supplies `title` and the
 * tab list; the look is not a parameter.
 */

/**
 * Rail tones: the colour of a rail tab is the colour of its own status dot —
 * the same dot the overview card prints and the legend swatches — so a tab, a
 * card, and a legend entry for one status cannot drift apart. `all` is a scope
 * rather than a status, so it keeps the neutral tone instead of borrowing the
 * brand colour and implying it filters something.
 */
export const RAIL_TONES = {
    neutral: {
        dot: 'bg-gray-400', selectedSurface: 'bg-gray-100/80 dark:bg-white/10', selectedText: 'text-gray-900 dark:text-white', bar: 'bg-gray-500',
    },
    amber: {
        dot: MAP_STATUS_CONFIG.pending.dot, selectedSurface: 'bg-amber-50/80 dark:bg-amber-500/10', selectedText: 'text-amber-900 dark:text-amber-200', bar: MAP_STATUS_CONFIG.pending.dot,
    },
    blue: {
        dot: MAP_ACTIVE_INCIDENT_CONFIG.dot, selectedSurface: 'bg-blue-50/80 dark:bg-blue-500/10', selectedText: 'text-blue-900 dark:text-blue-200', bar: MAP_ACTIVE_INCIDENT_CONFIG.dot,
    },
    red: {
        dot: 'bg-red-500', selectedSurface: 'bg-red-50/80 dark:bg-red-500/10', selectedText: 'text-red-900 dark:text-red-200', bar: 'bg-red-500',
    },
    emerald: {
        dot: MAP_STATUS_CONFIG.resolved.dot, selectedSurface: 'bg-green-50/80 dark:bg-green-500/10', selectedText: 'text-green-900 dark:text-green-200', bar: MAP_STATUS_CONFIG.resolved.dot,
    },
};
// Every value a filter can take, not just the three tabs a rail ships today:
// these same lookups draw the mobile summary line, which renders whatever filter
// a deep link arrived with. An unmapped value would silently fall back to the
// neutral tone — the colour of "no status", which is the drift this table is
// here to prevent.
export const RAIL_TONE_BY_FILTER = {
    all: 'neutral',
    pending: 'amber',
    verified: 'blue',
    active: 'blue',
    dispatch: 'blue',
    // Responding is one of the handled states and wears the same blue (see
    // ACTIVE_INCIDENT_BLUE), so it shares the blue rail tone: a cyan-tinted tab
    // over a blue dot was the rail contradicting its own swatch.
    responding: 'blue',
    // Transferred is the third of those states (see ACTIVE_INCIDENT_BLUE). The
    // three are one tab now, so nothing here lists it on its own — but a deep
    // link, a saved filter or a future tab can name it, and it must not land on
    // the neutral grey, which would call it "no status".
    transferred: 'blue',
    'risk-zones': 'red',
    resolved: 'emerald',
};

export const getRailTone = (filterValue) => RAIL_TONE_BY_FILTER[filterValue] || 'neutral';

// One dot per filter, shared by the desktop rail, the mobile summary line and
// the mobile sheet. Three surfaces, one lookup.
export const getRailDotClass = (filterValue) => RAIL_TONES[getRailTone(filterValue)].dot;

/**
 * One control in the map rail.
 *
 * The selected state is a tinted surface plus a 2px bar, not a `border-b-2`
 * underline: the base stylesheet forces every button's border-color
 * transparent, so an underline tab rendered with no line at all and the tab
 * that was supposed to read as selected looked exactly like the two beside it.
 */
export const MapRailTab = ({ label, count, tone = 'neutral', selected, onClick, title, ariaLabel }) => {
    const styles = RAIL_TONES[tone] || RAIL_TONES.neutral;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            title={title}
            aria-label={ariaLabel}
            // The native target carries its own hit area; adjacent filters do not overlap.
            className={`relative -mb-px inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg px-2.5 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${selected
                ? `${styles.selectedSurface} font-semibold ${styles.selectedText}`
                : `font-normal text-gray-500 hover:bg-white/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white${count === 0 ? ' opacity-60' : ''}`
                }`}
        >
            <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
            <span>{label}</span>
            <span className={`text-[10px] font-medium tabular-nums ${selected ? '' : 'text-gray-400 dark:text-gray-500'}`}>
                {count}
            </span>
            {/* The 2px bar is the selected cue ON the rail's baseline, so it only
                means anything while the tabs share one row with that baseline.
                Below sm they do not — analytics renders this rail inside the map
                card at every width, where four tabs need ~480px and a phone has
                330, so the row wraps and the bar would hang in the middle of the
                panel under a first-row tab. Phones get the tinted surface and the
                bold label instead; the bar returns at sm, where the tabs fit on
                one line again. (The operations workspace hides the whole rail
                below lg, so this is the analytics rail's own case.) */}
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-2 -bottom-px hidden h-[2px] rounded-full sm:block ${selected ? styles.bar : 'bg-transparent'}`}
            />
        </button>
    );
};

/**
 * The tooltip a status tab wears when its caller did not supply one: the rail's
 * two cases are scope-dependent (`all` means the whole open set only when the
 * viewer receives pending rows) and "awaiting review" is what the remaining
 * tabs of that rail are. A caller that ships a different or narrower tab set
 * passes `title` per tab instead.
 */
const statusTabTitle = (filter, showPendingReports) => {
    if (filter.title) return filter.title;
    if (filter.value === 'all') {
        return showPendingReports
            ? 'All open reports (pending + being handled)'
            : 'Active ongoing incidents';
    }
    return 'Unverified reports awaiting review';
};

export const MapFilterRail = ({
    filters = [],
    showPendingReports = false,
    selectedFilter,
    onSelectFilter,
    getCount,
}) => {
    const statusFilters = toSafeArray(filters).filter((filter) => filter.group === 'status');
    const layerFilters = toSafeArray(filters).filter((filter) => filter.group === 'layers');
    const countOf = (value) => (typeof getCount === 'function' ? getCount(value) : 0);

    return (
        <>
            {statusFilters.map((filter) => {
                const count = countOf(filter.value);
                const isSelected = selectedFilter === filter.value;

                return (
                    <MapRailTab
                        key={filter.value}
                        label={filter.label}
                        count={count}
                        tone={getRailTone(filter.value)}
                        selected={isSelected}
                        onClick={() => onSelectFilter(filter.value)}
                        title={statusTabTitle(filter, showPendingReports)}
                        ariaLabel={`${filter.label} filter (${count} ${count === 1 ? 'record' : 'records'})${isSelected ? ', selected' : ''}`}
                    />
                );
            })}
            {layerFilters.length > 0 && (
                <span
                    className="flex shrink-0 items-end gap-x-1 self-stretch border-l border-gray-200 pl-2 dark:border-white/10"
                    role="group"
                    aria-label="Layers and archive"
                >
                    {/* A layers glyph, not the words "Layers & archive": the
                        stacked-sheets icon is the map convention for this group
                        and costs ~16px where the label needed ~110px. Nothing is
                        lost to a screen reader — the group keeps its full
                        accessible name, and each control keeps its own title. */}
                    <span className="hidden pb-2 text-gray-400 lg:inline dark:text-gray-500" aria-hidden="true">
                        <HiOutlineCollection className="h-3.5 w-3.5" />
                    </span>
                    <MapRailTab
                        label={layerFilters.find((filter) => filter.value === 'risk-zones')?.label || 'Risk zones'}
                        count={countOf('risk-zones')}
                        tone={getRailTone('risk-zones')}
                        selected={selectedFilter === 'risk-zones'}
                        onClick={() => onSelectFilter(selectedFilter === 'risk-zones' ? 'all' : 'risk-zones')}
                        title="Toggle the mapped hazard layer"
                        ariaLabel={`Risk zones layer (${countOf('risk-zones')} ${countOf('risk-zones') === 1 ? 'zone' : 'zones'})${selectedFilter === 'risk-zones' ? ', shown' : ''}`}
                    />
                    <MapRailTab
                        label={layerFilters.find((filter) => filter.value === 'resolved')?.label || 'Resolved archive'}
                        count={countOf('resolved')}
                        tone={getRailTone('resolved')}
                        selected={selectedFilter === 'resolved'}
                        onClick={() => onSelectFilter('resolved')}
                        title="View the resolved incident archive"
                        ariaLabel={`Resolved archive (${countOf('resolved')} ${countOf('resolved') === 1 ? 'record' : 'records'})${selectedFilter === 'resolved' ? ', selected' : ''}`}
                    />
                </span>
            )}
        </>
    );
};

export default MapFilterRail;
