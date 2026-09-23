import {
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
import { getMapStatusDot } from '../../config/mapVisuals';
import {
    ADMIN_ROLES,
    getRoleStatuses,
    INCIDENT_STATUS,
} from './incidentReportConfig';

const RESPONDER_VIEW_COPY = {
    available: {
        title: 'Available incidents',
        description: 'Verified and transferred incidents available for response.',
    },
    municipalActive: {
        title: 'Municipal active incidents',
        description: 'All verified, transferred, and responding incidents in your municipality.',
    },
    active: {
        title: 'My active responses',
        description: 'Incidents currently assigned to your response unit.',
    },
    history: {
        title: 'Response history',
        description: 'Resolved incidents handled by your response unit.',
    },
    all: {
        title: 'Incident reports',
        description: 'Municipality-scoped incident records available to responders.',
    },
};

const RESPONDER_VIEWS = [
    { value: 'available', label: 'Available' },
    { value: 'municipalActive', label: 'Municipal active' },
    { value: 'active', label: 'My active' },
    { value: 'history', label: 'History' },
    { value: 'all', label: 'All incidents' },
];

const toCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const getResponderIncidentTotal = (stats, fallback) => {
    if (!stats) return toCount(fallback);
    return ['verified', 'transferred', 'responding', 'resolved']
        .reduce((total, key) => total + toCount(stats[key]), 0);
};

const formatLastUpdatedTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

const ResponderQueueControls = ({
    responderView,
    onResponderViewChange,
    stats,
    resultCount,
    lastUpdatedAt,
    status,
    setStatus,
    searchDraft,
    setSearchDraft,
    appliedSearch,
    applySearch,
    clearFilters,
    onRefresh,
    loading,
}) => {
    const activeResponderView = RESPONDER_VIEW_COPY[responderView] || RESPONDER_VIEW_COPY.all;
    const hasFilters = Boolean((responderView === 'all' && status) || appliedSearch);
    // MVP honesty: the stats total uses a transfer-inclusive municipal scope,
    // while each queue view is a stricter server-filtered query. Show the
    // active view's own result count so the headline never contradicts the list
    // (e.g. "4 incidents" above an empty dispatch queue).
    const incidentTotal = responderView === 'all'
        ? getResponderIncidentTotal(stats, resultCount)
        : toCount(resultCount);
    const lastUpdatedLabel = formatLastUpdatedTime(lastUpdatedAt);

    return (
        <>
            <header className="page-header mb-5">
                <div className="min-w-0">
                    <p className="page-eyebrow">
                        Responder operations
                    </p>
                    <h1 className="page-title">
                        Incident reports
                    </h1>
                    <p className="page-description">
                        Municipality-scoped incident records available to responders.
                    </p>
                    {stats && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Operational totals">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{incidentTotal} incident{incidentTotal === 1 ? '' : 's'}</span>
                            {responderView === 'all' && (
                                <>
                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                                    <span>{toCount(stats.responding)} responding</span>
                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                                    <span>{toCount(stats.resolved)} resolved</span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex min-h-9 shrink-0 items-center gap-2 self-start text-xs text-gray-500 dark:text-gray-400">
                    {lastUpdatedLabel && (
                        <time dateTime={new Date(lastUpdatedAt).toISOString()} className="tabular-nums">
                            Last updated {lastUpdatedLabel}
                        </time>
                    )}
                    {lastUpdatedLabel && <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="btn-outline"
                    >
                        <HiOutlineRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <nav className="mb-5" aria-label="Responder incident views">
                <div className="filter-tabs">
                    {RESPONDER_VIEWS.map((view) => {
                        const active = responderView === view.value;
                        return (
                            <button
                                key={view.value}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                onClick={() => onResponderViewChange(view.value)}
                                className="filter-tab"
                            >
                                {view.label}
                            </button>
                        );
                    })}
                </div>
            </nav>

            <section aria-label="Incident filters" className="surface-panel mb-5 p-4 sm:p-5">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applySearch();
                    }}
                    className="flex min-w-0 flex-col gap-2 sm:flex-row"
                >
                    <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Search incidents</span>
                        <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Search address, description, or municipality"
                            className="field-control pl-9"
                        />
                    </label>
                    <button
                        type="submit"
                        className="btn-primary w-full sm:w-auto"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="btn-outline w-full sm:w-auto"
                        >
                            <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </form>

                <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {responderView === 'all' ? 'Status' : 'Scope'}
                    </span>
                    {responderView !== 'all' ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{activeResponderView.description}</p>
                    ) : (
                        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Filter by status">
                            <button
                                type="button"
                                aria-pressed={status === ''}
                                onClick={() => setStatus('')}
                                className="filter-tab"
                            >
                                All statuses
                            </button>
                            {getRoleStatuses('responder').map((statusValue) => {
                                const config = INCIDENT_STATUS[statusValue];
                                const active = status === statusValue;
                                return (
                                    <button
                                        key={statusValue}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setStatus(statusValue)}
                                        className="filter-tab"
                                    >
                                        {config.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        </>
    );
};

const IncidentQueueControls = ({
    role,
    municipality,
    responderView,
    onResponderViewChange,
    stats,
    resultCount,
    lastUpdatedAt,
    status,
    setStatus,
    searchDraft,
    setSearchDraft,
    appliedSearch,
    applySearch,
    clearFilters,
    onRefresh,
    loading,
}) => {
    const isAdmin = ADMIN_ROLES.includes(role);
    const isResponder = role === 'responder';
    const hasFilters = Boolean((responderView === 'all' && status) || appliedSearch);

    if (isResponder) {
        return (
            <ResponderQueueControls
                responderView={responderView}
                onResponderViewChange={onResponderViewChange}
                stats={stats}
                resultCount={resultCount}
                lastUpdatedAt={lastUpdatedAt}
                status={status}
                setStatus={setStatus}
                searchDraft={searchDraft}
                setSearchDraft={setSearchDraft}
                appliedSearch={appliedSearch}
                applySearch={applySearch}
                clearFilters={clearFilters}
                onRefresh={onRefresh}
                loading={loading}
            />
        );
    }

    const lastUpdatedLabel = formatLastUpdatedTime(lastUpdatedAt);

    return (
        <>
            <header className="page-header mb-5">
                <div className="min-w-0">
                    <p className="page-eyebrow">
                        Incident management
                    </p>
                    <h1 className="page-title">
                        Incident reports
                    </h1>
                    <p className="page-description">
                        {`Municipality-scoped incident records${municipality ? ` for ${municipality}` : ''}.`}
                    </p>
                    {stats && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Operational totals">
                            <span className="whitespace-nowrap font-semibold text-gray-700 dark:text-gray-300">{resultCount} incident{resultCount === 1 ? '' : 's'}</span>
                            {isAdmin && (
                                <>
                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                        <span className={`h-1.5 w-1.5 rounded-full ${getMapStatusDot('pending')}`} aria-hidden="true" />
                                        <span>{toCount(stats.pending)} pending review</span>
                                    </span>
                                </>
                            )}
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className={`h-1.5 w-1.5 rounded-full ${getMapStatusDot('responding')}`} aria-hidden="true" />
                                <span>{toCount(stats.responding)} responding</span>
                            </span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className={`h-1.5 w-1.5 rounded-full ${getMapStatusDot('resolved')}`} aria-hidden="true" />
                                <span>{toCount(stats.resolved)} resolved</span>
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex w-full flex-col gap-2 self-start text-xs text-gray-500 xs:w-auto xs:flex-row xs:items-center dark:text-gray-400">
                    {lastUpdatedLabel && (
                        <time dateTime={new Date(lastUpdatedAt).toISOString()} className="tabular-nums">
                            Last updated {lastUpdatedLabel}
                        </time>
                    )}
                    {lastUpdatedLabel && <span aria-hidden="true" className="hidden text-gray-300 xs:inline dark:text-gray-700">&middot;</span>}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="btn-outline w-full xs:w-auto"
                    >
                        <HiOutlineRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <section aria-label="Incident filters" className="surface-panel mb-5 p-4 sm:p-5">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applySearch();
                    }}
                    className="flex min-w-0 flex-col gap-2 sm:flex-row"
                >
                    <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Search incidents</span>
                        <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Search address, description, or municipality"
                            className="field-control pl-9"
                        />
                    </label>
                    <button
                        type="submit"
                        className="btn-primary w-full sm:w-auto"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="btn-outline w-full sm:w-auto"
                        >
                            <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </form>

                <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Status
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-1" aria-label="Filter by status">
                        <button
                            type="button"
                            aria-pressed={status === ''}
                            onClick={() => setStatus('')}
                            className="filter-tab"
                        >
                            All statuses
                        </button>
                        {getRoleStatuses(role).map((statusValue) => {
                            const config = INCIDENT_STATUS[statusValue];
                            const active = status === statusValue;
                            return (
                                <button
                                    key={statusValue}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setStatus(statusValue)}
                                    className="filter-tab"
                                >
                                    {config.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>
        </>
    );
};

export default IncidentQueueControls;
