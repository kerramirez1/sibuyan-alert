import { useEffect, useId, useRef, useState } from 'react';
import { HiOutlineChevronDown, HiOutlineCollection, HiOutlineCheck } from 'react-icons/hi';

/**
 * The map's layer control: one compact button, and a popover of switches.
 *
 * It exists because the legend *is* the control — each switch carries its own
 * colour and its own name, so there is one place to look and no second copy of
 * the same facts to drift out of step. What changed is the cost of having it on
 * screen: as a row of chips in the map header it wrapped to two or four lines and
 * pushed the canvas down, which is exactly backwards on a surface whose whole job
 * is map.
 *
 * Collapsed, so nothing is claimed about height; opened, it overlays the corner
 * of the canvas it describes rather than the page around it.
 *
 * It renders whatever groups it is handed and owns no layer state at all: the
 * page decides which layers exist, which are on, and what each colour is. That
 * keeps the popover reusable for the next layer and means a toggle cannot
 * disagree with the switch it came from.
 *
 * Interaction is deliberate rather than incidental:
 *
 * - A switch is a `button role="switch"` with `aria-checked`, so it announces
 *   its state instead of relying on a tick glyph.
 * - The menu closes on a click anywhere outside, and on `Escape` — which returns
 *   focus to the button, so a keyboard user who opened it and changed their mind
 *   is not dropped at the top of the document.
 * - A class with nothing to draw stays visible, disabled, with the reason in its
 *   tooltip. Hiding it would make the control change shape as the data moves.
 *
 * @param {{ groups?: Array<{ id: string, label: string, items: Array<{ id: string, label: string, color: string, active: boolean, disabled?: boolean, title?: string, onToggle?: Function }> }>, label?: string, panelLabel?: string }} props
 */
const MapLayerControl = ({
    groups = [],
    label = 'Layers',
    panelLabel = 'Map layers',
}) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);
    const panelId = useId();

    const activeCount = groups.reduce(
        (total, group) => total + group.items.filter((item) => item.active).length,
        0
    );

    useEffect(() => {
        if (!open) return undefined;

        const closeOnOutside = (event) => {
            // The button is excluded as well as the panel, so pressing it while
            // open toggles the menu shut once (via onClick) rather than closing
            // here and reopening there.
            if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) {
                return;
            }
            setOpen(false);
        };

        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            buttonRef.current?.focus();
        };

        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);

        return () => {
            document.removeEventListener('pointerdown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                aria-expanded={open}
                aria-controls={panelId}
                aria-haspopup="true"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 cursor-pointer dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-white"
            >
                <HiOutlineCollection className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
                {/* How many layers are on, so the button carries the state that
                    the popover would otherwise have to be opened to see. */}
                {activeCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white" aria-hidden="true">
                        {activeCount}
                    </span>
                )}
                <HiOutlineChevronDown
                    className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>

            {open && (
                <div
                    id={panelId}
                    ref={panelRef}
                    role="group"
                    aria-label={panelLabel}
                    // Inset from the map's own control column once the card is wide
                    // enough to spend the room: MapLibre's zoom buttons live in the
                    // canvas's top-right corner, directly under this popover, and
                    // opening a layer menu should not take the zoom buttons with it.
                    // Below `sm` there is not enough width to have both, so the menu
                    // takes the corner and the buttons come back when it closes.
                    className="absolute right-0 top-full z-40 mr-0 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg sm:mr-11 dark:border-white/10 dark:bg-[#0c1813]"
                >
                    {groups.map((group, groupIndex) => (
                        <div
                            key={group.id}
                            className={`py-1.5 ${groupIndex > 0 ? 'border-t border-gray-100 dark:border-white/5' : 'pt-0'} ${groupIndex === groups.length - 1 ? 'pb-0' : ''}`}
                        >
                            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                {group.label}
                            </p>
                            {group.items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="switch"
                                    aria-checked={item.active}
                                    disabled={item.disabled}
                                    title={item.title}
                                    onClick={() => item.onToggle?.()}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${
                                        item.active
                                            ? 'font-medium text-gray-900 dark:text-white'
                                            : 'font-normal text-gray-600 dark:text-gray-300'
                                    } ${item.disabled
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5'}`}
                                >
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                        style={{ backgroundColor: item.color }}
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
                                    {item.active && (
                                        <HiOutlineCheck className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-gray-200" aria-hidden="true" />
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MapLayerControl;
