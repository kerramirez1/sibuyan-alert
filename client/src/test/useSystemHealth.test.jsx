import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { systemAPI } from '../services/api';

vi.mock('../services/api', () => ({
    systemAPI: { getHealth: vi.fn() },
}));

const Probe = () => {
    const { status, isDegraded, isOnline } = useSystemHealth();
    return (
        <div>
            <span>status:{status}</span>
            <span>degraded:{String(isDegraded)}</span>
            <span>online:{String(isOnline)}</span>
        </div>
    );
};

describe('useSystemHealth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('reports online when the health endpoint succeeds', async () => {
        systemAPI.getHealth.mockResolvedValueOnce({ data: { success: true } });

        render(<Probe />);

        await waitFor(() => {
            expect(screen.getByText('status:online')).toBeInTheDocument();
        });
        expect(screen.getByText('degraded:false')).toBeInTheDocument();
    });

    test('reports degraded when the health endpoint fails', async () => {
        systemAPI.getHealth.mockRejectedValueOnce(new Error('Network failure'));

        render(<Probe />);

        await waitFor(() => {
            expect(screen.getByText('status:degraded')).toBeInTheDocument();
        });
        expect(screen.getByText('online:false')).toBeInTheDocument();
    });

    test('reports degraded when the health payload is unsuccessful', async () => {
        systemAPI.getHealth.mockResolvedValueOnce({ data: { success: false } });

        render(<Probe />);

        await waitFor(() => {
            expect(screen.getByText('status:degraded')).toBeInTheDocument();
        });
    });
});
