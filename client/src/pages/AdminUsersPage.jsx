import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminAPI, filesAPI } from '../services/api';
import { isGridFsAsset, resolveAssetUrl } from '../utils/assets';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { Skeleton, SkeletonCircle, SkeletonButton, SkeletonRow } from '../components/ui/Skeleton';
import toast from '../utils/appToast';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineIdentification,
    HiOutlineTrash,
    HiOutlineLocationMarker,
    HiOutlineCamera,
    HiOutlineUsers,
    HiOutlineX,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
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
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ role: '', verificationStatus: '' });
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifyData, setVerifyData] = useState({ status: '', feedback: '' });
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
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
            loadAsset(selectedUser.idDocument),
            loadAsset(selectedUser.selfiePhoto),
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

    // Handle Escape key and focus return for document viewer
    useEffect(() => {
        if (!documentViewer.isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeDocumentPreview();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [documentViewer.isOpen]);

    // Cleanup active document blob URL on unmount
    useEffect(() => {
        return () => {
            if (activeDocBlobRef.current) {
                URL.revokeObjectURL(activeDocBlobRef.current);
            }
        };
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = {
                ...filter,
                search: search || undefined,
            };
            const response = await adminAPI.getUsers(params);
            setUsers(response.data.data.users);
            setStats(response.data.data.stats);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const openVerifyModal = (user, status) => {
        setSelectedUser(user);
        setVerifyData({ status, feedback: '' });
        setVerifyModalOpen(true);
    };

    const handleVerify = async () => {
        if (!selectedUser || !verifyData.status) return;

        setVerifyLoading(true);
        try {
            await adminAPI.verifyReporter(selectedUser._id, {
                status: verifyData.status,
                feedback: verifyData.feedback,
            });

            toast.success(`Reporter ${verifyData.status === 'approved' ? 'approved' : 'rejected'} successfully`);
            setVerifyModalOpen(false);
            fetchUsers();
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
        openDocumentPreview(documentViewer.user, newType);
    }, [documentViewer.user, documentViewer.docType, openDocumentPreview]);

    const handleDelete = async () => {
        if (!userToDelete) return;

        setDeleteLoading(true);
        try {
            await adminAPI.deleteUser(userToDelete._id);
            toast.success('User deleted successfully');
            setDeleteModalOpen(false);
            setUserToDelete(null);
            fetchUsers();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete user');
        } finally {
            setDeleteLoading(false);
        }
    };

    const renderRoleBadge = (role) => {
        const config = ROLE_BADGES[role] || { label: role || 'Unknown', dot: 'bg-gray-400' };
        return (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
                <span>{config.label}</span>
            </span>
        );
    };

    const renderVerificationBadge = (status) => {
        const config = VERIFICATION_BADGES[status] || { label: 'N/A', dot: 'bg-gray-400' };
        return (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-gray-200/90 bg-gray-50/80 px-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} aria-hidden="true" />
                <span>{config.label}</span>
            </span>
        );
    };

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1500px] overflow-x-hidden space-y-4 sm:space-y-5">
            {/* Page Header */}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Municipal administration
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white">
                        Manage users
                    </h1>
                    <p className="mt-0.5 max-w-xl text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        View and verify reporter accounts.
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 shadow-2xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Sibuyan Island · Alert System Active</span>
                    </div>
                </div>
            </header>

            {/* Summary Metrics Strip */}
            {stats && (
                <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-200/90 shadow-2xs md:grid-cols-4 dark:border-white/10 dark:bg-white/10" aria-label="User directory summary">
                    <div className="bg-white p-4 sm:p-4.5 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total users</span>
                            <HiOutlineUsers className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        </div>
                        <p className="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">{stats.totalUsers}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Registered accounts</p>
                    </div>

                    <div className="bg-white p-4 sm:p-4.5 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Reporters</span>
                            </div>
                        </div>
                        <p className="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">{stats.reporters}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Field reporters</p>
                    </div>

                    <div className="bg-white p-4 sm:p-4.5 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pending</span>
                            </div>
                        </div>
                        <p className="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">{stats.pendingVerification}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Awaiting verification</p>
                    </div>

                    <div className="bg-white p-4 sm:p-4.5 dark:bg-[#0c1813]/90">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Responders</span>
                            </div>
                        </div>
                        <p className="mt-2 font-display text-2xl font-bold leading-none tracking-tight text-gray-950 sm:text-3xl dark:text-white tabular-nums">{stats.responders}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Emergency units</p>
                    </div>
                </section>
            )}

            {/* Users Data Section */}
            <section className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xs dark:border-white/10 dark:bg-[#0c1813]/90" aria-label="Users directory">
                {/* Search & Filters Toolbar */}
                <div className="border-b border-gray-200/80 bg-gray-50/70 p-3.5 sm:p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1 min-w-[200px]">
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                            <input
                                type="text"
                                placeholder="Search by name or email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                                className="h-9 w-full rounded-xl border border-gray-200/90 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
                            <select
                                value={filter.role}
                                onChange={(e) => setFilter({ ...filter, role: e.target.value })}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by role"
                            >
                                <option value="">All Roles</option>
                                <option value="ordinary">Ordinary</option>
                                <option value="reporter">Reporter</option>
                            </select>
                            <select
                                value={filter.verificationStatus}
                                onChange={(e) => setFilter({ ...filter, verificationStatus: e.target.value })}
                                className="h-9 w-full sm:w-auto rounded-xl border border-gray-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200"
                                aria-label="Filter by verification status"
                            >
                                <option value="">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Desktop & Tablet Table */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200/80 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-white/[0.01] dark:text-gray-400">
                                <th scope="col" className="py-3 pl-4 pr-3 sm:pl-5">User</th>
                                <th scope="col" className="px-3 py-3">Role</th>
                                <th scope="col" className="px-3 py-3">Verification</th>
                                <th scope="col" className="px-3 py-3">Documents</th>
                                <th scope="col" className="px-3 py-3">Joined</th>
                                <th scope="col" className="px-3 py-3">Last Login</th>
                                <th scope="col" className="py-3 pl-3 pr-4 sm:pr-5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                            {loading ? (
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
                                users.map((user) => (
                                    <tr
                                        key={user._id}
                                        className="transition-colors hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"
                                    >
                                        <td className="py-3 pl-4 pr-3 sm:pl-5">
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs ${
                                                    user.role === 'municipal_admin' ? 'bg-indigo-600' :
                                                    user.role === 'responder' ? 'bg-cyan-600' :
                                                    user.role === 'reporter' ? 'bg-emerald-600' : 'bg-gray-600'
                                                }`}>
                                                    {user.avatar ? (
                                                        <img src={resolveAssetUrl(user.avatar)} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                                                    ) : (
                                                        user.name?.charAt(0).toUpperCase() || 'U'
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{user.name}</p>
                                                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
                                                    {user.address && (
                                                        <p className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                                            <HiOutlineLocationMarker className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">{user.address}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">{renderRoleBadge(user.role)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">{renderVerificationBadge(user.verificationStatus)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                {user.idDocument ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openDocumentPreview(user, 'idDocument', e)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200/90 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                                        title="View ID document"
                                                        aria-label={`View ID document for ${user.name}`}
                                                    >
                                                        <HiOutlineIdentification className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        ID
                                                    </button>
                                                ) : null}
                                                {user.selfiePhoto ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openDocumentPreview(user, 'selfiePhoto', e)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200/90 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                                                        title="View selfie photo"
                                                        aria-label={`View selfie photo for ${user.name}`}
                                                    >
                                                        <HiOutlineCamera className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        Selfie
                                                    </button>
                                                ) : null}
                                                {!user.idDocument && !user.selfiePhoto && (
                                                    <span className="text-gray-400 dark:text-gray-500">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                            {user.lastLogin ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true }) : 'Never'}
                                        </td>
                                        <td className="py-3 pl-3 pr-4 sm:pr-5 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {user.role === 'reporter' && user.verificationStatus === 'pending' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openVerifyModal(user, 'approved')}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200/90 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                            title="Approve reporter"
                                                            aria-label={`Approve reporter ${user.name}`}
                                                        >
                                                            <HiOutlineCheckCircle className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openVerifyModal(user, 'rejected')}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200/90 bg-red-50/80 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                                                            title="Reject reporter"
                                                            aria-label={`Reject reporter ${user.name}`}
                                                        >
                                                            <HiOutlineXCircle className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => openDeleteModal(user)}
                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                                                    title="Delete user"
                                                    aria-label={`Delete user ${user.name}`}
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
                    {loading ? (
                        [0, 1, 2, 3].map((item) => (
                            <SkeletonRow key={item} hasAvatar lines={2} trailingAction />
                        ))
                    ) : users.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">No users found</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try adjusting the search or filters.</p>
                        </div>
                    ) : (
                        users.map((user) => (
                            <article key={user._id} className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs ${
                                            user.role === 'municipal_admin' ? 'bg-indigo-600' :
                                            user.role === 'responder' ? 'bg-cyan-600' :
                                            user.role === 'reporter' ? 'bg-emerald-600' : 'bg-gray-600'
                                        }`}>
                                            {user.avatar ? (
                                                <img src={resolveAssetUrl(user.avatar)} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                                            ) : (
                                                user.name?.charAt(0).toUpperCase() || 'U'
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{user.name}</p>
                                            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        {renderRoleBadge(user.role)}
                                        {renderVerificationBadge(user.verificationStatus)}
                                    </div>
                                </div>

                                {user.address && (
                                    <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                        <HiOutlineLocationMarker className="h-3 w-3 shrink-0 text-gray-400" />
                                        <span className="truncate">{user.address}</span>
                                    </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-white/5 text-[11px] text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1.5">
                                        {user.idDocument ? (
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(user, 'idDocument', e)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200/90 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                                                aria-label={`View ID document for ${user.name}`}
                                            >
                                                <HiOutlineIdentification className="h-3 w-3 text-emerald-600" />
                                                ID
                                            </button>
                                        ) : null}
                                        {user.selfiePhoto ? (
                                            <button
                                                type="button"
                                                onClick={(e) => openDocumentPreview(user, 'selfiePhoto', e)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200/90 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-2xs dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                                                aria-label={`View selfie photo for ${user.name}`}
                                            >
                                                <HiOutlineCamera className="h-3 w-3 text-emerald-600" />
                                                Selfie
                                            </button>
                                        ) : null}
                                        {!user.idDocument && !user.selfiePhoto && (
                                            <span>Joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {user.role === 'reporter' && user.verificationStatus === 'pending' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => openVerifyModal(user, 'approved')}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-emerald-200/90 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                    title="Approve reporter"
                                                >
                                                    <HiOutlineCheckCircle className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openVerifyModal(user, 'rejected')}
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-red-200/90 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                                                    title="Reject reporter"
                                                >
                                                    <HiOutlineXCircle className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => openDeleteModal(user)}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200/90 bg-white text-gray-400 hover:text-red-600 dark:border-white/10 dark:bg-white/5"
                                            title="Delete user"
                                        >
                                            <HiOutlineTrash className="h-3.5 w-3.5" />
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
                        <div className="flex items-center gap-3 rounded-xl border border-gray-200/90 bg-gray-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
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
                                                        className="w-full max-h-48 rounded-xl border border-gray-200/90 object-contain bg-gray-50/50 shadow-2xs group-hover:border-emerald-500 transition-colors cursor-pointer dark:border-white/10 dark:bg-black/20"
                                                    />
                                                ) : (
                                                    <span className="flex min-h-28 items-center justify-center rounded-xl border border-gray-200/90 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
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
                                                        className="w-full max-h-48 rounded-xl border border-gray-200/90 object-contain bg-gray-50/50 shadow-2xs group-hover:border-emerald-500 transition-colors cursor-pointer dark:border-white/10 dark:bg-black/20"
                                                    />
                                                ) : (
                                                    <span className="flex min-h-28 items-center justify-center rounded-xl border border-gray-200/90 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
                                                        Preview unavailable
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {selectedUser.idDocument && selectedUser.selfiePhoto && (
                                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-2.5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
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
                                className="w-full rounded-xl border border-gray-200/90 bg-white p-2.5 text-xs text-gray-900 shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-[#07130e] dark:text-white resize-none"
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

            {/* In-App Document Preview Lightbox */}
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
                            className="fixed inset-0 bg-gray-950/70 backdrop-blur-xs transition-opacity"
                        />

                        {/* Bounded Responsive Modal Card */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="relative z-10 flex h-[min(640px,88vh)] max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0c1813]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Compact Fixed Header */}
                            <div className="flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-gray-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02] sm:px-5">
                                <div className="min-w-0 pr-2">
                                    <h3 id="document-viewer-title" className="text-sm font-bold text-gray-950 dark:text-white truncate">
                                        {documentViewer.docType === 'idDocument' ? 'Government ID' : 'Verification Selfie'}
                                    </h3>
                                    {documentViewer.user?.name && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {documentViewer.user.name}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                                    {/* Segmented Document Switcher */}
                                    {documentViewer.user?.idDocument && documentViewer.user?.selfiePhoto && (
                                        <div className="inline-flex rounded-xl border border-gray-200/90 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/5" role="tablist" aria-label="Document switcher">
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={documentViewer.docType === 'idDocument'}
                                                onClick={() => switchDocumentType('idDocument')}
                                                className={`h-7 rounded-lg px-2.5 sm:px-3 text-xs font-semibold transition-colors ${
                                                    documentViewer.docType === 'idDocument'
                                                        ? 'bg-white text-gray-950 shadow-2xs dark:bg-[#0c1813] dark:text-white'
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
                                                className={`h-7 rounded-lg px-2.5 sm:px-3 text-xs font-semibold transition-colors ${
                                                    documentViewer.docType === 'selfiePhoto'
                                                        ? 'bg-white text-gray-950 shadow-2xs dark:bg-[#0c1813] dark:text-white'
                                                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                }`}
                                            >
                                                Selfie
                                            </button>
                                        </div>
                                    )}

                                    {/* Zoom Controls */}
                                    {!documentViewer.loading && !documentViewer.error && documentViewer.src && (
                                        <div className="hidden sm:inline-flex items-center gap-0.5 rounded-xl border border-gray-200/90 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/5">
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                                                disabled={zoomLevel <= 0.75}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-40"
                                                aria-label="Zoom out"
                                                title="Zoom out"
                                            >
                                                <HiOutlineZoomOut className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel(1)}
                                                className="h-7 px-1 text-[11px] font-semibold text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                                                aria-label="Reset zoom"
                                                title="Reset zoom"
                                            >
                                                {Math.round(zoomLevel * 100)}%
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 2.5))}
                                                disabled={zoomLevel >= 2.5}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-40"
                                                aria-label="Zoom in"
                                                title="Zoom in"
                                            >
                                                <HiOutlineZoomIn className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Close Button */}
                                    <button
                                        type="button"
                                        onClick={closeDocumentPreview}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
                                        aria-label="Close document preview"
                                    >
                                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Body / Dedicated Image Canvas (Perfect Horizontal & Vertical Centering) */}
                            <div
                                className="relative flex flex-1 min-h-0 w-full flex-col overflow-auto bg-gray-100/60 p-4 sm:p-6 dark:bg-black/50"
                                data-testid="document-preview-stage"
                            >
                                {documentViewer.loading && (
                                    <div className="m-auto flex flex-col items-center justify-center gap-2 py-12 text-center text-xs text-gray-500 dark:text-gray-400">
                                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden="true" />
                                        <span>Loading protected document...</span>
                                    </div>
                                )}

                                {documentViewer.error && (
                                    <div className="m-auto flex flex-col items-center justify-center gap-2.5 py-12 text-center">
                                        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{documentViewer.error}</p>
                                        <button
                                            type="button"
                                            onClick={() => openDocumentPreview(documentViewer.user, documentViewer.docType)}
                                            className="inline-flex items-center gap-1 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs border border-gray-200/90 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
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
                                                transform: `scale(${zoomLevel})`,
                                                transformOrigin: 'center center',
                                            }}
                                        >
                                            <img
                                                src={documentViewer.src}
                                                alt={`${documentViewer.docType === 'idDocument' ? 'Government ID' : 'Verification Selfie'} of ${documentViewer.user?.name || 'user'}`}
                                                className="h-auto w-auto max-h-[calc(min(640px,88vh)-110px)] max-w-full rounded-xl object-contain shadow-md"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminUsersPage;
