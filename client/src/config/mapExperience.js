const DEFAULT_MUNICIPALITY = 'Sibuyan Island';

const OPERATIONAL_FILTERS = Object.freeze({
    operational: Object.freeze([
        Object.freeze({ value: 'all', label: 'All Active' }),
        Object.freeze({ value: 'pending', label: 'Pending' }),
        Object.freeze({ value: 'verified', label: 'Verified' }),
        Object.freeze({ value: 'responding', label: 'Responding' }),
        Object.freeze({ value: 'transferred', label: 'Transferred' }),
        Object.freeze({ value: 'resolved', label: 'Resolved' }),
        Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
    ]),
    public: Object.freeze([
        Object.freeze({ value: 'all', label: 'All Active' }),
        Object.freeze({ value: 'verified', label: 'Verified' }),
        Object.freeze({ value: 'responding', label: 'Responding' }),
        Object.freeze({ value: 'resolved', label: 'Resolved' }),
        Object.freeze({ value: 'risk-zones', label: 'Risk Zones' }),
    ]),
});

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
        };
    }

    if (role === 'reporter') {
        return {
            mode: 'reporter',
            eyebrow: 'Reporter map',
            title: 'Sibuyan Island incident map',
            description: 'View verified incidents and mapped hazards, or submit a new community report.',
            filters: OPERATIONAL_FILTERS.public,
            filterMode: 'public',
            showPendingReports: false,
            showSubmitReport: true,
            canRespond: false,
            canResolve: false,
        };
    }

    return {
        mode: 'guest',
        eyebrow: 'Public safety map',
        title: 'Sibuyan Island incident map',
        description: 'Explore verified incidents, active responses, and mapped hazards across Sibuyan Island.',
        filters: OPERATIONAL_FILTERS.public,
        filterMode: 'public',
        showPendingReports: false,
        showSubmitReport: false,
        canRespond: false,
        canResolve: false,
    };
};

export default getMapExperience;
