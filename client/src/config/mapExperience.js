const DEFAULT_MUNICIPALITY = 'Sibuyan Island';

const OPERATIONAL_FILTERS = Object.freeze({
    operational: Object.freeze([
        Object.freeze({ value: 'all', label: 'Active Incidents' }),
        Object.freeze({ value: 'pending', label: 'Pending' }),
        Object.freeze({ value: 'verified', label: 'Verified' }),
        Object.freeze({ value: 'responding', label: 'Responding' }),
        Object.freeze({ value: 'transferred', label: 'Transferred' }),
        Object.freeze({ value: 'resolved', label: 'Resolved' }),
        Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
    ]),
});

// Reporter-friendly filters: verified/transferred/responding are operational
// jargon, so they are folded into a single "Active incidents" tab instead of
// surfacing as separate tabs. Counts reconcile with no hidden remainder:
// All open (pending + active) = Pending review + Active incidents.
const REPORTER_FILTERS = Object.freeze([
    Object.freeze({ value: 'all', label: 'All open' }),
    Object.freeze({ value: 'pending', label: 'Pending review' }),
    Object.freeze({ value: 'active', label: 'Active incidents' }),
    Object.freeze({ value: 'resolved', label: 'Resolved' }),
    Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
]);

// Guest filters: the same shape as the reporter list — one "Active Incidents"
// tab instead of three pieces of operational jargon — minus the pending tab.
// Guests are never sent pending rows (see `showPendingReports` below), so a
// pending tab would be permanently empty.
//
// There is deliberately no separate "Active incidents" tab either. For a guest
// `all` and `active` resolve to the SAME set, because the only difference
// between them is whether pending is included (see getFilteredMapReports). So
// `all` IS the active set, which is why it keeps that label rather than the
// reporter's "All open".
const GUEST_FILTERS = Object.freeze([
    Object.freeze({ value: 'all', label: 'Active Incidents' }),
    Object.freeze({ value: 'resolved', label: 'Resolved' }),
    Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
]);

export const getMapExperience = ({ role, agency, municipality } = {}) => {
    const assignedMunicipality = municipality || DEFAULT_MUNICIPALITY;

    if (role === 'responder') {
        return {
            mode: 'responder',
            eyebrow: `${agency || 'Responder'} operations`,
            title: `${assignedMunicipality} incident map`,
            description: `Monitor incidents, active responses, and mapped hazards in ${assignedMunicipality}.`,
            filters: OPERATIONAL_FILTERS.operational,
            filterMode: 'response',
            showPendingReports: true,
            showSubmitReport: false,
            canRespond: true,
            canResolve: true,
            canVerify: false,
        };
    }

    if (role === 'municipal_admin') {
        return {
            mode: 'admin',
            eyebrow: 'Municipal oversight',
            title: `${assignedMunicipality} incident map`,
            description: `Review incident activity, field responses, and mapped hazards in ${assignedMunicipality}.`,
            filters: OPERATIONAL_FILTERS.operational,
            filterMode: 'review',
            showPendingReports: true,
            showSubmitReport: false,
            canRespond: false,
            canResolve: false,
            canVerify: true,
        };
    }

    if (role === 'reporter') {
        return {
            mode: 'reporter',
            eyebrow: 'Reporter map',
            title: 'Sibuyan Island incident map',
            description: 'Track your reports and community incidents across Sibuyan Island, or submit a new report.',
            filters: REPORTER_FILTERS,
            filterMode: 'public',
            showPendingReports: true,
            showSubmitReport: true,
            canRespond: false,
            canResolve: false,
            canVerify: false,
        };
    }

    return {
        mode: 'guest',
        eyebrow: 'Public safety map',
        title: 'Sibuyan Island incident map',
        description: 'Explore verified incidents, active responses, and mapped hazards across Sibuyan Island.',
        filters: GUEST_FILTERS,
        filterMode: 'public',
        showPendingReports: false,
        showSubmitReport: false,
        canRespond: false,
        canResolve: false,
        canVerify: false,
    };
};

export default getMapExperience;
