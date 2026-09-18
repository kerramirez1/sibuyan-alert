import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import ReachPanel from '../components/dashboard/ReachPanel';

/**
 * The panel used to show a single "Viewers" column that mixed every role, so on a
 * municipal dashboard the number was dominated by the office reading its own
 * queue while reading as community awareness. These tests exist to keep the
 * public figure the headline: if someone collapses the columns back into one
 * number, the meaning of the metric changes without any data changing.
 */
const rows = [
    {
        id: 'report-a',
        label: 'Road Accident at Poblacion',
        municipalityName: 'Cajidiocan',
        publicViewers: 7,
        guestViewers: 4,
        uniqueViewers: 9,
    },
    {
        id: 'zone-a',
        label: 'Cambajao River Flash Flood Zone',
        municipalityName: 'Cajidiocan',
        publicViewers: 2,
        guestViewers: 2,
        uniqueViewers: 3,
    },
];

const renderPanel = (props = {}) => render(
    <ReachPanel
        title="Incident reach"
        description="Distinct viewers who opened each incident"
        rows={rows}
        emptyDetail="No incident details have been opened yet."
        {...props}
    />,
);

describe('ReachPanel', () => {
    test('separates public reach from the total instead of showing one mixed number', () => {
        renderPanel();

        expect(screen.getByRole('columnheader', { name: 'Public' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'All viewers' })).toBeInTheDocument();
    });

    test('keeps the column labels on one line', () => {
        renderPanel();

        // In the two-panel dashboard layout the numeric headers run out of width
        // first, so "All viewers" broke onto two lines while the numbers under it
        // did not. The record label is the cell that should shrink instead.
        expect(screen.getByRole('columnheader', { name: 'All viewers' })).toHaveClass('whitespace-nowrap');
        expect(screen.getByRole('columnheader', { name: 'Public' })).toHaveClass('whitespace-nowrap');
    });

    test('renders exactly two figures per row, and no redundant guest column', () => {
        renderPanel();

        const firstRow = screen.getByRole('row', { name: /Road Accident at Poblacion/ });
        const cells = within(firstRow).getAllByRole('cell');

        // Public is a superset of guests (verified reporters), so a guest column
        // ties with its neighbour on every row and explains nothing. Column count
        // is part of the contract: label + two numbers.
        expect(cells).toHaveLength(3);
        expect(cells[1]).toHaveTextContent('7');
        expect(cells[2]).toHaveTextContent('9');
        expect(screen.queryByRole('columnheader', { name: 'Guests' })).not.toBeInTheDocument();
    });

    test('keeps the order the leaderboard sent, highest public reach first', () => {
        renderPanel();

        const [, firstRow, secondRow] = screen.getAllByRole('row');
        expect(firstRow).toHaveTextContent('Road Accident at Poblacion');
        expect(secondRow).toHaveTextContent('Cambajao River Flash Flood Zone');
    });

    test('states what public means, so the number cannot be misread as reach by staff', () => {
        renderPanel();

        expect(screen.getByText(/Public is anonymous visitors and verified reporters/i)).toBeInTheDocument();
        expect(screen.getByText(/Seeing a pin on the map is not counted/i)).toBeInTheDocument();
    });

    test('shows the empty state instead of an empty table', () => {
        renderPanel({ rows: [], emptyDetail: 'No hazard area details have been opened yet.' });

        expect(screen.getByText('No hazard area details have been opened yet.')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('survives rows it cannot read', () => {
        // The dashboards feed this straight from an API response; a malformed
        // payload must degrade, not take the analytics page down with it.
        renderPanel({ rows: null });

        expect(screen.getByText('No incident details have been opened yet.')).toBeInTheDocument();
    });
});
