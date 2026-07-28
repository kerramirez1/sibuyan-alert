import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { adminAPI, filesAPI } from '../services/api';
import { isGridFsAsset, resolveAssetUrl } from '../utils/assets';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import {
    HiOutlineSearch,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineIdentification,
    HiOutlineEye,
    HiOutlineTrash,
    HiOutlineLocationMarker,
    HiOutlineCamera,
} from 'react-icons/hi';

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
            const response = await filesAPI.getProtected(url);
            const blobUrl = URL.createObjectURL(response.data);
            blobUrls.push(blobUrl);
            return blobUrl;
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
        } catch (error) {
            toast.error('Failed to update verification status');
        } finally {
            setVerifyLoading(false);
        }
    };

    const openDeleteModal = (user) => {
        setUserToDelete(user);
        setDeleteModalOpen(true);
    };

    const openAsset = async (url) => {
        if (!url) return;
        if (!isGridFsAsset(url)) {
            window.open(resolveAssetUrl(url), '_blank', 'noopener,noreferrer');
            return;
        }

        const previewWindow = window.open('', '_blank');
        if (previewWindow) previewWindow.opener = null;

        try {
            const response = await filesAPI.getProtected(url);
            const blobUrl = URL.createObjectURL(response.data);
            if (previewWindow) {
                previewWindow.location.replace(blobUrl);
            } else {
                const link = document.createElement('a');
                link.href = blobUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.click();
            }
            window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        } catch (error) {
            previewWindow?.close();
            toast.error(error.response?.data?.message || 'Failed to open protected file');
        }
    };

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

    const getRoleBadge = (role) => {
        switch (role) {
            case 'municipal_admin':
                return <span className="badge bg-indigo-100 text-indigo-700">Municipal Admin</span>;
            case 'responder':
                return <span className="badge bg-orange-100 text-orange-700">Responder</span>;
            case 'reporter':
                return <span className="badge bg-primary-100 text-primary-700">Reporter</span>;
            case 'ordinary':
                return <span className="badge bg-gray-100 text-gray-600">Ordinary</span>;
            default:
                return <span className="badge bg-gray-100 text-gray-600 capitalize">{role || 'Unknown'}</span>;
        }
    };

    const getVerificationBadge = (status) => {
        switch (status) {
            case 'approved':
                return <span className="badge badge-verified">Verified</span>;
            case 'rejected':
                return <span className="badge badge-rejected">Rejected</span>;
            case 'pending':
                return <span className="badge badge-pending">Pending</span>;
            default:
                return <span className="badge bg-gray-100 text-gray-500">N/A</span>;
        }
    };

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="mb-6">
                    <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">
                        Manage Users
                    </h1>
                    <p className="text-gray-600">
                        View and verify reporter accounts
                    </p>
                </div>

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="card bg-gray-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                            <p className="text-sm text-gray-500">Total Users</p>
                        </div>
                        <div className="card bg-primary-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-primary-600">{stats.reporters}</p>
                            <p className="text-sm text-gray-500">Reporters</p>
                        </div>
                        <div className="card bg-accent-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-accent-600">{stats.pendingVerification}</p>
                            <p className="text-sm text-gray-500">Pending</p>
                        </div>
                        <div className="card bg-danger-50 flex flex-col justify-center">
                            <p className="text-2xl font-bold text-danger-600">{stats.responders}</p>
                            <p className="text-sm text-gray-500">Responders</p>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="card mb-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                                    className="input pl-10"
                                />
                            </div>
                        </div>
                        <select
                            value={filter.role}
                            onChange={(e) => setFilter({ ...filter, role: e.target.value })}
                            className="input w-full sm:w-auto"
                        >
                            <option value="">All Roles</option>
                            <option value="ordinary">Ordinary</option>
                            <option value="reporter">Reporter</option>
                        </select>
                        <select
                            value={filter.verificationStatus}
                            onChange={(e) => setFilter({ ...filter, verificationStatus: e.target.value })}
                            className="input w-auto"
                        >
                            <option value="">All Status</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>

                {/* Users Table */}
                <div className="card p-0">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Verification</th>
                                    <th>Documents</th>
                                    <th>Joined</th>
                                    <th>Last Login</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8">
                                            <div className="spinner mx-auto" />
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-8 text-gray-500">
                                            No users found
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((user) => (
                                        <tr key={user._id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${user.role === 'municipal_admin' ? 'bg-gradient-to-br from-indigo-500 to-indigo-700' :
                                                            user.role === 'responder' ? 'bg-gradient-to-br from-orange-500 to-orange-700' :
                                                                user.role === 'reporter' ? 'bg-gradient-to-br from-primary-500 to-primary-700' :
                                                                    'bg-gradient-to-br from-gray-400 to-gray-600'
                                                        }`}>
                                                        {user.avatar ? (
                                                            <img src={resolveAssetUrl(user.avatar)} alt="" className="w-full h-full rounded-full object-cover" />
                                                        ) : (
                                                            user.name?.charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">{user.name}</p>
                                                        <p className="text-sm text-gray-500">{user.email}</p>
                                                        {user.address && (
                                                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                                <HiOutlineLocationMarker className="w-3 h-3" />
                                                                {user.address}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{getRoleBadge(user.role)}</td>
                                            <td>{getVerificationBadge(user.verificationStatus)}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {user.idDocument ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openAsset(user.idDocument)}
                                                            className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-xs font-medium"
                                                        >
                                                            <HiOutlineIdentification className="w-4 h-4" />
                                                            ID
                                                        </button>
                                                    ) : null}
                                                    {user.selfiePhoto ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openAsset(user.selfiePhoto)}
                                                            className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-xs font-medium"
                                                        >
                                                            <HiOutlineCamera className="w-4 h-4" />
                                                            Selfie
                                                        </button>
                                                    ) : null}
                                                    {!user.idDocument && !user.selfiePhoto && (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="text-gray-500">
                                                {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                                            </td>
                                            <td className="text-gray-500">
                                                {user.lastLogin ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true }) : 'Never'}
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    {user.role === 'reporter' && user.verificationStatus === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => openVerifyModal(user, 'approved')}
                                                                className="p-2 text-success-600 hover:bg-success-50 rounded-lg"
                                                                title="Approve"
                                                            >
                                                                <HiOutlineCheckCircle className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => openVerifyModal(user, 'rejected')}
                                                                className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg"
                                                                title="Reject"
                                                            >
                                                                <HiOutlineXCircle className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => openDeleteModal(user)}
                                                        className="p-2 text-gray-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg"
                                                        title="Delete User"
                                                    >
                                                        <HiOutlineTrash className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </motion.div>

            {/* Verify Modal */}
            <Modal
                isOpen={verifyModalOpen}
                onClose={() => setVerifyModalOpen(false)}
                title={`${verifyData.status === 'approved' ? 'Approve' : 'Reject'} Reporter`}
                size="md"
            >
                {selectedUser && (
                    <div>
                        <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
                            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                                <HiOutlineIdentification className="w-6 h-6 text-primary-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">{selectedUser.name}</p>
                                <p className="text-sm text-gray-500">{selectedUser.email}</p>
                                {selectedUser.address && (
                                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                                        <HiOutlineLocationMarker className="w-3.5 h-3.5" />
                                        {selectedUser.address}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Verification Documents — Side-by-Side */}
                        {(selectedUser.idDocument || selectedUser.selfiePhoto) && (
                            <div className="mb-6">
                                <p className="label mb-3">Verification Documents</p>
                                {verificationAssets.loading && (
                                    <p className="text-sm text-gray-500">Loading protected verification files...</p>
                                )}
                                {verificationAssets.error && (
                                    <p className="text-sm text-danger-600" role="alert">{verificationAssets.error}</p>
                                )}
                                <div className={`grid gap-4 ${selectedUser.idDocument && selectedUser.selfiePhoto ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                                    {/* ID Document */}
                                    {selectedUser.idDocument && (
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <HiOutlineIdentification className="w-3.5 h-3.5" /> ID Document
                                            </p>
                                            {selectedUser.idDocument.endsWith('.pdf') ? (
                                                <button type="button" onClick={() => openAsset(selectedUser.idDocument)} className="btn-secondary w-full text-sm">
                                                    <HiOutlineEye className="w-4 h-4" /> View PDF
                                                </button>
                                            ) : (
                                                <button type="button" onClick={() => openAsset(selectedUser.idDocument)} className="block w-full">
                                                    {verificationAssets.idDocument ? (
                                                        <img
                                                            src={verificationAssets.idDocument}
                                                            alt="ID Document"
                                                            className="w-full rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all cursor-pointer shadow-sm hover:shadow-lg"
                                                        />
                                                    ) : (
                                                        <span className="flex min-h-32 items-center justify-center rounded-xl border border-gray-200 text-sm text-gray-500">
                                                            Preview unavailable
                                                        </span>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Selfie Photo */}
                                    {selectedUser.selfiePhoto && (
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                <HiOutlineCamera className="w-3.5 h-3.5" /> Face Verification
                                            </p>
                                            <button type="button" onClick={() => openAsset(selectedUser.selfiePhoto)} className="block w-full">
                                                {verificationAssets.selfiePhoto ? (
                                                    <img
                                                        src={verificationAssets.selfiePhoto}
                                                        alt="Selfie Verification"
                                                        className="w-full rounded-xl border-2 border-gray-200 hover:border-emerald-400 transition-all cursor-pointer shadow-sm hover:shadow-lg"
                                                    />
                                                ) : (
                                                    <span className="flex min-h-32 items-center justify-center rounded-xl border border-gray-200 text-sm text-gray-500">
                                                        Preview unavailable
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Comparison hint */}
                                {selectedUser.idDocument && selectedUser.selfiePhoto && (
                                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
                                        <p className="text-[11px] text-blue-700 font-medium">
                                            ↔ Compare the ID photo with the selfie to verify identity match
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mb-6">
                            <label className="label">
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
                                className="input resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={() => setVerifyModalOpen(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant={verifyData.status === 'approved' ? 'success' : 'danger'}
                                onClick={handleVerify}
                                loading={verifyLoading}
                                disabled={verifyData.status === 'rejected' && !verifyData.feedback.trim()}
                                className="flex-1"
                            >
                                {verifyData.status === 'approved' ? (
                                    <>
                                        <HiOutlineCheckCircle className="w-5 h-5" />
                                        Approve
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineXCircle className="w-5 h-5" />
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
                <div className="text-center">
                    <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <HiOutlineTrash className="w-8 h-8 text-danger-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Are you sure?</h3>
                    <p className="text-gray-500 mb-6">
                        This action cannot be undone. This will permanently delete
                        <span className="font-semibold text-gray-900"> {userToDelete?.name}</span>'s account and all associated data.
                    </p>
                    <div className="flex gap-3">
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
        </div>
    );
};

export default AdminUsersPage;
