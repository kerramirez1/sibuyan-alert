import {
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
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
    const incidentTotal = getResponderIncidentTotal(stats, resultCount);
    const lastUpdatedLabel = formatLastUpdatedTime(lastUpdatedAt);

    return (
        <>
            <header className="mb-4 flex min-w-0 flex-col gap-3 border-b border-gray-200/80 pb-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Responder operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Incident reports
                    </h1>
                    <p className="mt-1 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        Municipality-scoped incident records available to responders.
                    </p>
                    {stats && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Operational totals">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{incidentTotal} incident{incidentTotal === 1 ? '' : 's'}</span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span>{toCount(stats.responding)} responding</span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span>{toCount(stats.resolved)} resolved</span>
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
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <HiOutlineRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <nav className="mb-4 overflow-x-auto border-b border-gray-200/80 dark:border-white/10" aria-label="Responder incident views">
                <div className="-mb-px flex min-w-max items-end gap-2 sm:min-w-0 sm:flex-wrap">
                    {RESPONDER_VIEWS.map((view) => {
                        const active = responderView === view.value;
                        return (
                            <button
                                key={view.value}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                onClick={() => onResponderViewChange(view.value)}
                                className={`min-h-10 whitespace-nowrap border-b-2 px-3 py-2 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${active
                                    ? 'border-brand-600 text-gray-950 dark:border-brand-500 dark:text-white'
                                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-100'}`}
                            >
                                {view.label}
                            </button>
                        );
                    })}
                </div>
            </nav>

            <section aria-label="Incident filters" className="mb-4 border-b border-gray-200/80 pb-4 dark:border-white/10">
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
                            className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                        />
                    </label>
                    <button
                        type="submit"
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-700 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
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
                                className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${status === ''
                                    ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
                                    : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}
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
                                        className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active
                                            ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
                                            : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}
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
            <header className="mb-4 flex min-w-0 flex-col gap-3 border-b border-gray-200/80 pb-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Incident management
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Incident reports
                    </h1>
                    <p className="mt-1 max-w-2xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        {`Municipality-scoped incident records${municipality ? ` for ${municipality}` : ''}.`}
                    </p>
                    {stats && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Operational totals">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{resultCount} incident{resultCount === 1 ? '' : 's'}</span>
                            {isAdmin && (
                                <>
                                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                                        <span>{toCount(stats.pending)} pending review</span>
                                    </span>
                                </>
                            )}
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
                                <span>{toCount(stats.responding)} responding</span>
                            </span>
                            <span aria-hidden="true" className="text-gray-300 dark:text-gray-700">&middot;</span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                <span>{toCount(stats.resolved)} resolved</span>
                            </span>
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
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <HiOutlineRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <section aria-label="Incident filters" className="mb-4 border-b border-gray-200/80 pb-4 dark:border-white/10">
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
                            className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                        />
                    </label>
                    <button
                        type="submit"
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-brand-700 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
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
                    <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Filter by status">
                        <button
                            type="button"
                            aria-pressed={status === ''}
                            onClick={() => setStatus('')}
                            className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${status === ''
                                ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
                                : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}
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
                                    className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active
                                        ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
                                        : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}
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
