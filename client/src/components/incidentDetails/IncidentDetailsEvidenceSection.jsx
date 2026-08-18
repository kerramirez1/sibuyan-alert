import { HiOutlineChevronDown, HiOutlinePhotograph } from 'react-icons/hi';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';

const IncidentDetailsEvidenceSection = ({
    images = [],
    evidenceCount = 0,
    onViewImage,
    collapsible = true,
    defaultOpen = true,
    className = '',
}) => {
    const totalCount = Math.max(images.length, evidenceCount);

    if (totalCount === 0) {
        return null;
    }

    const content = (
        <div className="mt-2.5">
            <ProtectedEvidenceGallery images={images} onViewImage={onViewImage} />
        </div>
    );

    if (!collapsible) {
        return (
            <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`} aria-labelledby="incident-evidence-heading">
                <h3 id="incident-evidence-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                    Evidence photos ({totalCount})
                </h3>
                {content}
            </section>
        );
    }

    return (
        <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`}>
            <details className="group" open={defaultOpen || undefined}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                        <HiOutlinePhotograph className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                            Evidence photos ({totalCount})
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
