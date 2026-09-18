const DEFAULT_MUNICIPALITY = 'Sibuyan Island';

/**
 * Operational tab rail (municipal admin + responder).
 *
 * Five status tabs, not six. `verified` and `transferred` were separate tabs
 * whose labels are two pieces of lifecycle jargon describing one situation the
 * operator acts on: "verified and waiting for a responder to pick it up". They
 * are folded into a single **Ready to dispatch** tab for three reasons:
 *
 * 1. It is the pair the admin's dispatch card already counts
 *    (`dispatchableReports = verified + transferred`), so the card and the tab
 *    now describe the same set with the same words.
 * 2. A verified incident that gets transferred to another municipality is still
 *    waiting for a responder — the distinction is about which office owns the
 *    paperwork, not about what the operator should do next.
 * 3. Six status tabs plus a layer tab is a rail a dispatcher has to read; five
 *    plus a layer is one they can scan.
 *
 * `responding` is labelled **Active response** to match the card vocabulary.
 * One lifecycle state gets one name across tabs, cards, and the legend — the
 * reporter rail already followed that rule ("Active incidents"), and the
 * operational roles were the ones who did not.
 */
const OPERATIONAL_FILTERS = Object.freeze({
    operational: Object.freeze([
        Object.freeze({ value: 'all', label: 'Active Incidents' }),
        Object.freeze({ value: 'pending', label: 'Pending' }),
        Object.freeze({ value: 'dispatch', label: 'Ready to dispatch' }),
        Object.freeze({ value: 'responding', label: 'Active response' }),
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

/**
 * Whether the map's home camera is the incidents or the island.
 *
 * True for every signed-in role: an operator opening the dashboard wants to be
 * looking at where things happened, not at ocean around an island. The island
 * view remains the fallback whenever there is nothing to frame.
 *
 * False for guests, and that is the one deliberate exception. An anonymous
 * visitor arrives without knowing the island — which municipalities exist, which
 * barangay a name belongs to, whether the pin at the edge of the frame is near
 * them. Cropping the view to the incidents answers "where exactly are these two
 * accidents" for someone who has not yet asked "where am I". The public safety
 * map therefore opens on the whole island, with the incidents visible in their
 * place on it.
 */
const roleFramesReportsOnOpen = (role) => ['responder', 'municipal_admin', 'reporter'].includes(role);

export const getMapExperience = ({ role, agency, municipality } = {}) => {
    const assignedMunicipality = municipality || DEFAULT_MUNICIPALITY;
    const framesReportsOnOpen = roleFramesReportsOnOpen(role);

    if (role === 'responder') {
        return {
            mode: 'responder',
            eyebrow: `${agency || 'Responder'} operations`,
            title: `${assignedMunicipality} incident map`,
            description: `Monitor incidents, active responses, and mapped hazards in ${assignedMunicipality}.`,
            filters: OPERATIONAL_FILTERS.operational,
            filterMode: 'response',
            showPendingReports: true,
            framesReportsOnOpen,
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
            framesReportsOnOpen,
            canRespond: false,
            canResolve: false,
            canVerify: true,
        };
    }

    if (role === 'reporter') {
        return {
            mode: 'reporter',
            eyebrow: 'Reporter map',
            // The description used to end with "or submit a new report", but the
            // map page never had a submit control to point at (the submit action
            // lives in the navigation, on the dashboard, and on My Reports), and
            // the config flag that was supposed to drive one was never read by
            // any component. Copy must not promise an action the page does not
            // offer, so the promise was removed rather than the button faked.
            title: 'Sibuyan Island incident map',
            description: 'Track your reports and community incidents across Sibuyan Island.',
            filters: REPORTER_FILTERS,
            filterMode: 'public',
            showPendingReports: true,
            framesReportsOnOpen,
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
        framesReportsOnOpen,
        canRespond: false,
        canResolve: false,
        canVerify: false,
    };
};

export default getMapExperience;
