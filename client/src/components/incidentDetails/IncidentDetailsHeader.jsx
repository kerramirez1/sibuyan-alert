import { HiOutlineX } from 'react-icons/hi';
import { formatIncidentLabel } from '../../utils/incidentDetails';
import { MAP_STATUS_CONFIG } from '../../config/mapVisuals';

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
    moderate: { label: 'Moderate', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300', dot: 'bg-amber-500' },
    severe: { label: 'Severe', badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300', dot: 'bg-orange-500' },
    critical: { label: 'Critical', badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300', dot: 'bg-red-500' },
};

const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold';

const IncidentDetailsHeader = ({
    title,
    status = 'verified',
    severity = 'moderate',
    incidentType = '',
    onClose,
    closeRef,
}) => {
    const statusCfg = MAP_STATUS_CONFIG[status] || MAP_STATUS_CONFIG.verified;
    const severityCfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.moderate;
    const formattedType = formatIncidentLabel(incidentType, '');

    return (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200/80 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-gray-950 sm:px-5">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-sky-400">
                    Incident details
                </p>
                <h2 className="mt-1 line-clamp-2 break-words font-display text-lg font-bold leading-6 text-gray-950 dark:text-white">
                    {title || 'Incident Report'}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`${BADGE_BASE} ${statusCfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
                        <span className="capitalize">{status}</span>
                    </span>
                    <span className={`${BADGE_BASE} ${severityCfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${severityCfg.dot}`} aria-hidden="true" />
                        <span className="capitalize">{severityCfg.label}</span> severity
                    </span>
                    {formattedType && (
                        <span className={`${BADGE_BASE} border-gray-200/90 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300`}>
                            {formattedType}
                        </span>
                    )}
                </div>
            </div>
            {typeof onClose === 'function' && (
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="Close incident details"
                >
                    <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                </button>
            )}
        </header>
    );
};

export default IncidentDetailsHeader;
