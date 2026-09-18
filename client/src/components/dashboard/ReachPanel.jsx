/**
 * Reach panel — who opened this record's details, counted once per viewer.
 *
 * Two numbers per row, and the difference between them is the point:
 *
 *   Public       — distinct members of the community who opened it: anonymous
 *                  visitors plus verified reporters. Headline, and the order the
 *                  rows arrive in, because it is the only figure that answers the
 *                  operational question the metric exists for.
 *   All viewers  — everyone, including responders and municipal admins. It is the
 *                  context for the headline: "0 public / 1 all viewers" says only
 *                  the office has opened this, which is a different situation from
 *                  "1 public / 1 all viewers".
 *
 * The first version of this panel showed a single "Viewers" column that mixed all
 * roles. On a municipal dashboard that number is dominated by the office reading
 * its own queue, so it read as community awareness while measuring staff
 * activity — the one thing a reach figure must not do. Splitting the roles fixed
 * the meaning of the number rather than the number itself.
 *
 * An intermediate revision added a third column for anonymous guests. It was
 * removed: guests are a SUBSET of Public (the difference being verified
 * reporters), so the two columns tied on every row where no reporter had opened
 * the record — a duplicate number that invited exactly the question "why are
 * these different?" instead of answering anything. The guest slice is still
 * computed and returned by the API; it just does not earn a column that restates
 * its neighbour. Two figures that disagree carry information; three where two
 * agree carry noise.
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
                            <th scope="col" className="whitespace-nowrap px-3 py-1.5 text-right font-bold">Public</th>
                            {/* `whitespace-nowrap` because the record label is the column
                                that should absorb the squeeze: in the two-panel dashboard
                                layout these headers were the first thing to run out of
                                width, so "All viewers" broke onto two lines while the
                                numbers beneath it stayed on one. */}
                            <th scope="col" className="whitespace-nowrap px-3 py-1.5 text-right font-bold">All viewers</th>
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
                                    {row.publicViewers}
                                </td>
                                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">
                                    {row.uniqueViewers}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-500 dark:border-white/5 dark:text-gray-400">
                Counts someone opening the details. Seeing a pin on the map is not counted, and repeat
                opens by the same viewer count once. Public is anonymous visitors and verified
                reporters; All viewers also includes responders and municipal admins.
            </p>
        </div>
    );
};

export default ReachPanel;
