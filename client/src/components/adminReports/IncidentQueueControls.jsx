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
            <header className="mb-4 flex min-w-0 flex-col gap-3 border-b border-gray-200/80 pb-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Responder operations
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
                        Incident reports
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
                        Municipality-scoped incident records available to responders.
                    </p>
                    {stats && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" aria-label="Operational totals">
                            <span>{incidentTotal} incident{incidentTotal === 1 ? '' : 's'}</span>
                            <span className="mx-1.5" aria-hidden="true">&middot;</span>
                            <span>{toCount(stats.responding)} responding</span>
                            <span className="mx-1.5" aria-hidden="true">&middot;</span>
                            <span>{toCount(stats.resolved)} resolved</span>
                        </p>
                    )}
                </div>

                <div className="flex min-h-10 shrink-0 items-center gap-1 self-start text-xs text-gray-500 dark:text-gray-400">
                    {lastUpdatedLabel && (
                        <time dateTime={new Date(lastUpdatedAt).toISOString()}>
                            Last updated {lastUpdatedLabel}
                        </time>
                    )}
                    {lastUpdatedLabel && <span aria-hidden="true">&middot;</span>}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                        <HiOutlineRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <nav className="mb-4 overflow-x-auto border-b border-gray-200 dark:border-gray-800" aria-label="Responder incident views">
                <div className="-mb-px flex min-w-max items-end gap-1 sm:min-w-0 sm:flex-wrap">
                    {RESPONDER_VIEWS.map((view) => {
                        const active = responderView === view.value;
                        return (
                            <button
                                key={view.value}
                                type="button"
                                aria-current={active ? 'page' : undefined}
                                onClick={() => onResponderViewChange(view.value)}
                                className={`min-h-11 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${active
                                    ? 'border-gray-950 text-gray-950 dark:border-white dark:text-white'
                                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-100'}`}
                            >
                                {view.label}
                            </button>
                        );
                    })}
                </div>
            </nav>

            <section aria-label="Incident filters" className="mb-4 border-b border-gray-200 pb-4 dark:border-gray-800">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applySearch();
                    }}
                    className="flex min-w-0 flex-col gap-2 sm:flex-row"
                >
                    <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Search incidents</span>
                        <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Search address, description, or municipality"
                            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-brand-900/40"
                        />
                    </label>
                    <button
                        type="submit"
                        className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                        >
                            <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </form>

                <div className="mt-3 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {responderView === 'all' ? 'Status' : 'Scope'}
                    </span>
                    {responderView !== 'all' ? (
                        <p className="text-sm text-gray-600 dark:text-gray-300">{activeResponderView.description}</p>
                    ) : (
                        <div className="flex min-w-0 flex-wrap gap-1" aria-label="Filter by status">
                            <button
                                type="button"
                                aria-pressed={status === ''}
                                onClick={() => setStatus('')}
                                className={`min-h-10 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${status === ''
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
                                        className={`min-h-10 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${active
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

    return (
        <>
            <header className="mb-4 flex min-w-0 flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Incident management
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
                        Incident reports
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {`${resultCount} incident${resultCount === 1 ? '' : 's'} loaded${municipality ? ` for ${municipality}` : ''}.`}
                    </p>
                    {stats && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300" aria-label="Operational totals">
                            {isAdmin && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
                                    <strong className="text-amber-700 dark:text-amber-300">{stats.pending || 0}</strong> pending review
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-900 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20">
                                <strong className="text-indigo-700 dark:text-indigo-300">{stats.responding || 0}</strong> responding
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                                <strong className="text-emerald-700 dark:text-emerald-300">{stats.resolved || 0}</strong> resolved
                            </span>
                        </div>
                    )}
                </div>

                <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 lg:w-auto lg:grid-flow-col lg:auto-cols-max lg:grid-cols-none">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        <HiOutlineRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        Refresh
                    </button>
                </div>
            </header>

            <section aria-label="Incident filters" className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applySearch();
                    }}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                    <label className="relative flex-1">
                        <span className="sr-only">Search incidents</span>
                        <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Search address, description, or municipality"
                            className="min-h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                    </label>
                    <button
                        type="submit"
                        className="min-h-11 rounded-lg bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            <HiOutlineX className="h-4 w-4" aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </form>

                <div className="mt-3 border-t border-gray-100 pt-3">
                    {isResponder && responderView !== 'all' ? (
                        <p className="text-sm font-medium text-blue-800">
                            {responderView === 'available' && 'Showing verified unassigned and transferred incidents.'}
                            {responderView === 'municipalActive' && 'Showing all active incidents in your municipality.'}
                            {responderView === 'active' && 'Showing incidents assigned to your responder account.'}
                            {responderView === 'history' && 'Showing incidents resolved by your response unit.'}
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2" aria-label="Filter by status">
                            <button
                                type="button"
                                aria-pressed={status === ''}
                                onClick={() => setStatus('')}
                                className={`min-h-10 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${status === '' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
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
                                        className={`min-h-10 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${active ? config.className : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'} ${active && statusValue === 'resolved' ? '!border-transparent' : ''}`}
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

export default IncidentQueueControls;
