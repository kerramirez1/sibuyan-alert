/**
 * Reach panel — who opened this record's details, counted once per viewer.
 *
 * Two numbers per row, and the difference matters:
 *   Viewers  — distinct people who opened the details.
 *   Guests   — how many of them were anonymous members of the public.
 *
 * The guest figure is the one that drives a decision: if a hazard warning was
 * opened by very few members of the public, that is the case for pushing it
 * through a second channel (SMS, radio). The responder and reporter slices were
 * deliberately left out — "a responder opened it" is a weaker signal than the
 * respond action the system already records properly.
 *
 * The footnote is not decoration. "Views" invites the reading "how many people
 * saw it", which this is not: a pin scrolling past on the map counts for
 * nothing. Stating that in the UI is the only way the number is not misread.
 */
const ReachPanel = ({ title, description, rows = [], emptyDetail }) => {
    const safeRows = Array.isArray(rows) ? rows : [];

    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0c1813]/90">
            <div className="border-b border-gray-100 px-3 py-2 dark:border-white/5">
                <h2 className="font-display text-sm font-bold text-gray-950 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
            </div>

            {safeRows.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">{emptyDetail}</p>
            ) : (
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <th scope="col" className="px-3 py-1.5 font-bold">Record</th>
                            <th scope="col" className="px-3 py-1.5 text-right font-bold">Viewers</th>
                            <th scope="col" className="px-3 py-1.5 text-right font-bold">Guests</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeRows.map((row) => (
                            <tr key={row.id} className="border-t border-gray-100 dark:border-white/5">
                                <td className="px-3 py-1.5 text-xs font-medium text-gray-900 dark:text-gray-100">
                                    {row.label}
                                    {row.municipalityName ? (
                                        <span className="ml-1 text-[11px] text-gray-500 dark:text-gray-400">
                                            · {row.municipalityName}
                                        </span>
                                    ) : null}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                    {row.uniqueViewers}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">
                                    {row.guestViewers}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-500 dark:border-white/5 dark:text-gray-400">
                Counts someone opening the details. Seeing a pin on the map is not counted, and repeat
                opens by the same viewer count once.
            </p>
        </div>
    );
};

export default ReachPanel;
