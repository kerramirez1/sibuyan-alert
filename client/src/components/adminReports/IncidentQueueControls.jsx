import { useEffect, useRef } from 'react';
import {
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
import {
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

const formatLastUpdatedTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

/**
 * "Last updated" and Refresh, held together as one operational control.
 *
 * They answer one question between them — how current is what I am looking at,
 * and can I make it newer — so they are grouped rather than left as loose text
 * with a button somewhere after it.
 */
const OperationalControls = ({ lastUpdatedAt, onRefresh, loading, className = '' }) => {
    const lastUpdatedLabel = formatLastUpdatedTime(lastUpdatedAt);

    return (
        <div className={`control-cluster ${className}`}>
            {lastUpdatedLabel ? (
                <time dateTime={new Date(lastUpdatedAt).toISOString()} className="control-cluster__meta">
                    Last updated {lastUpdatedLabel}
                </time>
            ) : (
                <span className="control-cluster__meta">Not yet refreshed</span>
            )}
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
    );
};

/**
 * The page's filtering area — one region, shared by both roles so the two
 * variants cannot drift apart.
 *
 * Deliberately not a dashboard card: the search row and the status row are
 * separated by a hairline inside a single bordered region. The active status is
 * marked with an underline rather than a filled chip, because a row of filled
 * chips reads as a row of buttons and says nothing about which one is active.
 *
 * The field carries a visible "Search incidents" label rather than relying on its
 * placeholder, so its scope is legible before anything is typed. No further
 * explanation is needed on the page: this is the only search in the header or the
 * body here, because the application-wide one belongs to the Dashboard (see
 * `utils/globalSearch`).
 */
const IncidentFilterBar = ({
    role,
    responderView,
    responderDescription,
    status,
    setStatus,
    searchDraft,
    setSearchDraft,
    applySearch,
    clearFilters,
    hasFilters,
    stats,
}) => (
    <section aria-label="Incident filters" className="filter-bar mb-5">
        <form
            onSubmit={(event) => {
                event.preventDefault();
                applySearch();
            }}
            className="filter-bar__search"
        >
            <div className="filter-bar__controls">
                <label htmlFor="incident-search" className="filter-bar__label">
                    Search incidents
                </label>
                <div className="relative min-w-0 flex-1">
                    <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input
                        id="incident-search"
                        type="search"
                        value={searchDraft}
                        onChange={(event) => setSearchDraft(event.target.value)}
                        placeholder="Address, description, or municipality"
                        className="field-control pl-9"
                    />
                </div>
                <div className="filter-bar__buttons">
                    <button
                        type="submit"
                        className="btn-primary flex-1 sm:flex-none"
                    >
                        Search
                    </button>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="btn-outline flex-1 sm:flex-none"
                        >
                            <HiOutlineX className="h-3.5 w-3.5" aria-hidden="true" />
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </form>

        <div className="filter-bar__row">
            <span className="filter-bar__label">
                {responderView === 'all' ? 'Status' : 'Scope'}
            </span>
            {responderView !== 'all' ? (
                <p className="filter-bar__scope">{responderDescription}</p>
            ) : (
                <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Filter by status" tabIndex={0}>
                    <button
                        type="button"
                        aria-pressed={status === ''}
                        aria-label={`All statuses, ${toCount(stats?.total)} incidents`}
                        onClick={() => setStatus('')}
                        className="status-filter shrink-0 whitespace-nowrap"
                    >
                        All statuses
                        <span aria-hidden="true" className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">{toCount(stats?.total)}</span>
                    </button>
                    {getRoleStatuses(role).map((statusValue) => {
                        const config = INCIDENT_STATUS[statusValue];
                        const count = toCount(stats?.[statusValue]);
                        return (
                            <button
                                key={statusValue}
                                type="button"
                                aria-pressed={status === statusValue}
                                aria-label={`${config.label}, ${count} incidents`}
                                onClick={() => setStatus(statusValue)}
                                className="status-filter shrink-0 whitespace-nowrap"
                            >
                                {config.label}
                                <span aria-hidden="true" className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    </section>
);

const ResponderQueueControls = ({
    responderView,
    onResponderViewChange,
    stats,
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
    // Refs to each tab button, keyed by view value, so the active tab can be
    // scrolled into view inside the horizontally scrollable tab row.
    const tabButtonRefs = useRef({});

    // When the active view changes, keep the active tab visible in the tab
    // row on narrow screens. block: 'nearest' never moves the page
    // vertically beyond what is needed, so this cannot steal page scroll.
    useEffect(() => {
        const activeButton = tabButtonRefs.current[responderView];
        if (activeButton && typeof activeButton.scrollIntoView === 'function') {
            activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [responderView]);

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
                </div>

                <OperationalControls
                    lastUpdatedAt={lastUpdatedAt}
                    onRefresh={onRefresh}
                    loading={loading}
                    className="w-full self-start sm:w-auto"
                />
            </header>

            <nav className="mb-5" aria-label="Responder incident views" tabIndex={0}>
                <div className="filter-tabs">
                    {RESPONDER_VIEWS.map((view) => {
                        const active = responderView === view.value;
                        // Always rendered, including 0 — the zero is the point
                        // ("walang laman"). The pill is aria-hidden; the
                        // button's aria-label carries the count for SR users.
                        const count = toCount(stats?.viewCounts?.[view.value]);
                        return (
                            <button
                                key={view.value}
                                type="button"
                                ref={(node) => { tabButtonRefs.current[view.value] = node; }}
                                aria-current={active ? 'page' : undefined}
                                aria-label={`${view.label}, ${count} incidents`}
                                onClick={() => onResponderViewChange(view.value)}
                                className="filter-tab"
                            >
                                {view.label}
                                <span aria-hidden="true" className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            <IncidentFilterBar
                role="responder"
                responderView={responderView}
                responderDescription={activeResponderView.description}
                status={status}
                setStatus={setStatus}
                searchDraft={searchDraft}
                setSearchDraft={setSearchDraft}
                applySearch={applySearch}
                clearFilters={clearFilters}
                hasFilters={hasFilters}
                stats={stats}
            />
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
                </div>

                <OperationalControls
                    lastUpdatedAt={lastUpdatedAt}
                    onRefresh={onRefresh}
                    loading={loading}
                    className="w-full self-start sm:w-auto"
                />
            </header>

            <IncidentFilterBar
                role={role}
                responderView={responderView}
                status={status}
                setStatus={setStatus}
                searchDraft={searchDraft}
                setSearchDraft={setSearchDraft}
                applySearch={applySearch}
                clearFilters={clearFilters}
                hasFilters={hasFilters}
                stats={stats}
            />
        </>
    );
};

export default IncidentQueueControls;
