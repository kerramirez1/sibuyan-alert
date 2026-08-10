const DEFAULT_MUNICIPALITY = 'Sibuyan Island';

const OPERATIONAL_FILTERS = Object.freeze({
    responder: Object.freeze([
        Object.freeze({ value: 'all', label: 'All active' }),
        Object.freeze({ value: 'pending', label: 'Awaiting response' }),
        Object.freeze({ value: 'responding', label: 'Responding' }),
    ]),
    municipal_admin: Object.freeze([
        Object.freeze({ value: 'all', label: 'All active' }),
        Object.freeze({ value: 'pending', label: 'Needs review' }),
        Object.freeze({ value: 'responding', label: 'Responding' }),
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
            filters: OPERATIONAL_FILTERS.responder,
            filterMode: 'response',
            // The operational API deliberately excludes unverified pending
            // reports from responder reads. "Awaiting response" consists of
            // verified/transferred incidents that are eligible for response.
            showPendingReports: false,
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
            filters: OPERATIONAL_FILTERS.municipal_admin,
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
            filters: Object.freeze([]),
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
        filters: Object.freeze([]),
        filterMode: 'public',
        showPendingReports: false,
        showSubmitReport: false,
        canRespond: false,
        canResolve: false,
    };
};

export default getMapExperience;
