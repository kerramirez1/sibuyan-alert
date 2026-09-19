import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from '../router';

const { mapPropsSpy } = vi.hoisted(() => ({ mapPropsSpy: vi.fn() }));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapPropsSpy(props);
        return <div data-testid="map-view" />;
    },
}));

import DashboardMapWorkspace from '../components/dashboard/DashboardMapWorkspace';
import { MUNICIPALITY_MAP_FOCUS } from '../utils/sibuyanLocations';

const createProps = (overrides = {}) => ({
    user: { _id: 'user-1', role: 'reporter', name: 'Reporter' },
    isAuthenticated: true,
    isAdmin: false,
    isResponder: false,
    isReporter: true,
    loading: false,
    error: '',
    reports: [],
    pendingReports: [],
    respondingReports: [],
    resolvedTodayReports: [],
    highRiskZones: [],
    highRiskZonesLoading: false,
    highRiskZonesError: '',
    onRetryHighRiskZones: vi.fn(),
    roleStats: { myReports: { pending: 1, verified: 2, resolved: 3 }, trustPoints: 10 },
    reporterOverviewReports: null,
    reporterOverviewReportsLoading: false,
    reporterOverviewReportsError: '',
    onLoadReporterOverviewReports: vi.fn(),
    focusLocation: null,
    focusedReport: null,
    focusedRiskZone: null,
    responderMapFilter: 'all',
    setResponderMapFilter: vi.fn(),
    canCurrentResponderResolve: vi.fn(() => true),
    handleMapRespond: vi.fn(),
    handleMapResolve: vi.fn(),
    setSearchParams: vi.fn(),
    mapSummaryPanel: '',
    setMapSummaryPanel: vi.fn(),
    activePanel: null,
    ...overrides,
});

const renderWorkspace = (props) => render(
    <MemoryRouter>
        <DashboardMapWorkspace {...props} />
    </MemoryRouter>
);

/**
 * The record row that names this incident type, if the pane is showing one.
 *
 * Rows carry their status in a chip now, so a row's type and its status are two
 * elements rather than one line of text. A `/Vehicular.*Pending/` text query
 * would then be asserting the row's internal markup, which is not what these
 * tests are about — they are about which records a pane puts in front of the
 * reader. This finds the row by the fact it leads with, and the assertions below
 * read the status off it.
 */
const findReportRow = (scope, incidentType) => within(scope)
    .getAllByRole('article')
    .find((row) => row.textContent.toLowerCase().includes(incidentType.toLowerCase()));

describe('DashboardMapWorkspace permissions', () => {
    beforeEach(() => mapPropsSpy.mockClear());

    test('shows an unavailable notice for deep-linked reports that cannot resolve', () => {
        renderWorkspace(createProps({ focusedReport: null, focusedReportMissing: true }));

        expect(screen.getByRole('alert', { name: 'Selected incident unavailable' })).toBeInTheDocument();
    });

    test('hides the unavailable notice when the focused report resolves', () => {
        renderWorkspace(createProps({
            focusedReport: { _id: 'report-1', address: 'Poblacion' },
            focusedReportMissing: false,
        }));

        expect(screen.queryByRole('alert', { name: 'Selected incident unavailable' })).not.toBeInTheDocument();
    });

    test('shows a pending community-watch metric for reporters but not guests', () => {
        const pendingReport = {
            _id: 'pending-1',
            status: 'pending',
            title: 'Unverified crash',
            coordinates: { lat: 12.45, lng: 122.55 },
            incidentTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };

        const { unmount } = renderWorkspace(createProps({ reports: [pendingReport] }));
        expect(screen.getByRole('button', { name: /View 1 pending review/i })).toBeInTheDocument();
        unmount();

        renderWorkspace(createProps({
            reports: [pendingReport],
            user: null,
            isAuthenticated: false,
            isReporter: false,
        }));
        expect(screen.queryByRole('button', { name: /Pending review/i })).not.toBeInTheDocument();
    });

    test('keeps claim and resolve actions disabled for administrators', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
        }));

        const mapProps = mapPropsSpy.mock.lastCall[0];
        expect(mapProps.canRespond).toBe(false);
        expect(mapProps.canResolve).toBe(false);
        expect(mapProps.onRespondToReport).toBeNull();
        expect(mapProps.onResolveReport).toBeNull();
    });

    test('uses a compact responsive mobile map frame for every dashboard role', () => {
        renderWorkspace(createProps());

        // 4:3, sized from the frame's own width rather than from the viewport's
        // height: on a tall phone a 52svh canvas was ~443px tall over ~325px of
        // width — a portrait map, stretched the wrong way round for reading
        // terrain. At a 393px viewport this lands at ~259px, and at the ~322px
        // content width the design was measured against, ~241px.
        const frame = screen.getByTestId('map-view').parentElement;
        expect(frame).toHaveClass('aspect-[4/3]', 'w-full');
        expect(frame.className).not.toContain('h-[52svh]');
        // The ratio is switched off where the layout sets the height instead: a
        // flat 460px from sm, the column's share from lg.
        expect(frame).toHaveClass('sm:aspect-auto', 'sm:h-[460px]', 'lg:h-auto', 'lg:flex-1');
    });

    test('keeps the four-metric summary before the live map', () => {
        renderWorkspace(createProps());

        const liveMap = screen.getByRole('region', { name: 'Live incident map' });
        const summary = screen.getByRole('region', { name: 'Map summary' });
        const incidentsAction = within(summary).getByRole('button', { name: /View 0 active incidents/i });
        const riskZonesAction = within(summary).getByRole('button', { name: /View 0 risk zones/i });

        // The numbers come first. These cards used to sit under the map, so the
        // count that starts the whole triage was below a 500px canvas on a
        // laptop; only the reporter role escaped that, because they have a
        // separate summary page and the operational roles do not.
        expect(summary.compareDocumentPosition(liveMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // Drawn the other way round on a phone, though: the map leads the mobile
        // page and the numbers follow as the summary of it, which is one `order`
        // each on the row's two children (the source order above is untouched, so
        // the reading order a screen reader gets — and the box a pane opens into
        // — is the one this workspace has always had).
        const row = summary.parentElement.parentElement;
        expect(row).toBe(liveMap.parentElement);
        expect(liveMap).toHaveClass('order-1', 'sm:order-2');
        expect(summary.parentElement).toHaveClass('order-2', 'sm:order-1');
        expect(row).toHaveClass('flex', 'flex-col', 'gap-3', 'sm:gap-5');
        // Reporter has 4 metrics, and on a phone they fill a two-by-two grid:
        // pending review and active incidents on the first row, resolved and
        // risk zones on the second. The row order is the priority, so it is the
        // DOM order these assertions read.
        const cardsGrid = incidentsAction.parentElement;
        expect(cardsGrid).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-1');
        expect(Array.from(cardsGrid.children).map((card) => card.getAttribute('aria-label'))).toEqual([
            expect.stringMatching(/^View \d+ pending review/i),
            expect.stringMatching(/^View \d+ active incidents/i),
            expect.stringMatching(/^View \d+ resolved/i),
            expect.stringMatching(/^View \d+ risk zones/i),
        ]);
        // Four cards fill both rows, so none of them needs the full width — and
        // a tile wider than its neighbours is exactly the imbalance the equal
        // grid avoids.
        Array.from(cardsGrid.children).forEach((card) => expect(card).not.toHaveClass('col-span-2'));
        // From sm they stack in one column at every width: from lg that column
        // is the workspace's own right-hand column, so the cards count down
        // beside the map instead of across the top of it.
        expect(riskZonesAction).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
    });

    test('lays the workspace out as sidebar · map · summary from lg', () => {
        renderWorkspace(createProps());

        const liveMap = screen.getByRole('region', { name: 'Live incident map' });
        const summary = screen.getByRole('region', { name: 'Map summary' });
        const column = summary.parentElement;
        const row = column.parentElement;

        // One grid holds both, filled to the height the viewport leaves under
        // the app header, with a floor the map can never be cut below. Its
        // parent is height-bound, so the page has nothing left to scroll at lg.
        expect(row).toBe(liveMap.parentElement);
        expect(row).toHaveClass('lg:grid', 'lg:flex-1', 'lg:min-h-[420px]', 'lg:grid-cols-[minmax(0,1fr)_clamp(288px,24vw,332px)]');

        // The map paints in the first column and the summary in the second,
        // even though the summary stays first in the DOM so that the stacked
        // order below lg (and the screen-reader order) is unchanged.
        expect(liveMap).toHaveClass('lg:col-start-1', 'lg:row-start-1');
        expect(column).toHaveClass('lg:col-start-2', 'lg:row-start-1', 'lg:flex', 'lg:flex-col');

        // The card box is the box a card's records open into: it is the
        // positioning context, and the slot inside it is out of the way while
        // nothing is open. So the pane can be laid over exactly that box.
        // Closed, the box scrolls its own cards rather than growing past the map
        // it is the same height as.
        expect(summary).toHaveClass('relative', 'overflow-y-auto');
        const dock = screen.getByTestId('map-summary-dock');
        expect(summary).toContainElement(dock);
        expect(column).toContainElement(dock);
        expect(dock).toHaveClass('hidden');
        expect(summary).not.toHaveClass('hidden');

        // The canvas stretches to the column height instead of pinning itself
        // to the 500px frame that used to push the cards past the fold.
        const mapFrame = screen.getByTestId('map-view').parentElement;
        expect(mapFrame).toHaveClass('lg:h-auto', 'lg:flex-1');
        expect(mapFrame.className).not.toContain('lg:h-[500px]');

        // And the card row the height used to be spent on is gone.
        expect(liveMap.className).not.toContain('lg:h-[500px]');

        // The filter rail is a sibling of the row, not a band inside the map
        // card: across the workspace's whole width one line holds every control
        // even with three-digit counts (667px measured, 720px available at the
        // narrowest desktop width), where the map column has only ~400px at a
        // 1024px viewport and the rail wrapped there.
        const rail = screen.getByLabelText('Map status filter');
        expect(rail).toHaveClass('w-full', 'lg:flex');
        expect(rail.closest('[aria-label="Live incident map"]')).toBeNull();
        expect(rail.parentElement).toBe(row.parentElement);
        expect(rail.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // Which leaves the map card holding the canvas and nothing else at lg:
        // the mobile filter bar is the card's only header band, and it is hidden
        // from lg up, so the card itself carries the inset instead.
        expect(liveMap).toHaveClass('lg:p-2');
        expect(liveMap.firstElementChild).toHaveClass('lg:hidden');
    });

    test('gives the records pane a box of its own on a phone, and the map\'s height from sm', () => {
        renderWorkspace(createProps({ mapSummaryPanel: 'incidents' }));

        const liveMap = screen.getByRole('region', { name: 'Live incident map' });
        const summary = screen.getByRole('region', { name: 'Map summary' });
        const mapFrame = screen.getByTestId('map-view').parentElement;

        // From sm the two boxes are one: the pane stands in the column beside the
        // map, so a pane taller than the map would paint past the canvas it
        // describes — that pairing is what the shared 460px is for.
        expect(mapFrame).toHaveClass('sm:h-[460px]', 'lg:h-auto', 'lg:flex-1');
        expect(summary).toHaveClass('sm:h-[460px]', 'lg:h-auto', 'lg:flex-1');

        // On a phone they are deliberately different boxes. The map is its 4:3
        // self; the pane keeps a records height (52svh held between 320px and
        // 440px) because it renders into exactly this box, and the box stands
        // BELOW the map there — so the reason the two were tied together, a pane
        // painting past the canvas beside it, no longer applies.
        expect(mapFrame).toHaveClass('aspect-[4/3]');
        expect(summary).toHaveClass('h-[52svh]', 'min-h-[320px]', 'max-h-[440px]');
        expect(summary.className).not.toContain('aspect-');
        // Plus the one utility the map column does not need: at lg the box may
        // shrink inside the column, so cards taller than the map scroll inside
        // the box instead of pushing its bottom past the map's.
        expect(summary).toHaveClass('lg:min-h-0');

        // The pane's slot IS that box: `inset-0` inside it, and the box clips
        // while the pane is open, so the pane's edges cannot pass the box's. From
        // sm its bottom edge is the map's too — they are one stretched grid row.
        // On a phone the box stands under the canvas by design (that is the
        // mobile order), and its height is the list's room.
        const dock = screen.getByTestId('map-summary-dock');
        expect(summary).toContainElement(dock);
        expect(dock).toHaveClass('absolute', 'inset-0', 'flex', 'min-h-0', 'flex-col');
        expect(dock).not.toHaveClass('flex-1');
        expect(summary).toHaveClass('relative', 'overflow-hidden');
        // And the slot carries no margin of its own: the box used to spread its
        // children with `space-y`, whose `> * ~ *` selector outranks a plain
        // `mt-0`, so the slot sat 8px (10px from sm) down and that much short —
        // a strip of the box left showing above the pane, measured in the
        // browser. The box has one in-flow child and does not need the stack.
        expect(summary.className).not.toContain('space-y');
        expect(dock.className).not.toContain('mt-');

        const panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(panel.parentElement).toBe(dock);
        expect(panel).toHaveClass('flex-1', 'min-h-0', 'w-full');
        // Docked, not a sheet: nothing about the pane is anchored to the viewport
        // bottom, which is what used to put the records under the map on a phone.
        expect(panel.className).not.toContain('fixed');
        expect(panel).not.toHaveAttribute('aria-modal');
        expect(liveMap).not.toContainElement(panel);
    });

    test('hugs its compact cards on a phone, so the map is reached without scrolling the band', () => {
        const { rerender } = renderWorkspace(createProps());
        const summary = screen.getByRole('region', { name: 'Map summary' });

        // Closed, the band is exactly as tall as its own compact cards: no
        // reserved box height, no box of empty white under the map. This is the
        // state the workspace opens in, and the ~110px it saves is the
        // difference between the KPIs being one short scroll away and a band of
        // empty card sitting between the map and them.
        expect(summary).toHaveClass('h-auto', 'overflow-y-auto');
        expect(summary.className).not.toContain('h-[52svh]');
        // From sm it still takes the flat height and, from lg, the column's share
        // — where the band stands beside the map, not in front of it.
        expect(summary).toHaveClass('sm:h-[460px]', 'sm:max-h-none', 'lg:h-auto', 'lg:min-h-0', 'lg:flex-1');

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...createProps({ mapSummaryPanel: 'incidents' })} />
            </MemoryRouter>,
        );

        // Open, the box takes the records pane's own height: the pane has no
        // height of its own, so the box's height IS the list's room. That is a
        // height of its own rather than the map's frame — the map is a 4:3
        // canvas and a records list does not want a canvas ratio — which is why
        // the two are asserted separately here.
        const openSummary = screen.getByRole('region', { name: 'Map summary' });
        expect(openSummary).toHaveClass('h-[52svh]', 'min-h-[320px]', 'max-h-[440px]', 'overflow-hidden');
        expect(screen.getByTestId('map-view').parentElement).toHaveClass('aspect-[4/3]');
    });

    test('opens a pin\'s details in the summary box, not over the map', () => {
        renderWorkspace(createProps());

        const mapProps = mapPropsSpy.mock.lastCall[0];
        const dock = screen.getByTestId('map-summary-dock');
        // The map is handed the same slot a card's records open into, and told
        // when it takes it — which is what lets a pin's details land in the
        // summary column instead of on top of the canvas it was clicked on.
        expect(mapProps.dockTarget).toBe(dock);
        expect(typeof mapProps.onEntityInspectorChange).toBe('function');
        expect(dock).toHaveClass('hidden');

        act(() => mapProps.onEntityInspectorChange(true));

        const openDock = screen.getByTestId('map-summary-dock');
        expect(openDock).not.toHaveClass('hidden');
        expect(openDock).toHaveClass('absolute', 'inset-0', 'flex', 'flex-col');
        // The box is in use: the cards keep their space without painting it, and
        // the box clips rather than scrolls, so the pane covers it to the pixel.
        const summary = screen.getByRole('region', { name: 'Map summary' });
        expect(summary.querySelector(':scope > div')).toHaveClass('invisible');
        expect(summary).toHaveClass('relative', 'overflow-hidden');

        act(() => mapProps.onEntityInspectorChange(false));
        expect(screen.getByTestId('map-summary-dock')).toHaveClass('hidden');
        expect(screen.getByRole('region', { name: 'Map summary' }).querySelector(':scope > div')).not.toHaveClass('invisible');
    });

    test('stands its own records down when the map opens a pin\'s details', () => {
        const setMapSummaryPanel = vi.fn();
        renderWorkspace(createProps({ mapSummaryPanel: 'overview:pending', setMapSummaryPanel }));

        const mapProps = mapPropsSpy.mock.lastCall[0];
        act(() => mapProps.onEntityInspectorChange(true));

        // One box, one reader: a pin's details take the summary box from the
        // workspace's own pane rather than sharing it with it.
        expect(setMapSummaryPanel).toHaveBeenCalledWith('');
    });

    test('opens the records with the box scrolled back to its top', () => {
        const { rerender } = renderWorkspace(createProps());

        // The box scrolls its own cards while nothing is open, and the pane is
        // positioned against that same box — so a reader who scrolled the cards
        // before tapping one would otherwise open the pane already shifted up,
        // with the box's last 60px showing underneath it.
        const box = screen.getByRole('region', { name: 'Map summary' });
        box.scrollTop = 60;
        expect(box.scrollTop).toBe(60);

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...createProps({ mapSummaryPanel: 'incidents' })} />
            </MemoryRouter>,
        );

        const panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(panel.parentElement).toBe(screen.getByTestId('map-summary-dock'));
        expect(screen.getByRole('region', { name: 'Map summary' }).scrollTop).toBe(0);
    });

    test('uses clean overview cards with consistent spacing', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
        }));

        const cardsGrid = screen.getByTestId('map-summary-cards');
        const cards = Array.from(cardsGrid.children);

        // Guest sees 3 cards: active incidents, active response, risk zones.
        // Transferred is folded into active incidents, not shown separately.
        expect(cards).toHaveLength(3);
        // Two columns on a phone, one from sm. Guest has an odd number of
        // cards, so the primary one takes the full row instead of leaving a
        // hole beside it, and the two secondary figures share the row under it.
        expect(cardsGrid).toHaveClass('grid', 'grid-cols-2', 'sm:grid-cols-1');
        expect(cardsGrid.className).not.toContain('lg:grid-cols-3');
        expect(cards[0]).toHaveClass('col-span-2', 'sm:col-span-1');
        expect(cards[1]).not.toHaveClass('col-span-2');
        expect(cards[2]).not.toHaveClass('col-span-2');
        cards.forEach((card) => {
            // The card's outline is a ring, not a border: the base stylesheet
            // forces every button's border-color transparent, so a bordered card
            // rendered with no edge at all.
            expect(card).toHaveClass('rounded-xl', 'ring-1');
        });
        expect(cards.every((card) => card.tagName === 'BUTTON')).toBe(true);
    });

    test('renders every role-specific overview metric as a full semantic button', () => {
        const roleCases = [
            {
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isResponder: false,
                isReporter: false,
                expectedMetrics: 3,
            },
            {
                // Reporter gains the pending community-watch card on top of the
                // public set, which itself excludes a standalone transferred card.
                user: { _id: 'reporter-1', role: 'reporter' },
                isAuthenticated: true,
                isAdmin: false,
                isResponder: false,
                isReporter: true,
                expectedMetrics: 4,
            },
            {
                user: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
                isAuthenticated: true,
                isAdmin: false,
                isResponder: true,
                isReporter: false,
                expectedMetrics: 4,
            },
            {
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAuthenticated: true,
                isAdmin: true,
                isResponder: false,
                isReporter: false,
                expectedMetrics: 4,
            },
        ];

        roleCases.forEach((roleProps) => {
            const { expectedMetrics, ...props } = roleProps;
            const { unmount } = renderWorkspace(createProps(props));
            const metricButtons = within(screen.getByRole('region', { name: 'Map summary' })).getAllByRole('button');

            expect(metricButtons).toHaveLength(expectedMetrics);
            metricButtons.forEach((button) => {
                expect(button).toHaveAttribute('type', 'button');
                expect(button).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
                expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-emerald-600');
            });
            unmount();
        });
    });

    test('counts transferred reports inside active incidents instead of a separate card', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            isResponder: false,
            isAdmin: false,
            reports: [
                { _id: 'v1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
                { _id: 't1', status: 'transferred', coordinates: { lat: 12.41, lng: 122.61 } },
                { _id: 't2', status: 'transferred', coordinates: { lat: 12.42, lng: 122.62 } },
                { _id: 'r1', status: 'responding', coordinates: { lat: 12.43, lng: 122.63 } },
                { _id: 'x1', status: 'resolved', coordinates: { lat: 12.44, lng: 122.64 } },
            ],
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });

        // Active incidents = verified + transferred + responding = 1 + 2 + 1.
        // The resolved report is excluded, so the umbrella count is exact and
        // the two transferred rows are provably part of it.
        const activeCard = within(summary).getByRole('button', { name: /View 4 active incidents/i });
        expect(activeCard).toBeInTheDocument();
        // The count folds verified + transferred + responding, so all four rows
        // are inside it — and the supporting line reports the responding mix
        // rather than a status list, with the two transfers named inside the
        // waiting 3 rather than added beside it (1 + 3 is still the card's 4).
        expect(activeCard).toHaveAttribute('aria-label', expect.stringContaining('1 responding'));
        expect(activeCard).toHaveAttribute('aria-label', expect.stringContaining('3 waiting'));
        expect(activeCard).toHaveAttribute('aria-label', expect.stringContaining('(2 transferred)'));

        // The guest overview now mirrors the reporter's: Active incidents,
        // Resolved, Risk zones. "Active response" was a subset-duplicate of
        // Active incidents and is gone. The fixture's single resolved row lands
        // on the Resolved card, not on Active incidents.
        expect(within(summary).getByRole('button', { name: /View 1 resolved/i })).toBeInTheDocument();
        expect(within(summary).queryByRole('button', { name: /active response/i })).not.toBeInTheDocument();

        // Transferred must no longer exist as a category card of its own.
        expect(within(summary).queryByRole('button', { name: /^View \d+ transferred/i })).not.toBeInTheDocument();
        expect(within(summary).queryByText('Transferred')).not.toBeInTheDocument();
    });

    test('gives guests the reporter overview shape, minus the pending card only', () => {
        const reports = [
            { _id: 'v1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'r1', status: 'responding', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'x1', status: 'resolved', coordinates: { lat: 12.42, lng: 122.62 } },
        ];
        const cardsOf = (region) => within(region).getAllByRole('button')
            .map((button) => button.getAttribute('aria-label')?.split('.')[0] || '');

        const guest = renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            isResponder: false,
            isAdmin: false,
            reports,
        }));
        const guestCards = cardsOf(screen.getByRole('region', { name: 'Map summary' }));
        guest.unmount();

        renderWorkspace(createProps({
            user: { _id: 'u1', role: 'reporter', name: 'Reporter' },
            isAuthenticated: true,
            isReporter: true,
            isResponder: false,
            isAdmin: false,
            reports,
        }));
        const reporterCards = cardsOf(screen.getByRole('region', { name: 'Map summary' }));

        // The whole point of the guest overview: identical to the reporter's,
        // same cards in the same order, minus Pending review — the one card
        // whose data never reaches an unauthenticated viewer. This is the RBAC
        // boundary expressed as a test, so a future "just copy it all" change
        // cannot quietly leak pending counts to the public map.
        expect(reporterCards).toHaveLength(4);
        expect(guestCards).toHaveLength(3);
        expect(guestCards).not.toEqual(expect.arrayContaining([expect.stringMatching(/pending/i)]));
        expect(reporterCards.filter((card) => !/pending review/i.test(card))).toEqual(guestCards);
    });

    test('gives every signed-in role the same four overview cards, in the same order', () => {
        const reports = [
            { _id: 'p1', status: 'pending', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'v1', status: 'verified', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'x1', status: 'resolved', coordinates: { lat: 12.42, lng: 122.62 } },
        ];
        // Cards carry the number in their accessible name, and the number is
        // allowed to differ per role (a reporter may not be sent every row),
        // so compare the label and keep the supporting line separate: the label
        // is the contract, the line is where a role is allowed to speak.
        const cardsOf = () => within(screen.getByRole('region', { name: 'Map summary' }))
            .getAllByRole('button')
            .map((button) => {
                const [name = '', helper = ''] = (button.getAttribute('aria-label') || '').split('. ');
                return { label: name.replace(/^View \d+ /, ''), helper };
            });

        const rowsByRole = {};
        for (const [role, flags] of [
            ['reporter', { isReporter: true }],
            ['responder', { isResponder: true }],
            ['municipal_admin', { isAdmin: true }],
        ]) {
            const view = renderWorkspace(createProps({
                user: { _id: `${role}-1`, role },
                isAuthenticated: true,
                isReporter: false,
                isResponder: false,
                isAdmin: false,
                ...flags,
                reports,
            }));
            rowsByRole[role] = cardsOf();
            view.unmount();
        }

        // One row of four, whatever the account. The rail and the cards used to
        // be chosen per role, which is how the same incident became a different
        // product per login.
        expect(rowsByRole.reporter.map((card) => card.label)).toEqual([
            'pending review', 'active incidents', 'resolved', 'risk zones',
        ]);
        for (const role of ['responder', 'municipal_admin']) {
            expect(rowsByRole[role].map((card) => card.label))
                .toEqual(rowsByRole.reporter.map((card) => card.label));
        }

        // What differs is copy about the same set, never an extra tile: an
        // administrator is told how much closed today, a reporter is not.
        expect(rowsByRole.municipal_admin[2].helper).toMatch(/closed incidents · 0 today/i);
        expect(rowsByRole.reporter[2].helper).toBe('Completed incidents');
    });

    test('keeps municipal admin counts and contextual panel records on the same status definitions', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 }, createdAt: now },
            { _id: 'responding-1', status: 'responding', incidentType: 'marine', coordinates: { lat: 12.43, lng: 122.63 }, createdAt: now },
        ];
        // The resolved row is a real map row now: the Resolved card counts the
        // pins the Resolved tab shows, not every closed report in the system.
        const resolvedReport = { _id: 'resolved-1', status: 'resolved', incidentType: 'other', resolvedAt: now, coordinates: { lat: 12.44, lng: 122.64 }, createdAt: now };
        const props = createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports: [...reports, resolvedReport],
            resolvedTodayReports: [resolvedReport],
            mapSummaryPanel: 'overview:pending',
        });
        const { rerender } = renderWorkspace(props);

        const summary = screen.getByRole('region', { name: 'Map summary' });
        expect(within(summary).getByRole('button', { name: /View 1 pending review\. Awaiting review/i })).toHaveAttribute('aria-pressed', 'true');
        let panel = screen.getByRole('dialog', { name: 'Pending review' });
        expect(findReportRow(panel, 'Vehicular')).toHaveTextContent('Pending');
        expect(findReportRow(panel, 'Fire')).toBeUndefined();

        // The two operational queues are segments of the panel that already holds
        // those records, not tabs of their own: same card, same count, one click
        // deeper. Clicking one narrows the list, and the number on the chip is the
        // same array the segment renders.
        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:active" />
            </MemoryRouter>,
        );
        panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(3);

        const queue = within(panel).getByRole('group', { name: 'Active incident queue' });
        fireEvent.click(within(queue).getByRole('button', { name: /Ready to dispatch \(2\)/i }));
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(2);
        expect(findReportRow(panel, 'Fire')).toHaveTextContent('Verified');
        expect(findReportRow(panel, 'Medical')).toHaveTextContent('Transferred');
        expect(findReportRow(panel, 'Marine')).toBeUndefined();

        fireEvent.click(within(queue).getByRole('button', { name: /In response \(1\)/i }));
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(1);
        expect(findReportRow(panel, 'Marine')).toHaveTextContent('Active response');

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:resolved" />
            </MemoryRouter>,
        );
        panel = screen.getByRole('dialog', { name: 'Resolved incidents' });
        expect(findReportRow(panel, 'Other')).toHaveTextContent('Resolved');
        // The card now points the map at the Resolved tab, so its rows can be
        // located. It used to be list-only because the two numbers disagreed.
        expect(within(panel).getByRole('button', { name: 'Locate' })).toBeInTheDocument();
        // Today's closures are still reported, as supporting text beside the
        // archive count rather than as the value.
        expect(within(summary).getByRole('button', { name: /View 1 resolved\. Closed incidents · 1 today/i })).toBeInTheDocument();
    });



    test('prints the same number on the Resolved card as the Resolved tab counts', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'resolved-today', status: 'resolved', incidentType: 'fire', resolvedAt: now, coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'resolved-archive', status: 'resolved', incidentType: 'medical', resolvedAt: '2026-01-02T04:00:00.000Z', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'resolved-offmap', status: 'resolved', incidentType: 'other', resolvedAt: now, createdAt: now },
        ];
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            // The page owns the "today" scope; the card only clips it to rows
            // that are on the map.
            resolvedTodayReports: [reports[0], reports[2]],
        }));

        // The card and the tab are one set: both resolved pins, today's and the
        // archived one. The third row has no coordinates, so it is not on the map
        // and is counted nowhere — the old failure was the mirror of that, a card
        // scoped to today (0 or 1) sitting beside a tab counting the archive (2).
        const summary = screen.getByRole('region', { name: 'Map summary' });
        expect(within(summary).getByRole('button', { name: /View 2 resolved\./i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Resolved archive \(2 records\)/i })).toBeInTheDocument();
        // Today's closures survive as supporting text on the archive card — and
        // the coordinate-less one is dropped, so the line cannot outrun the
        // number beside it.
        expect(within(summary).getByRole('button', { name: /1 today/i })).toBeInTheDocument();
    });

    test('opens zero-count metrics with a metric-specific empty state', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            mapSummaryPanel: 'overview:pending',
        }));

        expect(screen.getByRole('button', { name: /View 0 pending review\. Awaiting review/i })).toBeEnabled();
        expect(screen.getByRole('dialog', { name: 'Pending review' }))
            .toHaveTextContent('0 reports awaiting municipal review.');
    });

    test('shows responder actions only for authorized operational metric records', () => {
        const availableReport = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'fire',
            coordinates: { lat: 12.41, lng: 122.61 },
            createdAt: new Date().toISOString(),
        };
        renderWorkspace(createProps({
            user: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
            isResponder: true,
            isReporter: false,
            reports: [availableReport],
            mapSummaryPanel: 'overview:active',
        }));

        fireEvent.click(screen.getByRole('button', { name: 'View details' }));
        expect(screen.getByRole('button', { name: 'Respond to incident' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Review resolution' })).not.toBeInTheDocument();
    });

    test('filters guest metric panels to the public status represented by the card', () => {
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'medical', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'resolved-1', status: 'resolved', incidentType: 'marine', coordinates: { lat: 12.42, lng: 122.62 } },
        ];
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports,
            mapSummaryPanel: 'overview:resolved',
        }));

        // The Resolved card opens a panel holding only resolved rows, so the
        // card's number and its list can never disagree.
        const panel = screen.getByRole('dialog', { name: 'Resolved incidents' });
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(1);
        expect(findReportRow(panel, 'Marine')).toHaveTextContent('Resolved');
        expect(findReportRow(panel, 'Medical')).toBeUndefined();
    });

    test('opens risk-zone overview metrics in the same contextual map panel and supports View details and Locate', () => {
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            description: 'Prone to rockfall and landslide debris during heavy rains.',
            type: 'landslide_prone',
            severity: 'high',
            radius: 150,
            municipality: 'Cajidiocan',
            barangay: 'Cambijang',
            coordinates: { lat: 12.405, lng: 122.69 },
            photos: [],
        };
        const setMapSummaryPanel = vi.fn();
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            highRiskZones: [zone],
            mapSummaryPanel: 'overview:risk-zones',
            setMapSummaryPanel,
        }));

        const panel = screen.getByRole('dialog', { name: 'Active risk zones' });
        const summary = screen.getByRole('region', { name: 'Map summary' });
        const dock = screen.getByTestId('map-summary-dock');
        // The records open in the box the cards were standing in — the same
        // column, the same height, laid over the space they keep — and not as a
        // card across the map. Non-modal, so the map they describe stays
        // navigable while they are open: no scrim, no scroll lock, no focus
        // trap.
        expect(panel.parentElement).toBe(dock);
        expect(panel).toHaveClass('pane-enter', 'flex-1', 'w-full');
        expect(panel).not.toHaveAttribute('aria-modal');
        expect(screen.getByRole('region', { name: 'Live incident map' })).not.toContainElement(panel);
        expect(document.body.style.overflow).toBe('');
        // Sized to the cards, never past them and never inside them: the slot is
        // `inset-0` in the card stack, and the cards keep their height — held
        // with `invisible`, not removed — while the pane covers them.
        expect(summary).toContainElement(dock);
        expect(dock).toHaveClass('absolute', 'inset-0', 'flex', 'flex-col', 'min-h-0');
        expect(dock).not.toHaveClass('flex-1');
        expect(summary.querySelector(':scope > div')).toHaveClass('invisible');
        expect(summary).toHaveClass('relative', 'overflow-hidden');
        expect(within(panel).getByText('Cambijang Risk Zone')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View 1 risk zones\. Mapped hazards/i })).toHaveAttribute('aria-pressed', 'true');

        // Both View details and Locate buttons are present
        const viewDetailsBtn = within(panel).getByRole('button', { name: 'View details' });
        const locateBtn = within(panel).getByRole('button', { name: 'Locate' });
        expect(viewDetailsBtn).toBeInTheDocument();
        expect(locateBtn).toBeInTheDocument();

        // Clicking View details transitions panel to High-Risk Zone Details
        fireEvent.click(viewDetailsBtn);
        const detailsPanel = screen.getByRole('dialog', { name: 'High-risk zone details' });
        expect(detailsPanel).toBeInTheDocument();
        expect(within(detailsPanel).getByText('High severity')).toBeInTheDocument();
        expect(within(detailsPanel).getByText('150 m radius')).toBeInTheDocument();
        expect(within(detailsPanel).getByRole('heading', { level: 4, name: 'Field reference' })).toBeInTheDocument();

        // Back button returns to list of zones
        const backBtn = within(detailsPanel).getByRole('button', { name: /Back to/i });
        expect(backBtn).toBeInTheDocument();
        fireEvent.click(backBtn);

        expect(screen.getByRole('dialog', { name: 'Active risk zones' })).toBeInTheDocument();
        expect(within(screen.getByRole('dialog', { name: 'Active risk zones' })).getByText('Cambijang Risk Zone')).toBeInTheDocument();
    });

    test('supports inspecting multiple different risk zones sequentially in the summary panel', () => {
        const zone1 = {
            _id: 'zone-1',
            name: 'Cambajao River Overflow',
            description: 'Prone to flash floods during monsoon storms.',
            type: 'landslide_prone',
            severity: 'critical',
            radius: 200,
            municipality: 'Cajidiocan',
            barangay: 'Cambajao',
            coordinates: { lat: 12.38, lng: 122.54 },
            photos: [{ _id: 'p1', url: '/api/files/123/p1.jpg', filename: 'p1.jpg' }],
        };
        const zone2 = {
            _id: 'zone-2',
            name: 'Magdiwang Coastal Erosion Area',
            description: 'Wave surge hazard zone along coastal highway.',
            type: 'accident_prone',
            severity: 'medium',
            radius: 120,
            municipality: 'Magdiwang',
            barangay: 'Poblacion',
            coordinates: { lat: 12.48, lng: 122.52 },
            photos: [],
        };

        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            highRiskZones: [zone1, zone2],
            mapSummaryPanel: 'zones',
        }));

        const panel = screen.getByRole('dialog', { name: 'High-risk zones' });
        expect(within(panel).getByText('Cambajao River Overflow')).toBeInTheDocument();
        expect(within(panel).getByText('Magdiwang Coastal Erosion Area')).toBeInTheDocument();

        // 1. Inspect Zone 1
        const viewDetailsButtons = within(panel).getAllByRole('button', { name: 'View details' });
        expect(viewDetailsButtons).toHaveLength(2);
        fireEvent.click(viewDetailsButtons[0]);

        const detailsPanel1 = screen.getByRole('dialog', { name: 'High-risk zone details' });
        expect(within(detailsPanel1).getByText('Critical severity')).toBeInTheDocument();
        expect(within(detailsPanel1).getByText('200 m radius')).toBeInTheDocument();
        expect(within(detailsPanel1).getByText('1 photo')).toBeInTheDocument();

        // 2. Go back to list
        const backBtn1 = within(detailsPanel1).getByRole('button', { name: /Back to/i });
        fireEvent.click(backBtn1);

        // 3. Inspect Zone 2
        const updatedPanel = screen.getByRole('dialog', { name: 'High-risk zones' });
        const updatedButtons = within(updatedPanel).getAllByRole('button', { name: 'View details' });
        fireEvent.click(updatedButtons[1]);

        const detailsPanel2 = screen.getByRole('dialog', { name: 'High-risk zone details' });
        expect(within(detailsPanel2).getByText('Medium severity')).toBeInTheDocument();
        expect(within(detailsPanel2).getByText('120 m radius')).toBeInTheDocument();
        expect(within(detailsPanel2).getByText('0 photos')).toBeInTheDocument();
        expect(within(detailsPanel2).getByText('No reference photos attached for this hazard zone.')).toBeInTheDocument();
    });

    test('enables claim and resolve actions only for responders', () => {
        const props = createProps({
            user: { _id: 'responder-1', role: 'responder', agency: 'BFP', assignedMunicipality: 'Magdiwang' },
            isResponder: true,
            isReporter: false,
        });
        renderWorkspace(props);

        const mapProps = mapPropsSpy.mock.lastCall[0];
        expect(mapProps.canRespond).toBe(true);
        expect(mapProps.canResolve).toBe(true);
        expect(mapProps.onRespondToReport).toBe(props.handleMapRespond);
        expect(mapProps.onResolveReport).toBe(props.handleMapResolve);
        expect(mapProps.canResolveReport).toBe(props.canCurrentResponderResolve);
        expect(mapProps.showPending).toBe(true);
        const filterBar = screen.getByLabelText('Map status filter');
        expect(within(filterBar).getByRole('button', { name: /active incidents/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending/i })).toBeInTheDocument();
    });

    test('gives administrators review terminology without responder actions', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
        }));

        expect(screen.getByText('Municipal oversight')).toBeInTheDocument();
        const filterBar = screen.getByLabelText('Map status filter');
        expect(within(filterBar).getByRole('button', { name: /active incidents/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending/i })).toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            canRespond: false,
            canResolve: false,
            showPending: true,
        });
    });

    test('converts a selected watchlist zone into the shared entity-focus request', () => {
        const focusedRiskZone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            coordinates: { lat: 12.4, lng: 122.6 },
        };

        renderWorkspace(createProps({
            highRiskZones: [focusedRiskZone],
            focusedRiskZone,
        }));

        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual({
            type: 'risk-zone',
            id: 'zone-1',
            entity: focusedRiskZone,
            requestId: 'risk-zone:zone-1',
        });
        expect(mapPropsSpy.mock.lastCall[0].focusedRiskZone).toBeUndefined();
    });

    test('converts a cross-page incident ID selection into the same focus request', () => {
        const focusedReport = {
            _id: 'report-1',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        };

        renderWorkspace(createProps({
            reports: [focusedReport],
            focusedReport,
        }));

        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual({
            type: 'incident',
            id: 'report-1',
            entity: focusedReport,
            requestId: 'incident:report-1',
        });
    });

    test('shows reporter actions and all active lifecycle states in the incident list', () => {
        const setMapSummaryPanel = vi.fn();
        const setResponderMapFilter = vi.fn();
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: new Date().toISOString() },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'motorcycle', coordinates: { lat: 12.5, lng: 122.7 }, createdAt: new Date().toISOString() },
            { _id: 'responding-1', status: 'responding', incidentType: 'pedestrian', coordinates: { lat: 12.6, lng: 122.8 }, createdAt: new Date().toISOString() },
        ];
        renderWorkspace(createProps({ reports, mapSummaryPanel: 'incidents', setMapSummaryPanel, setResponderMapFilter }));

        expect(findReportRow(document.body, 'Vehicular')).toHaveTextContent('Verified');
        expect(findReportRow(document.body, 'Motorcycle')).toHaveTextContent('Coordinated');
        expect(findReportRow(document.body, 'Pedestrian')).toHaveTextContent('Active response');

        fireEvent.click(screen.getByRole('button', { name: /View 3 active incidents/i }));
        expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:active');
        // The Active incidents card filters to the pending-excluded active set,
        // unlike the aggregate 'all' view which includes pending.
        expect(setResponderMapFilter).toHaveBeenCalledWith('active');
    });

    test('keeps the guest map public and free of operational controls', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            roleStats: null,
        }));

        expect(screen.getByText('Public safety map')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Awaiting response' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Needs review' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /submit report/i })).not.toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            viewerRole: 'guest',
            showPending: false,
            showDataState: true,
            canRespond: false,
            canResolve: false,
        });
    });

    test('opens the same sanitized incident description from the guest active-incidents list', () => {
        const setMapSummaryPanel = vi.fn();
        const report = {
            _id: 'verified-guest-1',
            status: 'verified',
            title: 'Accident at J. Rizal Street',
            description: 'One lane is temporarily obstructed.',
            incidentType: 'vehicular',
            severity: 'moderate',
            address: 'J. Rizal Street',
            barangay: 'Poblacion',
            municipalityName: 'Cajidiocan',
            coordinates: { lat: 12.4, lng: 122.6 },
            incidentTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports: [report],
            mapSummaryPanel: 'incidents',
            setMapSummaryPanel,
        }));

        const listPanel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(screen.getByText('1 currently visible')).toBeInTheDocument();
        expect(listPanel).toHaveClass('pane-enter', 'flex-1');
        expect(listPanel.parentElement).toBe(screen.getByTestId('map-summary-dock'));
        // The page behind it is untouched: opening a metric's records does not
        // take the map or the rest of the dashboard away from the reader.
        expect(document.body.style.overflow).toBe('');
        expect(listPanel.className).not.toContain('sm:w-[min(24rem,42%)]');
        fireEvent.click(screen.getByRole('button', { name: 'View details' }));

        // The details view is the same docked pane with a new subject, so it
        // keeps the pane's presentation rather than swapping to a drawer.
        expect(screen.getByRole('dialog', { name: 'Incident details' })).toHaveClass('pane-enter', 'flex-1');
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(report.description)).toBeInTheDocument();
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are protected/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Back to active incidents' }));
        expect(screen.getByRole('dialog', { name: 'Active incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close incidents panel' }));
        expect(setMapSummaryPanel).toHaveBeenCalledWith('');
    });

    test('reports the responding mix — transfers included — on the active incidents card', () => {
        const reports = [
            { _id: 'verified-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-2', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'transferred-1', status: 'transferred', coordinates: { lat: 12.5, lng: 122.7 } },
            { _id: 'responding-1', status: 'responding', coordinates: { lat: 12.6, lng: 122.8 } },
        ];

        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports,
        }));

        // 4 active with 1 responding, so 3 are still waiting for a responder —
        // and one of those 3 has been handed to another municipality. The
        // transfer rides in a parenthetical because it is part of the waiting 3
        // rather than a fifth incident, so the line still adds up to the number
        // printed above it.
        expect(screen.getByRole('button', {
            name: /View 4 active incidents\. 1 responding, 3 waiting \(1 transferred\)/i,
        })).toBeInTheDocument();
    });

    test('locates an incident through the mounted map without URL navigation', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const scrollIntoView = vi.fn();
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            reports: [report],
            mapSummaryPanel: 'incidents',
            setSearchParams,
            setMapSummaryPanel,
        }));

        // The panel setter also fires once on mount, pinning the arrival default;
        // clearing it here keeps the assertions below about the click alone.
        setMapSummaryPanel.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

        // A Locate is a camera move and nothing else: the route is untouched,
        // the page does not scroll, the map gets the request — and beside the
        // canvas the pane the viewer clicked from stays exactly as it was, so
        // the list is still there for the next incident.
        expect(setSearchParams).not.toHaveBeenCalled();
        expect(setMapSummaryPanel).not.toHaveBeenCalled();
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual(expect.objectContaining({
            type: 'incident',
            id: 'verified-1',
            entity: report,
            requestId: expect.stringMatching(/^\d+-1$/),
        }));
    });

    test('collapses the pane on Locate only where it is a sheet over the map', async () => {
        // Inside the sheet width the pane hides the pin the flight is bringing
        // into view, so there it still yields. Same click, two widths, one
        // difference — the panel's own breakpoint decides which.
        const setMapSummaryPanel = vi.fn();
        const scrollIntoView = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        const setSearchParams = vi.fn();
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(max-width: 639px)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        try {
            renderWorkspace(createProps({
                reports: [report],
                mapSummaryPanel: 'incidents',
                setSearchParams,
                setMapSummaryPanel,
            }));

            setMapSummaryPanel.mockClear();
            fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

            expect(setSearchParams).not.toHaveBeenCalled();
            expect(setMapSummaryPanel).toHaveBeenCalledWith('');
            expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual(expect.objectContaining({
                type: 'incident',
                id: 'verified-1',
            }));
            // And it takes the reader with it: at this width the map is above the
            // pane, so the flight would happen off-screen for anyone reading the
            // records. The camera move is still all Locate does — this is the
            // reader being brought to it.
            await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'start',
            }));
        } finally {
            window.matchMedia = originalMatchMedia;
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        }
    });

    test('brings a phone to the pane, because there the box stands under the canvas', async () => {
        // The mobile order draws the map first and the summary box second, and a
        // pane renders into that box — so a pin's details would otherwise open
        // below a canvas the reader has no reason to scroll past. From sm up the
        // box is the column beside the map, and this is deliberately nothing.
        const originalMatchMedia = window.matchMedia;
        const scrollIntoView = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(max-width: 639px)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        try {
            renderWorkspace(createProps());
            expect(scrollIntoView).not.toHaveBeenCalled();

            act(() => mapPropsSpy.mock.lastCall[0].onEntityInspectorChange(true));

            const dock = screen.getByTestId('map-summary-dock');
            expect(dock).not.toHaveClass('hidden');
            await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'start',
            }));
        } finally {
            window.matchMedia = originalMatchMedia;
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
        }
    });

    test('creates a new focus request for repeated locate clicks', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            reports: [report],
            mapSummaryPanel: 'incidents',
            setSearchParams,
            setMapSummaryPanel,
        }));

        const locateButton = screen.getByRole('button', { name: /^locate$/i });
        fireEvent.click(locateButton);
        const firstFocus = mapPropsSpy.mock.lastCall[0].locateRequest.requestId;
        fireEvent.click(locateButton);

        const secondFocus = mapPropsSpy.mock.lastCall[0].locateRequest.requestId;
        expect(setSearchParams).not.toHaveBeenCalled();
        expect(firstFocus).not.toBe(secondFocus);
    });

    test('switches summary modes in the same non-modal map panel with neutral selected controls', () => {
        const report = {
            _id: 'verified-1',
            status: 'verified',
            address: 'Near Cambijang',
            incidentType: 'vehicular',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            address: 'Sibuyan Circumferential Road, Cambijang',
            municipality: 'Cajidiocan',
            radius: 100,
            coordinates: { lat: 12.405, lng: 122.69 },
        };
        const props = createProps({ reports: [report], highRiskZones: [zone] });
        const { rerender } = renderWorkspace({ ...props, mapSummaryPanel: 'overview:active' });

        const incidentControl = screen.getByRole('button', { name: /View 1 active incidents/i });
        const riskZoneControl = screen.getByRole('button', { name: /View 1 risk zones/i });
        const panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(incidentControl).toHaveAttribute('aria-pressed', 'true');
        expect(riskZoneControl).toHaveAttribute('aria-pressed', 'false');
        expect(panel.parentElement).not.toHaveClass('fixed', 'bg-black/45', 'backdrop-blur-sm');

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:risk-zones" />
            </MemoryRouter>,
        );

        expect(screen.getByRole('dialog', { name: 'Active risk zones' })).toBe(panel);
        expect(screen.getByText('1 monitored zone')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View 1 active incidents/i })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /View 1 risk zones/i })).toHaveAttribute('aria-pressed', 'true');
    });

    test('locates a risk zone using its real marker identity without disturbing the pane', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            address: 'Sibuyan Circumferential Road, Cambijang',
            municipality: 'Cajidiocan',
            radius: 100,
            coordinates: { lat: 12.405, lng: 122.69 },
        };

        renderWorkspace(createProps({
            highRiskZones: [zone],
            mapSummaryPanel: 'zones',
            setMapSummaryPanel,
            setSearchParams,
        }));

        setMapSummaryPanel.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

        // A zone Locate obeys the same rule as an incident's: beside the canvas
        // the pane keeps its records, and only the camera moves.
        expect(setSearchParams).not.toHaveBeenCalled();
        expect(setMapSummaryPanel).not.toHaveBeenCalled();
        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual(expect.objectContaining({
            type: 'risk-zone',
            id: 'zone-1',
            entity: zone,
        }));
    });

    test('keeps the incident control and contextual list aligned with the active map filter', () => {
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 } },
        ];

        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            responderMapFilter: 'pending',
            mapSummaryPanel: 'incidents',
        }));

        expect(screen.getByRole('button', { name: /View 1 pending review\. Awaiting review/i })).toHaveTextContent('1');
        const incidentPanel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(findReportRow(incidentPanel, 'Vehicular')).toHaveTextContent('Pending');
        expect(findReportRow(incidentPanel, 'Fire')).toBeUndefined();
        expect(findReportRow(incidentPanel, 'Medical')).toBeUndefined();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            filterStatus: 'pending',
        });
    });

    test('surfaces risk-zone loading and retry states without blocking the map', () => {
        const onRetryHighRiskZones = vi.fn();
        const props = createProps({
            highRiskZonesLoading: true,
            mapSummaryPanel: 'zones',
            onRetryHighRiskZones,
        });
        const { rerender } = renderWorkspace(props);

        expect(screen.getByRole('button', { name: /View 0 risk zones/i })).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Loading risk zones');
        expect(screen.getByTestId('map-view')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace
                    {...props}
                    highRiskZonesLoading={false}
                    highRiskZonesError="High-risk zones are temporarily unavailable."
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('button', { name: /View 0 risk zones/i })).not.toHaveAttribute('aria-busy');
        expect(screen.getAllByText('High-risk zones are temporarily unavailable.')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Retry risk zones' }));
        expect(onRetryHighRiskZones).toHaveBeenCalledTimes(1);
    });

    test('renders role-aware status filter bar with counts and preserves high risk zones on map', () => {
        const setResponderMapFilter = vi.fn();
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 } },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'other', coordinates: { lat: 12.43, lng: 122.63 } },
            { _id: 'resolved-1', status: 'resolved', incidentType: 'marine', coordinates: { lat: 12.44, lng: 122.64 } },
        ];
        const highRiskZones = [
            { _id: 'zone-1', name: 'Risk Zone 1', type: 'landslide_prone', coordinates: { lat: 12.4, lng: 122.6 }, radius: 100 },
        ];

        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            highRiskZones,
            responderMapFilter: 'all',
            setResponderMapFilter,
        }));

        const filterBar = screen.getByLabelText('Map status filter');
        expect(filterBar).toBeInTheDocument();

        expect(within(filterBar).getByRole('button', { name: /active incidents/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending review/i })).toBeInTheDocument();
        // The operational queues are no longer tabs: the rail reads exactly like
        // the reporter's, and the dispatch/response split lives inside the panel
        // that holds those records (see the queue-segment test).
        expect(within(filterBar).queryByRole('button', { name: /ready to dispatch/i })).not.toBeInTheDocument();
        expect(within(filterBar).queryByRole('button', { name: /active response/i })).not.toBeInTheDocument();
        expect(within(filterBar).queryByRole('button', { name: /^transferred$/i })).not.toBeInTheDocument();
        // The archive and the hazard layer sit in their own labeled group, so
        // neither can read as a fourth status.
        expect(within(filterBar).getByRole('button', { name: /Resolved archive/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /risk zones layer/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('group', { name: /layers and archive/i })).toBeInTheDocument();

        fireEvent.click(within(filterBar).getByRole('button', { name: /risk zones/i }));
        expect(setResponderMapFilter).toHaveBeenCalledWith('risk-zones');

        fireEvent.click(within(filterBar).getByRole('button', { name: /Resolved archive/i }));
        expect(setResponderMapFilter).toHaveBeenCalledWith('resolved');

        expect(mapPropsSpy.mock.lastCall[0].highRiskZones).toEqual(highRiskZones);
    });

    test('rests the map on the viewer municipality for every assigned role, not just reporters', () => {
        const assignedRoles = [
            ['municipal admin', { _id: 'a1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' }, { isAdmin: true }],
            ['responder', { _id: 'r1', role: 'responder', assignedMunicipality: 'Magdiwang' }, { isResponder: true }],
            ['reporter', { _id: 'u1', role: 'reporter', assignedMunicipality: 'San Fernando' }, { isReporter: true }],
        ];

        assignedRoles.forEach(([label, user, flags]) => {
            const { unmount } = renderWorkspace(createProps({
                user,
                isAuthenticated: true,
                isReporter: false,
                isResponder: false,
                isAdmin: false,
                ...flags,
            }));

            // The page is titled "<Municipality> incident map" for all of them,
            // so all of them rest on that municipality when the incidents cannot
            // frame them. Only reporters used to, which left an admin staring at
            // the whole island with their own incidents off-screen.
            //
            // It rides as `homeFocus` — the camera the map falls back to — and
            // not as `focusLocation`, which means "a link asked for this place".
            // As a link target it fired a fly-to that outranked the incidents on
            // a warm cache and lost to them on a cold one, so the same view had
            // two different "defaults".
            expect(mapPropsSpy.mock.lastCall[0].homeFocus, label).toMatchObject({
                requestId: `municipality-home:${user.assignedMunicipality}`,
            });
            expect(mapPropsSpy.mock.lastCall[0].focusLocation, label).toBeNull();
            unmount();
        });

        // Guests have no assignment, so they keep the island-wide camera.
        const guest = renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            isResponder: false,
            isAdmin: false,
        }));
        expect(mapPropsSpy.mock.lastCall[0].homeFocus).toBeFalsy();
        guest.unmount();
    });

    test('opens the ready-to-dispatch card on the map as well as in its panel', () => {
        const setResponderMapFilter = vi.fn();
        const setMapSummaryPanel = vi.fn();
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAuthenticated: true,
            isAdmin: true,
            isReporter: false,
            isResponder: false,
            reports: [
                { _id: 'v1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
                { _id: 't1', status: 'transferred', coordinates: { lat: 12.41, lng: 122.61 } },
                { _id: 'r1', status: 'responding', coordinates: { lat: 12.42, lng: 122.62 } },
            ],
            responderMapFilter: 'all',
            setResponderMapFilter,
            setMapSummaryPanel,
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });
        // Active incidents is the card that holds the dispatch pair, and it opens
        // the same set its tab counts (1 verified + 1 transferred + 1 responding).
        const activeCard = within(summary).getByRole('button', { name: /View 3 active incidents/i });
        fireEvent.click(activeCard);

        expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:active');
        expect(setResponderMapFilter).toHaveBeenCalledWith('active');
        // The card is no longer the exception: every card wears the chevron,
        // because every card opens the set it counts.
        expect(activeCard.querySelector('svg')).not.toBeNull();
    });

    test('keeps overview metrics decoupled from active map status filters (e.g. risk-zones filter)', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'vehicular', coordinates: { lat: 12.42, lng: 122.62 }, createdAt: now },
        ];
        const highRiskZones = [
            { _id: 'zone-1', name: 'Risk Zone 1', type: 'landslide_prone', coordinates: { lat: 12.43, lng: 122.63 }, radius: 100 },
        ];

        renderWorkspace(createProps({
            user: null,
            isAdmin: false,
            isResponder: false,
            isReporter: false,
            reports,
            highRiskZones,
            responderMapFilter: 'risk-zones',
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });
        // Counts stay independent of the active map filter. Active incidents
        // already folds in the transferred row: 1 verified + 1 responding + 1
        // transferred = 3, so the merged total is what the card must show.
        expect(within(summary).getByRole('button', { name: /View 3 active incidents/i })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: /View 0 resolved/i })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: /View 1 risk zones/i })).toBeInTheDocument();
        // Transferred is no longer a category card of its own.
        expect(within(summary).queryByRole('button', { name: /^View \d+ transferred/i })).not.toBeInTheDocument();
    });

    describe('Mobile Map Dashboard Filter Controls & Bottom Sheet', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'rep-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'rep-2', status: 'responding', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'rep-3', status: 'pending', coordinates: { lat: 12.42, lng: 122.62 }, createdAt: now },
        ];
        const highRiskZones = [
            { _id: 'zone-1', name: 'Cambijang Risk Zone', type: 'landslide_prone', coordinates: { lat: 12.43, lng: 122.63 }, radius: 100 },
        ];

        test('1. Renders compact Filters button and status pill on mobile', () => {
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'all',
            }));

            const filterBtn = screen.getByRole('button', { name: /^filters$/i });
            expect(filterBtn).toBeInTheDocument();
            // The pill names the filter that is actually applied, using the same
            // rail label the desktop tab carries: 'all' is 'All open' now, for
            // admin and reporter alike.
            expect(screen.getByText(/All open · 3/i)).toBeInTheDocument();
        });

        test('2. Opens bottom sheet when tapping Filters button and displays operational status rows', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            const filterBtn = screen.getByRole('button', { name: /^filters$/i });
            fireEvent.click(filterBtn);

            const dialog = screen.getByRole('dialog', { name: /Map filters/i });
            expect(dialog).toBeInTheDocument();
            expect(screen.getByText('Control which incidents and hazard layers appear on the map.')).toBeInTheDocument();
            expect(screen.getByText(/Showing all open · 3 incidents/i)).toBeInTheDocument();

            // Distinct operational sections
            expect(screen.getByText(/Incident scope/i)).toBeInTheDocument();
            expect(screen.getByText(/Incident status/i)).toBeInTheDocument();
            expect(screen.getByText(/Map layers/i)).toBeInTheDocument();

            const radioGroup = within(dialog).getByRole('radiogroup', { name: /Incident filter options/i });
        expect(within(radioGroup).getByRole('radio', { name: /all open/i })).toBeInTheDocument();
        expect(within(radioGroup).getByRole('radio', { name: /active incidents/i })).toBeInTheDocument();
        expect(within(radioGroup).getByRole('radio', { name: /pending review/i })).toBeInTheDocument();
        expect(within(radioGroup).getByRole('radio', { name: /risk zones/i })).toBeInTheDocument();
        // The archive is a layer here, exactly as it is on the desktop rail —
        // not a third status.
        expect(within(radioGroup).getByRole('radio', { name: /resolved archive/i })).toBeInTheDocument();
        // The dispatch and in-response queues are segments inside the Active
        // incidents panel, not sheet options, so they must not reappear here.
        expect(within(radioGroup).queryByRole('radio', { name: /ready to dispatch/i })).not.toBeInTheDocument();
        expect(within(radioGroup).queryByRole('radio', { name: /active response/i })).not.toBeInTheDocument();
        });

        test('3. Selecting a status and tapping Apply filters updates the active filter', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            fireEvent.click(screen.getByRole('button', { name: /^filters$/i }));
            const dialog = screen.getByRole('dialog', { name: /Map filters/i });

            fireEvent.click(within(dialog).getByRole('radio', { name: /pending/i }));
            expect(screen.getByText(/Showing pending review · 1 incident/i)).toBeInTheDocument();

            fireEvent.click(within(dialog).getByRole('button', { name: /show 1 incident/i }));

            expect(setResponderMapFilter).toHaveBeenCalledWith('pending');
            expect(screen.queryByRole('dialog', { name: /Map filters/i })).not.toBeInTheDocument();
        });

        test('4. Tapping Clear all in bottom sheet resets filter to all', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'responding',
                setResponderMapFilter,
            }));

            fireEvent.click(screen.getByRole('button', { name: /filters, 1 filter applied/i }));
            const dialog = screen.getByRole('dialog', { name: /Map filters/i });

            fireEvent.click(within(dialog).getByRole('button', { name: /clear all/i }));

            expect(setResponderMapFilter).toHaveBeenCalledWith('all');
            expect(screen.queryByRole('dialog', { name: /Map filters/i })).not.toBeInTheDocument();
        });

        test('5. Dismisses bottom sheet with Escape key without applying changes', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            fireEvent.click(screen.getByRole('button', { name: /^filters$/i }));
            expect(screen.getByRole('dialog', { name: /Map filters/i })).toBeInTheDocument();

            fireEvent.keyDown(window, { key: 'Escape' });
            expect(screen.queryByRole('dialog', { name: /Map filters/i })).not.toBeInTheDocument();
            expect(setResponderMapFilter).not.toHaveBeenCalled();
        });

        test('6. Shows active filter badge and quick-clear action when non-default filter is active', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAdmin: true,
                isReporter: false,
                reports,
                highRiskZones,
                responderMapFilter: 'pending',
                setResponderMapFilter,
            }));

            expect(screen.getByRole('button', { name: /filters, 1 filter applied/i })).toBeInTheDocument();
            expect(screen.getByText(/Pending review · 1/i)).toBeInTheDocument();

            const quickClearBtns = screen.getAllByRole('button', { name: /clear active filter and show all/i });
            expect(quickClearBtns.length).toBeGreaterThan(0);
            fireEvent.click(quickClearBtns[0]);
            expect(setResponderMapFilter).toHaveBeenCalledWith('all');
        });
    });

    describe('Public and Reporter Transferred Filter', () => {
        const publicReports = [
            {
                _id: 'rep-v1',
                status: 'verified',
                title: 'Verified Accident',
                coordinates: { lat: 12.35, lng: 122.51 },
                municipalityName: 'Cajidiocan',
            },
            {
                _id: 'rep-t1',
                status: 'transferred',
                title: 'Transferred Accident 1',
                coordinates: { lat: 12.36, lng: 122.52 },
                municipalityName: 'Magdiwang',
            },
            {
                _id: 'rep-t2',
                status: 'transferred',
                title: 'Transferred Accident 2',
                coordinates: { lat: 12.37, lng: 122.53 },
                municipalityName: 'San Fernando',
            },
            {
                _id: 'rep-r1',
                status: 'responding',
                title: 'Responding Accident',
                coordinates: { lat: 12.38, lng: 122.54 },
                municipalityName: 'Cajidiocan',
            },
        ];

        test('1. Guest user sees the folded filter rail with no operational jargon', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
                reports: publicReports,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            // Guests get the reporter's filter shape — one Active Incidents tab
            // instead of Verified / Responding / Transferred — minus the pending
            // tab, which they are never sent data for.
            expect(screen.getByRole('button', { name: /Active Incidents filter/i })).toBeInTheDocument();
            // The archive is in the labeled layer group, the same place every
            // signed-in rail puts it.
            expect(screen.getByRole('button', { name: /Resolved archive/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Transferred filter/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Verified filter/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Pending filter/i })).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /Resolved archive/i }));
            expect(setResponderMapFilter).toHaveBeenCalledWith('resolved');
        });

        test('2. Guest filter sheet files the archive as a layer, not a status', () => {
            const setResponderMapFilter = vi.fn();
            const reportsWithArchive = [
                ...publicReports,
                { _id: 'rep-x1', status: 'resolved', title: 'Resolved Accident 1', coordinates: { lat: 12.39, lng: 122.55 }, municipalityName: 'Cajidiocan' },
                { _id: 'rep-x2', status: 'resolved', title: 'Resolved Accident 2', coordinates: { lat: 12.40, lng: 122.56 }, municipalityName: 'Magdiwang' },
            ];
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
                reports: reportsWithArchive,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            fireEvent.click(screen.getByRole('button', { name: /^filters$/i }));
            const sheet = screen.getByRole('dialog', { name: /Map filters/i });
            const radioGroup = within(sheet).getByRole('radiogroup', { name: /Incident filter options/i });

            // The sheet reads each option's own group, so it cannot disagree with
            // the rail beside it: the archive is a layer in both places. It used
            // to be hardcoded into the status section, which offered a guest
            // "Incident status: Resolved archive" and a second Resolved row.
            expect(within(radioGroup).getByRole('radio', { name: /risk zones/i })).toBeInTheDocument();
            expect(within(radioGroup).getByRole('radio', { name: /resolved archive/i })).toBeInTheDocument();
            // A guest has no status rows beyond the scope row, because the only
            // status a guest is missing is the one they are never sent.
            expect(sheet.querySelectorAll('h3')).toHaveLength(2);

            fireEvent.click(within(radioGroup).getByRole('radio', { name: /resolved archive/i }));
            expect(screen.getByText(/Showing resolved archive · 2 incidents/i)).toBeInTheDocument();

            fireEvent.click(within(sheet).getByRole('button', { name: /show 2 incidents/i }));
            expect(setResponderMapFilter).toHaveBeenCalledWith('resolved');
        });

        test('3. Reporter user folds Transferred into All open (no separate tab)', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'reporter-1', role: 'reporter' },
                isAuthenticated: true,
                isAdmin: false,
                isReporter: true,
                isResponder: false,
                reports: publicReports,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            fireEvent.click(screen.getByRole('button', { name: /^filters$/i }));
            const sheet = screen.getByRole('dialog', { name: /Map filters/i });
            expect(sheet).toBeInTheDocument();

            // Operational jargon is intentionally hidden from reporters.
            expect(within(sheet).queryByRole('radio', { name: /^transferred$/i })).not.toBeInTheDocument();
            expect(within(sheet).queryByRole('radio', { name: /^verified$/i })).not.toBeInTheDocument();
            // All open umbrella still counts the folded transferred rows.
            const allOpenRadio = within(sheet).getByRole('radio', { name: /^all open$/i });
            expect(allOpenRadio).toBeInTheDocument();

            fireEvent.click(within(sheet).getByRole('radio', { name: /^pending review$/i }));
            fireEvent.click(within(sheet).getByRole('button', { name: /Show \d+ incidents/i }));

            expect(setResponderMapFilter).toHaveBeenCalledWith('pending');
        });

        test('4. Passes the active filter through to MapView without narrowing the report set', () => {
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
                reports: publicReports,
                responderMapFilter: 'transferred',
            }));

            const mapProps = mapPropsSpy.mock.lastCall[0];
            expect(mapProps.filterStatus).toBe('transferred');
            // One map for every viewer: there is no longer a per-role marker
            // policy for the workspace to hand down.
            expect(mapProps.filterMode).toBeUndefined();
            expect(mapProps.reports).toEqual(publicReports);
        });

        test('4b. Hands MapView the role\'s own opening camera', () => {
            // Guest: the public safety map opens on the whole island.
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
                reports: publicReports,
            }));
            expect(mapPropsSpy.mock.lastCall[0].frameReportsOnOpen).toBe(false);

            // Reporter: opens on the incidents they can see.
            renderWorkspace(createProps({ reports: publicReports }));
            expect(mapPropsSpy.mock.lastCall[0].frameReportsOnOpen).toBe(true);
        });

        test('5. Reporter desktop strip shows only status tabs plus separate layer/archive controls', () => {
            const setResponderMapFilter = vi.fn();
            renderWorkspace(createProps({
                user: { _id: 'reporter-1', role: 'reporter' },
                isAuthenticated: true,
                isAdmin: false,
                isReporter: true,
                isResponder: false,
                reports: publicReports,
                responderMapFilter: 'all',
                setResponderMapFilter,
            }));

            // Primary status tabs reconcile: All open = Pending + Active.
            // Fixture: 0 pending + 4 active (1 verified + 2 transferred + 1 responding).
            expect(screen.getByRole('button', { name: /All open filter \(4 records\)/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Pending review filter \(0 records\)/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Active incidents filter \(4 records\)/i })).toBeInTheDocument();
            // Archive and hazard layer are separate controls, not status tabs.
            expect(screen.queryByRole('button', { name: /Resolved filter/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Risk Zones filter/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Risk zones layer/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Resolved archive/i })).toBeInTheDocument();
            // Secondary controls sit in a labeled group so they never read as status tabs.
            expect(screen.getByRole('group', { name: /Layers and archive/i })).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: /Resolved archive/i }));
            expect(setResponderMapFilter).toHaveBeenCalledWith('resolved');

            fireEvent.click(screen.getByRole('button', { name: /Risk zones layer/i }));
            expect(setResponderMapFilter).toHaveBeenCalledWith('risk-zones');
        });
    });

    describe('Mobile-First Responsive Layout and Typography', () => {
        test('1. Names the page with its own heading, above the workspace kicker', () => {
            renderWorkspace(createProps({
                user: { _id: 'reporter-1', role: 'reporter' },
                isAuthenticated: true,
                isReporter: true,
                isResponder: false,
                isAdmin: false,
            }));

            // The workspace's subject is the document's h1 — a screen reader
            // announces it and headings navigation finds it — and it prints,
            // because a map screen whose subject exists only in the URL reads as
            // a fragment of some larger page. It steps down to 22px from lg,
            // where the workspace is the viewport's height minus this header and
            // every line here is a line the map does not get.
            const heading = screen.getByRole('heading', { level: 1 });
            expect(heading).toHaveTextContent('Sibuyan Island incident map');
            expect(heading).not.toHaveClass('sr-only');
            expect(heading.className).toContain('font-display');
            expect(heading.className).toContain('text-[26px]');
            expect(heading.className).toContain('sm:text-[32px]');
            expect(heading.className).toContain('lg:text-[22px]');

            // The kicker above it names the viewer's own workspace, so the two
            // lines are one hierarchy rather than one line printed twice.
            const header = heading.closest('header');
            const eyebrow = within(header).getByText('Reporter map');
            expect(eyebrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

            // What the header also prints: the viewer's own workspace, and —
            // below lg, where the sidebar is behind a drawer — a sentence that
            // names the same place in words.
            expect(within(header).getByText('Reporter map')).toBeInTheDocument();
            expect(within(header).getByText(/Track your reports and community incidents across Sibuyan Island/i)).toBeInTheDocument();
            expect(within(header).getByText(/Track your reports and community incidents/i)).toHaveClass('lg:hidden');
        });

        test('2. Overview metrics items render with tabular numbers, distinct labels, and wrap gracefully', () => {
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isReporter: false,
                isResponder: false,
                isAdmin: false,
                reports: [
                    { _id: 'r1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
                    { _id: 'r2', status: 'responding', coordinates: { lat: 12.41, lng: 122.61 } },
                ],
                highRiskZones: [
                    { _id: 'z1', name: 'Very Long Zone Name In A Complex Terrain Area', type: 'flood', coordinates: { lat: 12.42, lng: 122.62 } },
                ],
            }));

            const summary = screen.getByRole('region', { name: 'Map summary' });
            const metricButtons = within(summary).getAllByRole('button');
            // Guest: active incidents, active response, risk zones.
            expect(metricButtons).toHaveLength(3);

            metricButtons.forEach((btn) => {
                // Compact phone row that grows into a comfortably padded card
                // from sm — one padding rhythm for every card in the band — and
                // gives that padding back at lg, where the card is one of four
                // in the map's own column: the stack has to close inside the
                // height the map beside it sets, because the pane a card opens is
                // laid over exactly this box.
                //
                // `py-2`, not the `py-2.5` the four equal rows used: on a phone
                // the band is a priority list whose height is the map's loss,
                // and 8px top and bottom still leaves a 56px target.
                //
                // `px-2` is what the phone's one-line supporting text is
                // measured against: at 375px it leaves 151px inside a half-width
                // card, which is 8px more than the longest line in the app (40
                // characters, 143.3px in the self-hosted Inter) needs in order to
                // fit without wrapping at all.
                expect(btn).toHaveClass('px-2', 'py-2', 'sm:px-4', 'sm:py-4', 'lg:justify-center', 'lg:py-2');
                // One number slot, sized per width — 20px in a half-width phone
                // card, 28px once the card is wide enough for its supporting line
                // to sit beside it. It stays the card's headline at both, which is
                // why it is one element with two sizes rather than two elements.
                const numbers = Array.from(btn.querySelectorAll('.tabular-nums'));
                expect(numbers).toHaveLength(1);
                expect(numbers[0]).toHaveClass('text-xl', 'sm:text-[28px]');
                // The number and its supporting line are one row, and the row is
                // what stacks on a phone (there is no room beside a number in a
                // 167px card) and goes side by side from sm. The number is not a
                // cell of the label row either, which is what stops a half-width
                // card squeezing "Active incidents" against the chevron.
                const valueRow = numbers[0].parentElement;
                expect(valueRow.parentElement).toBe(btn);
                expect(valueRow).toHaveClass('flex', 'flex-col', 'sm:flex-row', 'sm:items-baseline');
                // The number leads the row and the description follows it — which
                // is the recomposition: the two used to be separate lines, leaving
                // the right half of every card empty.
                expect(valueRow.firstElementChild).toBe(numbers[0]);
                expect(valueRow.children).toHaveLength(2);
                expect(valueRow.children[1].textContent).toBeTruthy();
            });
        });

        test('3. Long zone names, addresses, and hazard types render without layout breakage in summary panel', () => {
            const longZone = {
                _id: 'zone-long-1',
                name: 'Hazardous Landslide Area along Mountain Highway km 42 with Ongoing Soil Instability',
                type: 'landslide',
                address: 'Sitio Upper Malindog, Barangay Poblacion, Municipality of San Fernando, Sibuyan Island',
                description: 'Steep incline zone subject to sudden mudflows during continuous heavy rainfall periods.',
                radius: 350,
                coordinates: { lat: 12.35, lng: 122.55 },
            };

            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isReporter: false,
                isResponder: false,
                isAdmin: false,
                highRiskZones: [longZone],
                mapSummaryPanel: 'overview:risk-zones',
            }));

            const panel = screen.getByRole('dialog', { name: /Active Risk Zones/i });
            expect(panel).toBeInTheDocument();
            expect(within(panel).getByText(longZone.name)).toHaveClass('break-words');
            expect(within(panel).getByText(longZone.address)).toHaveClass('break-words');

            const viewDetailsBtn = within(panel).getByRole('button', { name: /View details/i });
            const locateBtn = within(panel).getByRole('button', { name: /Locate/i });

            expect(viewDetailsBtn).toBeInTheDocument();
            expect(locateBtn).toBeInTheDocument();

            // Distinct actions: clicking View details opens zone details
            fireEvent.click(viewDetailsBtn);
            expect(within(panel).getByRole('button', { name: /Back to (active )?risk zones/i })).toBeInTheDocument();
        });
    });

    // This component is mounted exactly while the map view is open, so a mount is
    // an arrival: another page, the analytics half of /dashboard, or a reload.
    // Each must open the way a fresh sign-in does, not where the last visit left
    // off.
    describe('Arrival defaults', () => {
        test('1. Opens on the role\'s home tab, not on the tab the last visit chose', () => {
            const setResponderMapFilter = vi.fn();
            const setMapSummaryPanel = vi.fn();

            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isReporter: false,
                isAdmin: true,
                isResponder: false,
                // Left behind by a previous visit to this map.
                responderMapFilter: 'risk-zones',
                mapSummaryPanel: 'overview:pending',
                setResponderMapFilter,
                setMapSummaryPanel,
            }));

            expect(setResponderMapFilter).toHaveBeenCalledWith('all');
            expect(setMapSummaryPanel).toHaveBeenCalledWith('');
        });

        test('2. Never leaves an overview panel open for a viewer who did not open it', () => {
            const setMapSummaryPanel = vi.fn();

            renderWorkspace(createProps({
                mapSummaryPanel: 'overview:resolved',
                activePanel: null,
                setMapSummaryPanel,
            }));

            // Nothing in the URL asked for a panel, so the arrival has none.
            expect(setMapSummaryPanel).toHaveBeenCalledWith('');
            expect(setMapSummaryPanel).not.toHaveBeenCalledWith('overview:resolved');
        });

        test('3. Honours the panel a deep link asked for', () => {
            const setMapSummaryPanel = vi.fn();

            renderWorkspace(createProps({ activePanel: 'zones', setMapSummaryPanel }));

            expect(setMapSummaryPanel).toHaveBeenCalledWith('zones');
            expect(setMapSummaryPanel).not.toHaveBeenCalledWith('');
        });

        test('4. Opens a guest on the public rail\'s home tab', () => {
            const setResponderMapFilter = vi.fn();

            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
                responderMapFilter: 'resolved',
                setResponderMapFilter,
            }));

            // 'all' is the guest's active-incident set — never the signed-in
            // pending tab, which the API never fills for an anonymous viewer.
            expect(setResponderMapFilter).toHaveBeenCalledWith('all');
        });

        test('5. Hands the map its assignment as a resting camera and not as a link target', () => {
            renderWorkspace(createProps({
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isReporter: false,
                isAdmin: true,
                isResponder: false,
                focusLocation: null,
            }));

            const mapProps = mapPropsSpy.mock.lastCall[0];
            expect(mapProps.homeFocus).toEqual({
                ...MUNICIPALITY_MAP_FOCUS.Cajidiocan,
                requestId: 'municipality-home:Cajidiocan',
            });
            // And it is NOT the query-driven focus: nothing may fly to the
            // municipality as though a link had asked for it.
            expect(mapProps.focusLocation).toBeNull();
        });

        test('6. Leaves a viewer with no assignment without a home camera', () => {
            renderWorkspace(createProps({
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isReporter: false,
                isResponder: false,
            }));

            expect(mapPropsSpy.mock.lastCall[0].homeFocus).toBeNull();
        });

        test('7. Tells the map when its data is still on its way', () => {
            renderWorkspace(createProps({ loading: true, reports: [] }));

            // The opening camera waits for this flag; without it the map would
            // decide on a half-loaded set and move again when the rest arrived.
            expect(mapPropsSpy.mock.lastCall[0].dataLoading).toBe(true);
        });
    });
});
