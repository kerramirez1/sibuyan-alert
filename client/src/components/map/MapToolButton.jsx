import { forwardRef } from 'react';

/**
 * One control in a MapLibre map's own tool rail.
 *
 * Lifted out of `MapView` unchanged so the rail's family has one definition: the
 * map's built-in tools (`MapView`) and the tools a workspace adds to the same
 * rail (map scope, see `MapScopeControl`) are the same button — same 28px
 * footprint, same surface, same focus ring, same `active` treatment — instead of
 * two components that were styled to match once and then drifted.
 *
 * The `before:-inset-2` overlay is what makes a 28px control a comfortable
 * touch target without drawing a 44px button: the visual size is the family's,
 * the hit area is not.
 */
const MAP_TOOL_BUTTON_CLASS = 'relative flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-700 shadow-2xs transition-all duration-150 hover:bg-white hover:text-gray-950 hover:border-gray-300 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:border-white/10 dark:bg-[#0c1813] dark:text-gray-200 dark:hover:bg-[#07130e] dark:hover:border-white/20 dark:hover:text-white cursor-pointer before:absolute before:-inset-2 before:content-[\'\']';

/**
 * `forwardRef` because a rail control that opens something has to be able to
 * hand focus back to itself when it closes, and a function component cannot be
 * given a ref. The ref lands on the real button, not on a wrapper.
 */
export const MapToolButton = forwardRef(({ label, icon: Icon, active = false, children, ...props }, ref) => (
    <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        // `!` because the base class already sets a border and a surface, and the
        // active state has to win over them regardless of rule order.
        className={`${MAP_TOOL_BUTTON_CLASS} ${active ? '!border-emerald-400/80 !bg-emerald-50/95 !text-emerald-800 shadow-xs dark:!border-emerald-600/60 dark:!bg-emerald-950/80 dark:!text-emerald-300' : ''}`}
        {...props}
    >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {children}
    </button>
));
MapToolButton.displayName = 'MapToolButton';

export default MapToolButton;
