import {
    HiOutlineGlobe,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';
import {
    ADMIN_ROLES,
    getRoleStatuses,
    INCIDENT_STATUS,
} from './incidentReportConfig';

const IncidentQueueControls = ({
    role,
    municipality,
    isDispatchQueueView,
    stats,
    resultCount,
    status,
    setStatus,
    searchDraft,
    setSearchDraft,
    appliedSearch,
    applySearch,
    clearFilters,
    showAll,
    setShowAll,
    onRefresh,
    loading,
}) => {
    const isAdmin = ADMIN_ROLES.includes(role);
    const canViewAllMunicipalities = role === 'admin';
    const hasFilters = Boolean(status || appliedSearch);

    return (
        <>
            <header className="mb-4 flex min-w-0 flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {role === 'responder' ? 'Responder operations' : 'Incident management'}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-950">
                        {isDispatchQueueView ? 'Dispatch queue' : 'Incident reports'}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600">
                        {isDispatchQueueView
                            ? 'Verified and transferred incidents available for response.'
                            : `${resultCount} incident${resultCount === 1 ? '' : 's'} loaded${municipality ? ` for ${showAll ? 'all Sibuyan municipalities' : municipality}` : ''}.`}
                    </p>
                    {stats && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Operational totals">
                            {isAdmin && <span><strong className="text-amber-700">{stats.pending || 0}</strong> pending review</span>}
                            <span><strong className="text-indigo-700">{stats.responding || 0}</strong> responding</span>
                            <span><strong className="text-emerald-700">{stats.resolved || 0}</strong> resolved</span>
                        </div>
                    )}
                </div>

                <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 lg:w-auto lg:grid-flow-col lg:auto-cols-max lg:grid-cols-none">
                    {canViewAllMunicipalities && municipality && (
                        <button
                            type="button"
                            onClick={() => setShowAll(!showAll)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            <HiOutlineGlobe className="h-4 w-4" aria-hidden="true" />
                            {showAll ? 'Use municipal scope' : 'View all Sibuyan'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-60"
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
                    {isDispatchQueueView ? (
                        <p className="text-sm font-medium text-blue-800">Showing verified unassigned and transferred incidents.</p>
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
                                        className={`min-h-10 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${active ? config.className : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
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
