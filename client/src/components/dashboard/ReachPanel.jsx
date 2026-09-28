import { useId } from 'react';
import styles from './DashboardAnalyticsWorkspace.module.css';

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
export const REACH_EXPLANATION =
    'Counts unique detail viewers, not map views. Public includes anonymous visitors and verified reporters; All viewers also includes responders and municipal admins.';

const ReachPanel = ({
    title,
    description,
    rows = [],
    emptyDetail,
    footnote = null,
}) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const titleId = useId();
    const descriptionId = useId();

    return (
        <div className="flex min-w-0 flex-col">
            <div className="px-5 py-5 sm:px-6">
                <h2 id={titleId} className={styles.title}>{title}</h2>
                <p id={descriptionId} className={styles.description}>{description}</p>
            </div>

            {safeRows.length === 0 ? (
                <p className={`px-5 py-6 text-sm sm:px-6 ${styles.secondary}`}>{emptyDetail}</p>
            ) : (
                <table className="w-full table-fixed text-left" aria-labelledby={titleId} aria-describedby={descriptionId}>
                    <colgroup>
                        <col />
                        <col className="w-[4.5rem]" />
                        <col className="w-24" />
                    </colgroup>
                    <thead className={styles.reachHeader}>
                        <tr className={`text-[11px] ${styles.secondary}`}>
                            <th scope="col" className="py-2.5 pl-5 pr-2 font-medium sm:pl-6">Record</th>
                            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Public</th>
                            <th scope="col" className="whitespace-nowrap py-2.5 pl-2 pr-5 text-right font-medium sm:pr-6">All viewers</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeRows.map((row) => (
                            <tr key={row.id} className={`border-t ${styles.rule}`}>
                                <td className="break-words py-3 pl-5 pr-2 text-xs font-medium leading-relaxed sm:pl-6">
                                    {row.label}
                                    {row.municipalityName ? (
                                        <span className={`mt-0.5 block text-[11px] font-normal ${styles.subtle}`}>
                                            {row.municipalityName}
                                        </span>
                                    ) : null}
                                </td>
                                <td className={`px-3 py-3 text-right text-sm font-semibold tabular-nums ${styles.accent}`}>
                                    {row.publicViewers}
                                </td>
                                <td className={`py-3 pl-2 pr-5 text-right text-xs tabular-nums sm:pr-6 ${styles.secondary}`}>
                                    {row.uniqueViewers}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {footnote ? (
                <p className={`mt-auto border-t px-5 py-4 text-[11px] leading-relaxed sm:px-6 ${styles.rule} ${styles.subtle}`}>
                    {footnote}
                </p>
            ) : null}
        </div>
    );
};

export default ReachPanel;
