import { HiOutlineChevronDown, HiOutlinePhotograph } from 'react-icons/hi';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';

const IncidentDetailsEvidenceSection = ({
    images = [],
    evidence = null,
    evidenceCount = 0,
    accessLevel = null,
    isOwner = false,
    isOperational = false,
    onViewImage,
    collapsible = true,
    defaultOpen = true,
    className = '',
    // Optional overrides for the resolution-photos variant: a separate
    // identity from the reporter's evidence, with its own labeling.
    heading = null,
    labelVariant = 'evidence',
}) => {
    const rawImagesCount = Array.isArray(images) ? images.length : 0;
    const evidenceItemsCount = Array.isArray(evidence?.items) ? evidence.items.length : 0;
    const declaredCount = Number(evidenceCount ?? evidence?.evidenceCount ?? evidence?.count) || 0;
    const totalCount = Math.max(rawImagesCount, evidenceItemsCount, declaredCount);
    const evidenceUpload = (evidence && typeof evidence === 'object') ? evidence : {};
    const expectedCount = Math.max(0, Number(evidenceUpload.expected) || 0);
    const pendingCount = Math.max(0, Number(evidenceUpload.pending) || 0);
    const uploadStatus = evidenceUpload.uploadStatus || 'complete';
    const isPending = pendingCount > 0;
    const sectionTitle = heading || (isPending
        ? `Evidence photos (${totalCount} of ${expectedCount})`
        : `Evidence photos (${totalCount})`);
    const emptyNote = labelVariant === 'resolution' ? 'No resolution photos attached.' : 'No evidence attached.';

    // Nothing attached is stated, not implied by an absent section.
    //
    // This used to return null, so a reader could not tell an incident with no
    // photos from a gallery that failed to load — and the section was the only
    // place the record's evidence count was ever printed. The wording, icon and
    // tone are the ones the map's incident pane already uses for the same state,
    // so the two surfaces answer the question the same way. It is deliberately
    // not a `<details>`: there is nothing to expand, and a chevron over an empty
    // body promises content that is not there.
    // A zero received count means "none attached" only when nothing is
    // expected. While uploads are pending the record supports no such
    // claim, so the section falls through to show the "0 of N" title and
    // the pending notice instead.
    if (totalCount === 0 && !isPending) {
        return (
            <section className={className} aria-labelledby="incident-evidence-heading">
                <h3
                    id="incident-evidence-heading"
                    className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white"
                >
                    {labelVariant === 'resolution' ? 'Resolution photos (0)' : 'Evidence photos (0)'}
                </h3>
                <p className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <HiOutlinePhotograph className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    {emptyNote}
                </p>
            </section>
        );
    }

    const content = (
        <div className="mt-2.5">
            {isPending && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">
                    <p className="text-xs font-semibold text-amber-900">
                        {uploadStatus === 'uploading'
                            ? 'Evidence still uploading'
                            : 'Evidence not received'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                        {totalCount} of {expectedCount} photo{expectedCount === 1 ? '' : 's'} received.
                        {uploadStatus === 'uploading'
                            ? ' The reporter is on a weak connection; the remaining photos arrive automatically.'
                            : ' The reporter may have closed the app before the upload finished.'}
                    </p>
                </div>
            )}
            {totalCount > 0 ? (
                <ProtectedEvidenceGallery
                    images={images}
                    evidence={evidence}
                    accessLevel={accessLevel}
                    isOwner={isOwner}
                    isOperational={isOperational}
                    variant="stacked"
                    labelVariant={labelVariant}
                    onViewImage={onViewImage}
                />
            ) : null}
        </div>
    );

    if (!collapsible) {
        return (
            <section className={className} aria-labelledby="incident-evidence-heading">
                <h3 id="incident-evidence-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                    {sectionTitle}
                </h3>
                {content}
            </section>
        );
    }

    return (
        <section className={className}>
            <details className="group" open={defaultOpen || undefined}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                        <HiOutlinePhotograph className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                            {sectionTitle}
                        </span>
                    </span>
                    <HiOutlineChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" aria-hidden="true" />
                </summary>
                {content}
            </details>
        </section>
    );
};

export default IncidentDetailsEvidenceSection;
