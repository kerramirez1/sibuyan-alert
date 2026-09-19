const DEFAULT_MUNICIPALITY = 'Sibuyan Island';

/**
 * The one rail every signed-in viewer reads.
 *
 * It used to be two: a reporter rail of five tabs and an operational rail of six,
 * picked by `filterMode`. The same incident therefore arrived as two different
 * products depending on the account, and the two drifted apart — the operational
 * rail called "Pending" what this one calls "Pending review", and named the same
 * resolved archive "Resolved" on one and "Resolved archive" on the other. A
 * viewer who switched roles had to relearn the screen.
 *
 * The tabs now answer three lifecycle questions about the open set — all of it,
 * the unverified part, the verified part — and the archive and hazard layer sit
 * in their own labeled group because they are not statuses. Counts reconcile
 * with no hidden remainder: All open = Pending review + Active incidents.
 *
 * A role changes what happens to a record, not what the rail calls it. The verbs
 * live in `canRespond` / `canResolve` / `canVerify`, and the operational queues
 * (ready to dispatch, in response) are segments inside the Active incidents
 * panel rather than tabs of their own — one click deeper, in the panel that
 * already holds those records, instead of a second vocabulary for the same set.
 *
 * `group` is what the rail renders: 'status' tabs first, then the 'layers' group
 * behind a divider and a label, so a layer can never read as a fourth status.
 */
const SIGNED_IN_FILTERS = Object.freeze([
    Object.freeze({ value: 'all', label: 'All open', group: 'status' }),
    Object.freeze({ value: 'pending', label: 'Pending review', group: 'status' }),
    Object.freeze({ value: 'active', label: 'Active incidents', group: 'status' }),
    Object.freeze({ value: 'risk-zones', label: 'Risk zones', group: 'layers' }),
    Object.freeze({ value: 'resolved', label: 'Resolved archive', group: 'layers' }),
]);

/**
 * Guest rail: the same shape minus the one tab whose data never reaches an
 * unauthenticated viewer. Guests are never sent pending rows (see
 * `showPendingReports` below), so a Pending review tab here would be permanently
 * empty — a tab that exists only to say "you are not allowed" is worse than no
 * tab, because it advertises a queue that cannot be answered.
 *
 * There is deliberately no separate "Active incidents" tab either. For a guest
 * `all` and `active` resolve to the SAME set, because the only difference
 * between them is whether pending is included (see getFilteredMapReports). So
 * `all` IS the active set, which is why it keeps that label rather than the
 * signed-in rail's "All open".
 */
const GUEST_FILTERS = Object.freeze([
    Object.freeze({ value: 'all', label: 'Active Incidents', group: 'status' }),
    // The layer group is labeled exactly as it is for signed-in viewers, so the
    // rail reads the same whether or not there is an account behind it.
    Object.freeze({ value: 'risk-zones', label: 'Risk zones', group: 'layers' }),
    Object.freeze({ value: 'resolved', label: 'Resolved archive', group: 'layers' }),
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
            filters: SIGNED_IN_FILTERS,
            showPendingReports: true,
            framesReportsOnOpen,
            canRespond: true,
            canResolve: true,
            canVerify: false,
            canDispatch: true,
        };
    }

    if (role === 'municipal_admin') {
        return {
            mode: 'admin',
            eyebrow: 'Municipal oversight',
            title: `${assignedMunicipality} incident map`,
            description: `Review incident activity, field responses, and mapped hazards in ${assignedMunicipality}.`,
            filters: SIGNED_IN_FILTERS,
            showPendingReports: true,
            framesReportsOnOpen,
            canRespond: false,
            canResolve: false,
            canVerify: true,
            canDispatch: true,
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
            filters: SIGNED_IN_FILTERS,
            showPendingReports: true,
            framesReportsOnOpen,
            canRespond: false,
            canResolve: false,
            canVerify: false,
            canDispatch: false,
        };
    }

    return {
        mode: 'guest',
        eyebrow: 'Public safety map',
        title: 'Sibuyan Island incident map',
        description: 'Explore verified incidents, active responses, and mapped hazards across Sibuyan Island.',
        filters: GUEST_FILTERS,
        showPendingReports: false,
        framesReportsOnOpen,
        canRespond: false,
        canResolve: false,
        canVerify: false,
        canDispatch: false,
    };
};

export default getMapExperience;
