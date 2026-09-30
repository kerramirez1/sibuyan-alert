import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { adminAPI, filesAPI } from '../services/api';
import {
    dedupedFetch,
    getStaleData,
    isRecentlyRevalidated,
    setCachedData,
} from '../utils/queryCache';
import { isGridFsAsset, resolveAssetUrl } from '../utils/assets';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { Skeleton, SkeletonCircle, SkeletonButton, SkeletonRow } from '../components/ui/Skeleton';
import toast from '../utils/appToast';
import { formatIncidentRelativeTime } from '../utils/dateTimeUtils';
import { CREATABLE_RESPONDER_UNIT_TYPES, getResponderUnitLabel } from '../config/responderUnits';
import {
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineIdentification,
    HiOutlineTrash,
    HiOutlineLocationMarker,
    HiOutlineCamera,
    HiOutlinePhotograph,
    HiOutlineX,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
} from 'react-icons/hi';

const ROLE_BADGES = {
    municipal_admin: { label: 'Mun. Admin', dot: 'bg-indigo-500' },
    responder: { label: 'Responder', dot: 'bg-cyan-500' },
    reporter: { label: 'Reporter', dot: 'bg-emerald-500' },
    ordinary: { label: 'Ordinary', dot: 'bg-gray-400' },
};

const VERIFICATION_BADGES = {
    approved: { label: 'Verified', dot: 'bg-emerald-500' },
    rejected: { label: 'Rejected', dot: 'bg-red-500' },
    pending: { label: 'Pending', dot: 'bg-amber-500' },
};

const AdminUsersPage = () => {
    // Session-scoped key (municipality cannot change mid-session; the whole
    // cache is wiped on logout/session-expiry, so no cross-account leakage).
    const usersCacheKey = (nextFilter, nextSearch) => [
        'admin-users',
        nextFilter.role || '',
        nextFilter.verificationStatus || '',
        nextSearch || '',
    ].join(':');
    const defaultUsersCacheKey = usersCacheKey({ role: '', verificationStatus: '' }, '');
    const [users, setUsers] = useState(() => {
        const cached = getStaleData(defaultUsersCacheKey)?.users;
        return Array.isArray(cached) ? cached.filter(Boolean) : [];
    });
    const [stats, setStats] = useState(() => getStaleData(defaultUsersCacheKey)?.stats || null);
    const [loading, setLoading] = useState(() => getStaleData(defaultUsersCacheKey) === null);
    const [filter, setFilter] = useState({ role: '', verificationStatus: '' });
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifyData, setVerifyData] = useState({ status: '', feedback: '' });
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    // Provisioning a responder. `fieldErrors` mirrors the server's per-field
    // validation shape so a 400 can mark the inputs instead of only flashing a
    // banner; `created` holds the account when the email failed, which is what
    // turns the modal into a retry rather than a dead end.
    const [addResponderOpen, setAddResponderOpen] = useState(false);
    const [responderForm, setResponderForm] = useState({ name: '', email: '', agency: '' });
    const [responderFieldErrors, setResponderFieldErrors] = useState({});
    const [responderError, setResponderError] = useState('');
    const [responderNotice, setResponderNotice] = useState('');
    const [responderLoading, setResponderLoading] = useState(false);
    const [responderCreated, setResponderCreated] = useState(null);
    // Which row is mid-resend, so only that row's button spins.
    const [resendingForId, setResendingForId] = useState(null);
    const [verificationAssets, setVerificationAssets] = useState({
        idDocument: null,
        selfiePhoto: null,
        loading: false,
        error: null,
    });

    // In-App Document Preview Lightbox State
    const [documentViewer, setDocumentViewer] = useState({
        isOpen: false,
        user: null,
        docType: 'idDocument',
        src: null,
        loading: false,
        error: '',
    });
    const [zoomLevel, setZoomLevel] = useState(1);
    const [rotationDegree, setRotationDegree] = useState(0);
    const activeDocBlobRef = useRef(null);
    const lastFocusedTriggerRef = useRef(null);

    useEffect(() => {
        fetchUsers();
    }, [filter]);

    useEffect(() => {
        if (!verifyModalOpen || !selectedUser) return undefined;

        let cancelled = false;
        const blobUrls = [];
        const loadAsset = async (url) => {
            if (!url) return null;
            if (!isGridFsAsset(url)) return resolveAssetUrl(url);
            try {
                const response = await filesAPI.getProtected(url);
                if (response?.data) {
                    const blobUrl = URL.createObjectURL(response.data);
                    blobUrls.push(blobUrl);
                    return blobUrl;
                }
                return null;
            } catch (err) {
                console.error('Failed to load asset:', err);
                return null;
            }
        };

        setVerificationAssets({ idDocument: null, selfiePhoto: null, loading: true, error: null });
        Promise.all([
            loadAsset(selectedUser?.idDocument),
            loadAsset(selectedUser?.selfiePhoto),
        ])
            .then(([idDocument, selfiePhoto]) => {
                if (!cancelled) {
                    setVerificationAssets({ idDocument, selfiePhoto, loading: false, error: null });
                }
            })
            .catch((error) => {
                console.error('Failed to load verification files:', error);
                if (!cancelled) {
                    setVerificationAssets({
                        idDocument: null,
                        selfiePhoto: null,
                        loading: false,
                        error: 'Verification files could not be loaded.',
                    });
                }
            });

        return () => {
            cancelled = true;
            blobUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [verifyModalOpen, selectedUser]);

    // Cleanup active document blob URL on unmount
    useEffect(() => {
        return () => {
            if (activeDocBlobRef.current) {
                URL.revokeObjectURL(activeDocBlobRef.current);
            }
        };
    }, []);

    const fetchUsers = async (overrides = {}) => {
        const nextFilter = overrides.filter ?? filter;
        const nextSearch = overrides.search ?? search;
        const key = usersCacheKey(nextFilter, nextSearch);
        const stale = getStaleData(key);
        if (stale) {
            setUsers(Array.isArray(stale?.users) ? stale.users.filter(Boolean) : []);
            setStats(stale?.stats || null);
            setLoading(false);
        } else {
            setLoading(true);
        }

        // Avoid micro-burst revalidation within 4 seconds unless forced or cold
        if (!overrides.force && stale && isRecentlyRevalidated(key, 4000)) {
            return;
        }

        try {
            const params = {
                ...nextFilter,
                search: nextSearch || undefined,
            };
            const response = await dedupedFetch(`fetch:${key}`, () => adminAPI.getUsers(params));
            const rawUsers = response?.data?.data?.users;
            const nextUsers = Array.isArray(rawUsers) ? rawUsers.filter(Boolean) : [];
            const nextStats = response?.data?.data?.stats || null;
            setUsers(nextUsers);
            setStats(nextStats);
            setCachedData(key, { users: nextUsers, stats: nextStats });
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const hasActiveFilters = Boolean(search.trim() || filter.role || filter.verificationStatus);

    const clearFilters = () => {
        const alreadyDefault = !filter.role && !filter.verificationStatus;
        setSearch('');
        setFilter({ role: '', verificationStatus: '' });
        if (alreadyDefault) {
            fetchUsers({ search: '' });
        }
    };

    const openVerifyModal = (user, status) => {
        setSelectedUser(user);
        setVerifyData({ status, feedback: '' });
        setVerifyModalOpen(true);
    };

    const handleVerify = async () => {
        if (!selectedUser?._id || !verifyData.status) return;

        setVerifyLoading(true);
        try {
            await adminAPI.verifyReporter(selectedUser?._id, {
                status: verifyData.status,
                feedback: verifyData.feedback,
            });

            toast.success(`Reporter ${verifyData.status === 'approved' ? 'approved' : 'rejected'} successfully`);
            setVerifyModalOpen(false);
            fetchUsers({ force: true });
        } catch {
            toast.error('Failed to update verification status');
        } finally {
            setVerifyLoading(false);
        }
    };

    const openDeleteModal = (user) => {
        setUserToDelete(user);
        setDeleteModalOpen(true);
    };

    const openDocumentPreview = useCallback((targetUser, docType = 'idDocument', event = null) => {
        if (event?.currentTarget) {
            lastFocusedTriggerRef.current = event.currentTarget;
        }
        const assetUrl = targetUser?.[docType];
        if (!assetUrl) return;

        if (activeDocBlobRef.current) {
            URL.revokeObjectURL(activeDocBlobRef.current);
            activeDocBlobRef.current = null;
        }

        setZoomLevel(1);
        setRotationDegree(0);
        setDocumentViewer({
            isOpen: true,
            user: targetUser,
            docType,
            src: null,
            loading: true,
            error: '',
        });

        if (!isGridFsAsset(assetUrl)) {
            setDocumentViewer((prev) => ({
                ...prev,
                src: resolveAssetUrl(assetUrl),
                loading: false,
            }));
            return;
        }

        filesAPI.getProtected(assetUrl)
            .then((response) => {
                const blobUrl = URL.createObjectURL(response.data);
                activeDocBlobRef.current = blobUrl;
                setDocumentViewer((prev) => ({
                    ...prev,
                    src: blobUrl,
                    loading: false,
                }));
            })
            .catch((err) => {
                console.error('Failed to load protected document:', err);
                setDocumentViewer((prev) => ({
                    ...prev,
                    loading: false,
                    error: err.response?.data?.message || 'Failed to load protected document.',
                }));
            });
    }, []);

    const closeDocumentPreview = useCallback(() => {
        if (activeDocBlobRef.current) {
            URL.revokeObjectURL(activeDocBlobRef.current);
            activeDocBlobRef.current = null;
        }
        setZoomLevel(1);
        setRotationDegree(0);
        setDocumentViewer((prev) => ({
            ...prev,
            isOpen: false,
            src: null,
            loading: false,
            error: '',
        }));
        if (lastFocusedTriggerRef.current?.isConnected) {
            lastFocusedTriggerRef.current.focus();
        }
    }, []);

    const switchDocumentType = useCallback((newType) => {
        if (!documentViewer.user || documentViewer.docType === newType) return;
        setZoomLevel(1);
        setRotationDegree(0);
        openDocumentPreview(documentViewer.user, newType);
    }, [documentViewer.user, documentViewer.docType, openDocumentPreview]);

    const handleActionFromViewer = useCallback((status) => {
        const targetUser = documentViewer.user;
        closeDocumentPreview();
        openVerifyModal(targetUser, status);
    }, [closeDocumentPreview, openVerifyModal]);

    // Keyboard navigation & tools for document viewer
    useEffect(() => {
        if (!documentViewer.isOpen) return undefined;

        const handleKeyDown = (event) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;

            if (event.key === 'Escape') {
                closeDocumentPreview();
            } else if (event.key === 'r' || event.key === 'R') {
                setRotationDegree((deg) => (deg + 90) % 360);
            } else if (event.key === '+' || event.key === '=') {
                setZoomLevel((z) => Math.min(z + 0.25, 2.5));
            } else if (event.key === '-' || event.key === '_') {
                setZoomLevel((z) => Math.max(z - 0.25, 0.75));
            } else if (event.key === '0') {
                setZoomLevel(1);
                setRotationDegree(0);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                if (documentViewer.user?.idDocument && documentViewer.user?.selfiePhoto) {
                    const nextType = documentViewer.docType === 'idDocument' ? 'selfiePhoto' : 'idDocument';
                    switchDocumentType(nextType);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [documentViewer.isOpen, documentViewer.docType, documentViewer.user, closeDocumentPreview, switchDocumentType]);

    const openAddResponder = () => {
        setResponderForm({ name: '', email: '', agency: '' });
        setResponderFieldErrors({});
        setResponderError('');
        setResponderNotice('');
        setResponderCreated(null);
        setAddResponderOpen(true);
    };

    const closeAddResponder = () => {
        setAddResponderOpen(false);
        setResponderFieldErrors({});
        setResponderError('');
        setResponderNotice('');
        setResponderCreated(null);
    };

    /**
     * Creates the responder, then either closes on success or — when the account
     * was created but the invitation email was not delivered — keeps the modal
     * open holding that account, so the only thing left to do is retry the mail.
     * The account is deliberately not deleted on a mail failure: it is inert
     * (no password means sign-in is refused), and deleting it would make the
     * administrator start over for a transient SMTP error.
     */
    const handleAddResponder = async (event) => {
        event.preventDefault();
        setResponderLoading(true);
        setResponderError('');
        setResponderNotice('');
        setResponderFieldErrors({});

        try {
            const response = await adminAPI.createResponder({
                name: responderForm.name.trim(),
                email: responderForm.email.trim(),
                agency: responderForm.agency,
            });
            const data = response.data?.data || {};

            // Re-read the scoped list rather than inserting locally: the server
            // owns the account's shape, and a local insert could disagree with it.
            fetchUsers({ force: true });

            if (data.invitationSent) {
                toast.success(data.message || 'Invitation sent');
                closeAddResponder();
            } else {
                setResponderCreated(data.user || null);
                setResponderNotice(data.message || 'Account created, but the invitation email could not be sent.');
            }
        } catch (error) {
            const payload = error.response?.data;
            const fieldErrors = {};
            (Array.isArray(payload?.errors) ? payload.errors : []).forEach((entry) => {
                if (entry?.field) fieldErrors[entry.field] = entry.message;
            });

            setResponderFieldErrors(fieldErrors);
            setResponderError(
                Object.keys(fieldErrors).length
                    ? 'Please correct the highlighted fields.'
                    : payload?.message || 'Could not create the responder account.',
            );
        } finally {
            setResponderLoading(false);
        }
    };

    const handleResendInvitation = async () => {
        const id = responderCreated?.id;
        if (!id) return;

        setResponderLoading(true);
        setResponderError('');
        try {
            const response = await adminAPI.resendResponderInvitation(id);
            toast.success(response.data?.data?.message || 'Invitation sent');
            closeAddResponder();
        } catch (error) {
            setResponderError(error.response?.data?.message || 'Could not send the invitation.');
        } finally {
            setResponderLoading(false);
        }
    };

    /**
     * Re-issue an invitation for an EXISTING responder.
     *
     * This is the action the list was missing, and its absence was a dead end:
     * once an account exists, adding the same address again is refused as a
     * duplicate (`EMAIL_IN_USE`) and never reaches the sender. An administrator
     * whose first invitation did not arrive had no way to send another, so the
     * only visible symptom was "it stopped sending to that account".
     *
     * A responder who has already set a password gets a clear 409 from the
     * endpoint, surfaced as a toast.
     */
    const handleResendInvitationFor = async (user) => {
        if (!user?._id) return;

        setResendingForId(user._id);
        try {
            const response = await adminAPI.resendResponderInvitation(user._id);
            toast.success(response.data?.data?.message || 'Invitation sent');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not send the invitation.');
        } finally {
            setResendingForId(null);
        }
    };

    const handleDelete = async () => {
        if (!userToDelete?._id) return;

        setDeleteLoading(true);
        try {
            await adminAPI.deleteUser(userToDelete?._id);
            toast.success('User deleted successfully');
            setDeleteModalOpen(false);
            setUserToDelete(null);
            fetchUsers({ force: true });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete user');
        } finally {
            setDeleteLoading(false);
        }
    };

    const renderRoleBadge = (role) => {
        const safeRole = typeof role === 'string' ? role : '';
        const config = ROLE_BADGES[safeRole] || { label: safeRole || 'Unknown', dot: 'bg-gray-400' };
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
                <span>{config.label}</span>
            </span>
        );
    };

    const renderVerificationBadge = (status) => {
        const safeStatus = typeof status === 'string' ? status : '';
        const config = VERIFICATION_BADGES[safeStatus] || { label: 'N/A', dot: 'bg-gray-400' };
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
                <span>{config.label}</span>
            </span>
        );
    };

    return (
        <div className="page-shell max-w-[1120px] space-y-4">
            <PageHeader
                eyebrow="Municipal administration"
                title="Manage users"
                description="View and verify reporter accounts, and manage emergency responders."
                actions={<p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" /><span>Sibuyan Island · Alert System Active</span></p>}
            />

            {/* Summary Metrics Strip */}
            {stats && (
                <section
                    className="metric-strip grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 md:[&>*:nth-child(3)]:border-l-0 md:[&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(3)]:border-l lg:[&>*:nth-child(n+3)]:border-t-0"
                    aria-label="User directory summary"
                >
                    <div className="metric-tile p-3 sm:p-3.5">
                        <p className="metric-value font-display text-[26px] sm:text-[28px] font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)]">{stats.totalUsers}</p>
                        <span className="metric-label flex items-center gap-1.5 mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" aria-hidden="true" />
                            <span>Total users</span>
                        </span>
                        <p className="metric-helper mt-1 text-[11px] text-[var(--text-muted)]">Registered accounts</p>
                    </div>

                    <div className="metric-tile p-3 sm:p-3.5">
                        <p className="metric-value font-display text-[26px] sm:text-[28px] font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)]">{stats.reporters}</p>
                        <span className="metric-label flex items-center gap-1.5 mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                            <span>Reporters</span>
                        </span>
                        <p className="metric-helper mt-1 text-[11px] text-[var(--text-muted)]">Field reporters</p>
                    </div>

                    <div className={`metric-tile p-3 sm:p-3.5 transition-colors ${stats.pendingVerification > 0 ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                        <p className="metric-value font-display text-[26px] sm:text-[28px] font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)]">{stats.pendingVerification}</p>
                        <span className="metric-label flex items-center gap-1.5 mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stats.pendingVerification > 0 ? 'bg-amber-500' : 'bg-gray-400 dark:bg-gray-500'}`} aria-hidden="true" />
                            <span>Pending</span>
                        </span>
                        <p className="metric-helper mt-1 text-[11px] text-[var(--text-muted)]">{stats.pendingVerification === 0 ? 'All clear' : 'Awaiting verification'}</p>
                    </div>

                    <div className="metric-tile p-3 sm:p-3.5">
                        <p className="metric-value font-display text-[26px] sm:text-[28px] font-semibold tabular-nums leading-none tracking-tight text-[var(--text-primary)]">{stats.responders}</p>
                        <span className="metric-label flex items-center gap-1.5 mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" aria-hidden="true" />
                            <span>Responders</span>
                        </span>
                        <p className="metric-helper mt-1 text-[11px] text-[var(--text-muted)]">Emergency units</p>
                    </div>
                </section>
            )}

            {/* Users Data Section */}
            <section className="surface-panel overflow-hidden" aria-label="Users directory">
                {/* Search & Filters Toolbar */}
                <div className="border-b border-gray-200 bg-gray-50/60 p-2.5 sm:p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        {/* Search + Filter Controls Group */}
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                            {/* Search Bar with attached Search Button */}
                            <div className="flex min-w-0 flex-1 sm:max-w-xs items-center">
                                <div className="relative flex-1 min-w-0">
                                    <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" aria-hidden="true" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or email..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchUsers({ force: true })}
                                        className="field-control h-10 min-h-10 pl-9 pr-2 text-xs rounded-r-none border-r-0 focus:z-10"
                                        aria-label="Search users by name or email"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fetchUsers({ force: true })}
                                    className="inline-flex h-10 min-h-10 items-center justify-center rounded-r-lg border border-border-strong bg-surface px-3 text-xs font-semibold text-[var(--text-primary)] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 z-0 shrink-0 cursor-pointer transition-colors"
                                >
                                    Search
                                </button>
                            </div>

                            {/* Role Filter */}
                            <select
                                value={filter.role}
                                onChange={(e) => setFilter({ ...filter, role: e.target.value })}
                                className="field-control h-10 min-h-10 text-xs w-auto sm:w-32 cursor-pointer"
                                aria-label="Filter by role"
                            >
                                <option value="">All roles</option>
                                <option value="ordinary">Ordinary</option>
                                <option value="reporter">Reporter</option>
                            </select>

                            {/* Verification Status Filter */}
                            <select
                                value={filter.verificationStatus}
                                onChange={(e) => setFilter({ ...filter, verificationStatus: e.target.value })}
                                className="field-control h-10 min-h-10 text-xs w-auto sm:w-36 cursor-pointer"
                                aria-label="Filter by verification status"
                            >
                                <option value="">All statuses</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>

                            {/* Clear Action */}
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="inline-flex h-10 min-h-10 items-center justify-center rounded-lg border border-border-strong bg-surface px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-surface-hover hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Primary Action Button */}
                        <div className="shrink-0">
                            <Button
                                type="button"
                                variant="primary"
                                onClick={openAddResponder}
                                className="w-full sm:w-auto h-10 min-h-10 px-3.5 text-xs font-semibold"
                                aria-label="Add a responder account"
                            >
                                <span className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold leading-none" aria-hidden="true">+</span>
                                    <span>Add responder</span>
                                </span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Result Summary Bar */}
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/40 px-4 py-2 text-[11px] font-medium text-gray-500 dark:border-white/5 dark:bg-white/[0.01] dark:text-gray-400">
                    <span>
                        Showing {users.filter(Boolean).length} {users.filter(Boolean).length === 1 ? 'user' : 'users'}
                        {hasActiveFilters ? ' matching current filters' : ''}
                    </span>
                </div>

                {/* Desktop & Tablet Table */}
                <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-[820px] text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50/70 text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-400">
                                <th scope="col" className="w-[34%] py-2.5 pl-4 pr-3 sm:pl-5">User</th>
                                <th scope="col" className="w-[12%] px-3 py-2.5">Role</th>
                                <th scope="col" className="w-[14%] px-3 py-2.5">Verification</th>
                                <th scope="col" className="w-[14%] px-3 py-2.5">Documents</th>
                                <th scope="col" className="w-[12%] px-3 py-2.5">Joined</th>
                                <th scope="col" className="w-[10%] px-3 py-2.5">Last Login</th>
                                <th scope="col" className="w-[8%] py-2.5 pl-3 pr-4 sm:pr-5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                            {loading && users.length === 0 ? (
                                [0, 1, 2, 3, 4].map((item) => (
                                    <tr key={item}>
                                        <td className="py-3.5 pl-4 pr-3 sm:pl-5">
                                            <div className="flex items-center gap-3">
                                                <SkeletonCircle size="h-9 w-9" />
                                                <div className="space-y-1.5 flex-1">
                                                    <Skeleton variant="text" className="h-3.5 w-28" />
                                                    <Skeleton variant="text" className="h-2.5 w-36 opacity-80" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3.5"><SkeletonButton size="h-5 w-20" className="rounded-full" /></td>
                                        <td className="px-3 py-3.5"><SkeletonButton size="h-5 w-20" className="rounded-full" /></td>
                                        <td className="px-3 py-3.5"><SkeletonButton size="h-5 w-16" className="rounded-full" /></td>
                                        <td className="px-3 py-3.5"><Skeleton variant="text" className="h-3.5 w-16" /></td>
                                        <td className="px-3 py-3.5"><Skeleton variant="text" className="h-3.5 w-16" /></td>
                                        <td className="py-3.5 pl-3 pr-4 sm:pr-5 text-right"><SkeletonButton size="h-7 w-14" className="ml-auto" /></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">No users found</p>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try adjusting the search or filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                users.filter(Boolean).map((user, index) => (
                                    <tr
                                        key={user?._id ?? index}
                                        className="hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                                    >
                                        <td className="py-3 pl-4 pr-3 sm:pl-5">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                                                    user?.role === 'municipal_admin' ? 'bg-indigo-600' :
                                                    user?.role === 'responder' ? 'bg-cyan-600' :
                                                    user?.role === 'reporter' ? 'bg-emerald-600' : 'bg-gray-600'
                                                }`}>
                                                    {user?.avatar ? (
                                                        <img src={resolveAssetUrl(user.avatar)} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                                                    ) : (
                                                        user?.name?.charAt(0).toUpperCase() || 'U'
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{user?.name}</p>
                                                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user?.email}</p>
                                                    {user?.address && (
                                                        <p className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                                            <HiOutlineLocationMarker className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">{user.address}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">{renderRoleBadge(user?.role)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">{renderVerificationBadge(user?.verificationStatus)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                {user?.idDocument ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openDocumentPreview(user, 'idDocument', e)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                                        title="View ID document"
                                                        aria-label={`View ID document for ${user?.name}`}
                                                    >
                                                        <HiOutlineIdentification className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        ID
                                                    </button>
                                                ) : null}
                                                {user?.selfiePhoto ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openDocumentPreview(user, 'selfiePhoto', e)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                                        title="View selfie photo"
                                                        aria-label={`View selfie photo for ${user?.name}`}
                                                    >
                                                        <HiOutlineCamera className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        Selfie
                                                    </button>
                                                ) : null}
                                                {!user?.idDocument && !user?.selfiePhoto && (
                                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            {formatIncidentRelativeTime(user?.createdAt, 'Unknown date')}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            {user?.lastLogin ? formatIncidentRelativeTime(user.lastLogin, 'Never') : 'Never'}
                                        </td>
                                        <td className="py-3 pl-3 pr-4 sm:pr-5 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {user?.role === 'reporter' && user?.verificationStatus === 'pending' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openVerifyModal(user, 'approved')}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                            title="Approve reporter"
                                                            aria-label={`Approve reporter ${user?.name}`}
                                                        >
                                                            <HiOutlineCheckCircle className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openVerifyModal(user, 'rejected')}
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                                                            title="Reject reporter"
                                                            aria-label={`Reject reporter ${user?.name}`}
                                                        >
                                                            <HiOutlineXCircle className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {user?.role === 'responder' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResendInvitationFor(user)}
                                                        disabled={resendingForId === user?._id}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                                                        title="Resend invitation"
                                                        aria-label={`Resend invitation to ${user?.name}`}
                                                    >
                                                        <HiOutlineRefresh className={`h-4 w-4 ${resendingForId === user?._id ? 'animate-spin' : ''}`} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => openDeleteModal(user)}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                                    title="Delete user"
                                                    aria-label={`Delete user ${user?.name}`}
                                                >
                                                    <HiOutlineTrash className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View: Compact Records List */}
                    <div className="sm:hidden divide-y divide-gray-100 dark:divide-white/5">
                        {loading && users.length === 0 ? (
                        [0, 1, 2, 3].map((item) => (
                            <SkeletonRow key={item} hasAvatar lines={2} trailingAction />
                        ))
                    ) : users.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">No users found</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try adjusting the search or filters.</p>
                        </div>
                    ) : (
                        users.filter(Boolean).map((user, index) => (
                            <article key={user?._id ?? index} className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                                            user?.role === 'municipal_admin' ? 'bg-indigo-600' :
                                            user?.role === 'responder' ? 'bg-cyan-600' :
                                            user?.role === 'reporter' ? 'bg-emerald-600' : 'bg-gray-600'
                                        }`}>
                                            {user?.avatar ? (
                                                <img src={resolveAssetUrl(user.avatar)} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                                            ) : (
                                                user?.name?.charAt(0).toUpperCase() || 'U'
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{user?.name}</p>
                                            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user?.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap justify-end gap-x-2 gap-y-1">
                                        {renderRoleBadge(user?.role)}
                                        {renderVerificationBadge(user?.verificationStatus)}
                                    </div>
                                </div>

                                {user?.address && (
                                    <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                        <HiOutlineLocationMarker className="h-3 w-3 shrink-0 text-gray-400" />
                                        <span className="truncate">{user.address}</span>
                                    </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-white/5 text-[11px] text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1.5">
                                        {user?.idDocument ? (
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(user, 'idDocument', e)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                                                aria-label={`View ID document for ${user?.name}`}
                                            >
                                                <HiOutlineIdentification className="h-3 w-3 text-emerald-600" />
                                                ID
                                            </button>
                                        ) : null}
                                        {user?.selfiePhoto ? (
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(user, 'selfiePhoto', e)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                                                aria-label={`View selfie photo for ${user?.name}`}
                                            >
                                                <HiOutlineCamera className="h-3 w-3 text-emerald-600" />
                                                Selfie
                                            </button>
                                        ) : null}
                                        {!user?.idDocument && !user?.selfiePhoto && (
                                            <span>Joined {formatIncidentRelativeTime(user?.createdAt, 'recently')}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {user?.role === 'reporter' && user?.verificationStatus === 'pending' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => openVerifyModal(user, 'approved')}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                    title="Approve reporter"
                                                    aria-label={`Approve reporter ${user?.name}`}
                                                >
                                                    <HiOutlineCheckCircle className="h-4 w-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openVerifyModal(user, 'rejected')}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                                                    title="Reject reporter"
                                                    aria-label={`Reject reporter ${user?.name}`}
                                                >
                                                    <HiOutlineXCircle className="h-4 w-4" />
                                                </button>
                                            </>
                                        )}
                                        {user?.role === 'responder' && (
                                            <button
                                                type="button"
                                                onClick={() => handleResendInvitationFor(user)}
                                                disabled={resendingForId === user?._id}
                                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                                                title="Resend invitation"
                                                aria-label={`Resend invitation to ${user?.name}`}
                                            >
                                                <HiOutlineRefresh className={`h-4 w-4 ${resendingForId === user?._id ? 'animate-spin' : ''}`} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => openDeleteModal(user)}
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                            title="Delete user"
                                            aria-label={`Delete user ${user?.name}`}
                                        >
                                            <HiOutlineTrash className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))
                    )}
                </div>
            </section>

            {/* Verify Modal */}
            <Modal
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                title={`${verifyData.status === 'approved' ? 'Approve' : 'Reject'} Reporter`}
                size="md"
            >
                {selectedUser && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 rounded-lg border border-gray-200/90 bg-gray-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <HiOutlineIdentification className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white truncate">{selectedUser.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedUser.email}</p>
                                {selectedUser.address && (
                                    <p className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                                        <HiOutlineLocationMarker className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{selectedUser.address}</span>
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Verification Documents — Side-by-Side */}
                        {(selectedUser.idDocument || selectedUser.selfiePhoto) && (
                            <div className="space-y-2.5">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Verification Documents</p>
                                {verificationAssets.loading && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Loading protected verification files...</p>
                                )}
                                {verificationAssets.error && (
                                    <p className="text-xs text-red-600 dark:text-red-400" role="alert">{verificationAssets.error}</p>
                                )}
                                <div className={`grid gap-3 ${selectedUser.idDocument && selectedUser.selfiePhoto ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                                    {/* ID Document */}
                                    {selectedUser.idDocument && (
                                        <div className="space-y-1.5">
                                            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                <HiOutlineIdentification className="h-3.5 w-3.5" /> ID Document
                                            </p>
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(selectedUser, 'idDocument', e)}
                                                className="block w-full text-left group"
                                                aria-label={`View full ID document for ${selectedUser.name}`}
                                            >
                                                {verificationAssets.idDocument ? (
                                                    <img
                                                        src={verificationAssets.idDocument}
                                                        alt="ID Document"
                                                        className="w-full max-h-48 rounded-lg border border-gray-200/90 object-contain bg-gray-50/50 group-hover:border-emerald-500 transition-colors cursor-pointer dark:border-white/10 dark:bg-black/20"
                                                    />
                                                ) : (
                                                    <span className="flex min-h-28 items-center justify-center rounded-lg border border-gray-200/90 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
                                                        Preview unavailable
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Selfie Photo */}
                                    {selectedUser.selfiePhoto && (
                                        <div className="space-y-1.5">
                                            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                <HiOutlineCamera className="h-3.5 w-3.5" /> Face Verification
                                            </p>
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(selectedUser, 'selfiePhoto', e)}
                                                className="block w-full text-left group"
                                                aria-label={`View full selfie verification for ${selectedUser.name}`}
                                            >
                                                {verificationAssets.selfiePhoto ? (
                                                    <img
                                                        src={verificationAssets.selfiePhoto}
                                                        alt="Selfie Verification"
                                                        className="w-full max-h-48 rounded-lg border border-gray-200/90 object-contain bg-gray-50/50 group-hover:border-emerald-500 transition-colors cursor-pointer dark:border-white/10 dark:bg-black/20"
                                                    />
                                                ) : (
                                                    <span className="flex min-h-28 items-center justify-center rounded-lg border border-gray-200/90 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
                                                        Preview unavailable
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {selectedUser.idDocument && selectedUser.selfiePhoto && (
                                    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-2.5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
                                        <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                                            Compare the ID document with the selfie to confirm identity
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                                Feedback {verifyData.status === 'rejected' ? '(Required)' : '(Optional)'}
                            </label>
                            <textarea
                                value={verifyData.feedback}
                                onChange={(e) => setVerifyData({ ...verifyData, feedback: e.target.value })}
                                placeholder={
                                    verifyData.status === 'rejected'
                                        ? 'Please provide a reason for rejection...'
                                        : 'Any additional notes...'
                                }
                                rows={3}
                                className="w-full rounded-lg border border-gray-200/90 bg-white p-2.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white resize-none"
                            />
                        </div>

                        <div className="flex gap-2.5 pt-2">
                            <Button
                                variant="secondary"
                                onClick={() => setVerifyModalOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant={verifyData.status === 'approved' ? 'primary' : 'danger'}
                                onClick={handleVerify}
                                loading={verifyLoading}
                                disabled={verifyData.status === 'rejected' && !verifyData.feedback.trim()}
                                className="flex-1"
                            >
                                {verifyData.status === 'approved' ? (
                                    <>
                                        <HiOutlineCheckCircle className="h-4 w-4" />
                                        Approve
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineXCircle className="h-4 w-4" />
                                        Reject
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            {/* Provision a responder. There is no password field on purpose: the
                administrator never sets or sees a credential — the responder
                chooses their own from the emailed invitation, and the account
                cannot be signed into until they do. The municipality is not a
                field either; the server reads it from the session. */}
            <Modal
                isOpen={addResponderOpen}
                onClose={closeAddResponder}
                title="Add responder"
                size="md"
            >
                {responderCreated ? (
                    <div className="space-y-3.5">
                        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                            <p>{responderNotice}</p>
                            <p className="mt-1 font-semibold">{responderCreated.name} · {responderCreated.email}</p>
                            <p className="mt-1">
                                The account exists but cannot be signed into until the invitation is followed.
                            </p>
                        </div>

                        {responderError ? (
                            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                {responderError}
                            </p>
                        ) : null}

                        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                            <Button type="button" variant="secondary" onClick={closeAddResponder} className="sm:flex-1" disabled={responderLoading}>
                                Close
                            </Button>
                            <Button type="button" onClick={handleResendInvitation} loading={responderLoading} className="sm:flex-1">
                                Resend invitation
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleAddResponder} className="space-y-3.5">
                        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                            The account is created for your municipality and the responder sets their own
                            password from a single-use invitation link.
                        </p>

                        {responderError ? (
                            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                {responderError}
                            </p>
                        ) : null}

                        <div>
                            <label htmlFor="responder-name" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Full name</label>
                            <input
                                id="responder-name"
                                type="text"
                                value={responderForm.name}
                                onChange={(e) => setResponderForm({ ...responderForm, name: e.target.value })}
                                className="field-control"
                                autoComplete="name"
                                maxLength={100}
                                required
                                aria-invalid={Boolean(responderFieldErrors.name)}
                            />
                            {responderFieldErrors.name && (
                                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{responderFieldErrors.name}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="responder-email" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Email</label>
                            <input
                                id="responder-email"
                                type="email"
                                value={responderForm.email}
                                onChange={(e) => setResponderForm({ ...responderForm, email: e.target.value })}
                                className="field-control"
                                autoComplete="email"
                                required
                                aria-invalid={Boolean(responderFieldErrors.email)}
                            />
                            {responderFieldErrors.email && (
                                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{responderFieldErrors.email}</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="responder-agency" className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Agency</label>
                            <select
                                id="responder-agency"
                                value={responderForm.agency}
                                onChange={(e) => setResponderForm({ ...responderForm, agency: e.target.value })}
                                className="field-control"
                                required
                                aria-invalid={Boolean(responderFieldErrors.agency)}
                            >
                                <option value="">Select an agency</option>
                                {CREATABLE_RESPONDER_UNIT_TYPES.map((unitType) => (
                                    <option key={unitType} value={unitType}>{getResponderUnitLabel(unitType)}</option>
                                ))}
                            </select>
                            {responderFieldErrors.agency && (
                                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{responderFieldErrors.agency}</p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                            <Button type="button" variant="secondary" onClick={closeAddResponder} className="sm:flex-1" disabled={responderLoading}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={responderLoading} className="sm:flex-1">
                                Create and send invitation
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete User"
                size="sm"
            >
                <div className="text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        <HiOutlineTrash className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-gray-950 dark:text-white">Are you sure?</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        This action cannot be undone. This will permanently delete
                        <span className="font-semibold text-gray-900 dark:text-gray-100"> {userToDelete?.name}</span>'s account and all associated data.
                    </p>
                    <div className="flex gap-2.5 pt-2">
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteModalOpen(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            loading={deleteLoading}
                            className="flex-1"
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* In-App Document Preview Lightbox (Portaled to document.body to escape MainLayout stacking context) */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {documentViewer.isOpen && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="document-viewer-title"
                        >
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={closeDocumentPreview}
                                className="fixed inset-0 bg-gray-950/80 backdrop-blur-xs transition-opacity"
                            />

                            {/* Bounded Responsive Modal Card: perfectly centered with safe vertical boundaries */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: 6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 6 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="relative z-10 flex h-[min(620px,84vh)] max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0c1813]"
                                onClick={(e) => e.stopPropagation()}
                            >
                            {/* Structured Header */}
                            <div className="flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-gray-50/90 px-3.5 py-2.5 sm:px-5 sm:py-3 dark:border-white/10 dark:bg-white/[0.02]">
                                <div className="min-w-0 flex items-center gap-2.5 pr-2">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-emerald-400">
                                        {documentViewer.docType === 'idDocument' ? (
                                            <HiOutlineIdentification className="h-4 w-4" />
                                        ) : (
                                            <HiOutlineCamera className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 id="document-viewer-title" className="text-xs sm:text-sm font-bold text-gray-950 dark:text-white truncate">
                                                {documentViewer.docType === 'idDocument' ? 'Government ID' : 'Verification Selfie'}
                                            </h3>
                                            {documentViewer.user?.verificationStatus && (
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                    documentViewer.user.verificationStatus === 'approved'
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                        : documentViewer.user.verificationStatus === 'rejected'
                                                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                                }`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                                        documentViewer.user.verificationStatus === 'approved' ? 'bg-emerald-500' :
                                                        documentViewer.user.verificationStatus === 'rejected' ? 'bg-red-500' : 'bg-amber-500'
                                                    }`} />
                                                    {documentViewer.user.verificationStatus}
                                                </span>
                                            )}
                                        </div>
                                        {documentViewer.user?.name && (
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                {documentViewer.user.name}
                                                {documentViewer.user?.role && (
                                                    <span className="capitalize"> · {String(documentViewer.user?.role || '').replace('_', ' ')}</span>
                                                )}
                                                {documentViewer.user?.assignedMunicipality && (
                                                    <span> · {documentViewer.user.assignedMunicipality}</span>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    {/* Segmented Document Switcher */}
                                    {documentViewer.user?.idDocument && documentViewer.user?.selfiePhoto && (
                                        <div className="inline-flex rounded-lg border border-gray-200/90 bg-gray-100/90 p-0.5 dark:border-white/10 dark:bg-white/5" role="tablist" aria-label="Document switcher">
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={documentViewer.docType === 'idDocument'}
                                                onClick={() => switchDocumentType('idDocument')}
                                                className={`h-7 rounded-md px-2.5 sm:px-3 text-xs font-semibold transition-colors cursor-pointer ${
                                                    documentViewer.docType === 'idDocument'
                                                        ? 'bg-white text-gray-950 dark:bg-[#0c1813] dark:text-white'
                                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                }`}
                                            >
                                                ID
                                            </button>
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={documentViewer.docType === 'selfiePhoto'}
                                                onClick={() => switchDocumentType('selfiePhoto')}
                                                className={`h-7 rounded-md px-2.5 sm:px-3 text-xs font-semibold transition-colors cursor-pointer ${
                                                    documentViewer.docType === 'selfiePhoto'
                                                        ? 'bg-white text-gray-950 dark:bg-[#0c1813] dark:text-white'
                                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                }`}
                                            >
                                                Selfie
                                            </button>
                                        </div>
                                    )}

                                    {/* View Tools: Rotate & Zoom */}
                                    {!documentViewer.loading && !documentViewer.error && documentViewer.src && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setRotationDegree((r) => (r + 90) % 360)}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 cursor-pointer"
                                                title="Rotate 90° (R)"
                                                aria-label="Rotate document 90 degrees"
                                            >
                                                <HiOutlineRefresh className="h-3.5 w-3.5" />
                                            </button>

                                            <div className="hidden sm:inline-flex items-center gap-0.5 rounded-lg border border-gray-200/90 bg-gray-100/90 p-0.5 dark:border-white/10 dark:bg-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                                                    disabled={zoomLevel <= 0.75}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                                                    aria-label="Zoom out"
                                                    title="Zoom out (-)"
                                                >
                                                    <HiOutlineZoomOut className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setZoomLevel(1); setRotationDegree(0); }}
                                                    className="h-6 px-1.5 text-[10px] font-mono font-semibold text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white tabular-nums cursor-pointer"
                                                    aria-label="Reset zoom"
                                                    title="Reset view (0)"
                                                >
                                                    {Math.round(zoomLevel * 100)}%
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 2.5))}
                                                    disabled={zoomLevel >= 2.5}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                                                    aria-label="Zoom in"
                                                    title="Zoom in (+)"
                                                >
                                                    <HiOutlineZoomIn className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {/* Close Button */}
                                    <button
                                        type="button"
                                        onClick={closeDocumentPreview}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors cursor-pointer"
                                        aria-label="Close document preview"
                                    >
                                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Dedicated High-Contrast Inspection Canvas */}
                            <div
                                className="relative flex flex-1 min-h-0 w-full flex-col overflow-auto bg-[#090e11] p-3 sm:p-6"
                                data-testid="document-preview-stage"
                            >
                                {documentViewer.loading && (
                                    <div className="m-auto flex w-full max-w-md flex-col items-center justify-center gap-3 py-10 text-center" role="status" aria-label="Loading document preview" aria-busy="true">
                                        <span className="sr-only">Loading protected document...</span>
                                        <div className="aspect-[4/3] w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.04] animate-pulse flex flex-col items-center justify-center gap-2.5 p-6">
                                            <HiOutlinePhotograph className="h-8 w-8 text-gray-500 animate-pulse" aria-hidden="true" />
                                            <div className="h-3 w-32 rounded bg-white/10" />
                                            <div className="h-2 w-20 rounded bg-white/10" />
                                        </div>
                                    </div>
                                )}

                                {documentViewer.error && (
                                    <div className="m-auto flex flex-col items-center justify-center gap-2.5 py-12 text-center">
                                        <p className="text-xs font-semibold text-red-400">{documentViewer.error}</p>
                                        <button
                                            type="button"
                                            onClick={() => openDocumentPreview(documentViewer.user, documentViewer.docType)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/20 transition-colors cursor-pointer"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                )}

                                {!documentViewer.loading && !documentViewer.error && documentViewer.src && (
                                    <div className="m-auto flex min-h-full min-w-full items-center justify-center">
                                        <div
                                            className="flex items-center justify-center transition-transform duration-150 ease-out"
                                            style={{
                                                transform: `scale(${zoomLevel}) rotate(${rotationDegree}deg)`,
                                                transformOrigin: 'center center',
                                            }}
                                        >
                                            <img
                                                src={documentViewer.src}
                                                alt={`${documentViewer.docType === 'idDocument' ? 'Government ID' : 'Verification Selfie'} of ${documentViewer.user?.name || 'user'}`}
                                                className="h-auto w-auto max-h-[calc(min(680px,88vh)-130px)] max-w-full rounded-lg object-contain shadow-2xl border border-white/10"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Integrated Decision Bar for Pending Verification */}
                            {documentViewer.user?.role === 'reporter' && documentViewer.user?.verificationStatus === 'pending' && (
                                <div className="flex shrink-0 items-center justify-between border-t border-gray-200/80 bg-gray-50/95 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.03] sm:px-5">
                                    <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <HiOutlineShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        <span>Action required: review and verify this reporter</span>
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                        <button
                                            type="button"
                                            onClick={() => handleActionFromViewer('rejected')}
                                            className="inline-flex h-8 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg border border-red-200/90 bg-red-50/80 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 transition-colors cursor-pointer"
                                        >
                                            <HiOutlineXCircle className="h-4 w-4" />
                                            Reject
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleActionFromViewer('approved')}
                                            className="inline-flex h-8 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 transition-colors cursor-pointer"
                                        >
                                            <HiOutlineCheckCircle className="h-4 w-4" />
                                            Approve reporter
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )}
        </div>
    );
};

export default AdminUsersPage;
