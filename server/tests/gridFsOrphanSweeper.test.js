import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    files: [],
    deleted: [],
    reportIds: [],
}));

vi.mock('../services/gridFsService.js', () => ({
    getGridFsBucket: () => ({
        find: (filter) => ({
            toArray: async () => mocks.files.filter((file) => {
                const cond = filter?.['metadata.resourceId'];
                if (cond && typeof cond === 'object' && '$ne' in cond) {
                    return cond.$ne === null
                        ? file.metadata?.resourceId != null
                        : String(file.metadata?.resourceId) !== String(cond.$ne);
                }
                if (cond !== undefined) {
                    return String(file.metadata?.resourceId) === String(cond);
                }
                return true;
            }),
        }),
        delete: async (id) => {
            mocks.deleted.push(String(id));
        },
    }),
}));

vi.mock('mongoose', async (importOriginal) => {
    const actual = await importOriginal();
    const fakeModel = vi.fn((name) => {
        if (name === 'Report') {
            return {
                find: (filter) => ({
                    select: () => ({
                        lean: async () => mocks.reportIds
                            .filter((id) => (filter?._id?.$in || [])
                                .some((want) => String(want) === String(id)))
                            .map((id) => ({ _id: id })),
                    }),
                }),
            };
        }
        return actual.model(name);
    });
    // `import mongoose from 'mongoose'` resolves through the default
    // interop, so the override must land on `default` as well.
    return { ...actual, default: { ...actual.default, model: fakeModel }, model: fakeModel };
});

const { sweepGridFsOrphans, startGridFsOrphanSweeper } = await import('../services/gridFsOrphanSweeper.js');

describe('P2-7 GridFS orphan sweeper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.files = [];
        mocks.deleted = [];
        mocks.reportIds = [];
    });

    test('deletes files whose resourceId matches no Report and keeps the rest', async () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        mocks.reportIds = ['64b100000000000000000001'];
        mocks.files = [
            { _id: 'file-keep', metadata: { resourceId: '64b100000000000000000001', uploadedAt: twoHoursAgo } },
            { _id: 'file-orphan', metadata: { resourceId: '64b100000000000000000002', uploadedAt: twoHoursAgo } },
            { _id: 'file-noresource', metadata: { resourceId: null, uploadedAt: twoHoursAgo } },
        ];

        const result = await sweepGridFsOrphans();

        expect(result).toEqual({ checked: 2, deleted: 1 });
        expect(mocks.deleted).toEqual(['file-orphan']);
    });

    test('never deletes a just-uploaded file inside the age grace window (F2)', async () => {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        mocks.reportIds = [];
        mocks.files = [
            // In-flight upload: resourceId has no Report YET — must survive.
            { _id: 'file-inflight', metadata: { resourceId: '64b100000000000000000003', uploadedAt: oneMinuteAgo } },
            // Genuinely orphaned and old — must be deleted.
            { _id: 'file-old-orphan', metadata: { resourceId: '64b100000000000000000004', uploadedAt: twoHoursAgo } },
            // No usable timestamp — fail safe, skip.
            { _id: 'file-no-timestamp', metadata: { resourceId: '64b100000000000000000005' } },
        ];

        const result = await sweepGridFsOrphans();

        expect(result).toEqual({ checked: 3, deleted: 1 });
        expect(mocks.deleted).toEqual(['file-old-orphan']);
    });

    test('returns zero counts when no files reference reports', async () => {
        mocks.files = [{ _id: 'file-x', metadata: { resourceId: null } }];

        const result = await sweepGridFsOrphans();

        expect(result).toEqual({ checked: 0, deleted: 0 });
        expect(mocks.deleted).toHaveLength(0);
    });

    test('startGridFsOrphanSweeper returns a stop function and does not hold the process open', async () => {
        const stop = startGridFsOrphanSweeper({ intervalMs: 50 });
        expect(typeof stop).toBe('function');
        // Let at least one interval sweep run, then stop cleanly.
        await new Promise((resolve) => setTimeout(resolve, 120));
        stop();
    });
});
