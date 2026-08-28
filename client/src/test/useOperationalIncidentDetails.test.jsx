import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useOperationalIncidentDetails from '../hooks/useOperationalIncidentDetails';
import { adminAPI, reportsAPI } from '../services/api';

vi.mock('../services/api', () => ({
    adminAPI: {
        getReportById: vi.fn(),
    },
    reportsAPI: {
        getById: vi.fn(),
    },
}));

describe('useOperationalIncidentDetails Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('1. Handles string ID, _id, and id property formats seamlessly', async () => {
        reportsAPI.getById.mockResolvedValue({
            data: {
                data: {
                    _id: 'report-123',
                    title: 'Incident 123',
                    status: 'verified',
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        // Test with string ID
        const { result: stringResult } = renderHook(() =>
            useOperationalIncidentDetails('report-123', 'guest')
        );
        await waitFor(() => expect(stringResult.current.loading).toBe(false));
        expect(reportsAPI.getById).toHaveBeenCalledWith('report-123', expect.any(Object));
        expect(stringResult.current.report?._id).toBe('report-123');

        // Test with { id: 'report-456' }
        reportsAPI.getById.mockResolvedValue({
            data: {
                data: {
                    id: 'report-456',
                    title: 'Incident 456',
                    status: 'verified',
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        const { result: idPropResult } = renderHook(() =>
            useOperationalIncidentDetails({ id: 'report-456', title: 'Summary 456' }, 'guest')
        );
        await waitFor(() => expect(idPropResult.current.loading).toBe(false));
        expect(reportsAPI.getById).toHaveBeenCalledWith('report-456', expect.any(Object));
        expect(idPropResult.current.report?.title).toBe('Incident 456');
    });

    test('2. Public/guest user loads public report details and normalizes evidence count', async () => {
        reportsAPI.getById.mockResolvedValue({
            data: {
                data: {
                    _id: 'report-1',
                    title: 'Public Incident',
                    status: 'verified',
                    evidence: {
                        viewerAccess: 'redacted',
                        count: 2,
                        items: [
                            { id: '0', redactedPreviewUrl: '/api/reports/report-1/evidence/0/preview?rv=3.4' },
                            { id: '1', redactedPreviewUrl: '/api/reports/report-1/evidence/1/preview?rv=3.4' },
                        ],
                    },
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        const baseReport = {
            _id: 'report-1',
            title: 'Public Incident',
            status: 'verified',
            evidenceCount: 2,
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'guest')
        );

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(reportsAPI.getById).toHaveBeenCalledWith('report-1', expect.any(Object));
        expect(adminAPI.getReportById).not.toHaveBeenCalled();
        expect(result.current.report?.detailAccess).toBe('public');
        expect(result.current.report?.detailCompleteness).toBe('full');
        expect(result.current.report?.evidenceCount).toBe(2);
        expect(result.current.error).toBe('');
        expect(result.current.restricted).toBe(false);
    });

    test('3. Operational user requests admin operational details via adminAPI', async () => {
        adminAPI.getReportById.mockResolvedValue({
            data: {
                data: {
                    _id: 'report-1',
                    title: 'Operational Incident',
                    status: 'verified',
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    images: ['/api/files/photo-1.jpg'],
                },
            },
        });

        const baseReport = {
            _id: 'report-1',
            title: 'Operational Incident',
            status: 'verified',
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'responder')
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(adminAPI.getReportById).toHaveBeenCalledWith('report-1', expect.any(Object));
        expect(reportsAPI.getById).not.toHaveBeenCalled();
        expect(result.current.report?.detailAccess).toBe('operational');
        expect(result.current.isOperationalViewer).toBe(true);
    });

    test('4. Operational user falls back to public reportsAPI when adminAPI returns 403 (out of jurisdiction)', async () => {
        const error403 = new Error('Forbidden');
        error403.response = { status: 403, data: { message: 'Out of municipal scope' } };

        adminAPI.getReportById.mockRejectedValue(error403);
        reportsAPI.getById.mockResolvedValue({
            data: {
                data: {
                    _id: 'report-1',
                    title: 'Out of Scope Incident',
                    status: 'verified',
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        const baseReport = {
            _id: 'report-1',
            title: 'Out of Scope Incident',
            status: 'verified',
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'municipal_admin')
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(adminAPI.getReportById).toHaveBeenCalledWith('report-1', expect.any(Object));
        expect(reportsAPI.getById).toHaveBeenCalledWith('report-1', expect.any(Object));
        expect(result.current.report?.detailAccess).toBe('public');
        expect(result.current.error).toBe('');
        expect(result.current.restricted).toBe(false);
    });

    test('5. Owner viewer loads report with owner detail access and preserved evidence ownership', async () => {
        reportsAPI.getById.mockResolvedValue({
            data: {
                data: {
                    _id: 'report-1',
                    title: 'My Report',
                    status: 'verified',
                    isOwnedByCurrentUser: true,
                    detailAccess: 'owner',
                    detailCompleteness: 'full',
                    images: ['/api/files/my-evidence.jpg'],
                },
            },
        });

        const baseReport = {
            _id: 'report-1',
            title: 'My Report',
            status: 'verified',
            isOwnedByCurrentUser: true,
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'reporter')
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.isOwnerViewer).toBe(true);
        expect(result.current.report?.detailAccess).toBe('owner');
    });

    test('6. Preserves existing base incident summary when network error occurs and provides functional retry', async () => {
        reportsAPI.getById.mockRejectedValueOnce(new Error('Network disconnected'));

        const baseReport = {
            _id: 'report-1',
            title: 'Base Highway Incident',
            status: 'verified',
            severity: 'severe',
            coordinates: { lat: 12.4, lng: 122.6 },
            casualties: { injured: 2, fatalities: 0, missing: 0 },
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'guest')
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        // Error is recorded
        expect(result.current.error).toMatch(/connection problem/i);
        expect(result.current.restricted).toBe(false);

        // Base incident summary is preserved, not blank/null
        expect(result.current.report?.title).toBe('Base Highway Incident');
        expect(result.current.report?.severity).toBe('severe');
        expect(result.current.report?.casualties?.injured).toBe(2);

        // Retry succeeds
        reportsAPI.getById.mockResolvedValueOnce({
            data: {
                data: {
                    _id: 'report-1',
                    title: 'Base Highway Incident (Full Details)',
                    status: 'verified',
                    severity: 'severe',
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        act(() => {
            result.current.retry();
        });

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('');
        expect(result.current.report?.title).toBe('Base Highway Incident (Full Details)');
    });

    test('7. Handles 403 privacy restriction properly with clear restricted status', async () => {
        const error403 = new Error('Forbidden');
        error403.response = { status: 403, data: { message: 'Not authorized to view this report' } };
        reportsAPI.getById.mockRejectedValue(error403);

        const baseReport = {
            _id: 'report-pending',
            title: 'Unverified Incident',
            status: 'pending',
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(baseReport, 'guest')
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.restricted).toBe(true);
        expect(result.current.error).toBe('You do not have permission to view this incident.');
        expect(result.current.report?.title).toBe('Unverified Incident');
    });

    test('8. Maps missing and server failures to distinct retry behavior', async () => {
        const notFound = new Error('Not found');
        notFound.response = { status: 404, data: { code: 'REPORT_NOT_FOUND' } };
        reportsAPI.getById.mockRejectedValueOnce(notFound);

        const { result, rerender } = renderHook(
            ({ report }) => useOperationalIncidentDetails(report, 'guest'),
            { initialProps: { report: { _id: 'report-missing', title: 'Missing incident' } } },
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('This incident is no longer available.');
        expect(result.current.retryable).toBe(false);

        const serverFailure = new Error('Server unavailable');
        serverFailure.response = { status: 500, data: { code: 'REPORT_DETAILS_UNAVAILABLE' } };
        reportsAPI.getById.mockRejectedValueOnce(serverFailure);
        rerender({ report: { _id: 'report-server', title: 'Server incident' } });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('Incident details are temporarily unavailable.');
        expect(result.current.retryable).toBe(true);
    });

    test('9. Prevents stale responses when switching rapidly between incident reports', async () => {
        let resolveFirst;
        reportsAPI.getById.mockImplementationOnce(
            () => new Promise((resolve) => { resolveFirst = resolve; })
        );
        reportsAPI.getById.mockResolvedValueOnce({
            data: {
                data: {
                    _id: 'report-2',
                    title: 'Second Incident (Fresh)',
                    status: 'verified',
                    detailAccess: 'public',
                    detailCompleteness: 'full',
                },
            },
        });

        const { result, rerender } = renderHook(
            ({ report }) => useOperationalIncidentDetails(report, 'guest'),
            { initialProps: { report: { _id: 'report-1', title: 'First' } } }
        );

        // Rapidly switch to report-2
        rerender({ report: { _id: 'report-2', title: 'Second' } });

        await waitFor(() => {
            expect(result.current.report?._id).toBe('report-2');
            expect(result.current.report?.title).toBe('Second Incident (Fresh)');
        });

        // Now late-resolve the first request
        act(() => {
            resolveFirst({
                data: {
                    data: {
                        _id: 'report-1',
                        title: 'First Incident (Stale)',
                        status: 'verified',
                        detailAccess: 'public',
                        detailCompleteness: 'full',
                    },
                },
            });
        });

        // Report 2 must NOT be overwritten by the stale Report 1 response
        expect(result.current.report?._id).toBe('report-2');
        expect(result.current.report?.title).toBe('Second Incident (Fresh)');
    });

    test('10. Does not trigger redundant fetch when report already has detailCompleteness: full', () => {
        const fullReport = {
            _id: 'report-full',
            title: 'Already Full Incident',
            status: 'verified',
            detailAccess: 'public',
            detailCompleteness: 'full',
            evidenceCount: 0,
        };

        const { result } = renderHook(() =>
            useOperationalIncidentDetails(fullReport, 'guest')
        );

        expect(result.current.loading).toBe(false);
        expect(reportsAPI.getById).not.toHaveBeenCalled();
        expect(adminAPI.getReportById).not.toHaveBeenCalled();
        expect(result.current.report?.title).toBe('Already Full Incident');
    });
});
